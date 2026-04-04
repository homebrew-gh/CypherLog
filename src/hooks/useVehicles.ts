import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption, useDecryptConcurrency, isAbortError } from './useEncryption';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { VEHICLE_KIND, type Vehicle, type VehicleDocument } from '@/lib/types';
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

// Helper to get all tag values (for arrays like documents)
function getTagValues(event: NostrEvent, tagName: string): string[] {
  return event.tags
    .filter(([name]) => name === tagName)
    .map(tag => tag[1])
    .filter(Boolean);
}

// Parse document tags: ["document", "<url>", "<name>", "<uploadedAt>"] or legacy document_url
function parseVehicleDocuments(event: NostrEvent): { documents: VehicleDocument[]; documentsUrls: string[] } {
  const documentTags = event.tags.filter(([name]) => name === 'document');
  if (documentTags.length > 0) {
    const documents: VehicleDocument[] = documentTags
      .map(tag => ({
        url: tag[1] || '',
        name: tag[2] || undefined,
        uploadedAt: tag[3] || undefined,
      }))
      .filter(doc => doc.url);
    return {
      documents,
      documentsUrls: documents.map(d => d.url),
    };
  }
  const urls = getTagValues(event, 'document_url');
  return {
    documents: urls.map(url => ({ url })),
    documentsUrls: urls,
  };
}

// Data stored in encrypted content
type VehicleData = Omit<Vehicle, 'id' | 'pubkey' | 'createdAt'>;

