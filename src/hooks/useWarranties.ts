import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption, useDecryptConcurrency, isAbortError } from './useEncryption';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { WARRANTY_KIND, type Warranty, type WarrantyDocument, type WarrantyLinkedType } from '@/lib/types';
import { cacheEvents, getCachedEvents, deleteCachedEventByAddress } from '@/lib/eventCache';
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

// Helper to parse document tags
// Format: ["document", "<url>", "<name>", "<uploadedAt>"]
function parseDocumentTags(event: NostrEvent): WarrantyDocument[] {
  return event.tags
    .filter(([name]) => name === 'document')
    .map(tag => ({
      url: tag[1] || '',
      name: tag[2] || undefined,
      uploadedAt: tag[3] || undefined,
    }))
    .filter(doc => doc.url);
}

// Data stored in encrypted content
type WarrantyData = Omit<Warranty, 'id' | 'pubkey' | 'createdAt'>;

// Parse a Nostr event into a Warranty object (plaintext version)
function parseWarrantyPlaintext(event: NostrEvent): Warranty | null {
  const id = getTagValue(event, 'd');
  const name = getTagValue(event, 'name');
  const warrantyType = getTagValue(event, 'warranty_type');

  if (!id || !name || !warrantyType) return null;

  return {
    id,
    warrantyType,
    name,
    description: getTagValue(event, 'description'),
    purchaseDate: getTagValue(event, 'purchase_date'),
    purchasePrice: getTagValue(event, 'purchase_price'),
    warrantyStartDate: getTagValue(event, 'warranty_start_date'),
    warrantyEndDate: getTagValue(event, 'warranty_end_date'),
    warrantyLength: getTagValue(event, 'warranty_length'),
    warrantyLengthValue: getTagValue(event, 'warranty_length_value') ? parseInt(getTagValue(event, 'warranty_length_value')!, 10) : undefined,
    warrantyLengthUnit: getTagValue(event, 'warranty_length_unit') as 'weeks' | 'months' | 'years' | undefined,
    isLifetime: getTagValue(event, 'is_lifetime') === 'true',
    linkedType: getTagValue(event, 'linked_type') as WarrantyLinkedType | undefined,
    linkedItemId: getTagValue(event, 'linked_item_id'),
    linkedItemName: getTagValue(event, 'linked_item_name'),
    companyId: getTagValue(event, 'company_id'),
    companyName: getTagValue(event, 'company_name'),
    isRegistered: getTagValue(event, 'is_registered') === 'true',
    registrationDate: getTagValue(event, 'registration_date'),
    registrationNumber: getTagValue(event, 'registration_number'),
    registrationNotes: getTagValue(event, 'registration_notes'),
    hasExtendedWarranty: getTagValue(event, 'has_extended_warranty') === 'true',
    extendedWarrantyProvider: getTagValue(event, 'extended_warranty_provider'),
    extendedWarrantyEndDate: getTagValue(event, 'extended_warranty_end_date'),
    extendedWarrantyCost: getTagValue(event, 'extended_warranty_cost'),
    extendedWarrantyNotes: getTagValue(event, 'extended_warranty_notes'),
    documents: parseDocumentTags(event),
    receiptUrl: getTagValue(event, 'receipt_url'),
    notes: getTagValue(event, 'notes'),
    isArchived: getTagValue(event, 'is_archived') === 'true',
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

// Parse encrypted warranty from content
async function parseWarrantyEncrypted(
  event: NostrEvent,
  decryptFn: (content: string) => Promise<WarrantyData>
): Promise<Warranty | null> {
  const id = getTagValue(event, 'd');
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
    logger.error('[Warranties] Failed to decrypt warranty');
    return null;
  }
}

// Extract deleted warranty IDs from kind 5 events
function getDeletedWarrantyIds(deletionEvents: NostrEvent[], pubkey: string): Set<string> {
  const deletedIds = new Set<string>();

  for (const event of deletionEvents) {
    for (const tag of event.tags) {
      if (tag[0] === 'a') {
        // Parse "kind:pubkey:d-tag" format
        const parts = tag[1].split(':');
        if (parts.length >= 3 && parts[0] === String(WARRANTY_KIND) && parts[1] === pubkey) {
          deletedIds.add(parts[2]);
        }
      }
    }
  }

  return deletedIds;
}

// Parse events into warranties
async function parseEventsToWarranties(
  events: NostrEvent[],
  pubkey: string,
  decryptForCategory: <T>(content: string) => Promise<T>,
  decryptConcurrency: number,
): Promise<Warranty[]> {
  // Separate warranty events from deletion events
  const warrantyEvents = events.filter(e => e.kind === WARRANTY_KIND);
  const deletionEvents = events.filter(e => e.kind === 5);

  // Get the set of deleted warranty IDs
  const deletedIds = getDeletedWarrantyIds(deletionEvents, pubkey);

  const results = await runWithConcurrencyLimit(
    warrantyEvents,
    decryptConcurrency,
    async (event): Promise<Warranty | null> => {
      const id = getTagValue(event, 'd');
      if (!id || deletedIds.has(id)) return null;
      if (event.content?.startsWith(ENCRYPTED_MARKER)) {
        return parseWarrantyEncrypted(event, (content) => decryptForCategory<WarrantyData>(content));
      }
      return parseWarrantyPlaintext(event);
    }
  );

  return results.filter((w): w is Warranty => w != null).sort((a, b) => b.createdAt - a.createdAt);
}

export function useWarranties() {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();
  const decryptConcurrency = useDecryptConcurrency();

  // Main query - loads from cache only
  // Background sync is handled centrally by useDataSyncStatus
  const query = useQuery({
    queryKey: ['warranties', user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey) return [];

      // Load from cache (populated by useDataSyncStatus)
      const cachedEvents = await getCachedEvents([WARRANTY_KIND, 5], user.pubkey);
      
      if (cachedEvents.length > 0) {
        const warranties = await parseEventsToWarranties(
          cachedEvents,
          user.pubkey,
          decryptForCategory,
          decryptConcurrency,
        );
        return warranties;
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

export function useWarrantyById(id: string | undefined) {
  const { data: warranties } = useWarranties();
  return warranties?.find(w => w.id === id);
}

// Get warranties linked to a specific appliance
export function useWarrantiesByApplianceId(applianceId: string | undefined) {
  const { data: warranties = [] } = useWarranties();
  if (!applianceId) return [];
  return warranties.filter(w => w.linkedType === 'appliance' && w.linkedItemId === applianceId);
}

// Get warranties linked to a specific vehicle
export function useWarrantiesByVehicleId(vehicleId: string | undefined) {
  const { data: warranties = [] } = useWarranties();
  if (!vehicleId) return [];
  return warranties.filter(w => w.linkedType === 'vehicle' && w.linkedItemId === vehicleId);
}

// Get warranties linked to a specific company
export function useWarrantiesByCompanyId(companyId: string | undefined) {
  const { data: warranties = [] } = useWarranties();
  if (!companyId) return [];
  return warranties.filter(w => w.companyId === companyId);
}

// Get warranties expiring soon (within 90 days) sorted by expiration date
export function useExpiringWarranties(daysAhead: number = 90) {
  const { data: warranties = [] } = useWarranties();
  
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(now.getDate() + daysAhead);
  
  return warranties
    .filter(w => {
      // Use extended warranty end date if available, otherwise regular warranty end date
      const endDateStr = w.hasExtendedWarranty && w.extendedWarrantyEndDate 
        ? w.extendedWarrantyEndDate 
        : w.warrantyEndDate;
      
      if (!endDateStr) return false;
      
      // Parse MM/DD/YYYY format
      const parts = endDateStr.split('/');
      if (parts.length !== 3) return false;
      
      const endDate = new Date(
        parseInt(parts[2]),
        parseInt(parts[0]) - 1,
        parseInt(parts[1])
      );
      
      // Check if warranty is not expired and expires within the time window
      return endDate >= now && endDate <= futureDate;
    })
    .sort((a, b) => {
      const aEndDateStr = a.hasExtendedWarranty && a.extendedWarrantyEndDate 
        ? a.extendedWarrantyEndDate 
        : a.warrantyEndDate;
      const bEndDateStr = b.hasExtendedWarranty && b.extendedWarrantyEndDate 
        ? b.extendedWarrantyEndDate 
        : b.warrantyEndDate;
      
      if (!aEndDateStr) return 1;
      if (!bEndDateStr) return -1;
      
      const aParts = aEndDateStr.split('/');
      const bParts = bEndDateStr.split('/');
      
      const aDate = new Date(parseInt(aParts[2]), parseInt(aParts[0]) - 1, parseInt(aParts[1]));
      const bDate = new Date(parseInt(bParts[2]), parseInt(bParts[0]) - 1, parseInt(bParts[1]));
      
      return aDate.getTime() - bDate.getTime();
    });
}

export function useWarrantyActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { preferences } = useUserPreferences();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { encryptForCategory, shouldEncrypt } = useEncryption();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const createWarranty = async (data: Omit<Warranty, 'id' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    const id = crypto.randomUUID();
    const useEncryption = isEncryptionEnabled('warranties');

    // Base tags (always included)
    const tags: string[][] = [
      ['d', id],
      ['alt', useEncryption ? 'Encrypted Cypher Log warranty data' : `Warranty: ${data.name}`],
    ];

    let content = '';

    let dualPublish: { plainContent: string } | undefined;
    if (useEncryption && shouldEncrypt('warranties')) {
      content = await encryptForCategory('warranties', data);
      dualPublish = { plainContent: JSON.stringify(data) };
    } else {
      // Store data in plaintext tags
      tags.push(['name', data.name]);
      tags.push(['warranty_type', data.warrantyType]);
      
      if (data.description) tags.push(['description', data.description]);
      if (data.purchaseDate) tags.push(['purchase_date', data.purchaseDate]);
      if (data.purchasePrice) tags.push(['purchase_price', data.purchasePrice]);
      if (data.warrantyStartDate) tags.push(['warranty_start_date', data.warrantyStartDate]);
      if (data.warrantyEndDate) tags.push(['warranty_end_date', data.warrantyEndDate]);
      if (data.warrantyLength) tags.push(['warranty_length', data.warrantyLength]);
      if (data.warrantyLengthValue !== undefined) tags.push(['warranty_length_value', String(data.warrantyLengthValue)]);
      if (data.warrantyLengthUnit) tags.push(['warranty_length_unit', data.warrantyLengthUnit]);
      if (data.isLifetime) tags.push(['is_lifetime', 'true']);
      if (data.linkedType) tags.push(['linked_type', data.linkedType]);
      if (data.linkedItemId) tags.push(['linked_item_id', data.linkedItemId]);
      if (data.linkedItemName) tags.push(['linked_item_name', data.linkedItemName]);
      if (data.companyId) tags.push(['company_id', data.companyId]);
      if (data.companyName) tags.push(['company_name', data.companyName]);
      if (data.isRegistered !== undefined) tags.push(['is_registered', String(data.isRegistered)]);
      if (data.registrationDate) tags.push(['registration_date', data.registrationDate]);
      if (data.registrationNumber) tags.push(['registration_number', data.registrationNumber]);
      if (data.registrationNotes) tags.push(['registration_notes', data.registrationNotes]);
      if (data.hasExtendedWarranty !== undefined) tags.push(['has_extended_warranty', String(data.hasExtendedWarranty)]);
      if (data.extendedWarrantyProvider) tags.push(['extended_warranty_provider', data.extendedWarrantyProvider]);
      if (data.extendedWarrantyEndDate) tags.push(['extended_warranty_end_date', data.extendedWarrantyEndDate]);
      if (data.extendedWarrantyCost) tags.push(['extended_warranty_cost', data.extendedWarrantyCost]);
      if (data.extendedWarrantyNotes) tags.push(['extended_warranty_notes', data.extendedWarrantyNotes]);
      if (data.receiptUrl) tags.push(['receipt_url', data.receiptUrl]);
      if (data.notes) tags.push(['notes', data.notes]);
      if (data.isArchived) tags.push(['is_archived', 'true']);

      // Add document tags
      if (data.documents && data.documents.length > 0) {
        for (const doc of data.documents) {
          const docTag = ['document', doc.url];
          if (doc.name) docTag.push(doc.name);
          if (doc.uploadedAt) docTag.push(doc.uploadedAt);
          tags.push(docTag);
        }
      }
    }

    const event = await publishEvent({
      kind: WARRANTY_KIND,
      content,
      tags,
      ...(dualPublish && { dualPublish }),
    });

    if (event) {
      await cacheEvents([event]);
    }

    // Refetch to ensure immediate data refresh after creating a warranty
    await queryClient.refetchQueries({ queryKey: ['warranties', user.pubkey] });

    return id;
  };

  const updateWarranty = async (id: string, data: Omit<Warranty, 'id' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    const useEncryption = isEncryptionEnabled('warranties');

    // Base tags (always included)
    const tags: string[][] = [
      ['d', id],
      ['alt', useEncryption ? 'Encrypted Cypher Log warranty data' : `Warranty: ${data.name}`],
    ];

    let content = '';

    let dualPublish: { plainContent: string } | undefined;
    if (useEncryption && shouldEncrypt('warranties')) {
      content = await encryptForCategory('warranties', data);
      dualPublish = { plainContent: JSON.stringify(data) };
    } else {
      // Store data in plaintext tags
      tags.push(['name', data.name]);
      tags.push(['warranty_type', data.warrantyType]);
      
      if (data.description) tags.push(['description', data.description]);
      if (data.purchaseDate) tags.push(['purchase_date', data.purchaseDate]);
      if (data.purchasePrice) tags.push(['purchase_price', data.purchasePrice]);
      if (data.warrantyStartDate) tags.push(['warranty_start_date', data.warrantyStartDate]);
      if (data.warrantyEndDate) tags.push(['warranty_end_date', data.warrantyEndDate]);
      if (data.warrantyLength) tags.push(['warranty_length', data.warrantyLength]);
      if (data.warrantyLengthValue !== undefined) tags.push(['warranty_length_value', String(data.warrantyLengthValue)]);
      if (data.warrantyLengthUnit) tags.push(['warranty_length_unit', data.warrantyLengthUnit]);
      if (data.isLifetime) tags.push(['is_lifetime', 'true']);
      if (data.linkedType) tags.push(['linked_type', data.linkedType]);
      if (data.linkedItemId) tags.push(['linked_item_id', data.linkedItemId]);
      if (data.linkedItemName) tags.push(['linked_item_name', data.linkedItemName]);
      if (data.companyId) tags.push(['company_id', data.companyId]);
      if (data.companyName) tags.push(['company_name', data.companyName]);
      if (data.isRegistered !== undefined) tags.push(['is_registered', String(data.isRegistered)]);
      if (data.registrationDate) tags.push(['registration_date', data.registrationDate]);
      if (data.registrationNumber) tags.push(['registration_number', data.registrationNumber]);
      if (data.registrationNotes) tags.push(['registration_notes', data.registrationNotes]);
      if (data.hasExtendedWarranty !== undefined) tags.push(['has_extended_warranty', String(data.hasExtendedWarranty)]);
      if (data.extendedWarrantyProvider) tags.push(['extended_warranty_provider', data.extendedWarrantyProvider]);
      if (data.extendedWarrantyEndDate) tags.push(['extended_warranty_end_date', data.extendedWarrantyEndDate]);
      if (data.extendedWarrantyCost) tags.push(['extended_warranty_cost', data.extendedWarrantyCost]);
      if (data.extendedWarrantyNotes) tags.push(['extended_warranty_notes', data.extendedWarrantyNotes]);
      if (data.receiptUrl) tags.push(['receipt_url', data.receiptUrl]);
      if (data.notes) tags.push(['notes', data.notes]);
      if (data.isArchived) tags.push(['is_archived', 'true']);

      // Add document tags
      if (data.documents && data.documents.length > 0) {
        for (const doc of data.documents) {
          const docTag = ['document', doc.url];
          if (doc.name) docTag.push(doc.name);
          if (doc.uploadedAt) docTag.push(doc.uploadedAt);
          tags.push(docTag);
        }
      }
    }

    const event = await publishEvent({
      kind: WARRANTY_KIND,
      content,
      tags,
      ...(dualPublish && { dualPublish }),
    });

    if (event) {
      await cacheEvents([event]);
    }

    // Refetch to ensure immediate data refresh after updating a warranty
    await queryClient.refetchQueries({ queryKey: ['warranties', user.pubkey] });
  };

  const archiveWarranty = async (id: string, isArchived: boolean) => {
    if (!user) throw new Error('Must be logged in');

    // Get current warranty data
    const warranties = queryClient.getQueryData<Warranty[]>(['warranties', user.pubkey]) || [];
    const warranty = warranties.find(w => w.id === id);
    if (!warranty) throw new Error('Warranty not found');

    // Update with archive status
    await updateWarranty(id, { ...warranty, isArchived });
  };

  const deleteWarranty = async (id: string) => {
    if (!user) throw new Error('Must be logged in');

    const privateRelayUrls = (preferences.privateRelays ?? []).filter(isRelayUrlSecure);
    const publicRelayUrls = config.relayMetadata.relays
      .filter((r) => !privateRelayUrls.includes(r.url))
      .map((r) => r.url);

    const siblingIds =
      privateRelayUrls.length > 0 || publicRelayUrls.length > 0
        ? await getSiblingEventIdsForDeletion(
            nostr.group(privateRelayUrls),
            nostr.group(publicRelayUrls),
            WARRANTY_KIND,
            user.pubkey,
            { dTag: id },
            AbortSignal.timeout(5000)
          )
        : [];

    const tags: string[][] = [['a', `${WARRANTY_KIND}:${user.pubkey}:${id}`]];
    for (const eventId of siblingIds) tags.push(['e', eventId]);

    const event = await publishEvent({
      kind: 5,
      content: 'Deleted warranty',
      tags,
    });

    if (event) {
      await cacheEvents([event]);
      await deleteCachedEventByAddress(WARRANTY_KIND, user.pubkey, id);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    await queryClient.refetchQueries({ queryKey: ['warranties'] });
  };

  return { createWarranty, updateWarranty, deleteWarranty, archiveWarranty };
}

// Get archived warranties
export function useArchivedWarranties() {
  const { data: warranties = [] } = useWarranties();
  return warranties.filter(w => w.isArchived);
}

// Get active (non-archived) warranties
export function useActiveWarranties() {
  const { data: warranties = [] } = useWarranties();
  return warranties.filter(w => !w.isArchived);
}

// Helper function to parse warranty end date and return a Date object
export function parseWarrantyEndDate(warranty: Warranty): Date | null {
  const endDateStr = warranty.hasExtendedWarranty && warranty.extendedWarrantyEndDate 
    ? warranty.extendedWarrantyEndDate 
    : warranty.warrantyEndDate;
  
  if (!endDateStr) return null;
  
  // Parse MM/DD/YYYY format
  const parts = endDateStr.split('/');
  if (parts.length !== 3) return null;
  
  return new Date(
    parseInt(parts[2]),
    parseInt(parts[0]) - 1,
    parseInt(parts[1])
  );
}

// Helper to check if warranty is expired
export function isWarrantyExpired(warranty: Warranty): boolean {
  // Lifetime warranties never expire
  if (warranty.isLifetime) return false;
  
  const endDate = parseWarrantyEndDate(warranty);
  if (!endDate) return false;
  return endDate < new Date();
}

// Helper to check if warranty is expiring soon (within 30 days by default)
export function isWarrantyExpiringSoon(warranty: Warranty, days: number = 30): boolean {
  // Lifetime warranties never expire
  if (warranty.isLifetime) return false;
  
  const endDate = parseWarrantyEndDate(warranty);
  if (!endDate) return false;
  
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(now.getDate() + days);
  
  return endDate >= now && endDate <= futureDate;
}

// Helper to format remaining warranty time
export function formatWarrantyTimeRemaining(warranty: Warranty): string {
  // Check for lifetime warranty first
  if (warranty.isLifetime) return 'Lifetime Warranty';
  
  const endDate = parseWarrantyEndDate(warranty);
  if (!endDate) return 'No expiration date';
  
  const now = new Date();
  const diffTime = endDate.getTime() - now.getTime();
  
  if (diffTime < 0) {
    const expiredDays = Math.abs(Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    if (expiredDays === 1) return 'Expired 1 day ago';
    if (expiredDays < 30) return `Expired ${expiredDays} days ago`;
    const expiredMonths = Math.floor(expiredDays / 30);
    if (expiredMonths === 1) return 'Expired 1 month ago';
    return `Expired ${expiredMonths} months ago`;
  }
  
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Expires today';
  if (diffDays === 1) return '1 day remaining';
  if (diffDays < 30) return `${diffDays} days remaining`;
  
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month remaining';
  if (diffMonths < 12) return `${diffMonths} months remaining`;
  
  const diffYears = Math.floor(diffDays / 365);
  const remainingMonths = Math.floor((diffDays % 365) / 30);
  
  if (diffYears === 1) {
    if (remainingMonths === 0) return '1 year remaining';
    return `1 year, ${remainingMonths} month${remainingMonths > 1 ? 's' : ''} remaining`;
  }
  
  if (remainingMonths === 0) return `${diffYears} years remaining`;
  return `${diffYears} years, ${remainingMonths} month${remainingMonths > 1 ? 's' : ''} remaining`;
}
