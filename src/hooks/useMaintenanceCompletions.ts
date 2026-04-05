import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption, useDecryptConcurrency, isAbortError } from './useEncryption';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { MAINTENANCE_COMPLETION_KIND, MAINTENANCE_KIND, type MaintenanceCompletion, type MaintenancePart } from '@/lib/types';
import { cacheEvents, getCachedEvents, deleteCachedEventById } from '@/lib/eventCache';
import { isRelayUrlSecure } from '@/lib/relay';
import { getSiblingEventIdsForDeletion } from '@/lib/relayDeletion';
import { logger } from '@/lib/logger';
import { runWithConcurrencyLimit } from '@/lib/utils';
import { parseImetaRow } from '@/lib/maintenanceReceipt';

const ENCRYPTED_MARKER = 'nip44:';

/** Sensitive completion data stored in encrypted content when encryption is on */
interface MaintenanceCompletionData {
  completedDate: string;
  mileageAtCompletion?: string;
  notes?: string;
  parts?: MaintenancePart[];
  receiptUrl?: string;
  receiptMime?: string;
}

// Helper to get tag value
function getTagValue(event: NostrEvent, tagName: string): string | undefined {
  return event.tags.find(([name]) => name === tagName)?.[1];
}

// Parse part tags from event
// Format: ["part", "<name>", "<partNumber>", "<cost>"]
function parsePartTags(event: NostrEvent): MaintenancePart[] {
  return event.tags
    .filter(([name]) => name === 'part')
    .map(tag => ({
      name: tag[1] || '',
      partNumber: tag[2] || undefined,
      cost: tag[3] || undefined,
    }))
    .filter(part => part.name);
}

