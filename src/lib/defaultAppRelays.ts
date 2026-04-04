import type { RelayMetadata } from '@/contexts/AppContext';

/** Bootstrap relays for new installs and when NIP-65 lists have no read-capable entries. */
export const DEFAULT_RELAY_METADATA_ENTRIES: RelayMetadata['relays'] = [
  { url: 'wss://relay.ditto.pub', read: true, write: true },
  { url: 'wss://relay.nostr.band', read: true, write: true },
  { url: 'wss://relay.damus.io', read: true, write: true },
];

export const DEFAULT_PUBLIC_READ_RELAY_URLS: string[] = DEFAULT_RELAY_METADATA_ENTRIES.filter(
  (r) => r.read,
).map((r) => r.url);

/** NIP-65 lists may be write-only; without any read relay, kind 0 and feeds never load. */
export function ensureAtLeastOneReadRelay(
  relays: RelayMetadata['relays'],
): RelayMetadata['relays'] {
  if (relays.some((r) => r.read)) return relays;
  const seen = new Set(relays.map((r) => r.url));
  const merged = [...relays];
  for (const d of DEFAULT_RELAY_METADATA_ENTRIES) {
    if (!seen.has(d.url)) merged.push({ ...d });
    seen.add(d.url);
  }
  return merged;
}
