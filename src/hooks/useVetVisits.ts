import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption, useDecryptConcurrency, isAbortError } from './useEncryption';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { VET_VISIT_KIND, PET_KIND, type VetVisit, type VetVisitType } from '@/lib/types';
import { cacheEvents, getCachedEvents, deleteCachedEventById } from '@/lib/eventCache';
import { isRelayUrlSecure } from '@/lib/relay';
import { getSiblingEventIdsForDeletion } from '@/lib/relayDeletion';
import { logger } from '@/lib/logger';
import { runWithConcurrencyLimit } from '@/lib/utils';

// Encrypted content marker
const ENCRYPTED_MARKER = 'nip44:';

// Helper to get tag value
function getTagValue(event: NostrEvent, tagName: string): string | undefined {
  return event.tags.find(([name]) => name === tagName)?.[1];
}

// Helper to get all tag values (for arrays like vaccinations or documents)
function getTagValues(event: NostrEvent, tagName: string): string[] {
  return event.tags
    .filter(([name]) => name === tagName)
    .map(tag => tag[1])
    .filter(Boolean);
}

// Data stored in encrypted content
type VetVisitData = Omit<VetVisit, 'id' | 'pubkey' | 'createdAt'>;

// Parse a Nostr event into a VetVisit object (plaintext version)
function parseVetVisitPlaintext(event: NostrEvent): VetVisit | null {
  const id = event.id;
  const visitDate = getTagValue(event, 'visit_date');
  const visitType = getTagValue(event, 'visit_type') as VetVisitType;
  const reason = getTagValue(event, 'reason');

  // Get pet reference from 'a' tag
  const aTag = event.tags.find(([name]) => name === 'a')?.[1];
  const petId = aTag?.split(':')[2]; // Format: kind:pubkey:d-tag

  if (!id || !visitDate || !visitType || !reason || !petId) return null;

  return {
    id,
    petId,
    visitDate,
    visitType,
    reason,
    vetClinic: getTagValue(event, 'vet_clinic'),
    veterinarian: getTagValue(event, 'veterinarian'),
    companyId: getTagValue(event, 'company_id'),
    diagnosis: getTagValue(event, 'diagnosis'),
    treatment: getTagValue(event, 'treatment'),
    prescriptions: getTagValue(event, 'prescriptions'),
    weight: getTagValue(event, 'weight'),
    vaccinations: getTagValues(event, 'vaccination'),
    followUpDate: getTagValue(event, 'follow_up_date'),
    followUpNotes: getTagValue(event, 'follow_up_notes'),
    cost: getTagValue(event, 'cost'),
    documentsUrls: getTagValues(event, 'document_url'),
    notes: getTagValue(event, 'notes'),
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

// Parse encrypted vet visit from content
async function parseVetVisitEncrypted(
  event: NostrEvent,
  decryptFn: (content: string) => Promise<VetVisitData>
): Promise<VetVisit | null> {
  const id = event.id;
  if (!id) return null;

  try {
    const data = await decryptFn(event.content);
    return {
      id,
      ...data,
      pubkey: event.pubkey,
      createdAt: event.created_at,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    logger.error('[VetVisits] Failed to decrypt vet visit');
    return null;
  }
}

// Extract deleted vet visit IDs from kind 5 events
function getDeletedVetVisitIds(deletionEvents: NostrEvent[]): Set<string> {
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

// Parse events into vet visits
async function parseEventsToVetVisits(
  events: NostrEvent[],
  decryptForCategory: <T>(content: string) => Promise<T>,
  decryptConcurrency: number,
): Promise<VetVisit[]> {
  // Separate vet visit events from deletion events
  const vetVisitEvents = events.filter(e => e.kind === VET_VISIT_KIND);
  const deletionEvents = events.filter(e => e.kind === 5);

  // Get the set of deleted vet visit IDs
  const deletedIds = getDeletedVetVisitIds(deletionEvents);

  const results = await runWithConcurrencyLimit(
    vetVisitEvents,
    decryptConcurrency,
    async (event): Promise<VetVisit | null> => {
      if (deletedIds.has(event.id)) return null;
      if (event.content?.startsWith(ENCRYPTED_MARKER)) {
        return parseVetVisitEncrypted(event, (content) => decryptForCategory<VetVisitData>(content));
      }
      return parseVetVisitPlaintext(event);
    }
  );

  return results.filter((v): v is VetVisit => v != null).sort((a, b) => {
    // Parse MM/DD/YYYY dates for comparison
    const parseDate = (dateStr: string) => {
      const parts = dateStr.split('/');
      if (parts.length !== 3) return 0;
      return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1])).getTime();
    };
    return parseDate(b.visitDate) - parseDate(a.visitDate);
  });
}

export function useVetVisits() {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();
  const decryptConcurrency = useDecryptConcurrency();

  // Main query - loads from cache only
  // Background sync is handled centrally by useDataSyncStatus
  const query = useQuery({
    queryKey: ['vet-visits', user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey) {
        return [];
      }

      // Load from cache (populated by useDataSyncStatus)
      const cachedEvents = await getCachedEvents([VET_VISIT_KIND, 5], user.pubkey);

      if (cachedEvents.length > 0) {
        const vetVisits = await parseEventsToVetVisits(
          cachedEvents,
          decryptForCategory,
          decryptConcurrency,
        );
        return vetVisits;
      }

      return [];
    },
    enabled: !!user?.pubkey,
    staleTime: Infinity, // Data comes from IndexedDB cache, no need to refetch
    gcTime: Infinity, // Keep in memory for the session
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch when component remounts - use cached data
  });

  return query;
}

