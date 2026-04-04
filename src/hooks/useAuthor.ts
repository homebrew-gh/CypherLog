import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { pickLatestKind0 } from '@/lib/nostrProfile';

const PROFILE_QUERY_TIMEOUT_MS = 22_000;

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      const events = await nostr.query(
        [{ kinds: [0], authors: [pubkey], limit: 48 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(PROFILE_QUERY_TIMEOUT_MS)]) },
      );

      const event = pickLatestKind0(events);
      if (!event) {
        return { metadata: {}, event: undefined };
      }

      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        return { metadata, event };
      } catch {
        return { event };
      }
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000, // Keep cached data fresh for 5 minutes
    retry: 3,
  });
}