// Parse a Nostr event into a MaintenanceCompletion object (plaintext tags)
function parseCompletionPlaintext(event: NostrEvent): MaintenanceCompletion | null {
  const id = event.id;
  const completedDate = getTagValue(event, 'completed_date');
  const mileageAtCompletion = getTagValue(event, 'mileage_at_completion');
  const notes = getTagValue(event, 'notes');

  const aTag = event.tags.find(([name]) => name === 'a')?.[1];
  const maintenanceId = aTag?.split(':')[2];

  if (!id || !completedDate || !maintenanceId) return null;

  const parts = parsePartTags(event);

  const imetaTag = event.tags.find(([name]) => name === 'imeta');
  const { url: receiptUrl, mime: receiptMime } = imetaTag
    ? parseImetaRow(imetaTag)
    : {};

  return {
    id,
    maintenanceId,
    completedDate,
    mileageAtCompletion,
    notes,
    parts: parts.length > 0 ? parts : undefined,
    receiptUrl,
    receiptMime,
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

/** Dual-publish plaintext: no completed_date tags, JSON body matches MaintenanceCompletionData. */
function parseCompletionDualPublishPlain(event: NostrEvent): MaintenanceCompletion | null {
  const raw = event.content?.trim();
  if (!raw || raw.startsWith(ENCRYPTED_MARKER) || raw[0] !== '{') return null;

  let data: MaintenanceCompletionData;
  try {
    data = JSON.parse(raw) as MaintenanceCompletionData;
  } catch {
    return null;
  }

  if (!data.completedDate) return null;

  const id = event.id;
  const aTag = event.tags.find(([name]) => name === 'a')?.[1];
  const maintenanceId = aTag?.split(':')[2];

  if (!id || !maintenanceId) return null;

  return {
    id,
    maintenanceId,
    completedDate: data.completedDate,
    mileageAtCompletion: data.mileageAtCompletion,
    notes: data.notes,
    parts: data.parts?.length ? data.parts : undefined,
    receiptUrl: data.receiptUrl,
    receiptMime: data.receiptMime,
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

// Parse encrypted completion from content; maintenance ref from plaintext 'a' tag
async function parseCompletionEncrypted(
  event: NostrEvent,
  decryptFn: (content: string) => Promise<MaintenanceCompletionData>
): Promise<MaintenanceCompletion | null> {
  const id = event.id;
  const aTag = event.tags.find(([name]) => name === 'a')?.[1];
  const maintenanceId = aTag?.split(':')[2];

  if (!id || !maintenanceId || !event.content?.startsWith(ENCRYPTED_MARKER)) return null;

  try {
    const data = await decryptFn(event.content);
    if (!data.completedDate) return null;
    return {
      id,
      maintenanceId,
      completedDate: data.completedDate,
      mileageAtCompletion: data.mileageAtCompletion,
      notes: data.notes,
      parts: data.parts?.length ? data.parts : undefined,
      receiptUrl: data.receiptUrl,
      receiptMime: data.receiptMime,
      pubkey: event.pubkey,
      createdAt: event.created_at,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    logger.warn('[MaintenanceCompletions] Failed to decrypt completion');
    return null;
  }
}

// Extract deleted completion IDs from kind 5 events
function getDeletedCompletionIds(deletionEvents: NostrEvent[]): Set<string> {
  const deletedIds = new Set<string>();
  
  for (const event of deletionEvents) {
    for (const tag of event.tags) {
      if (tag[0] === 'e') {
        deletedIds.add(tag[1]);
      }
    }
  }
  
  return deletedIds;
}

// Parse events into maintenance completions (handles both encrypted and plaintext)
async function parseEventsToCompletions(
  events: NostrEvent[],
  decryptForCategory: <T>(content: string) => Promise<T>,
  decryptConcurrency: number,
): Promise<MaintenanceCompletion[]> {
  const completionEvents = events.filter(e => e.kind === MAINTENANCE_COMPLETION_KIND);
  const deletionEvents = events.filter(e => e.kind === 5);
  const deletedIds = getDeletedCompletionIds(deletionEvents);

  const results = await runWithConcurrencyLimit(
    completionEvents,
    decryptConcurrency,
    async (event): Promise<MaintenanceCompletion | null> => {
      const completion = event.content?.startsWith(ENCRYPTED_MARKER)
        ? await parseCompletionEncrypted(event, (c) => decryptForCategory<MaintenanceCompletionData>(c))
        : parseCompletionPlaintext(event) ?? parseCompletionDualPublishPlain(event);
      if (completion && !deletedIds.has(completion.id)) return completion;
      return null;
    }
  );

  const parseDate = (dateStr: string) => {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return 0;
    return new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10)).getTime();
  };
  const completions = results.filter((c): c is MaintenanceCompletion => c !== null);
  return completions.sort((a, b) => parseDate(b.completedDate) - parseDate(a.completedDate));
}

export function useMaintenanceCompletions() {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();
  const decryptConcurrency = useDecryptConcurrency();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const canLoadCompletions =
    !!user?.pubkey &&
    (!isEncryptionEnabled('maintenance') || !!user?.signer?.nip44);

  const query = useQuery({
    queryKey: ['maintenance-completions', user?.pubkey, canLoadCompletions],
    queryFn: async () => {
      if (!user?.pubkey) return [];

      const cachedEvents = await getCachedEvents([MAINTENANCE_COMPLETION_KIND, 5], user.pubkey);
      if (cachedEvents.length > 0) {
        return parseEventsToCompletions(cachedEvents, decryptForCategory, decryptConcurrency);
      }
      return [];
    },
    enabled: canLoadCompletions,
    staleTime: Infinity, // Data comes from IndexedDB cache, no need to refetch
    gcTime: Infinity, // Keep in memory for the session
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch when component remounts - use cached data
  });

  return query;
}

export function useCompletionsByMaintenance(maintenanceId: string | undefined) {
  const { data: completions } = useMaintenanceCompletions();
  if (!maintenanceId) return [];
  return completions?.filter(c => c.maintenanceId === maintenanceId) || [];
}

export function useMaintenanceCompletionActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { preferences } = useUserPreferences();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { encryptForCategory, shouldEncrypt } = useEncryption();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const createCompletion = async (
    maintenanceId: string,
    completedDate: string,
    mileageAtCompletion?: string,
    notes?: string,
    parts?: MaintenancePart[],
    receiptImetaRow?: string[]
  ) => {
    if (!user) throw new Error('Must be logged in');

    const useEncryption = isEncryptionEnabled('maintenance') && shouldEncrypt('maintenance');
    const receiptFromImeta =
      receiptImetaRow && receiptImetaRow.length > 0 ? parseImetaRow(receiptImetaRow) : {};

    const tags: string[][] = [
      ['a', `${MAINTENANCE_KIND}:${user.pubkey}:${maintenanceId}`, '', 'maintenance'],
      ['alt', useEncryption ? 'Encrypted Cypher Log maintenance completion' : `Maintenance completed on ${completedDate}`],
    ];

    let content = '';
    let dualPublish: { plainContent: string } | undefined;
    if (useEncryption) {
      const payload: MaintenanceCompletionData = {
        completedDate,
        mileageAtCompletion,
        notes,
        parts,
        ...(receiptFromImeta.url && {
          receiptUrl: receiptFromImeta.url,
          ...(receiptFromImeta.mime && { receiptMime: receiptFromImeta.mime }),
        }),
      };
      content = await encryptForCategory('maintenance', payload);
      dualPublish = { plainContent: JSON.stringify(payload) };
    } else {
      tags.push(['completed_date', completedDate]);
      if (mileageAtCompletion) tags.push(['mileage_at_completion', mileageAtCompletion]);
      if (notes) tags.push(['notes', notes]);
      if (parts?.length) {
        for (const part of parts) {
          const partTag = ['part', part.name];
          if (part.partNumber) partTag.push(part.partNumber);
          if (part.cost) partTag.push(part.cost);
          tags.push(partTag);
        }
      }
      if (receiptImetaRow && receiptImetaRow.length > 0 && receiptImetaRow[0] === 'imeta') {
        tags.push(receiptImetaRow);
      }
    }

    const event = await publishEvent({
      kind: MAINTENANCE_COMPLETION_KIND,
      content,
      tags,
      ...(dualPublish && { dualPublish }),
    });

    if (event) {
      await cacheEvents([event]);
    }

    await queryClient.refetchQueries({ queryKey: ['maintenance-completions'] });
  };

  const deleteCompletion = async (id: string) => {
    if (!user) throw new Error('Must be logged in');

    const privateRelayUrls = (preferences.privateRelays ?? []).filter(isRelayUrlSecure);
    const publicRelayUrls = config.relayMetadata.relays
      .filter((r) => !privateRelayUrls.includes(r.url))
      .map((r) => r.url);

    const cachedEvents = await getCachedEvents([MAINTENANCE_COMPLETION_KIND], user.pubkey);
    const completionEvent = cachedEvents.find((e) => e.id === id);
    const created_at = completionEvent?.created_at;

    const siblingIds =
      (privateRelayUrls.length > 0 || publicRelayUrls.length > 0) && created_at !== undefined
        ? await getSiblingEventIdsForDeletion(
            nostr.group(privateRelayUrls),
            nostr.group(publicRelayUrls),
            MAINTENANCE_COMPLETION_KIND,
            user.pubkey,
            { created_at },
            AbortSignal.timeout(5000)
          )
        : [id];

    const tags: string[][] = [];
    for (const eventId of siblingIds) tags.push(['e', eventId]);

    const event = await publishEvent({
      kind: 5,
      content: 'Deleted maintenance completion',
      tags,
    });

    if (event) {
      await cacheEvents([event]);
      await deleteCachedEventById(id);
    }

    await queryClient.refetchQueries({ queryKey: ['maintenance-completions'] });
  };

  const deleteCompletionsByMaintenanceId = async (maintenanceId: string) => {
    if (!user) throw new Error('Must be logged in');

    // Get all completions for this maintenance
    const completions = queryClient.getQueryData<MaintenanceCompletion[]>(['maintenance-completions', user.pubkey]) || [];
    const toDelete = completions.filter(c => c.maintenanceId === maintenanceId);

    // Delete each completion
    for (const completion of toDelete) {
      await deleteCompletion(completion.id);
    }
  };

  return { createCompletion, deleteCompletion, deleteCompletionsByMaintenanceId };
}
