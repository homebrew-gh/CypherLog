import { useNostr } from "@nostrify/react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "@/hooks/useAppContext";
import { logger } from "@/lib/logger";
import type { OutboxNostr } from "@/lib/publishOutbox";
import { publishEventThroughOutbox } from "@/lib/publishOutbox";

import type { NostrEvent } from "@nostrify/nostrify";

// CypherLog client identifier for NIP-89 client tag
// This allows other clients to identify events created by CypherLog
// and enables discovery of CypherLog users among follows
const CYPHERLOG_CLIENT_NAME = "Cypher Log";
const CYPHERLOG_CLIENT_URL = "https://cypherlog.io";

export type PublishEventInput = Omit<NostrEvent, 'id' | 'pubkey' | 'sig' | 'created_at' | 'tags'> & {
  created_at?: number;
  tags?: string[][];
};

/**
 * Publish one signed event to all configured write relays (outbox enqueue + background flush).
 * Callers pass either encrypted `content` + minimal tags or plaintext tag mode — never two variants.
 */
export function useNostrPublish(): UseMutationResult<NostrEvent, Error, PublishEventInput> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  return useMutation({
    mutationFn: async (t: PublishEventInput) => {
      if (!user) throw new Error("User is not logged in");

      const tags = t.tags ?? [];
      if (!tags.some(([name]) => name === "client")) {
        tags.push(["client", CYPHERLOG_CLIENT_NAME, CYPHERLOG_CLIENT_URL]);
      }
      const created_at = t.created_at ?? Math.floor(Date.now() / 1000);

      const allWriteRelayUrls = config.relayMetadata.relays.filter((r) => r.write).map((r) => r.url);

      const pool = nostr as unknown as OutboxNostr;

      const event = await user.signer.signEvent({
        kind: t.kind,
        content: t.content ?? "",
        tags,
        created_at,
      });
      await publishEventThroughOutbox(pool, event, allWriteRelayUrls);
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
