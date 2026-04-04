import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NostrEvent, NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import type { NUser } from '@nostrify/react/login';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { isPrivateDataKind } from '@/lib/privateRelayKinds';
import { logger } from '@/lib/logger';
import { PublishOutboxManager } from '@/components/PublishOutboxManager';

/** Setter for private relay URLs; synced from UserPreferencesProvider when preferences load */
export const SetPrivateRelayUrlsContext = createContext<((urls: string[]) => void) | null>(null);

/** NIP-42 auth kind for relay authentication */
const NIP42_AUTH_KIND = 22242;

/** Ref type for the current user's signer (used by NIP-42 auth callback). */
type SignerRef = React.MutableRefObject<NUser['signer'] | null | undefined>;

/**
 * Updates signerRef and currentUserPubkeyRef from useCurrentUser. Must be a child of NostrContext.Provider
 * so useCurrentUser (which uses useNostr) has access to the pool.
 */
function SignerRefUpdater({
  signerRef,
  currentUserPubkeyRef,
}: {
  signerRef: SignerRef;
  currentUserPubkeyRef: React.MutableRefObject<string | null>;
}) {
  const { user } = useCurrentUser();
  useEffect(() => {
    signerRef.current = user?.signer ?? null;
    currentUserPubkeyRef.current = user?.pubkey ?? null;
    return () => {
      signerRef.current = null;
      currentUserPubkeyRef.current = null;
    };
  }, [user?.signer, user?.pubkey, signerRef, currentUserPubkeyRef]);
  return null;
}

interface NostrProviderProps {
  children: React.ReactNode;
}

