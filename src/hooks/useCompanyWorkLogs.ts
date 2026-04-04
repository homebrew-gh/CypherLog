import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption, useDecryptConcurrency, isAbortError } from './useEncryption';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { COMPANY_WORK_LOG_KIND, COMPANY_KIND, type CompanyWorkLog } from '@/lib/types';
import { cacheEvents, getCachedEvents, deleteCachedEventById } from '@/lib/eventCache';
import { isRelayUrlSecure } from '@/lib/relay';
import { getSiblingEventIdsForDeletion } from '@/lib/relayDeletion';
import { logger } from '@/lib/logger';
import { runWithConcurrencyLimit } from '@/lib/utils';

const ENCRYPTED_MARKER = 'nip44';

function getTagValue(event: NostrEvent, tagName: string): string | undefined {
  return event.tags.find(([name]) => name === tagName)?.[1];
}

type CompanyWorkLogData = Omit<CompanyWorkLog, 'id' | 'pubkey' | 'createdAt'>;

function parseWorkLogPlaintext(event: NostrEvent): CompanyWorkLog | null {
  const id = event.id;
  const companyId = getTagValue(event, 'company_id');
  const description = getTagValue(event, 'description');

  if (!id || !companyId || !description) return null;

  return {
    id,
    companyId,
    description,
    totalPrice: getTagValue(event, 'total_price'),
    completedDate: getTagValue(event, 'completed_date'),
    completedDateStart: getTagValue(event, 'completed_date_start'),
    completedDateEnd: getTagValue(event, 'completed_date_end'),
    notes: getTagValue(event, 'notes'),
    invoiceUrl: getTagValue(event, 'invoice_url'),
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

async function parseWorkLogEncrypted(
  event: NostrEvent,
  decryptFn: (content: string) => Promise<CompanyWorkLogData>
): Promise<CompanyWorkLog | null> {
  if (!event.id) return null;
  try {
    const data = await decryptFn(event.content);
    return {
      id: event.id,
      ...data,
      pubkey: event.pubkey,
      createdAt: event.created_at,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    logger.error('[CompanyWorkLogs] Failed to decrypt work log');
    return null;
  }
}

function getDeletedWorkLogIds(deletionEvents: NostrEvent[]): Set<string> {
  const set = new Set<string>();
  for (const event of deletionEvents) {
    for (const tag of event.tags) {
      if (tag[0] === 'e') set.add(tag[1]);
    }
  }
  return set;
}

async function parseEventsToWorkLogs(
  events: NostrEvent[],
  decryptForCategory: <T>(content: string) => Promise<T>,
  decryptConcurrency: number,
): Promise<CompanyWorkLog[]> {
  const workLogEvents = events.filter((e) => e.kind === COMPANY_WORK_LOG_KIND);
  const deletionEvents = events.filter((e) => e.kind === 5);
  const deletedIds = getDeletedWorkLogIds(deletionEvents);

  const results = await runWithConcurrencyLimit(
    workLogEvents,
    decryptConcurrency,
    async (event): Promise<CompanyWorkLog | null> => {
      if (deletedIds.has(event.id)) return null;
      if (event.content?.startsWith(ENCRYPTED_MARKER)) {
        return parseWorkLogEncrypted(event, (content) =>
          decryptForCategory<CompanyWorkLogData>(content)
        );
      }
      return parseWorkLogPlaintext(event);
    }
  );

  const list = results.filter((w): w is CompanyWorkLog => w != null);

  const parseDate = (d: string | undefined): number => {
    if (!d) return 0;
    const parts = d.split('/');
    if (parts.length !== 3) return 0;
    return new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10)).getTime();
  };

  list.sort((a, b) => {
    const aTime = a.completedDate
      ? parseDate(a.completedDate)
      : a.completedDateEnd
        ? parseDate(a.completedDateEnd)
        : a.createdAt * 1000;
    const bTime = b.completedDate
      ? parseDate(b.completedDate)
      : b.completedDateEnd
        ? parseDate(b.completedDateEnd)
        : b.createdAt * 1000;
    return bTime - aTime;
  });

  return list;
}

export function useCompanyWorkLogs() {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();
  const decryptConcurrency = useDecryptConcurrency();

  const query = useQuery({
    queryKey: ['company-work-logs', user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey) return [];
      const cachedEvents = await getCachedEvents([COMPANY_WORK_LOG_KIND, 5], user.pubkey);
      if (cachedEvents.length > 0) {
        return parseEventsToWorkLogs(cachedEvents, decryptForCategory, decryptConcurrency);
      }
      return [];
    },
    enabled: !!user?.pubkey,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  return query;
}

export function useCompanyWorkLogsByCompanyId(companyId: string | undefined) {
  const { data: workLogs } = useCompanyWorkLogs();
  if (!companyId) return [];
  return workLogs?.filter((w) => w.companyId === companyId) ?? [];
}

export function useCompanyWorkLogActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { preferences } = useUserPreferences();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { encryptForCategory, shouldEncrypt } = useEncryption();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const createWorkLog = async (
    companyId: string,
    data: Omit<CompanyWorkLog, 'id' | 'companyId' | 'pubkey' | 'createdAt'>
  ) => {
    if (!user) throw new Error('Must be logged in');

    const useEncryption = isEncryptionEnabled('companies');

    const tags: string[][] = [
      ['a', `${COMPANY_KIND}:${user.pubkey}:${companyId}`, '', 'company'],
      ['company_id', companyId],
      ['alt', useEncryption ? 'Encrypted Cypher Log company work log' : `Work: ${data.description.slice(0, 50)}...`],
    ];

    let content = '';

    let dualPublish: { plainContent: string } | undefined;
    if (useEncryption && shouldEncrypt('companies')) {
      const payload = { companyId, ...data };
      content = await encryptForCategory('companies', payload);
      dualPublish = { plainContent: JSON.stringify(payload) };
    } else {
      tags.push(['description', data.description]);
      if (data.totalPrice) tags.push(['total_price', data.totalPrice]);
      if (data.completedDate) tags.push(['completed_date', data.completedDate]);
      if (data.completedDateStart) tags.push(['completed_date_start', data.completedDateStart]);
      if (data.completedDateEnd) tags.push(['completed_date_end', data.completedDateEnd]);
      if (data.notes) tags.push(['notes', data.notes]);
      if (data.invoiceUrl) tags.push(['invoice_url', data.invoiceUrl]);
    }

    const event = await publishEvent({
      kind: COMPANY_WORK_LOG_KIND,
      content,
      tags,
      ...(dualPublish && { dualPublish }),
    });

    if (event) {
      await cacheEvents([event]);
    }

    await new Promise((r) => setTimeout(r, 500));
    await queryClient.refetchQueries({ queryKey: ['company-work-logs', user.pubkey] });

    return event?.id;
  };

  const updateWorkLog = async (
    id: string,
    companyId: string,
    data: Omit<CompanyWorkLog, 'id' | 'companyId' | 'pubkey' | 'createdAt'>
  ) => {
    if (!user) throw new Error('Must be logged in');
    await deleteWorkLog(id);
    return createWorkLog(companyId, data);
  };

  const deleteWorkLog = async (id: string) => {
    if (!user) throw new Error('Must be logged in');

    const privateRelayUrls = (preferences.privateRelays ?? []).filter(isRelayUrlSecure);
    const publicRelayUrls = config.relayMetadata.relays
      .filter((r) => !privateRelayUrls.includes(r.url))
      .map((r) => r.url);

    const cachedEvents = await getCachedEvents([COMPANY_WORK_LOG_KIND], user.pubkey);
    const workLogEvent = cachedEvents.find((e) => e.id === id);
    const created_at = workLogEvent?.created_at;

    const siblingIds =
      (privateRelayUrls.length > 0 || publicRelayUrls.length > 0) && created_at !== undefined
        ? await getSiblingEventIdsForDeletion(
            nostr.group(privateRelayUrls),
            nostr.group(publicRelayUrls),
            COMPANY_WORK_LOG_KIND,
            user.pubkey,
            { created_at },
            AbortSignal.timeout(5000)
          )
        : [id];

    const tags: string[][] = [];
    for (const eventId of siblingIds) tags.push(['e', eventId]);

    const event = await publishEvent({
      kind: 5,
      content: 'Deleted company work log',
      tags,
    });

    if (event) {
      await cacheEvents([event]);
      await deleteCachedEventById(id);
    }

    await new Promise((r) => setTimeout(r, 500));
    await queryClient.refetchQueries({ queryKey: ['company-work-logs', user.pubkey] });
  };

  return { createWorkLog, updateWorkLog, deleteWorkLog };
}
