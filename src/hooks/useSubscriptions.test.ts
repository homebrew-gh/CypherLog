import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import { parseEventsToSubscriptions, getDeletedSubscriptionIds } from './useSubscriptions';
import { SUBSCRIPTION_KIND, SUBSCRIPTION_KIND_LEGACY } from '@/lib/types';

function makeEvent(partial: Partial<NostrEvent> & Pick<NostrEvent, 'kind' | 'pubkey' | 'created_at'>): NostrEvent {
  return {
    id: partial.id ?? 'f'.repeat(64),
    kind: partial.kind,
    pubkey: partial.pubkey,
    created_at: partial.created_at,
    content: partial.content ?? '',
    tags: partial.tags ?? [],
    sig: partial.sig ?? 'a'.repeat(128),
  };
}

describe('useSubscriptions migration parsing', () => {
  const pubkey = '1'.repeat(64);

  it('deterministically prefers kind 30078 over legacy 37004 for same logical id', async () => {
    const legacy = makeEvent({
      id: 'a'.repeat(64),
      kind: SUBSCRIPTION_KIND_LEGACY,
      pubkey,
      created_at: 1000,
      tags: [
        ['d', 'sub-1'],
        ['name', 'Legacy Name'],
        ['subscription_type', 'Streaming'],
        ['cost', '9.99'],
        ['billing_frequency', 'monthly'],
      ],
    });
    const migrated = makeEvent({
      id: 'b'.repeat(64),
      kind: SUBSCRIPTION_KIND,
      pubkey,
      created_at: 1001,
      tags: [
        ['d', 'subscription:sub-1'],
        ['id', 'sub-1'],
        ['name', 'Migrated Name'],
        ['subscription_type', 'Streaming'],
        ['cost', '15.99'],
        ['billing_frequency', 'monthly'],
        ['schema_version', '2'],
        ['updated_at', '1001'],
      ],
    });

    const parsed = await parseEventsToSubscriptions([legacy, migrated], pubkey, async <T>() => ({} as T));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('sub-1');
    expect(parsed[0].name).toBe('Migrated Name');
    expect(parsed[0].schemaVersion).toBe('2');
  });

  it('filters deleted subscriptions using a-tags across legacy and new addresses', async () => {
    const subscription = makeEvent({
      id: 'c'.repeat(64),
      kind: SUBSCRIPTION_KIND,
      pubkey,
      created_at: 1100,
      tags: [
        ['d', 'subscription:sub-2'],
        ['id', 'sub-2'],
        ['name', 'Netflix'],
        ['subscription_type', 'Streaming'],
        ['cost', '10'],
        ['billing_frequency', 'monthly'],
      ],
    });

    const deleteLegacyAddress = makeEvent({
      id: 'd'.repeat(64),
      kind: 5,
      pubkey,
      created_at: 1200,
      tags: [['a', `${SUBSCRIPTION_KIND_LEGACY}:${pubkey}:sub-2`]],
    });

    const parsedFromLegacyDelete = await parseEventsToSubscriptions(
      [subscription, deleteLegacyAddress],
      pubkey,
      async <T>() => ({} as T)
    );
    expect(parsedFromLegacyDelete).toHaveLength(0);

    const deleteNewAddress = makeEvent({
      id: 'e'.repeat(64),
      kind: 5,
      pubkey,
      created_at: 1201,
      tags: [['a', `${SUBSCRIPTION_KIND}:${pubkey}:subscription:sub-2`]],
    });
    const parsedFromNewDelete = await parseEventsToSubscriptions(
      [subscription, deleteNewAddress],
      pubkey,
      async <T>() => ({} as T)
    );
    expect(parsedFromNewDelete).toHaveLength(0);
  });

  it('supports e-tag tombstones for direct event-id deletes', () => {
    const deletion = makeEvent({
      kind: 5,
      pubkey,
      created_at: 1300,
      tags: [['e', 'z'.repeat(64)]],
    });
    const deletedIds = getDeletedSubscriptionIds([deletion], pubkey);
    expect(deletedIds.has('z'.repeat(64))).toBe(true);
  });
});
