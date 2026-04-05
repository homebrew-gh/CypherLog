/**
 * Private relay backfill: sync events from public relays to private relay(s).
 * When the user was away, events only reached public relays (encrypted). This hook
 * fetches those events, decrypts them, and publishes plaintext to private relay(s)
 * so all data is available on all relays. See docs/PRIVATE_RELAY_BACKFILL.md.
 */

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';
import { useAppContext } from './useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { useEncryption } from './useEncryption';
import { PRIVATE_DATA_KINDS } from '@/lib/privateRelayKinds';
import { dedupeEventsByLogicalKey, getLogicalKey } from '@/lib/eventCache';
import { isRelayUrlSecure } from '@/lib/relay';
import { runWithConcurrencyLimit } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { useToast } from './useToast';
import type { OutboxNostr } from '@/lib/publishOutbox';
import {
  enqueuePublishJob,
  isPublishOutboxSupported,
  publishEventThroughOutbox,
  waitForPublishJobs,
} from '@/lib/publishOutbox';

const BACKFILL_STORAGE_KEY = 'cypherlog-backfill-last';
const BACKFILL_PUBLISH_CONCURRENCY = 4;
const BACKFILL_SINCE_CAP_DAYS = 90;
const PENDING_SYNC_STALE_MS = 3 * 60 * 1000; // 3 min
const PERIODIC_INTERVAL_MS = 30 * 60 * 1000; // 30 min

// Data kinds to sync to private relay (plaintext). Do NOT include kind 5 (deletions).
const BACKFILL_KINDS = [...PRIVATE_DATA_KINDS];

const ENCRYPTED_MARKER = 'nip44:';

function getLastBackfillAt(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(BACKFILL_STORAGE_KEY);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function setLastBackfillAt(ts: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BACKFILL_STORAGE_KEY, String(ts));
}