// Parse a Nostr event into a Vehicle object (plaintext version)
function parseVehiclePlaintext(event: NostrEvent): Vehicle | null {
  const id = getTagValue(event, 'd');
  const name = getTagValue(event, 'name');
  const vehicleType = getTagValue(event, 'vehicle_type');

  if (!id || !name || !vehicleType) return null;

  const { documents, documentsUrls } = parseVehicleDocuments(event);

  return {
    id,
    vehicleType,
    name,
    make: getTagValue(event, 'make'),
    model: getTagValue(event, 'model'),
    year: getTagValue(event, 'year'),
    purchaseDate: getTagValue(event, 'purchase_date'),
    purchasePrice: getTagValue(event, 'purchase_price'),
    purchaseLocation: getTagValue(event, 'purchase_location'),
    licensePlate: getTagValue(event, 'license_plate'),
    mileage: getTagValue(event, 'mileage'),
    fuelType: getTagValue(event, 'fuel_type'),
    registrationExpiry: getTagValue(event, 'registration_expiry'),
    hullId: getTagValue(event, 'hull_id'),
    registrationNumber: getTagValue(event, 'registration_number'),
    engineHours: getTagValue(event, 'engine_hours'),
    tailNumber: getTagValue(event, 'tail_number'),
    hobbsTime: getTagValue(event, 'hobbs_time'),
    serialNumber: getTagValue(event, 'serial_number'),
    receiptUrl: getTagValue(event, 'receipt_url'),
    warrantyUrl: getTagValue(event, 'warranty_url'),
    warrantyExpiry: getTagValue(event, 'warranty_expiry'),
    documents: documents.length > 0 ? documents : undefined,
    documentsUrls: documentsUrls.length > 0 ? documentsUrls : undefined,
    notes: getTagValue(event, 'notes'),
    isArchived: getTagValue(event, 'is_archived') === 'true',
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

// Parse encrypted vehicle from content
async function parseVehicleEncrypted(
  event: NostrEvent,
  decryptFn: (content: string) => Promise<VehicleData>
): Promise<Vehicle | null> {
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
    logger.error('[Vehicles] Failed to decrypt vehicle');
    return null;
  }
}

// Extract deleted vehicle IDs from kind 5 events
function getDeletedVehicleIds(deletionEvents: NostrEvent[], pubkey: string): Set<string> {
  const deletedIds = new Set<string>();

  for (const event of deletionEvents) {
    for (const tag of event.tags) {
      if (tag[0] === 'a') {
        // Parse "kind:pubkey:d-tag" format
        const parts = tag[1].split(':');
        if (parts.length >= 3 && parts[0] === String(VEHICLE_KIND) && parts[1] === pubkey) {
          deletedIds.add(parts[2]);
        }
      }
    }
  }

  return deletedIds;
}

// Parse events into vehicles
async function parseEventsToVehicles(
  events: NostrEvent[],
  pubkey: string,
  decryptForCategory: <T>(content: string) => Promise<T>,
  decryptConcurrency: number,
): Promise<Vehicle[]> {
  // Separate vehicle events from deletion events
  const vehicleEvents = events.filter(e => e.kind === VEHICLE_KIND);
  const deletionEvents = events.filter(e => e.kind === 5);

  // Get the set of deleted vehicle IDs
  const deletedIds = getDeletedVehicleIds(deletionEvents, pubkey);

  const results = await runWithConcurrencyLimit(
    vehicleEvents,
    decryptConcurrency,
    async (event): Promise<Vehicle | null> => {
      const id = getTagValue(event, 'd');
      if (!id || deletedIds.has(id)) return null;
      if (event.content?.startsWith(ENCRYPTED_MARKER)) {
        return parseVehicleEncrypted(event, (content) => decryptForCategory<VehicleData>(content));
      }
      return parseVehiclePlaintext(event);
    }
  );

  return results.filter((v): v is Vehicle => v != null).sort((a, b) => b.createdAt - a.createdAt);
}

export function useVehicles() {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();
  const decryptConcurrency = useDecryptConcurrency();
  const { isEncryptionEnabled } = useEncryptionSettings();

  // When vehicles encryption is on, wait for signer (NIP-44) before running the query
  // so we never try to decrypt before the signer is ready
  const canLoadVehicles =
    !!user?.pubkey &&
    (!isEncryptionEnabled('vehicles') || !!user?.signer?.nip44);

  const query = useQuery({
    queryKey: ['vehicles', user?.pubkey, canLoadVehicles],
    queryFn: async () => {
      if (!user?.pubkey) return [];

      try {
        const cachedEvents = await getCachedEvents([VEHICLE_KIND, 5], user.pubkey);
        if (cachedEvents.length === 0) return [];

        const vehicles = await parseEventsToVehicles(
          cachedEvents,
          user.pubkey,
          decryptForCategory,
          decryptConcurrency,
        );
        return vehicles;
      } catch (error) {
        logger.error('[Vehicles] Failed to load vehicles:', error);
        return [];
      }
    },
    enabled: canLoadVehicles,
    staleTime: Infinity, // Data comes from IndexedDB cache, no need to refetch
    gcTime: Infinity, // Keep in memory for the session
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch when component remounts - use cached data
  });

  return query;
}

export function useVehicleById(id: string | undefined) {
  const { data: vehicles } = useVehicles();
  return vehicles?.find(v => v.id === id);
}

export function useVehicleActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { preferences } = useUserPreferences();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { encryptForCategory, shouldEncrypt } = useEncryption();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const createVehicle = async (data: Omit<Vehicle, 'id' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    const id = crypto.randomUUID();
    const useEncryption = isEncryptionEnabled('vehicles');

    // Base tags (always included)
    const tags: string[][] = [
      ['d', id],
      ['alt', useEncryption ? 'Encrypted Cypher Log vehicle data' : `Vehicle: ${data.name}`],
    ];

    let content = '';
    let dualPublish: { plainContent: string } | undefined;

    if (useEncryption && shouldEncrypt('vehicles')) {
      // Store data in encrypted content; plain copy to private relays
      content = await encryptForCategory('vehicles', data);
      dualPublish = { plainContent: JSON.stringify(data) };
    } else {
      // Store data in plaintext tags (legacy format)
      tags.push(['name', data.name]);
      tags.push(['vehicle_type', data.vehicleType]);
      
      if (data.make) tags.push(['make', data.make]);
      if (data.model) tags.push(['model', data.model]);
      if (data.year) tags.push(['year', data.year]);
      if (data.purchaseDate) tags.push(['purchase_date', data.purchaseDate]);
      if (data.purchasePrice) tags.push(['purchase_price', data.purchasePrice]);
      if (data.purchaseLocation) tags.push(['purchase_location', data.purchaseLocation]);
      if (data.licensePlate) tags.push(['license_plate', data.licensePlate]);
      if (data.mileage) tags.push(['mileage', data.mileage]);
      if (data.fuelType) tags.push(['fuel_type', data.fuelType]);
      if (data.registrationExpiry) tags.push(['registration_expiry', data.registrationExpiry]);
      if (data.hullId) tags.push(['hull_id', data.hullId]);
      if (data.registrationNumber) tags.push(['registration_number', data.registrationNumber]);
      if (data.engineHours) tags.push(['engine_hours', data.engineHours]);
      if (data.tailNumber) tags.push(['tail_number', data.tailNumber]);
      if (data.hobbsTime) tags.push(['hobbs_time', data.hobbsTime]);
      if (data.serialNumber) tags.push(['serial_number', data.serialNumber]);
      if (data.receiptUrl) tags.push(['receipt_url', data.receiptUrl]);
      if (data.warrantyUrl) tags.push(['warranty_url', data.warrantyUrl]);
      if (data.warrantyExpiry) tags.push(['warranty_expiry', data.warrantyExpiry]);
      if (data.notes) tags.push(['notes', data.notes]);
      if (data.isArchived) tags.push(['is_archived', 'true']);

      if (data.documents && data.documents.length > 0) {
        for (const doc of data.documents) {
          const docTag = ['document', doc.url];
          if (doc.name) docTag.push(doc.name);
          if (doc.uploadedAt) docTag.push(doc.uploadedAt);
          tags.push(docTag);
        }
      } else if (data.documentsUrls && data.documentsUrls.length > 0) {
        for (const url of data.documentsUrls) {
          tags.push(['document_url', url]);
        }
      }
    }

    const event = await publishEvent({
      kind: VEHICLE_KIND,
      content,
      tags,
      ...(dualPublish && { dualPublish }),
    });

    if (event) {
      await cacheEvents([event]);
    }

    // Refetch to ensure immediate data refresh after creating a vehicle
    await queryClient.refetchQueries({ queryKey: ['vehicles', user.pubkey] });

    return id;
  };

  const updateVehicle = async (id: string, data: Omit<Vehicle, 'id' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    const useEncryption = isEncryptionEnabled('vehicles');

    // Base tags (always included)
    const tags: string[][] = [
      ['d', id],
      ['alt', useEncryption ? 'Encrypted Cypher Log vehicle data' : `Vehicle: ${data.name}`],
    ];

    let content = '';
    let dualPublish: { plainContent: string } | undefined;

    if (useEncryption && shouldEncrypt('vehicles')) {
      content = await encryptForCategory('vehicles', data);
      dualPublish = { plainContent: JSON.stringify(data) };
    } else {
      // Store data in plaintext tags (legacy format)
      tags.push(['name', data.name]);
      tags.push(['vehicle_type', data.vehicleType]);
      
      if (data.make) tags.push(['make', data.make]);
      if (data.model) tags.push(['model', data.model]);
      if (data.year) tags.push(['year', data.year]);
      if (data.purchaseDate) tags.push(['purchase_date', data.purchaseDate]);
      if (data.purchasePrice) tags.push(['purchase_price', data.purchasePrice]);
      if (data.purchaseLocation) tags.push(['purchase_location', data.purchaseLocation]);
      if (data.licensePlate) tags.push(['license_plate', data.licensePlate]);
      if (data.mileage) tags.push(['mileage', data.mileage]);
      if (data.fuelType) tags.push(['fuel_type', data.fuelType]);
      if (data.registrationExpiry) tags.push(['registration_expiry', data.registrationExpiry]);
      if (data.hullId) tags.push(['hull_id', data.hullId]);
      if (data.registrationNumber) tags.push(['registration_number', data.registrationNumber]);
      if (data.engineHours) tags.push(['engine_hours', data.engineHours]);
      if (data.tailNumber) tags.push(['tail_number', data.tailNumber]);
      if (data.hobbsTime) tags.push(['hobbs_time', data.hobbsTime]);
      if (data.serialNumber) tags.push(['serial_number', data.serialNumber]);
      if (data.receiptUrl) tags.push(['receipt_url', data.receiptUrl]);
      if (data.warrantyUrl) tags.push(['warranty_url', data.warrantyUrl]);
      if (data.warrantyExpiry) tags.push(['warranty_expiry', data.warrantyExpiry]);
      if (data.notes) tags.push(['notes', data.notes]);
      if (data.isArchived) tags.push(['is_archived', 'true']);

      if (data.documents && data.documents.length > 0) {
        for (const doc of data.documents) {
          const docTag = ['document', doc.url];
          if (doc.name) docTag.push(doc.name);
          if (doc.uploadedAt) docTag.push(doc.uploadedAt);
          tags.push(docTag);
        }
      } else if (data.documentsUrls && data.documentsUrls.length > 0) {
        for (const url of data.documentsUrls) {
          tags.push(['document_url', url]);
        }
      }
    }

    const event = await publishEvent({
      kind: VEHICLE_KIND,
      content,
      tags,
      ...(dualPublish && { dualPublish }),
    });

    if (event) {
      await cacheEvents([event]);
    }

    // Refetch to ensure immediate data refresh after updating a vehicle
    await queryClient.refetchQueries({ queryKey: ['vehicles', user.pubkey] });
  };

  const archiveVehicle = async (id: string, isArchived: boolean) => {
    if (!user) throw new Error('Must be logged in');

    // Get current vehicle data
    const vehicles = queryClient.getQueryData<Vehicle[]>(['vehicles', user.pubkey]) || [];
    const vehicle = vehicles.find(v => v.id === id);
    if (!vehicle) throw new Error('Vehicle not found');

    // Update with archive status
    await updateVehicle(id, { ...vehicle, isArchived });
  };

  const deleteVehicle = async (id: string) => {
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
            VEHICLE_KIND,
            user.pubkey,
            { dTag: id },
            AbortSignal.timeout(5000)
          )
        : [];

    const tags: string[][] = [['a', `${VEHICLE_KIND}:${user.pubkey}:${id}`]];
    for (const eventId of siblingIds) tags.push(['e', eventId]);

    const event = await publishEvent({
      kind: 5,
      content: 'Deleted vehicle',
      tags,
    });

    if (event) {
      await cacheEvents([event]);
      await deleteCachedEventByAddress(VEHICLE_KIND, user.pubkey, id);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    await queryClient.refetchQueries({ queryKey: ['vehicles'] });
    await queryClient.refetchQueries({ queryKey: ['maintenance'] });
  };

  return { createVehicle, updateVehicle, deleteVehicle, archiveVehicle };
}

// Get archived vehicles
export function useArchivedVehicles() {
  const { data: vehicles = [] } = useVehicles();
  return vehicles.filter(v => v.isArchived);
}

// Get active (non-archived) vehicles
export function useActiveVehicles() {
  const { data: vehicles = [] } = useVehicles();
  return vehicles.filter(v => !v.isArchived);
}
