import type { NostrEvent } from '@nostrify/nostrify';

/** Prefer the newest kind 0 when a relay returns several (replaceable metadata). */
export function pickLatestKind0(events: NostrEvent[]): NostrEvent | undefined {
  const zeros = events.filter((e) => e.kind === 0);
  if (zeros.length === 0) return undefined;
  return zeros.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
}

export function pickLatestKind0ForPubkey(events: NostrEvent[], pubkey: string): NostrEvent | undefined {
  return pickLatestKind0(events.filter((e) => e.pubkey === pubkey));
}
