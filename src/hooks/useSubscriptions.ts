import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption, useDecryptConcurrency, isAbortError } from './useEncryption';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import {
  SUBSCRIPTION_KIND,
  SUBSCRIPTION_KIND_LEGACY,
  SUBSCRIPTION_KINDS_READ,
  type Subscription,
  type BillingFrequency,
  type LinkedAssetType,
} from '@/lib/types';
import {
  buildSubscriptionPayload,
  buildSubscriptionTags,
  deriveDueDay,
  normalizeBillingFrequency,
  parseSubscriptionIdFromDTag,
  SUBSCRIPTION_D_TAG_PREFIX,
  SUBSCRIPTION_SCHEMA_VERSION,
  toSubscriptionDTag,
} from '@/lib/subscriptionEvent';
import { cacheEvents, getCachedEvents, deleteCachedEventByAddress, deleteCachedEventById } from '@/lib/eventCache';
import { isRelayUrlSecure } from '@/lib/relay';
import { getSiblingEventIdsForDeletion } from '@/lib/relayDeletion';
import { logger } from '@/lib/logger';
import { runWithConcurrencyLimit, DECRYPT_CONCURRENCY } from '@/lib/utils';

// Encrypted content marker
const ENCRYPTED_MARKER = 'nip44:';

// Helper to get tag value
function getTagValue(event: NostrEvent, tagName: string): string | undefined {
  return event.tags.find(([name]) => name === tagName)?.[1];
}

type ParsedSubscriptionEvent = {
  subscription: Subscription;
  sourceKind: number;
  isEncrypted: boolean;
  eventId: string;
};

function parseContentJson(content: string): Record<string, unknown> | null {
  if (!content || content.startsWith(ENCRYPTED_MARKER)) return null;
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed === 'object' && parsed != null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

// Parse a Nostr event into a Subscription object (plaintext version)
// Uses d-tag as id when present; otherwise event.id so empty/minimal events from other clients still show (and can be deleted).
function getNormalizedSubscriptionId(event: NostrEvent): string | undefined {
  const explicitId = getTagValue(event, 'id')?.trim();
  const parsedD = parseSubscriptionIdFromDTag(getTagValue(event, 'd'));
  return explicitId || parsedD || event.id;
}

function isSubscriptionEventCandidate(event: NostrEvent): boolean {
  if (event.kind === SUBSCRIPTION_KIND_LEGACY) return true;
  if (event.kind !== SUBSCRIPTION_KIND) return false;

  const dTag = getTagValue(event, 'd') ?? '';
  if (dTag.startsWith(SUBSCRIPTION_D_TAG_PREFIX)) return true;

  // Guard against colliding kind 30078 app-data records (e.g. preferences).
  const hasSubscriptionShape =
    !!getTagValue(event, 'name') &&
    (!!getTagValue(event, 'cost') || !!getTagValue(event, 'amount')) &&
    (!!getTagValue(event, 'billing_frequency') || !!getTagValue(event, 'recurrence'));
  return hasSubscriptionShape;
}

function getCypherlogPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const cypherlog = payload.cypherlog;
  if (typeof cypherlog === 'object' && cypherlog != null && !Array.isArray(cypherlog)) {
    return cypherlog as Record<string, unknown>;
  }
  return {};
}

