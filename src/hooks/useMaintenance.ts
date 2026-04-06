import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption, useDecryptConcurrency, isAbortError } from './useEncryption';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { MAINTENANCE_KIND, APPLIANCE_KIND, VEHICLE_KIND, COMPANY_KIND, type MaintenanceSchedule, type MaintenancePart } from '@/lib/types';
import { cacheEvents, getCachedEvents, deleteCachedEventByAddress } from '@/lib/eventCache';
import { isRelayUrlSecure } from '@/lib/relay';
import { getSiblingEventIdsForDeletion } from '@/lib/relayDeletion';
import { logger } from '@/lib/logger';
import { runWithConcurrencyLimit } from '@/lib/utils';

const ENCRYPTED_MARKER = 'nip44:';

/** Sensitive maintenance data stored in encrypted content when encryption is on */
interface MaintenanceScheduleData {
  description: string;
  frequency?: number;
  frequencyUnit?: MaintenanceSchedule['frequencyUnit'];
  homeFeature?: string;
  partNumber?: string;
  parts?: MaintenancePart[];
  mileageInterval?: number;
  intervalType?: MaintenanceSchedule['intervalType'];
  isLogOnly?: boolean;
  isArchived?: boolean;
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

// Parse a Nostr event into a MaintenanceSchedule object (plaintext tags)
function parseMaintenancePlaintext(event: NostrEvent): MaintenanceSchedule | null {
  const id = getTagValue(event, 'd');
  const description = getTagValue(event, 'description');
  const frequency = getTagValue(event, 'frequency');
  const frequencyUnit = getTagValue(event, 'frequency_unit');

  // Get reference from 'a' tags - could be appliance, vehicle, or company
  const aTags = event.tags.filter(([name]) => name === 'a');
  let applianceId: string | undefined;
  let vehicleId: string | undefined;
  let companyId: string | undefined;

  for (const aTag of aTags) {
    const parts = aTag[1]?.split(':');
    if (parts && parts.length >= 3) {
      const kind = parseInt(parts[0], 10);
      const refId = parts[2];
      if (kind === APPLIANCE_KIND) {
        applianceId = refId;
      } else if (kind === VEHICLE_KIND) {
        vehicleId = refId;
      } else if (kind === COMPANY_KIND) {
        companyId = refId;
      }
    }
  }

  const homeFeature = getTagValue(event, 'home_feature');
  const isLogOnly = getTagValue(event, 'is_log_only') === 'true';

  if (!id || !description || (!applianceId && !vehicleId && !homeFeature)) return null;
  if (!isLogOnly && (!frequency || !frequencyUnit)) return null;

  const validUnits = ['days', 'weeks', 'months', 'years'];
  if (!isLogOnly && frequencyUnit && !validUnits.includes(frequencyUnit)) return null;

  const mileageInterval = getTagValue(event, 'mileage_interval');
  const intervalType = getTagValue(event, 'interval_type');
  const parts = parsePartTags(event);

  return {
    id,
    applianceId,
    vehicleId,
    homeFeature,
    companyId,
    description,
    partNumber: getTagValue(event, 'part_number'),
    parts: parts.length > 0 ? parts : undefined,
    frequency: frequency ? parseInt(frequency, 10) : undefined,
    frequencyUnit: frequencyUnit as MaintenanceSchedule['frequencyUnit'],
    mileageInterval: mileageInterval ? parseInt(mileageInterval, 10) : undefined,
    intervalType: (intervalType === 'hours' ? 'hours' : 'miles') as MaintenanceSchedule['intervalType'],
    isLogOnly,
    isArchived: getTagValue(event, 'is_archived') === 'true',
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

/**
 * Dual-publish plaintext copy: same tags as encrypted (no description in tags), body is JSON.
 * Local cache stores this event from useNostrPublish; parseMaintenancePlaintext would return null.
 */
function parseMaintenanceDualPublishPlain(event: NostrEvent): MaintenanceSchedule | null {
  const raw = event.content?.trim();
  if (!raw || raw.startsWith(ENCRYPTED_MARKER) || raw[0] !== '{') return null;

  let data: MaintenanceScheduleData;
  try {
    data = JSON.parse(raw) as MaintenanceScheduleData;
  } catch {
    return null;
  }

  if (!data.description) return null;

  const id = getTagValue(event, 'd');
  if (!id) return null;

  const aTags = event.tags.filter(([name]) => name === 'a');
  let applianceId: string | undefined;
  let vehicleId: string | undefined;
  let companyId: string | undefined;

  for (const aTag of aTags) {
    const parts = aTag[1]?.split(':');
    if (parts && parts.length >= 3) {
      const kind = parseInt(parts[0], 10);
      const refId = parts[2];
      if (kind === APPLIANCE_KIND) applianceId = refId;
      else if (kind === VEHICLE_KIND) vehicleId = refId;
      else if (kind === COMPANY_KIND) companyId = refId;
    }
  }

  if (!applianceId && !vehicleId && !data.homeFeature) return null;
  if (!data.isLogOnly && (!data.frequency || !data.frequencyUnit)) return null;

  return {
    id,
    applianceId,
    vehicleId,
    homeFeature: data.homeFeature,
    companyId,
    description: data.description,
    partNumber: data.partNumber,
    parts: data.parts?.length ? data.parts : undefined,
    frequency: data.frequency,
    frequencyUnit: data.frequencyUnit,
    mileageInterval: data.mileageInterval,
    intervalType: data.intervalType,
    isLogOnly: data.isLogOnly,
    isArchived: data.isArchived,
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

// Parse encrypted maintenance from content; refs come from plaintext 'a' tags
async function parseMaintenanceEncrypted(
  event: NostrEvent,
  decryptFn: (content: string) => Promise<MaintenanceScheduleData>
): Promise<MaintenanceSchedule | null> {
  const id = getTagValue(event, 'd');
  if (!id || !event.content || !event.content.startsWith(ENCRYPTED_MARKER)) return null;

  const aTags = event.tags.filter(([name]) => name === 'a');
  let applianceId: string | undefined;
  let vehicleId: string | undefined;
  let companyId: string | undefined;

  for (const aTag of aTags) {
    const parts = aTag[1]?.split(':');
    if (parts && parts.length >= 3) {
      const kind = parseInt(parts[0], 10);
      const refId = parts[2];
      if (kind === APPLIANCE_KIND) applianceId = refId;
      else if (kind === VEHICLE_KIND) vehicleId = refId;
      else if (kind === COMPANY_KIND) companyId = refId;
    }
  }

  try {
    const data = await decryptFn(event.content);
    if (!data.description || (!applianceId && !vehicleId && !data.homeFeature)) return null;
    if (!data.isLogOnly && (!data.frequency || !data.frequencyUnit)) return null;

    return {
      id,
      applianceId,
      vehicleId,
      homeFeature: data.homeFeature,
      companyId,
      description: data.description,
      partNumber: data.partNumber,
      parts: data.parts?.length ? data.parts : undefined,
      frequency: data.frequency,
      frequencyUnit: data.frequencyUnit,
      mileageInterval: data.mileageInterval,
      intervalType: data.intervalType,
      isLogOnly: data.isLogOnly,
      isArchived: data.isArchived,
      pubkey: event.pubkey,
      createdAt: event.created_at,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    logger.warn('[Maintenance] Failed to decrypt schedule');
    return null;
  }
}

// Extract deleted maintenance IDs from kind 5 events
function getDeletedMaintenanceIds(deletionEvents: NostrEvent[], pubkey: string): Set<string> {
  const deletedIds = new Set<string>();

  for (const event of deletionEvents) {
    for (const tag of event.tags) {
      if (tag[0] === 'a') {
        // Parse "kind:pubkey:d-tag" format
        const parts = tag[1].split(':');
        if (parts.length >= 3 && parts[0] === String(MAINTENANCE_KIND) && parts[1] === pubkey) {
          deletedIds.add(parts[2]);
        }
      }
    }
  }

  return deletedIds;
}

// Extract deleted appliance IDs from kind 5 events (to filter out orphaned maintenance)
function getDeletedApplianceIds(deletionEvents: NostrEvent[], pubkey: string): Set<string> {
  const deletedIds = new Set<string>();

  for (const event of deletionEvents) {
    for (const tag of event.tags) {
      if (tag[0] === 'a') {
        // Parse "kind:pubkey:d-tag" format
        const parts = tag[1].split(':');
        if (parts.length >= 3 && parts[0] === String(APPLIANCE_KIND) && parts[1] === pubkey) {
          deletedIds.add(parts[2]);
        }
      }
    }
  }

  return deletedIds;
}

// Extract deleted vehicle IDs from kind 5 events (to filter out orphaned maintenance)
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

// Parse events into maintenance schedules (handles both encrypted and plaintext)
async function parseEventsToMaintenance(
  events: NostrEvent[],
  pubkey: string,
  decryptForCategory: <T>(content: string) => Promise<T>,
  decryptConcurrency: number,
): Promise<MaintenanceSchedule[]> {
  const maintenanceEvents = events.filter(e => e.kind === MAINTENANCE_KIND);
  const deletionEvents = events.filter(e => e.kind === 5);

  const deletedMaintenanceIds = getDeletedMaintenanceIds(deletionEvents, pubkey);
  const deletedApplianceIds = getDeletedApplianceIds(deletionEvents, pubkey);
  const deletedVehicleIds = getDeletedVehicleIds(deletionEvents, pubkey);

  const results = await runWithConcurrencyLimit(
    maintenanceEvents,
    decryptConcurrency,
    async (event): Promise<MaintenanceSchedule | null> => {
      const schedule = event.content?.startsWith(ENCRYPTED_MARKER)
        ? await parseMaintenanceEncrypted(event, (c) => decryptForCategory<MaintenanceScheduleData>(c))
        : parseMaintenancePlaintext(event) ?? parseMaintenanceDualPublishPlain(event);
      if (!schedule || deletedMaintenanceIds.has(schedule.id)) return null;
      if (schedule.applianceId && deletedApplianceIds.has(schedule.applianceId)) return null;
      if (schedule.vehicleId && deletedVehicleIds.has(schedule.vehicleId)) return null;
      return schedule;
    }
  );

  return results.filter((s): s is MaintenanceSchedule => s != null).sort((a, b) => b.createdAt - a.createdAt);
}

export function useMaintenance() {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();
  const decryptConcurrency = useDecryptConcurrency();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const canLoadMaintenance =
    !!user?.pubkey &&
    (!isEncryptionEnabled('maintenance') || !!user?.signer?.nip44);

  const query = useQuery({
    queryKey: ['maintenance', user?.pubkey, canLoadMaintenance],
    queryFn: async () => {
      if (!user?.pubkey) return [];

      const cachedEvents = await getCachedEvents([MAINTENANCE_KIND, 5], user.pubkey);
      if (cachedEvents.length > 0) {
        return parseEventsToMaintenance(
          cachedEvents,
          user.pubkey,
          decryptForCategory,
          decryptConcurrency,
        );
      }
      return [];
    },
    enabled: canLoadMaintenance,
    staleTime: Infinity, // Data comes from IndexedDB cache, no need to refetch
    gcTime: Infinity, // Keep in memory for the session
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch when component remounts - use cached data
  });

  return query;
}

export function useMaintenanceByAppliance(applianceId: string | undefined) {
  const { data: maintenance } = useMaintenance();
  if (!applianceId) return [];
  return maintenance?.filter(m => m.applianceId === applianceId) || [];
}

export function useMaintenanceByVehicle(vehicleId: string | undefined) {
  const { data: maintenance } = useMaintenance();
  if (!vehicleId) return [];
  return maintenance?.filter(m => m.vehicleId === vehicleId) || [];
}

// Get all appliance maintenance (for home maintenance tab) - includes both appliance and home feature maintenance
export function useApplianceMaintenance() {
  const { data: maintenance } = useMaintenance();
  // Return maintenance that has an appliance OR homeFeature but NOT a vehicle
  return useMemo(
    () => maintenance?.filter(m => (m.applianceId || m.homeFeature) && !m.vehicleId) || [],
    [maintenance]
  );
}

// Get all vehicle maintenance (for maintenance tab vehicle section)
export function useVehicleMaintenance() {
  const { data: maintenance } = useMaintenance();
  return useMemo(
    () => maintenance?.filter(m => m.vehicleId && !m.applianceId) || [],
    [maintenance]
  );
}

// Get all home feature maintenance (maintenance with homeFeature but no appliance)
export function useHomeFeatureMaintenance() {
  const { data: maintenance } = useMaintenance();
  return useMemo(
    () => maintenance?.filter(m => m.homeFeature && !m.applianceId && !m.vehicleId) || [],
    [maintenance]
  );
}

// Get maintenance schedules linked to a specific company
export function useMaintenanceByCompanyId(companyId: string | undefined) {
  const { data: maintenance } = useMaintenance();
  if (!companyId) return [];
  return maintenance?.filter(m => m.companyId === companyId) || [];
}

export function useMaintenanceActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { preferences } = useUserPreferences();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { encryptForCategory, shouldEncrypt } = useEncryption();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const createMaintenance = async (data: Omit<MaintenanceSchedule, 'id' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');
    if (!data.applianceId && !data.vehicleId && !data.homeFeature) {
      throw new Error('Must have either applianceId, vehicleId, or homeFeature');
    }

    const id = crypto.randomUUID();
    const useEncryption = isEncryptionEnabled('maintenance') && shouldEncrypt('maintenance');

    const tags: string[][] = [
      ['d', id],
      ['alt', useEncryption ? 'Encrypted Cypher Log maintenance data' : (data.isLogOnly ? `Maintenance log: ${data.description}` : `Maintenance schedule: ${data.description}`)],
    ];

    if (data.applianceId) {
      tags.push(['a', `${APPLIANCE_KIND}:${user.pubkey}:${data.applianceId}`, '', 'appliance']);
    }
    if (data.vehicleId) {
      tags.push(['a', `${VEHICLE_KIND}:${user.pubkey}:${data.vehicleId}`, '', 'vehicle']);
    }
    if (data.companyId) {
      tags.push(['a', `${COMPANY_KIND}:${user.pubkey}:${data.companyId}`, '', 'company']);
    }

    let content = '';
    if (useEncryption) {
      const payload: MaintenanceScheduleData = {
        description: data.description,
        frequency: data.frequency,
        frequencyUnit: data.frequencyUnit,
        homeFeature: data.homeFeature,
        partNumber: data.partNumber,
        parts: data.parts,
        mileageInterval: data.mileageInterval,
        intervalType: data.intervalType,
        isLogOnly: data.isLogOnly,
        isArchived: data.isArchived,
      };
      content = await encryptForCategory('maintenance', payload);
    } else {
      tags.push(['description', data.description]);
      if (!data.isLogOnly && data.frequency != null && data.frequencyUnit) {
        tags.push(['frequency', data.frequency.toString()]);
        tags.push(['frequency_unit', data.frequencyUnit]);
      }
      if (data.isLogOnly) tags.push(['is_log_only', 'true']);
      if (data.homeFeature) tags.push(['home_feature', data.homeFeature]);
      if (data.partNumber) tags.push(['part_number', data.partNumber]);
      if (data.parts?.length) {
        for (const part of data.parts) {
          const partTag = ['part', part.name];
          if (part.partNumber) partTag.push(part.partNumber);
          if (part.cost) partTag.push(part.cost);
          tags.push(partTag);
        }
      }
      if (data.mileageInterval != null) {
        tags.push(['mileage_interval', data.mileageInterval.toString()]);
        if (data.intervalType) tags.push(['interval_type', data.intervalType]);
      }
      if (data.isArchived) tags.push(['is_archived', 'true']);
    }

    const event = await publishEvent({
      kind: MAINTENANCE_KIND,
      content,
      tags,
    });

    if (event) {
      await cacheEvents([event]);
    }

    // Refetch to ensure immediate data refresh after creating maintenance
    await queryClient.refetchQueries({ queryKey: ['maintenance', user.pubkey] });

    return id;
  };

  const updateMaintenance = async (id: string, data: Omit<MaintenanceSchedule, 'id' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');
    if (!data.applianceId && !data.vehicleId && !data.homeFeature) {
      throw new Error('Must have either applianceId, vehicleId, or homeFeature');
    }

    const useEncryption = isEncryptionEnabled('maintenance') && shouldEncrypt('maintenance');

    const tags: string[][] = [
      ['d', id],
      ['alt', useEncryption ? 'Encrypted Cypher Log maintenance data' : (data.isLogOnly ? `Maintenance log: ${data.description}` : `Maintenance schedule: ${data.description}`)],
    ];

    if (data.applianceId) {
      tags.push(['a', `${APPLIANCE_KIND}:${user.pubkey}:${data.applianceId}`, '', 'appliance']);
    }
    if (data.vehicleId) {
      tags.push(['a', `${VEHICLE_KIND}:${user.pubkey}:${data.vehicleId}`, '', 'vehicle']);
    }
    if (data.companyId) {
      tags.push(['a', `${COMPANY_KIND}:${user.pubkey}:${data.companyId}`, '', 'company']);
    }

    let content = '';
    if (useEncryption) {
      const payload: MaintenanceScheduleData = {
        description: data.description,
        frequency: data.frequency,
        frequencyUnit: data.frequencyUnit,
        homeFeature: data.homeFeature,
        partNumber: data.partNumber,
        parts: data.parts,
        mileageInterval: data.mileageInterval,
        intervalType: data.intervalType,
        isLogOnly: data.isLogOnly,
        isArchived: data.isArchived,
      };
      content = await encryptForCategory('maintenance', payload);
    } else {
      tags.push(['description', data.description]);
      if (!data.isLogOnly && data.frequency != null && data.frequencyUnit) {
        tags.push(['frequency', data.frequency.toString()]);
        tags.push(['frequency_unit', data.frequencyUnit]);
      }
      if (data.isLogOnly) tags.push(['is_log_only', 'true']);
      if (data.homeFeature) tags.push(['home_feature', data.homeFeature]);
      if (data.partNumber) tags.push(['part_number', data.partNumber]);
      if (data.parts?.length) {
        for (const part of data.parts) {
          const partTag = ['part', part.name];
          if (part.partNumber) partTag.push(part.partNumber);
          if (part.cost) partTag.push(part.cost);
          tags.push(partTag);
        }
      }
      if (data.mileageInterval != null) {
        tags.push(['mileage_interval', data.mileageInterval.toString()]);
        if (data.intervalType) tags.push(['interval_type', data.intervalType]);
      }
      if (data.isArchived) tags.push(['is_archived', 'true']);
    }

    const event = await publishEvent({
      kind: MAINTENANCE_KIND,
      content,
      tags,
    });

    if (event) {
      await cacheEvents([event]);
    }

    // Refetch to ensure immediate data refresh after updating maintenance
    await queryClient.refetchQueries({ queryKey: ['maintenance', user.pubkey] });
  };

  const archiveMaintenance = async (id: string, isArchived: boolean) => {
    if (!user) throw new Error('Must be logged in');

    // Get current maintenance data
    const maintenance = queryClient.getQueryData<MaintenanceSchedule[]>(['maintenance', user.pubkey]) || [];
    const schedule = maintenance.find(m => m.id === id);
    if (!schedule) throw new Error('Maintenance schedule not found');

    // Update with archive status
    await updateMaintenance(id, { ...schedule, isArchived });
  };

  const deleteMaintenance = async (id: string) => {
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
            MAINTENANCE_KIND,
            user.pubkey,
            { dTag: id },
            AbortSignal.timeout(5000)
          )
        : [];

    const tags: string[][] = [['a', `${MAINTENANCE_KIND}:${user.pubkey}:${id}`]];
    for (const eventId of siblingIds) tags.push(['e', eventId]);

    const event = await publishEvent({
      kind: 5,
      content: 'Deleted maintenance schedule',
      tags,
    });

    if (event) {
      await cacheEvents([event]);
      await deleteCachedEventByAddress(MAINTENANCE_KIND, user.pubkey, id);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    await queryClient.refetchQueries({ queryKey: ['maintenance'] });
  };

  return { createMaintenance, updateMaintenance, deleteMaintenance, archiveMaintenance };
}

// Get archived maintenance schedules
export function useArchivedMaintenance() {
  const { data: maintenance = [] } = useMaintenance();
  return maintenance.filter(m => m.isArchived);
}

// Get active (non-archived) maintenance schedules
export function useActiveMaintenance() {
  const { data: maintenance = [] } = useMaintenance();
  return maintenance.filter(m => !m.isArchived);
}

// Parse MM/DD/YYYY date string to Date object
function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;

  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;

  const month = parseInt(parts[0], 10) - 1; // JS months are 0-indexed
  const day = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;

  const date = new Date(year, month, day);
  if (isNaN(date.getTime())) return null;

  return date;
}

// Add frequency to a date
function addFrequencyToDate(date: Date, frequency: number, frequencyUnit: MaintenanceSchedule['frequencyUnit']): Date {
  const newDate = new Date(date);
  switch (frequencyUnit) {
    case 'days':
      newDate.setDate(newDate.getDate() + frequency);
      break;
    case 'weeks':
      newDate.setDate(newDate.getDate() + (frequency * 7));
      break;
    case 'months':
      newDate.setMonth(newDate.getMonth() + frequency);
      break;
    case 'years':
      newDate.setFullYear(newDate.getFullYear() + frequency);
      break;
  }
  return newDate;
}

// Calculate the next due date for a maintenance schedule
// If lastCompletionDate is provided, calculate from there; otherwise use purchaseDate
export function calculateNextDueDate(
  purchaseDate: string,
  frequency: number | undefined,
  frequencyUnit: MaintenanceSchedule['frequencyUnit'],
  lastCompletionDate?: string
): Date | null {
  // Guard against invalid frequency values that could cause infinite loops
  if (!frequency || frequency <= 0 || !frequencyUnit) {
    return null;
  }

  // If there's a completion date, calculate from that
  if (lastCompletionDate) {
    const completionDate = parseDateString(lastCompletionDate);
    if (completionDate) {
      // Next due date is completion date + frequency
      return addFrequencyToDate(completionDate, frequency, frequencyUnit);
    }
  }

  // Fall back to purchase date if no completion
  const startDate = parseDateString(purchaseDate);
  if (!startDate) return null;

  const now = new Date();
  let nextDue = new Date(startDate);

  // Keep adding frequency until we get a future date
  // Add safety limit to prevent infinite loops
  let iterations = 0;
  const maxIterations = 1000;
  while (nextDue <= now && iterations < maxIterations) {
    nextDue = addFrequencyToDate(nextDue, frequency, frequencyUnit);
    iterations++;
  }

  if (iterations >= maxIterations) {
    logger.warn('[Maintenance] calculateNextDueDate: max iterations reached');
    return null;
  }

  return nextDue;
}

// Format date for display
export function formatDueDate(date: Date | null): string {
  if (!date) return 'N/A';
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric'
  });
}

// Check if maintenance is overdue
export function isOverdue(
  purchaseDate: string,
  frequency: number | undefined,
  frequencyUnit: MaintenanceSchedule['frequencyUnit'],
  lastCompletionDate?: string
): boolean {
  if (!frequency || !frequencyUnit) return false;
  const nextDue = calculateNextDueDate(purchaseDate, frequency, frequencyUnit, lastCompletionDate);
  if (!nextDue) return false;
  return nextDue < new Date();
}

// Check if maintenance is due soon (within 7 days)
export function isDueSoon(
  purchaseDate: string,
  frequency: number | undefined,
  frequencyUnit: MaintenanceSchedule['frequencyUnit'],
  lastCompletionDate?: string
): boolean {
  if (!frequency || !frequencyUnit) return false;
  const nextDue = calculateNextDueDate(purchaseDate, frequency, frequencyUnit, lastCompletionDate);
  if (!nextDue) return false;
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return nextDue <= sevenDaysFromNow && nextDue >= now;
}
