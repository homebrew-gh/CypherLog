import { useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { getCachedEvents, cacheEvents } from '@/lib/eventCache';
import { ensureAtLeastOneReadRelay } from '@/lib/defaultAppRelays';
import { logger } from '@/lib/logger';

/**
 * NostrSync - Syncs user's Nostr data in the background
 *
 * This component runs globally to sync various Nostr data when the user logs in.
 * Uses cache-first pattern: loads from IndexedDB first, then syncs from relays.
 * 
 * Currently syncs:
 * - NIP-65 relay list (kind 10002)
 */
export function NostrSync() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const lastSyncedPubkey = useRef<string | null>(null);
  const loginsRef = useRef(logins);
  loginsRef.current = logins;

  useEffect(() => {
    if (!user) {
      lastSyncedPubkey.current = null;
      updateConfig((c) => ({ ...c, relayListSyncedForPubkey: null }));
      return;
    }

    // Don't re-sync for the same user
    if (lastSyncedPubkey.current === user.pubkey) {
      return;
    }
    lastSyncedPubkey.current = user.pubkey;
    // Clear so data sync waits until we've loaded this user's relay list
    updateConfig((c) => ({ ...c, relayListSyncedForPubkey: null }));

    const syncRelaysFromNostr = async () => {
      const pubkey = user.pubkey;
      
      // STEP 1: Try loading from cache first (instant)
      try {
        const cachedEvents = await getCachedEvents([10002], pubkey);
        if (cachedEvents.length > 0) {
          const cachedEvent = cachedEvents.reduce((a, b) => 
            a.created_at > b.created_at ? a : b
          );
          
          if (cachedEvent.created_at > config.relayMetadata.updatedAt) {
            const cachedRelays = cachedEvent.tags
              .filter(([name]) => name === 'r')
              .map(([_, url, marker]) => ({
                url,
                read: !marker || marker === 'read',
                write: !marker || marker === 'write',
              }));

            if (cachedRelays.length > 0) {
              logger.log('[NostrSync] Loading relay list from cache');
              const relays = ensureAtLeastOneReadRelay(cachedRelays);
              updateConfig((current) => ({
                ...current,
                relayMetadata: {
                  relays,
                  updatedAt: cachedEvent.created_at,
                },
              }));
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
          loginType === 'bunker' || loginType === 'x-amber-android' ? 20_000 : 5000;
        const events = await nostr.query(
          [{ kinds: [10002], authors: [pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(relayListTimeoutMs) }
        );

        if (events.length > 0) {
          const event = events[0];

          // Cache the fresh event
          cacheEvents([event]).catch(err => 
            logger.warn('[NostrSync] Failed to cache relay list:', err)
          );

          // Only update if the event is newer than our stored data
          if (event.created_at > config.relayMetadata.updatedAt) {
            const fetchedRelays = event.tags
              .filter(([name]) => name === 'r')
              .map(([_, url, marker]) => ({
                url,
                read: !marker || marker === 'read',
                write: !marker || marker === 'write',
              }));

            if (fetchedRelays.length > 0) {
              logger.log('[NostrSync] Syncing relay list from Nostr');
              const relays = ensureAtLeastOneReadRelay(fetchedRelays);
              updateConfig((current) => ({
                ...current,
                relayMetadata: {
                  relays,
                  updatedAt: event.created_at,
                },
              }));
            }
          }
        }
      } catch (error) {
        logger.warn('[NostrSync] Failed to sync relays from Nostr (using cache):', error);
      } finally {
        // Signal that relay list has been attempted for this user so data sync can proceed (with user's relays or defaults)
        updateConfig((c) => ({ ...c, relayListSyncedForPubkey: pubkey }));
      }
    };

    // Run sync immediately but don't block
    syncRelaysFromNostr();
  }, [user, config.relayMetadata.updatedAt, nostr, updateConfig]);

  return null;
}