const NostrProvider: React.FC<NostrProviderProps> = (props) => {
  const { children } = props;
  const { config } = useAppContext();
  const { cachingRelay } = useEncryptionSettings();

  const queryClient = useQueryClient();
  const [privateRelayUrls, setPrivateRelayUrls] = useState<string[]>([]);

  // Ref for NIP-42 auth: updated by SignerRefUpdater (child of provider), read by auth callback
  const signerRef = useRef<NUser['signer'] | null>(null);
  // Current user pubkey: used by reqRouter to route "owned data" reads to private relay (fast plaintext load)
  const currentUserPubkeyRef = useRef<string | null>(null);

  // Full relay list with private relays first (preferred for reads)
  const mergedRelays = useMemo(() => {
    const privateSet = new Set(privateRelayUrls);
    const relays = config.relayMetadata.relays;
    return [...relays].sort((a, b) => {
      const aPrivate = privateSet.has(a.url);
      const bPrivate = privateSet.has(b.url);
      if (aPrivate && !bPrivate) return -1;
      if (!aPrivate && bPrivate) return 1;
      return 0;
    });
  }, [config.relayMetadata.relays, privateRelayUrls]);

  // Refs so the pool always has the latest data
  const relayMetadataRef = useRef({ relays: mergedRelays });
  const cachingRelayRef = useRef(cachingRelay);
  const privateRelayUrlsRef = useRef<string[]>([]);

  relayMetadataRef.current = { relays: mergedRelays };
  privateRelayUrlsRef.current = privateRelayUrls;

  const createPool = useCallback(() => {
    logger.log('[NostrProvider] Initializing NPool');
    return new NPool({
      open(url: string) {
        logger.log('[NostrProvider] Opening relay connection');
        return new NRelay1(url, {
          auth: async (challenge: string) => {
            const signer = signerRef.current;
            if (!signer) {
              throw new Error('NIP-42 auth requires login');
            }
            return signer.signEvent({
              kind: NIP42_AUTH_KIND,
              content: '',
              tags: [
                ['relay', url],
                ['challenge', challenge],
              ],
              created_at: Math.floor(Date.now() / 1000),
            });
          },
        });
      },
      reqRouter(filters: NostrFilter[]) {
        const routes = new Map<string, NostrFilter[]>();
        const { relays } = relayMetadataRef.current;
        const privateSet = new Set(privateRelayUrlsRef.current);
        const currentUser = currentUserPubkeyRef.current;
        const publicReadRelays = relays
          .filter((r) => r.read && !privateSet.has(r.url))
          .map((r) => r.url);
        const privateReadRelays = relays
          .filter((r) => r.read && privateSet.has(r.url))
          .map((r) => r.url);

        const isOwnedDataFilter = (f: NostrFilter) =>
          currentUser &&
          f.authors?.length === 1 &&
          f.authors[0] === currentUser &&
          (!f.kinds?.length || f.kinds.every((k) => isPrivateDataKind(k)));
        const includePrivateForReads = privateReadRelays.length > 0 && filters.some(isOwnedDataFilter);

        if (includePrivateForReads) {
          for (const url of privateReadRelays) routes.set(url, filters);
        }
        let orderedPublic = [...publicReadRelays];
        const currentCachingRelay = cachingRelayRef.current;
        if (currentCachingRelay && publicReadRelays.includes(currentCachingRelay)) {
          orderedPublic = [currentCachingRelay, ...publicReadRelays.filter((url) => url !== currentCachingRelay)];
        }
        for (const url of orderedPublic) {
          routes.set(url, filters);
        }
        return routes;
      },
      eventRouter(_event: NostrEvent) {
        const { relays } = relayMetadataRef.current;
        const writeRelays = relays.filter((r) => r.write).map((r) => r.url);
        return [...new Set(writeRelays)];
      },
    });
  }, []);

  // Pool instance: null when page is hidden (connections closed), NPool when visible.
  // Start with null; first effect will create pool when visible (avoids calling createPool before refs are set).
  const [poolInstance, setPoolInstance] = useState<NPool | null>(null);

  // Invalidate Nostr queries when merged relay list changes
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['nostr'] });
  }, [mergedRelays, queryClient]);

  // Update caching relay ref when it changes
  useEffect(() => {
    cachingRelayRef.current = cachingRelay;
    queryClient.invalidateQueries({ queryKey: ['nostr'] });
  }, [cachingRelay, queryClient]);

  // Create pool on mount when visible; when tab is hidden, close and set null; when visible again, create new pool.
  // Reduces relay churn and rate limit pressure when CypherLog PWA is backgrounded on mobile.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setPoolInstance((prev) => {
          if (prev) {
            logger.log('[NostrProvider] Page hidden, closing relay connections');
            void prev.close();
            return null;
          }
          return prev;
        });
      } else {
        setPoolInstance((prev) => {
          if (!prev) {
            logger.log('[NostrProvider] Page visible, reconnecting relays');
            queryClient.invalidateQueries({ queryKey: ['nostr'] });
            return createPool();
          }
          return prev;
        });
      }
    };

    if (document.visibilityState === 'visible') {
      setPoolInstance((prev) => {
        if (prev) return prev;
        queryClient.invalidateQueries({ queryKey: ['nostr'] });
        return createPool();
      });
    }

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [createPool, queryClient]);

  if (poolInstance === null) {
    return (
      <SetPrivateRelayUrlsContext.Provider value={setPrivateRelayUrls}>
        <div className="flex min-h-screen items-center justify-center bg-theme-gradient tool-pattern-bg" role="status" aria-live="polite">
          <p className="text-muted-foreground text-sm">Reconnecting to relays…</p>
        </div>
      </SetPrivateRelayUrlsContext.Provider>
    );
  }

  return (
    <SetPrivateRelayUrlsContext.Provider value={setPrivateRelayUrls}>
      <NostrContext.Provider value={{ nostr: poolInstance } as unknown as React.ComponentProps<typeof NostrContext.Provider>['value']}>
        <SignerRefUpdater signerRef={signerRef} currentUserPubkeyRef={currentUserPubkeyRef} />
        <PublishOutboxManager />
        {children}
      </NostrContext.Provider>
    </SetPrivateRelayUrlsContext.Provider>
  );
};

export default NostrProvider;