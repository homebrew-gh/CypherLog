/**
 * useProperty - Property profile data (single-property mode).
 * For multi-property design see docs/MULTI_PROPERTY_PLAN.md.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption, useDecryptConcurrency, isAbortError } from './useEncryption';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { PROPERTY_KIND, type Property } from '@/lib/types';
import { cacheEvents, getCachedEvents, deleteCachedEventByAddress } from '@/lib/eventCache';
import { isRelayUrlSecure } from '@/lib/relay';
import { getSiblingEventIdsForDeletion } from '@/lib/relayDeletion';
import { logger } from '@/lib/logger';
import { runWithConcurrencyLimit } from '@/lib/utils';

const ENCRYPTED_MARKER = 'nip44:';

function getTagValue(event: NostrEvent, tagName: string): string | undefined {
  return event.tags.find(([name]) => name === tagName)?.[1];
}

type PropertyData = Omit<Property, 'id' | 'pubkey' | 'createdAt'>;

function parsePropertyPlaintext(event: NostrEvent): Property | null {
  const id = getTagValue(event, 'd');
  const name = getTagValue(event, 'name');
  if (!id || !name) return null;

  const yearBuiltStr = getTagValue(event, 'year_built');
  const bedroomsStr = getTagValue(event, 'bedrooms');
  const bathroomsStr = getTagValue(event, 'bathrooms');

  return {
    id,
    name,
    yearBuilt: yearBuiltStr ? parseInt(yearBuiltStr, 10) : undefined,
    squareFootage: getTagValue(event, 'square_footage'),
    roofType: getTagValue(event, 'roof_type'),
    roofAge: getTagValue(event, 'roof_age'),
    hvacType: getTagValue(event, 'hvac_type'),
    heatingCooling: getTagValue(event, 'heating_cooling'),
    lotSize: getTagValue(event, 'lot_size'),
    bedrooms: bedroomsStr ? parseInt(bedroomsStr, 10) : undefined,
    bathrooms: bathroomsStr ? parseInt(bathroomsStr, 10) : undefined,
    waterSource: getTagValue(event, 'water_source') as Property['waterSource'],
    sewerType: getTagValue(event, 'sewer_type') as Property['sewerType'],
    notes: getTagValue(event, 'notes'),
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

async function parsePropertyEncrypted(
  event: NostrEvent,
  decryptFn: (content: string) => Promise<PropertyData>
): Promise<Property | null> {
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
    logger.error('[Property] Failed to decrypt');
    return null;
  }
}

function getDeletedPropertyIds(deletionEvents: NostrEvent[], pubkey: string): Set<string> {
  const set = new Set<string>();
  for (const ev of deletionEvents) {
    for (const tag of ev.tags) {
      if (tag[0] === 'a') {
        const parts = tag[1].split(':');
        if (parts.length >= 3 && parts[0] === String(PROPERTY_KIND) && parts[1] === pubkey) {
          set.add(parts[2]);
        }
      }
    }
  }
  return set;
}

async function parseEventsToProperties(
  events: NostrEvent[],
  pubkey: string,
  decryptForCategory: <T>(content: string) => Promise<T>,
  decryptConcurrency: number,
): Promise<Property[]> {
  const propertyEvents = events.filter((e) => e.kind === PROPERTY_KIND);
  const deletionEvents = events.filter((e) => e.kind === 5);
  const deletedIds = getDeletedPropertyIds(deletionEvents, pubkey);

  const results = await runWithConcurrencyLimit(
    propertyEvents,
    decryptConcurrency,
    async (event): Promise<Property | null> => {
      const d = getTagValue(event, 'd');
      if (!d || deletedIds.has(d)) return null;
      if (event.content?.startsWith(ENCRYPTED_MARKER)) {
        return parsePropertyEncrypted(event, (c) => decryptForCategory<PropertyData>(c));
      }
      return parsePropertyPlaintext(event);
    }
  );

  const list = results.filter((p): p is Property => p != null);
  list.sort((a, b) => {
    if (a.id === 'default') return -1;
    if (b.id === 'default') return 1;
    return a.name.localeCompare(b.name);
  });
  return list;
}

export function useProperties() {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();
  const decryptConcurrency = useDecryptConcurrency();

  return useQuery({
    queryKey: ['properties', user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey) return [];
      const cached = await getCachedEvents([PROPERTY_KIND, 5], user.pubkey);
      return parseEventsToProperties(cached, user.pubkey, decryptForCategory, decryptConcurrency);
    },
    enabled: !!user?.pubkey,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/** Single-property mode: returns the property with id "default" or the first property. */
export function useProperty() {
  const { data: properties = [] } = useProperties();
  return properties.find((p) => p.id === 'default') ?? properties[0] ?? null;
}

export function usePropertyActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { preferences } = useUserPreferences();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { encryptForCategory, shouldEncrypt } = useEncryption();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const createOrUpdateProperty = async (
    id: string,
    data: PropertyData
  ) => {
    if (!user) throw new Error('Must be logged in');

    const useEncryption = isEncryptionEnabled('projects');

    const tags: string[][] = [
      ['d', id],
      ['alt', useEncryption ? 'Encrypted property profile' : `Property: ${data.name}`],
    ];

    let content = '';
    let dualPublish: { plainContent: string } | undefined;
    if (useEncryption && shouldEncrypt('projects')) {
      content = await encryptForCategory('projects', data);
      dualPublish = { plainContent: JSON.stringify(data) };
    } else {
      tags.push(['name', data.name]);
      if (data.yearBuilt != null) tags.push(['year_built', String(data.yearBuilt)]);
      if (data.squareFootage) tags.push(['square_footage', data.squareFootage]);
      if (data.roofType) tags.push(['roof_type', data.roofType]);
      if (data.roofAge) tags.push(['roof_age', data.roofAge]);
      if (data.hvacType) tags.push(['hvac_type', data.hvacType]);
      if (data.heatingCooling) tags.push(['heating_cooling', data.heatingCooling]);
      if (data.lotSize) tags.push(['lot_size', data.lotSize]);
      if (data.bedrooms != null) tags.push(['bedrooms', String(data.bedrooms)]);
      if (data.bathrooms != null) tags.push(['bathrooms', String(data.bathrooms)]);
      if (data.waterSource) tags.push(['water_source', data.waterSource]);
      if (data.sewerType) tags.push(['sewer_type', data.sewerType]);
      if (data.notes) tags.push(['notes', data.notes]);
    }

    const event = await publishEvent({
      kind: PROPERTY_KIND,
      content,
      tags,
      ...(dualPublish && { dualPublish }),
    });

    if (event) await cacheEvents([event]);
    await queryClient.refetchQueries({ queryKey: ['properties', user.pubkey] });
  };

  const deleteProperty = async (id: string) => {
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
            PROPERTY_KIND,
            user.pubkey,
            { dTag: id },
            AbortSignal.timeout(5000)
          )
        : [];

    const tags: string[][] = [['a', `${PROPERTY_KIND}:${user.pubkey}:${id}`]];
    for (const eventId of siblingIds) tags.push(['e', eventId]);

    const event = await publishEvent({
      kind: 5,
      content: 'Deleted property',
      tags,
    });

    if (event) {
      await cacheEvents([event]);
      await deleteCachedEventByAddress(PROPERTY_KIND, user.pubkey, id);
    }
    await new Promise((r) => setTimeout(r, 300));
    await queryClient.refetchQueries({ queryKey: ['properties'] });
  };

  return { createOrUpdateProperty, deleteProperty };
}
