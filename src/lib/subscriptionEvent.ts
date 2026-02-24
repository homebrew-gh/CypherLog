/**
 * Kind 37004 (Subscription) event tag building for CypherLog ↔ FiatLife interoperability.
 * Canonical tags (d, alt, name, subscription_type, cost, billing_frequency) are always
 * emitted so other clients can render subscription cards without decrypting content.
 *
 * Example generated event (tags; id/sig/content set by signer/relay):
 * {
 *   "kind": 37004,
 *   "pubkey": "<pubkey>",
 *   "created_at": 1700000000,
 *   "content": "",
 *   "tags": [
 *     ["d", "sub-uuid"], ["alt", "Subscription: Netflix"], ["name", "Netflix"],
 *     ["subscription_type", "Streaming"], ["cost", "15.99"], ["billing_frequency", "monthly"],
 *     ["currency", "USD"], ["client", "Cypher Log", "https://cypherlog.io"]
 *   ],
 *   "id": "<event-id>",
 *   "sig": "<signature>"
 * }
 */

import type { NostrEvent } from '@nostrify/nostrify';
import type { BillingFrequency } from './types';

/** Valid billing_frequency values for kind 37004 interop */
export const BILLING_FREQUENCY_VALUES: readonly BillingFrequency[] = [
  'weekly',
  'monthly',
  'quarterly',
  'semi-annually',
  'annually',
  'one-time',
] as const;

const BILLING_SET = new Set<string>(BILLING_FREQUENCY_VALUES);

/** Tag names we emit; any other tag on an existing event is preserved on update (round-trip). */
const KNOWN_TAG_NAMES = new Set([
  'd',
  'alt',
  'name',
  'subscription_type',
  'cost',
  'billing_frequency',
  'currency',
  'company_id',
  'company_name',
  'linked_asset_type',
  'linked_asset_id',
  'linked_asset_name',
  'notes',
  'is_archived',
  'a',
  'client',
]);

export type SubscriptionTagData = {
  name: string;
  subscriptionType: string;
  cost: string;
  billingFrequency: string;
  currency?: string;
  companyId?: string;
  companyName?: string;
  linkedAssetType?: string;
  linkedAssetId?: string;
  linkedAssetName?: string;
  notes?: string;
  isArchived?: boolean;
};

/**
 * Normalize cost to a decimal string for interop (e.g. "15.99").
 * Strips currency symbols and commas; returns "0" if unparseable.
 */
export function normalizeCostForTag(cost: string): string {
  if (cost == null || typeof cost !== 'string') return '0';
  const stripped = cost.replace(/[^0-9.]/g, '');
  if (!stripped) return '0';
  const num = parseFloat(stripped);
  if (Number.isNaN(num) || num < 0) return '0';
  return num.toString();
}

/**
 * Coerce billing frequency to a valid value for kind 37004.
 */
export function normalizeBillingFrequency(freq: string): BillingFrequency {
  const lower = (freq || '').toLowerCase().trim();
  if (BILLING_SET.has(lower as BillingFrequency)) return lower as BillingFrequency;
  return 'monthly';
}

/**
 * Build canonical + optional tags for kind 37004.
 * Used for both create and update; when existingEvent is provided, unknown tags are preserved.
 */
export function buildSubscriptionTags(params: {
  id: string;
  data: SubscriptionTagData;
  existingEvent?: NostrEvent | null;
}): string[][] {
  const { id, data, existingEvent } = params;
  const cost = normalizeCostForTag(data.cost);
  const billingFrequency = normalizeBillingFrequency(data.billingFrequency);

  const tags: string[][] = [
    ['d', id],
    ['alt', `Subscription: ${data.name || 'Unnamed'}`],
    ['name', (data.name || '').trim() || 'Unnamed'],
    ['subscription_type', (data.subscriptionType || '').trim() || 'Other'],
    ['cost', cost],
    ['billing_frequency', billingFrequency],
  ];

  if (data.currency?.trim()) tags.push(['currency', data.currency.trim()]);
  if (data.companyId?.trim()) tags.push(['company_id', data.companyId.trim()]);
  if (data.companyName?.trim()) tags.push(['company_name', data.companyName.trim()]);
  if (data.linkedAssetType?.trim()) tags.push(['linked_asset_type', data.linkedAssetType.trim()]);
  if (data.linkedAssetId?.trim()) tags.push(['linked_asset_id', data.linkedAssetId.trim()]);
  if (data.linkedAssetName?.trim()) tags.push(['linked_asset_name', data.linkedAssetName.trim()]);
  if (data.notes?.trim()) tags.push(['notes', data.notes.trim()]);
  if (data.isArchived === true) tags.push(['is_archived', 'true']);

  if (existingEvent?.tags?.length) {
    for (const tag of existingEvent.tags) {
      const name = tag[0];
      if (name && !KNOWN_TAG_NAMES.has(name)) {
        tags.push([name, ...tag.slice(1)]);
      }
    }
  }

  return tags;
}
