import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';
import { useQuery } from '@tanstack/react-query';
import { NSchema as n, NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { getCachedEvents, cacheEvents } from '@/lib/eventCache';
import { logger } from '@/lib/logger';
import { pickLatestKind0ForPubkey } from '@/lib/nostrProfile';

export interface Account {
  id: string;
  pubkey: string;
  event?: NostrEvent;
  metadata: NostrMetadata;
}

/**
 * Parse metadata from an event, with fallback to empty object
 */
function parseMetadata(event?: NostrEvent): NostrMetadata {
  if (!event?.content) return {};
  try {
    return n.json().pipe(n.metadata()).parse(event.content);
  } catch {
    return {};
  }
}

export function useLoggedInAccounts() {
  const { nostr } = useNostr();
  const { logins, setLogin, removeLogin } = useNostrLogin();

  const { data: authors = [], isLoading, isFetched } = useQuery({
    queryKey: ['nostr', 'logins', logins.map((l) => l.id).join(';')],
    queryFn: async ({ signal }) => {
      const pubkeys = logins.map((l) => l.pubkey);
      
      // CACHE-FIRST: Try to load from IndexedDB cache immediately
      const cachedEvents: NostrEvent[] = [];
      for (const pubkey of pubkeys) {
        const cached = await getCachedEvents([0], pubkey);
        if (cached.length > 0) {
          // Get the most recent cached event
          const latest = cached.reduce((a, b) => a.created_at > b.created_at ? a : b);
          cachedEvents.push(latest);
        }
      }
      
      // Cached profiles loaded from IndexedDB
      
      // Build initial results from cache (instant)
      const cachedResults = logins.map(({ id, pubkey }): Account => {
        const event = cachedEvents.find((e) => e.pubkey === pubkey);
        return { id, pubkey, metadata: parseMetadata(event), event };
      });
      
      // BACKGROUND SYNC: Fetch fresh data from relays
      // Longer timeout on cold start (no IndexedDB profile yet), especially on mobile
      const timeoutMs = cachedEvents.length > 0 ? 8000 : 22000;
      
      try {
        const freshEvents = await nostr.query(
          [{ kinds: [0], authors: pubkeys }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) },
        );
        
        // Fetched fresh profile data from relays
        
        // Cache the fresh events for next time
        if (freshEvents.length > 0) {
          cacheEvents(freshEvents).catch(() => 
            logger.warn('[useLoggedInAccounts] Failed to cache profiles')
          );
        }
        
        // Merge fresh data with cached data (prefer fresh)
        return logins.map(({ id, pubkey }): Account => {
          const freshEvent = pickLatestKind0ForPubkey(freshEvents, pubkey);
          const cachedEvent = pickLatestKind0ForPubkey(cachedEvents, pubkey);
          const event = freshEvent ?? cachedEvent;
          return { id, pubkey, metadata: parseMetadata(event), event };
        });
      } catch (error) {
        logger.warn('[useLoggedInAccounts] Relay fetch failed, using cache');
        // If relay fetch fails but we have cached data, return that
        if (cachedEvents.length > 0) {
          return cachedResults;
        }
        throw error; // Re-throw if no cache available
      }
    },
    retry: 2,
    enabled: logins.length > 0,
    // Return cached data immediately while fetching fresh data
    staleTime: 0,
    gcTime: Infinity,
  });

  // Current user is the first login
  const currentUser: Account | undefined = (() => {
    const login = logins[0];
    if (!login) return undefined;
    const author = authors.find((a) => a.id === login.id);
    return { metadata: {}, ...author, id: login.id, pubkey: login.pubkey };
  })();

  // Other users are all logins except the current one
  const otherUsers = (authors || []).slice(1) as Account[];

  // Profile loading is now much faster with cache-first
  // Only show loading if we don't have cached data yet AND are still fetching
  const isProfileLoading = logins.length > 0 && isLoading && !isFetched;

  return {
    authors,
    currentUser,
    otherUsers,
    setLogin,
    removeLogin,
    isProfileLoading,
  };
}