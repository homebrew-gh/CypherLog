import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption, isAbortError } from './useEncryption';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { SUBSCRIPTION_KIND, type Subscription, type BillingFrequency, type LinkedAssetType } from '@/lib/types';
import { buildSubscriptionTags } from '@/lib/subscriptionEvent';
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

// Data stored in encrypted content
type SubscriptionData = Omit<Subscription, 'id' | 'pubkey' | 'createdAt'>;

// Parse a Nostr event into a Subscription object (plaintext version)
// Uses d-tag as id when present; otherwise event.id so empty/minimal events from other clients still show (and can be deleted).
function parseSubscriptionPlaintext(event: NostrEvent): Subscription | null {
  const id = getTagValue(event, 'd') || event.id;
  if (!id) return null;

  const name = getTagValue(event, 'name')?.trim() || 'Unnamed';
  const subscriptionType = getTagValue(event, 'subscription_type')?.trim() || 'Other';
  const cost = getTagValue(event, 'cost') ?? '0';
  const billingFrequency = (getTagValue(event, 'billing_frequency') as BillingFrequency) || 'monthly';

  return {
    id,
    subscriptionType,
    name,
    cost,
    currency: getTagValue(event, 'currency'),
    billingFrequency,
    companyId: getTagValue(event, 'company_id'),
    companyName: getTagValue(event, 'company_name'),
    linkedAssetType: getTagValue(event, 'linked_asset_type') as LinkedAssetType | undefined,
    linkedAssetId: getTagValue(event, 'linked_asset_id'),
    linkedAssetName: getTagValue(event, 'linked_asset_name'),
    notes: getTagValue(event, 'notes'),
    startDate: getTagValue(event, 'start_date'),
    isArchived: getTagValue(event, 'is_archived') === 'true',
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

// Parse encrypted subscription from content
async function parseSubscriptionEncrypted(
  event: NostrEvent,
  decryptFn: (content: string) => Promise<SubscriptionData>
): Promise<Subscription | null> {
  const id = getTagValue(event, 'd') || event.id;
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
    logger.error('[Subscriptions] Failed to decrypt subscription');
    return null;
  }
}

// Extract deleted subscription IDs from kind 5 events (both addressable 'a' and event-id 'e' refs)
function getDeletedSubscriptionIds(deletionEvents: NostrEvent[], pubkey: string): Set<string> {
  const deletedIds = new Set<string>();

  for (const event of deletionEvents) {
    for (const tag of event.tags) {
      if (tag[0] === 'a') {
        const parts = tag[1].split(':');
        if (parts.length >= 3 && parts[0] === String(SUBSCRIPTION_KIND) && parts[1] === pubkey) {
          deletedIds.add(parts[2]);
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
async function parseEventsToSubscriptions(
  events: NostrEvent[],
  pubkey: string,
  decryptForCategory: <T>(content: string) => Promise<T>
): Promise<Subscription[]> {
  // Separate subscription events from deletion events
  const subscriptionEvents = events.filter(e => e.kind === SUBSCRIPTION_KIND);
  const deletionEvents = events.filter(e => e.kind === 5);

  // Get the set of deleted subscription IDs
  const deletedIds = getDeletedSubscriptionIds(deletionEvents, pubkey);

  const results = await runWithConcurrencyLimit(
    subscriptionEvents,
    DECRYPT_CONCURRENCY,
    async (event): Promise<Subscription | null> => {
      const id = getTagValue(event, 'd') || event.id;
      if (!id || deletedIds.has(id)) return null;
      if (event.content?.startsWith(ENCRYPTED_MARKER)) {
        return parseSubscriptionEncrypted(event, (content) => decryptForCategory<SubscriptionData>(content));
      }
      return parseSubscriptionPlaintext(event);
    }
  );

  return results.filter((s): s is Subscription => s != null).sort((a, b) => b.createdAt - a.createdAt);
}

export function useSubscriptions() {
  const { user } = useCurrentUser();
  const { decryptForCategory } = useEncryption();

  // Main query - loads from cache only
  // Background sync is handled centrally by useDataSyncStatus
  const query = useQuery({
    queryKey: ['subscriptions', user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey) return [];

      // Load from cache (populated by useDataSyncStatus)
      const cachedEvents = await getCachedEvents([SUBSCRIPTION_KIND, 5], user.pubkey);
      
      if (cachedEvents.length > 0) {
        const subscriptions = await parseEventsToSubscriptions(cachedEvents, user.pubkey, decryptForCategory);
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
  const { encryptForCategory, shouldEncrypt } = useEncryption();
  const { isEncryptionEnabled } = useEncryptionSettings();

  const createSubscription = async (data: Omit<Subscription, 'id' | 'pubkey' | 'createdAt'>) => {
    if (!user) throw new Error('Must be logged in');

    const id = crypto.randomUUID();
    const useEncryption = isEncryptionEnabled('subscriptions');

    // Canonical tags for FiatLife/interop: always emit so other clients can render without decrypting
    const tags = buildSubscriptionTags({ id, data, existingEvent: null });

    let content = '';
    let dualPublish: { plainContent: string } | undefined;
    if (useEncryption && shouldEncrypt('subscriptions')) {
      content = await encryptForCategory('subscriptions', data);
      dualPublish = { plainContent: JSON.stringify(data) };
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

    // Preserve unknown tags from existing event (round-trip safe)
    let existingEvent: NostrEvent | null = null;
    try {
      const cached = await getCachedEvents([SUBSCRIPTION_KIND], user.pubkey);
      existingEvent = cached.find((e) => e.tags.find(([t]) => t === 'd')?.[1] === id) ?? null;
    } catch {
      // proceed without preserving unknown tags
    }

    const tags = buildSubscriptionTags({ id, data, existingEvent });

    let content = '';
    let dualPublish: { plainContent: string } | undefined;
    if (useEncryption && shouldEncrypt('subscriptions')) {
      content = await encryptForCategory('subscriptions', data);
      dualPublish = { plainContent: JSON.stringify(data) };
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

    const siblingIds =
      privateRelayUrls.length > 0 || publicRelayUrls.length > 0
        ? await getSiblingEventIdsForDeletion(
            nostr.group(privateRelayUrls),
            nostr.group(publicRelayUrls),
            SUBSCRIPTION_KIND,
            user.pubkey,
            { dTag: id },
            AbortSignal.timeout(5000)
          )
        : [];

    const tags: string[][] = [['a', `${SUBSCRIPTION_KIND}:${user.pubkey}:${id}`]];
    for (const eventId of siblingIds) tags.push(['e', eventId]);

    const event = await publishEvent({
      kind: 5,
      content: 'Deleted subscription',
      tags,
    });

    if (event) {
      await cacheEvents([event]);
      await deleteCachedEventByAddress(SUBSCRIPTION_KIND, user.pubkey, id);
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
