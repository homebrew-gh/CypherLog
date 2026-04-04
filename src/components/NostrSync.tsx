import { useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { getCachedEvents, cacheEvents } from '@/lib/eventCache';
import { ensureAtLeastOneReadRelay } from '@/lib/defaultAppRelays';
import { isRelayUrlSecure } from '@/lib/relay';
import { logger } from '@/lib/logger';

function parseNip65RelaysFromEvent(event: NostrEvent) {
  return event.tags
    .filter(([name]) => name === 'r')
    .map(([_, url, marker]) => ({
      url,
      read: !marker || marker === 'read',
      write: !marker || marker === 'write',
    }));
}

function pickLatestKind10002(events: NostrEvent[]): NostrEvent | null {
  if (events.length === 0) return null;
  return events.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
}

/**
 * NostrSync - Syncs user's Nostr data in the background
 *
 * This component runs globally to sync various Nostr data when the user logs in.
 * Uses cache-first pattern: loads from IndexedDB first, then syncs from relays.
 *
 * Currently syncs:
 * - NIP-65 relay list (kind 10002)
 *
 * Must render under {@link UserPreferencesProvider} so the first fetch can re-run
 * after `privateRelays` loads; otherwise kind 10002 is only queried on default/public
 * relays and fresh installs miss lists stored only on a private relay.
 */
export function NostrSync() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();
  const { user } = useCurrentUser();
  const { preferences } = useUserPreferences();
  const { updateConfig } = useAppContext();
  const lastRelaySyncKeyRef = useRef<string | null>(null);
  const loginsRef = useRef(logins);
  loginsRef.current = logins;

  const privateRelayUrls = (preferences?.privateRelays ?? []).filter(isRelayUrlSecure);
  const privateRelaysKey = [...privateRelayUrls].sort().join('|');

  useEffect(() => {
    if (!user) {
      lastRelaySyncKeyRef.current = null;
      updateConfig((c) => ({ ...c, relayListSyncedForPubkey: null }));
      return;
    }

    const syncKey = `${user.pubkey}|${privateRelaysKey}`;
    if (lastRelaySyncKeyRef.current === syncKey) {
      return;
    }
    lastRelaySyncKeyRef.current = syncKey;
    updateConfig((c) => ({ ...c, relayListSyncedForPubkey: null }));

    const syncRelaysFromNostr = async () => {
      const pubkey = user.pubkey;

      // STEP 1: Try loading from cache first (instant)
      try {
        const cachedEvents = await getCachedEvents([10002], pubkey);
        if (cachedEvents.length > 0) {
          const cachedEvent = pickLatestKind10002(cachedEvents);
          if (cachedEvent) {
            const cachedRelays = parseNip65RelaysFromEvent(cachedEvent);
            if (cachedRelays.length > 0) {
              updateConfig((raw) => {
                const prevUpdatedAt = raw.relayMetadata?.updatedAt ?? 0;
                if (cachedEvent.created_at <= prevUpdatedAt) return raw;
                logger.log('[NostrSync] Loading relay list from cache');
                const relays = ensureAtLeastOneReadRelay(cachedRelays);
                return {
                  ...raw,
                  relayMetadata: {
                    relays,
                    updatedAt: cachedEvent.created_at,
                  },
                };
              });
            }
          }
        }
      } catch (error) {
        logger.warn('[NostrSync] Failed to load relays from cache:', error);
      }

      // STEP 2: Fetch fresh data from relays in background
      try {
        const loginType = loginsRef.current[0]?.type;
        const relayListTimeoutMs =
          loginType === 'bunker' || loginType === 'x-amber-android' ? 20_000 : 12_000;
        const events = await nostr.query(
          [{ kinds: [10002], authors: [pubkey], limit: 24 }],
          { signal: AbortSignal.timeout(relayListTimeoutMs) }
        );

        const event = pickLatestKind10002(events);
        if (event) {
          cacheEvents([event]).catch((err) =>
            logger.warn('[NostrSync] Failed to cache relay list:', err)
          );

          const fetchedRelays = parseNip65RelaysFromEvent(event);
          if (fetchedRelays.length > 0) {
            updateConfig((raw) => {
              const prevUpdatedAt = raw.relayMetadata?.updatedAt ?? 0;
              if (event.created_at <= prevUpdatedAt) return raw;
              logger.log('[NostrSync] Syncing relay list from Nostr');
              const relays = ensureAtLeastOneReadRelay(fetchedRelays);
              return {
                ...raw,
                relayMetadata: {
                  relays,
                  updatedAt: event.created_at,
                },
              };
            });
          }
        }
      } catch (error) {
        logger.warn('[NostrSync] Failed to sync relays from Nostr (using cache):', error);
      } finally {
        updateConfig((c) => ({ ...c, relayListSyncedForPubkey: pubkey }));
      }
    };

    void syncRelaysFromNostr();
  }, [user, privateRelaysKey, nostr, updateConfig]);

  return null;
}
