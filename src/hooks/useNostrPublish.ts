import { useNostr } from "@nostrify/react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { useContext } from "react";
import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "@/hooks/useAppContext";
import { UserPreferencesContext } from "@/contexts/UserPreferencesContext";
import { logger } from "@/lib/logger";
import { isRelayUrlSecure } from "@/lib/relay";

import type { NostrEvent } from "@nostrify/nostrify";

// CypherLog client identifier for NIP-89 client tag
// This allows other clients to identify events created by CypherLog
// and enables discovery of CypherLog users among follows
const CYPHERLOG_CLIENT_NAME = "Cypher Log";
const CYPHERLOG_CLIENT_URL = "https://cypherlog.io";

export type PublishEventInput = Omit<NostrEvent, 'id' | 'pubkey' | 'sig' | 'created_at' | 'tags'> & {
  created_at?: number;
  tags?: string[][];
  /** When set and private relays exist: publish plain to private relays and encrypted to public relays */
  dualPublish?: { plainContent: string };
};

export function useNostrPublish(): UseMutationResult<NostrEvent, Error, PublishEventInput> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const prefsContext = useContext(UserPreferencesContext);
  const preferences = prefsContext?.preferences;

  return useMutation({
    mutationFn: async (t: PublishEventInput) => {
      if (!user) throw new Error("User is not logged in");

      const tags = t.tags ?? [];
      if (!tags.some(([name]) => name === "client")) {
        tags.push(["client", CYPHERLOG_CLIENT_NAME, CYPHERLOG_CLIENT_URL]);
      }
      const created_at = t.created_at ?? Math.floor(Date.now() / 1000);

      const privateRelayUrls = (preferences?.privateRelays ?? []).filter(isRelayUrlSecure);
      const publicRelayUrls = config.relayMetadata.relays
        .filter((r) => r.write && !privateRelayUrls.includes(r.url))
        .map((r) => r.url);

      const { dualPublish } = t;
      const encryptedContent = t.content ?? "";

      if (dualPublish && privateRelayUrls.length > 0 && publicRelayUrls.length > 0) {
        // Dual publish: plaintext to private relays, encrypted to public relays
        const plainEvent = await user.signer.signEvent({
          kind: t.kind,
          content: dualPublish.plainContent,
          tags,
          created_at,
        });
        const encEvent = await user.signer.signEvent({
          kind: t.kind,
          content: encryptedContent,
          tags,
          created_at,
        });
        const signal = AbortSignal.timeout(5000);
        await Promise.all([
          nostr.group(privateRelayUrls).event(plainEvent, { signal }),
          nostr.group(publicRelayUrls).event(encEvent, { signal }),
        ]);
        return plainEvent;
      }

      if (dualPublish && privateRelayUrls.length > 0 && publicRelayUrls.length === 0) {
        // Only private relays: publish plain only
        const plainEvent = await user.signer.signEvent({
          kind: t.kind,
          content: dualPublish.plainContent,
          tags,
          created_at,
        });
        await nostr.group(privateRelayUrls).event(plainEvent, { signal: AbortSignal.timeout(5000) });
        return plainEvent;
      }

      // Single publish to full pool (no dual or no private relays)
      const event = await user.signer.signEvent({
        kind: t.kind,
        content: encryptedContent,
        tags,
        created_at,
      });
      await nostr.event(event, { signal: AbortSignal.timeout(5000) });
      return event;
    },
    onError: (error) => {
      logger.error("[Publish] Failed to publish event:", error);
    },
    onSuccess: () => {
      logger.log("[Publish] Event published successfully");
    },
  });
}

// Export constants for use in other parts of the app (e.g., discovery)
export { CYPHERLOG_CLIENT_NAME, CYPHERLOG_CLIENT_URL };