export function usePrivateRelayBackfill() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { preferences } = useUserPreferences();
  const { decryptFromSelf } = useEncryption();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [lastBackfillAt, setLastBackfillAtState] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const privateRelayUrls = (preferences.privateRelays ?? []).filter(isRelayUrlSecure);
  const publicRelayUrls = config.relayMetadata.relays
    .filter((r) => r.write && !privateRelayUrls.includes(r.url))
    .map((r) => r.url);

  const eligible =
    !!user?.pubkey &&
    privateRelayUrls.length > 0 &&
    publicRelayUrls.length > 0 &&
    !!user?.signer?.nip44;

  // Hydrate lastBackfillAt from localStorage once
  useEffect(() => {
    setLastBackfillAtState(getLastBackfillAt());
  }, []);

  const runBackfill = useCallback(
    async (options?: { since?: number; manual?: boolean }) => {
      if (!user?.pubkey || !user.signer.nip44) {
        setError(new Error('Must be logged in with NIP-44 support'));
        return;
      }
      if (privateRelayUrls.length === 0 || publicRelayUrls.length === 0) {
        setError(new Error('Need at least one private and one public relay'));
        return;
      }

      setIsRunning(true);
      setError(null);

      const now = Math.floor(Date.now() / 1000);
      const capSince = now - BACKFILL_SINCE_CAP_DAYS * 86400;
      const since =
        options?.since !== undefined
          ? Math.max(options.since, capSince)
          : Math.max(getLastBackfillAt() ?? capSince, capSince);

      try {
        const publicGroup = nostr.group(publicRelayUrls);
        const signal = AbortSignal.timeout(60_000);
        const pool = nostr as unknown as OutboxNostr;

        const events = await publicGroup.query(
          [
            {
              kinds: BACKFILL_KINDS,
              authors: [user.pubkey],
              since,
              limit: 5000,
            },
          ],
          { signal }
        );

        const deduped = dedupeEventsByLogicalKey(events);

        const jobResults = await runWithConcurrencyLimit(
          deduped,
          BACKFILL_PUBLISH_CONCURRENCY,
          async (ev: NostrEvent): Promise<string | null> => {
            if (!ev.content?.startsWith(ENCRYPTED_MARKER)) {
              return null;
            }
            try {
              const plainContent = await decryptFromSelf(ev.content);
              const plainEvent = await user.signer.signEvent({
                kind: ev.kind,
                content: plainContent,
                tags: ev.tags,
                created_at: ev.created_at,
              });
              if (!isPublishOutboxSupported()) {
                await publishEventThroughOutbox(pool, plainEvent, privateRelayUrls, {
                  jobTimeoutMs: 60_000,
                  waitUntilDelivered: true,
                });
                return null;
              }
              return await enqueuePublishJob(plainEvent, privateRelayUrls);
            } catch (e) {
              logger.warn('[Backfill] Skip event (decrypt/sign failed):', ev.id, e);
              return null;
            }
          }
        );

        const enqueued = jobResults.filter((id): id is string => typeof id === 'string' && id.length > 0);

        if (enqueued.length > 0) {
          await waitForPublishJobs(pool, enqueued, {
            timeoutMs: Math.min(45 * 60 * 1000, Math.max(120_000, enqueued.length * 10_000)),
          });
        }

        const published = enqueued.length;

        const newLast = now;
        setLastBackfillAtState(newLast);
        setLastBackfillAt(newLast);

        await queryClient.invalidateQueries({ queryKey: ['private-relay-pending-sync', user.pubkey] });
        logger.log('[Backfill] Done. Published', published, 'events to private relay(s).');
        toast({
          title: 'Sync complete',
          description: published > 0 ? `Synced ${published} event${published !== 1 ? 's' : ''} to your private relay(s).` : 'Your private relay was already up to date.',
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        logger.error('[Backfill] Failed:', err);
        toast({
          title: 'Sync failed',
          description: e.message,
          variant: 'destructive',
        });
      } finally {
        setIsRunning(false);
      }
    },
    [
      user,
      privateRelayUrls,
      publicRelayUrls,
      nostr,
      decryptFromSelf,
      queryClient,
      toast,
    ]
  );

  const sinceForPending = lastBackfillAt ?? Math.floor(Date.now() / 1000) - 7 * 86400;

  // Pending-sync count is only fetched when the user triggers it (e.g. "Check" in Relay Management).
  // This avoids hitting the private relay on every load; read from private only on demand.
  const pendingSyncQuery = useQuery({
    queryKey: ['private-relay-pending-sync', user?.pubkey, lastBackfillAt],
    queryFn: async (): Promise<number> => {
      if (!user?.pubkey || privateRelayUrls.length === 0 || publicRelayUrls.length === 0) return 0;
      const publicGroup = nostr.group(publicRelayUrls);
      const privateGroup = nostr.group(privateRelayUrls);
      const signal = AbortSignal.timeout(15_000);

      const [publicEvents, privateEvents] = await Promise.all([
        publicGroup.query(
          [
            {
              kinds: BACKFILL_KINDS,
              authors: [user.pubkey],
              since: sinceForPending,
              limit: 2000,
            },
          ],
          { signal }
        ),
        privateGroup.query(
          [
            {
              kinds: BACKFILL_KINDS,
              authors: [user.pubkey],
              since: sinceForPending,
              limit: 2000,
            },
          ],
          { signal }
        ),
      ]);

      const publicKeys = new Set(publicEvents.map(getLogicalKey));
      const privateKeys = new Set(privateEvents.map(getLogicalKey));
      let count = 0;
      for (const k of publicKeys) {
        if (!privateKeys.has(k)) count++;
      }
      return count;
    },
    enabled: false, // Only run when refetchPendingSync() is called; avoids constant reads from private relay
    staleTime: PENDING_SYNC_STALE_MS,
  });

  const pendingSyncCount = pendingSyncQuery.data ?? 0;
  const refetchPendingSync = pendingSyncQuery.refetch;

  useEffect(() => {
    if (!eligible) return;
    const id = setInterval(() => {
      runBackfill();
    }, PERIODIC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [eligible, runBackfill]);

  return {
    runBackfill,
    lastBackfillAt,
    isRunning,
    error,
    pendingSyncCount,
    pendingSyncLoading: pendingSyncQuery.isLoading,
    pendingSyncError: pendingSyncQuery.error,
    pendingSyncFetched: pendingSyncQuery.data !== undefined,
    refetchPendingSync,
    eligible,
  };
}