export function useVetVisitsByPetId(petId: string | undefined) {
  const { data: vetVisits } = useVetVisits();
  if (!petId) return [];
  return vetVisits?.filter(v => v.petId === petId) || [];
}

export function useVetVisitsByCompanyId(companyId: string | undefined) {
  const { data: vetVisits } = useVetVisits();
  if (!companyId) return [];
  return vetVisits?.filter(v => v.companyId === companyId) ?? [];
}

export function useVetVisitActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { preferences } = useUserPreferences();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { encryptForCategory, shouldEncrypt } = useEncryption();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const createVetVisit = async (
    petId: string,
    data: Omit<VetVisit, 'id' | 'petId' | 'pubkey' | 'createdAt'>
  ) => {
    if (!user) throw new Error('Must be logged in');

    const useEncryption = isEncryptionEnabled('pets');

    // Base tags (always included)
    const tags: string[][] = [
      ['a', `${PET_KIND}:${user.pubkey}:${petId}`, '', 'pet'],
      ['alt', useEncryption ? 'Encrypted Cypher Log vet visit data' : `Vet visit on ${data.visitDate}`],
    ];

    let content = '';

    if (useEncryption && shouldEncrypt('pets')) {
      const payload = { petId, ...data };
      content = await encryptForCategory('pets', payload);
    } else {
      // Store data in plaintext tags
      tags.push(['visit_date', data.visitDate]);
      tags.push(['visit_type', data.visitType]);
      tags.push(['reason', data.reason]);

      if (data.vetClinic) tags.push(['vet_clinic', data.vetClinic]);
      if (data.veterinarian) tags.push(['veterinarian', data.veterinarian]);
      if (data.companyId) tags.push(['company_id', data.companyId]);
      if (data.diagnosis) tags.push(['diagnosis', data.diagnosis]);
      if (data.treatment) tags.push(['treatment', data.treatment]);
      if (data.prescriptions) tags.push(['prescriptions', data.prescriptions]);
      if (data.weight) tags.push(['weight', data.weight]);
      if (data.followUpDate) tags.push(['follow_up_date', data.followUpDate]);
      if (data.followUpNotes) tags.push(['follow_up_notes', data.followUpNotes]);
      if (data.cost) tags.push(['cost', data.cost]);
      if (data.notes) tags.push(['notes', data.notes]);

      if (data.vaccinations) {
        for (const vaccination of data.vaccinations) {
          tags.push(['vaccination', vaccination]);
        }
      }

      if (data.documentsUrls) {
        for (const url of data.documentsUrls) {
          tags.push(['document_url', url]);
        }
      }
    }

    const event = await publishEvent({
      kind: VET_VISIT_KIND,
      content,
      tags,
    });

    if (event) {
      await cacheEvents([event]);
    }

    // Small delay to allow the event to propagate
    await new Promise(resolve => setTimeout(resolve, 500));

    await queryClient.refetchQueries({ queryKey: ['vet-visits', user.pubkey] });

    return event?.id;
  };

  const updateVetVisit = async (
    id: string,
    petId: string,
    data: Omit<VetVisit, 'id' | 'petId' | 'pubkey' | 'createdAt'>
  ) => {
    if (!user) throw new Error('Must be logged in');

    // For regular events, we need to delete the old one and create a new one
    // First, delete the old event
    await deleteVetVisit(id);

    // Then create a new event with the updated data
    return await createVetVisit(petId, data);
  };

  const deleteVetVisit = async (id: string) => {
    if (!user) throw new Error('Must be logged in');

    const privateRelayUrls = (preferences.privateRelays ?? []).filter(isRelayUrlSecure);
    const publicRelayUrls = config.relayMetadata.relays
      .filter((r) => !privateRelayUrls.includes(r.url))
      .map((r) => r.url);

    const cachedEvents = await getCachedEvents([VET_VISIT_KIND], user.pubkey);
    const visitEvent = cachedEvents.find((e) => e.id === id);
    const created_at = visitEvent?.created_at;

    const siblingIds =
      (privateRelayUrls.length > 0 || publicRelayUrls.length > 0) && created_at !== undefined
        ? await getSiblingEventIdsForDeletion(
            nostr.group(privateRelayUrls),
            nostr.group(publicRelayUrls),
            VET_VISIT_KIND,
            user.pubkey,
            { created_at },
            AbortSignal.timeout(5000)
          )
        : [id];

    const tags: string[][] = [];
    for (const eventId of siblingIds) tags.push(['e', eventId]);

    const event = await publishEvent({
      kind: 5,
      content: 'Deleted vet visit',
      tags,
    });

    if (event) {
      await cacheEvents([event]);
      await deleteCachedEventById(id);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    await queryClient.refetchQueries({ queryKey: ['vet-visits', user.pubkey] });
  };

  const deleteVetVisitsByPetId = async (petId: string) => {
    if (!user) throw new Error('Must be logged in');

    // Get all vet visits for this pet
    const vetVisits = queryClient.getQueryData<VetVisit[]>(['vet-visits', user.pubkey]) || [];
    const toDelete = vetVisits.filter(v => v.petId === petId);

    // Delete each vet visit
    for (const vetVisit of toDelete) {
      await deleteVetVisit(vetVisit.id);
    }
  };

  return { createVetVisit, updateVetVisit, deleteVetVisit, deleteVetVisitsByPetId };
}