function fromPayloadString(payload: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function fromPayloadNumber(payload: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function parseSubscriptionFromEventData(
  event: NostrEvent,
  payload: Record<string, unknown> | null
): Subscription | null {
  const id = getNormalizedSubscriptionId(event);
  if (!id) return null;

  const cypherlogPayload = payload ? getCypherlogPayload(payload) : {};
  const name = fromPayloadString(payload ?? {}, 'name') || getTagValue(event, 'name')?.trim() || 'Unnamed';
  const subscriptionType =
    fromPayloadString(payload ?? {}, 'subscriptionType', 'subscription_type') ||
    getTagValue(event, 'subscription_type')?.trim() ||
    'Other';
  const cost =
    fromPayloadString(payload ?? {}, 'cost', 'amount') ||
    getTagValue(event, 'cost') ||
    getTagValue(event, 'amount') ||
    '0';
  const billingFrequency = normalizeBillingFrequency(
    fromPayloadString(payload ?? {}, 'billingFrequency', 'recurrence') ||
      getTagValue(event, 'billing_frequency') ||
      getTagValue(event, 'recurrence') ||
      'monthly'
  ) as BillingFrequency;
  const startDate =
    fromPayloadString(payload ?? {}, 'startDate', 'initialPurchaseDate') ||
    getTagValue(event, 'start_date') ||
    getTagValue(event, 'initial_purchase_date');
  const dueDay =
    fromPayloadString(payload ?? {}, 'dueDay') || getTagValue(event, 'due_day') || deriveDueDay(startDate);
  const updatedAt =
    fromPayloadNumber(payload ?? {}, 'updatedAt') ||
    Number.parseInt(getTagValue(event, 'updated_at') ?? '', 10) ||
    event.created_at;
  const schemaVersion =
    fromPayloadString(payload ?? {}, 'schemaVersion') ||
    getTagValue(event, 'schema_version') ||
    (event.kind === SUBSCRIPTION_KIND ? SUBSCRIPTION_SCHEMA_VERSION : '1');

  const companyId =
    fromPayloadString(cypherlogPayload, 'companyId') ||
    fromPayloadString(payload ?? {}, 'companyId') ||
    getTagValue(event, 'company_id');
  const companyName =
    fromPayloadString(cypherlogPayload, 'companyName') ||
    fromPayloadString(payload ?? {}, 'companyName') ||
    getTagValue(event, 'company_name');
  const linkedAssetType =
    (fromPayloadString(cypherlogPayload, 'linkedAssetType') ||
      fromPayloadString(payload ?? {}, 'linkedAssetType') ||
      getTagValue(event, 'linked_asset_type')) as LinkedAssetType | undefined;
  const linkedAssetId =
    fromPayloadString(cypherlogPayload, 'linkedAssetId') ||
    fromPayloadString(payload ?? {}, 'linkedAssetId') ||
    getTagValue(event, 'linked_asset_id');
  const linkedAssetName =
    fromPayloadString(cypherlogPayload, 'linkedAssetName') ||
    fromPayloadString(payload ?? {}, 'linkedAssetName') ||
    getTagValue(event, 'linked_asset_name');
  const notes = fromPayloadString(payload ?? {}, 'notes') || getTagValue(event, 'notes');
  const isArchived = payload?.isArchived === true || getTagValue(event, 'is_archived') === 'true';
  const currency = fromPayloadString(payload ?? {}, 'currency') || getTagValue(event, 'currency');

  return {
    id,
    subscriptionType,
    name,
    cost,
    currency,
    billingFrequency,
    companyId,
    companyName,
    linkedAssetType,
    linkedAssetId,
    linkedAssetName,
    notes,
    startDate,
    dueDay,
    updatedAt,
    schemaVersion,
    isArchived,
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

// Parse encrypted subscription from content
async function parseSubscriptionEncrypted(
  event: NostrEvent,
  decryptFn: (content: string) => Promise<Record<string, unknown>>
): Promise<ParsedSubscriptionEvent | null> {
  try {
    const payload = await decryptFn(event.content);
    const subscription = parseSubscriptionFromEventData(event, payload);
    if (!subscription) return null;
    return {
      subscription,
      sourceKind: event.kind,
      isEncrypted: true,
      eventId: event.id,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    logger.error('[Subscriptions] Failed to decrypt subscription');
    return null;
  }
}

// Extract deleted subscription IDs from kind 5 events (both addressable 'a' and event-id 'e' refs)
export function getDeletedSubscriptionIds(deletionEvents: NostrEvent[], pubkey: string): Set<string> {
  const deletedIds = new Set<string>();
  const subscriptionKinds = new Set(SUBSCRIPTION_KINDS_READ.map((k) => String(k)));

  for (const event of deletionEvents) {
    for (const tag of event.tags) {
      if (tag[0] === 'a') {
        const parts = tag[1].split(':');
        if (parts.length >= 3 && subscriptionKinds.has(parts[0]) && parts[1] === pubkey) {
          const normalized = parseSubscriptionIdFromDTag(parts.slice(2).join(':'));
          if (normalized) deletedIds.add(normalized);
        }
      }
      if (tag[0] === 'e') {
        deletedIds.add(tag[1]);
      }
    }
  }

  return deletedIds;
}

// Parse events into subscriptions
export async function parseEventsToSubscriptions(
  events: NostrEvent[],
  pubkey: string,
  decryptForCategory: <T>(content: string) => Promise<T>,
  decryptConcurrency: number = DECRYPT_CONCURRENCY,
): Promise<Subscription[]> {
  // Separate subscription events from deletion events
  const readKinds = new Set<number>(SUBSCRIPTION_KINDS_READ);
  const subscriptionEvents = events.filter((e) => readKinds.has(e.kind) && isSubscriptionEventCandidate(e));
  const deletionEvents = events.filter(e => e.kind === 5);

  // Get the set of deleted subscription IDs
  const deletedIds = getDeletedSubscriptionIds(deletionEvents, pubkey);

  const results = await runWithConcurrencyLimit(
    subscriptionEvents,
    decryptConcurrency,
    async (event): Promise<ParsedSubscriptionEvent | null> => {
      const id = getNormalizedSubscriptionId(event);
      if (!id || deletedIds.has(id) || deletedIds.has(event.id)) return null;
      if (event.content?.startsWith(ENCRYPTED_MARKER)) {
        return parseSubscriptionEncrypted(event, (content) =>
          decryptForCategory<Record<string, unknown>>(content)
        );
      }
      const payload = parseContentJson(event.content);
      const subscription = parseSubscriptionFromEventData(event, payload);
      if (!subscription) return null;
      return {
        subscription,
        sourceKind: event.kind,
        isEncrypted: false,
        eventId: event.id,
      };
    }
  );

  const candidates = results.filter((s): s is ParsedSubscriptionEvent => s != null);
  const winnerById = new Map<string, ParsedSubscriptionEvent>();
  const priority = (kind: number): number => (kind === SUBSCRIPTION_KIND ? 2 : 1);

  for (const candidate of candidates) {
    const current = winnerById.get(candidate.subscription.id);
    if (!current) {
      winnerById.set(candidate.subscription.id, candidate);
      continue;
    }

    const candidateUpdatedAt = candidate.subscription.updatedAt ?? candidate.subscription.createdAt;
    const currentUpdatedAt = current.subscription.updatedAt ?? current.subscription.createdAt;

    const candidateWins =
      priority(candidate.sourceKind) > priority(current.sourceKind) ||
      (priority(candidate.sourceKind) === priority(current.sourceKind) &&
        Number(candidate.isEncrypted) < Number(current.isEncrypted)) ||
      (priority(candidate.sourceKind) === priority(current.sourceKind) &&
        candidate.isEncrypted === current.isEncrypted &&
        candidateUpdatedAt > currentUpdatedAt) ||
      (priority(candidate.sourceKind) === priority(current.sourceKind) &&
        candidate.isEncrypted === current.isEncrypted &&
        candidateUpdatedAt === currentUpdatedAt &&
        candidate.subscription.createdAt > current.subscription.createdAt) ||
      (priority(candidate.sourceKind) === priority(current.sourceKind) &&
        candidate.isEncrypted === current.isEncrypted &&
        candidateUpdatedAt === currentUpdatedAt &&
        candidate.subscription.createdAt === current.subscription.createdAt &&
        candidate.eventId > current.eventId);

    if (candidateWins) {
      winnerById.set(candidate.subscription.id, candidate);
    }
  }

  return Array.from(winnerById.values())
    .map((entry) => entry.subscription)
    .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
}

export function useSubscriptions() {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();
  const decryptConcurrency = useDecryptConcurrency();

  // Main query - loads from cache only
  // Background sync is handled centrally by useDataSyncStatus
  const query = useQuery({
    queryKey: ['subscriptions', user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey) return [];

      // Load from cache (populated by useDataSyncStatus)
      const cachedEvents = await getCachedEvents([...SUBSCRIPTION_KINDS_READ, 5], user.pubkey);
      
      if (cachedEvents.length > 0) {
        const subscriptions = await parseEventsToSubscriptions(
          cachedEvents,
          user.pubkey,
          decryptForCategory,
          decryptConcurrency,
        );
        return subscriptions;
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

export function useSubscriptionById(id: string | undefined) {
  const { data: subscriptions } = useSubscriptions();
  return subscriptions?.find(s => s.id === id);
}

// Get subscriptions linked to a specific company
export function useSubscriptionsByCompanyId(companyId: string | undefined) {
  const { data: subscriptions } = useSubscriptions();
  if (!companyId) return [];
  return subscriptions?.filter(s => s.companyId === companyId) ?? [];
}

export function useSubscriptionActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { preferences } = useUserPreferences();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { encryptForCategory, shouldEncrypt, decryptForCategory } = useEncryption();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const createSubscription = async (data: Omit<Subscription, 'id' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    const id = crypto.randomUUID();
    const useEncryption = isEncryptionEnabled('subscriptions');
    const updatedAt = Math.floor(Date.now() / 1000);
    const schemaVersion = SUBSCRIPTION_SCHEMA_VERSION;

    // Canonical tags for FiatLife/interop: always emit so other clients can render without decrypting
    const tags = buildSubscriptionTags({
      id,
      data: { ...data, updatedAt, schemaVersion },
      existingEvent: null,
    });
    const payload = buildSubscriptionPayload({
      data: {
        id,
        name: data.name,
        subscriptionType: data.subscriptionType,
        cost: data.cost,
        billingFrequency: data.billingFrequency,
        currency: data.currency,
        startDate: data.startDate,
        dueDay: data.dueDay,
        notes: data.notes,
        isArchived: data.isArchived,
        updatedAt,
        schemaVersion,
        companyId: data.companyId,
        companyName: data.companyName,
        linkedAssetType: data.linkedAssetType,
        linkedAssetId: data.linkedAssetId,
        linkedAssetName: data.linkedAssetName,
      },
      existingPayload: null,
    });

    let content = '';
    let dualPublish: { plainContent: string } | undefined;
    if (useEncryption && shouldEncrypt('subscriptions')) {
      content = await encryptForCategory('subscriptions', payload);
      dualPublish = { plainContent: JSON.stringify(payload) };
    } else {
      content = JSON.stringify(payload);
    }

    const event = await publishEvent({
      kind: SUBSCRIPTION_KIND,
      content,
      tags,
      ...(dualPublish && { dualPublish }),
    });

    if (event) {
      await cacheEvents([event]);
    }

    // Invalidate so the list refetches from cache and shows the new subscription
    await queryClient.invalidateQueries({ queryKey: ['subscriptions', user.pubkey] });

    return id;
  };

  const updateSubscription = async (id: string, data: Omit<Subscription, 'id' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    const useEncryption = isEncryptionEnabled('subscriptions');
    const updatedAt = Math.floor(Date.now() / 1000);
    const schemaVersion = SUBSCRIPTION_SCHEMA_VERSION;

    // Preserve unknown tags from existing event (round-trip safe)
    let existingEvent: NostrEvent | null = null;
    let existingPayload: Record<string, unknown> | null = null;
    try {
      const cached = await getCachedEvents([...SUBSCRIPTION_KINDS_READ], user.pubkey);
      existingEvent =
        cached
          .filter((e) => isSubscriptionEventCandidate(e) && getNormalizedSubscriptionId(e) === id)
          .sort((a, b) => b.created_at - a.created_at)[0] ?? null;

      if (existingEvent?.content?.startsWith(ENCRYPTED_MARKER)) {
        try {
          existingPayload = await decryptForCategory<Record<string, unknown>>(existingEvent.content);
        } catch (error) {
          logger.warn('[Subscriptions] Could not decrypt existing payload for full round-trip preservation', error);
        }
      } else if (existingEvent) {
        existingPayload = parseContentJson(existingEvent.content);
      }
    } catch {
      // proceed without preserving unknown tags
    }

    const tags = buildSubscriptionTags({
      id,
      data: { ...data, updatedAt, schemaVersion },
      existingEvent,
    });
    const payload = buildSubscriptionPayload({
      data: {
        id,
        name: data.name,
        subscriptionType: data.subscriptionType,
        cost: data.cost,
        billingFrequency: data.billingFrequency,
        currency: data.currency,
        startDate: data.startDate,
        dueDay: data.dueDay,
        notes: data.notes,
        isArchived: data.isArchived,
        updatedAt,
        schemaVersion,
        companyId: data.companyId,
        companyName: data.companyName,
        linkedAssetType: data.linkedAssetType,
        linkedAssetId: data.linkedAssetId,
        linkedAssetName: data.linkedAssetName,
      },
      existingPayload,
    });

    let content = '';
    let dualPublish: { plainContent: string } | undefined;
    if (useEncryption && shouldEncrypt('subscriptions')) {
      content = await encryptForCategory('subscriptions', payload);
      dualPublish = { plainContent: JSON.stringify(payload) };
    } else {
      content = JSON.stringify(payload);
    }

    const event = await publishEvent({
      kind: SUBSCRIPTION_KIND,
      content,
      tags,
      ...(dualPublish && { dualPublish }),
    });

    if (event) {
      await cacheEvents([event]);
    }

    await queryClient.invalidateQueries({ queryKey: ['subscriptions', user.pubkey] });
  };

  const archiveSubscription = async (id: string, isArchived: boolean) => {
    if (!user) throw new Error('Must be logged in');

    // Get current subscription data
    const subscriptions = queryClient.getQueryData<Subscription[]>(['subscriptions', user.pubkey]) || [];
    const subscription = subscriptions.find(s => s.id === id);
    if (!subscription) throw new Error('Subscription not found');

    // Update with archive status
    await updateSubscription(id, { ...subscription, isArchived });
  };

  const deleteSubscription = async (id: string) => {
    if (!user) throw new Error('Must be logged in');

    // Subscriptions without a d-tag use event.id as id (64-char hex). Delete those by event id.
    const isEventId = /^[a-f0-9]{64}$/i.test(id);

    if (isEventId) {
      const tags: string[][] = [['e', id]];
      const event = await publishEvent({
        kind: 5,
        content: 'Deleted subscription',
        tags,
      });
      if (event) {
        await cacheEvents([event]);
        await deleteCachedEventById(id);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      await queryClient.invalidateQueries({ queryKey: ['subscriptions', user.pubkey] });
      return;
    }

    const privateRelayUrls = (preferences.privateRelays ?? []).filter(isRelayUrlSecure);
    const publicRelayUrls = config.relayMetadata.relays
      .filter((r) => !privateRelayUrls.includes(r.url))
      .map((r) => r.url);

    const readKinds = [SUBSCRIPTION_KIND_LEGACY, SUBSCRIPTION_KIND] as const;
    const dTagsByKind: Record<number, string> = {
      [SUBSCRIPTION_KIND_LEGACY]: id,
      [SUBSCRIPTION_KIND]: toSubscriptionDTag(id),
    };

    const siblingIds = new Set<string>();
    if (privateRelayUrls.length > 0 || publicRelayUrls.length > 0) {
      const siblingResults = await Promise.all(
        readKinds.map((kind) =>
          getSiblingEventIdsForDeletion(
            nostr.group(privateRelayUrls),
            nostr.group(publicRelayUrls),
            kind,
            user.pubkey,
            { dTag: dTagsByKind[kind] },
            AbortSignal.timeout(5000)
          )
        )
      );
      for (const result of siblingResults) {
        for (const eventId of result) siblingIds.add(eventId);
      }
    }

    const tags: string[][] = [
      ['a', `${SUBSCRIPTION_KIND_LEGACY}:${user.pubkey}:${dTagsByKind[SUBSCRIPTION_KIND_LEGACY]}`],
      ['a', `${SUBSCRIPTION_KIND}:${user.pubkey}:${dTagsByKind[SUBSCRIPTION_KIND]}`],
    ];
    for (const eventId of siblingIds) tags.push(['e', eventId]);

    const event = await publishEvent({
      kind: 5,
      content: 'Deleted subscription',
      tags,
    });

    if (event) {
      await cacheEvents([event]);
      await deleteCachedEventByAddress(SUBSCRIPTION_KIND_LEGACY, user.pubkey, dTagsByKind[SUBSCRIPTION_KIND_LEGACY]);
      await deleteCachedEventByAddress(SUBSCRIPTION_KIND, user.pubkey, dTagsByKind[SUBSCRIPTION_KIND]);
      for (const eventId of siblingIds) {
        await deleteCachedEventById(eventId);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    await queryClient.invalidateQueries({ queryKey: ['subscriptions', user.pubkey] });
  };

  return { createSubscription, updateSubscription, deleteSubscription, archiveSubscription };
}

// Get archived subscriptions
export function useArchivedSubscriptions() {
  const { data: subscriptions = [] } = useSubscriptions();
  return subscriptions.filter(s => s.isArchived);
}

// Get active (non-archived) subscriptions
export function useActiveSubscriptions() {
  const { data: subscriptions = [] } = useSubscriptions();
  return subscriptions.filter(s => !s.isArchived);
}
