/**
 * Kind 30078 (Subscription) codec for CypherLog ↔ FiatLife interoperability.
 * Builds canonical tags and content payload while preserving unknown data on edits.
 */

import type { NostrEvent } from '@nostrify/nostrify';
import type { BillingFrequency } from './types';

/** Valid billing_frequency values for subscription interop */
export const BILLING_FREQUENCY_VALUES: readonly BillingFrequency[] = [
  'weekly',
  'monthly',
  'quarterly',
  'semi-annually',
  'annually',
  'one-time',
] as const;

const BILLING_SET = new Set<string>(BILLING_FREQUENCY_VALUES);
export const SUBSCRIPTION_D_TAG_PREFIX = 'subscription:';
export const SUBSCRIPTION_SCHEMA_VERSION = '2';

/** Tag names we emit; any other tag on an existing event is preserved on update (round-trip). */
const KNOWN_TAG_NAMES = new Set([
  'id',
  'd',
  'alt',
  'name',
  'subscription_type',
  'cost',
  'amount',
  'billing_frequency',
  'recurrence',
  'currency',
  'updated_at',
  'schema_version',
  'company_id',
  'company_name',
  'linked_asset_type',
  'linked_asset_id',
  'linked_asset_name',
  'notes',
  'start_date',
  'initial_purchase_date',
  'due_day',
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
  /** When the subscription began. MM/DD/YYYY. */
  startDate?: string;
  dueDay?: string;
  updatedAt?: number;
  schemaVersion?: string;
  isArchived?: boolean;
};

export type SubscriptionPayloadData = {
  id: string;
  name: string;
  subscriptionType: string;
  cost: string;
  billingFrequency: string;
  currency?: string;
  startDate?: string;
  dueDay?: string;
  notes?: string;
  isArchived?: boolean;
  updatedAt: number;
  schemaVersion: string;
  companyId?: string;
  companyName?: string;
  linkedAssetType?: string;
  linkedAssetId?: string;
  linkedAssetName?: string;
};

const MANAGED_PAYLOAD_KEYS = new Set([
  'id',
  'name',
  'subscriptionType',
  'cost',
  'amount',
  'currency',
  'billingFrequency',
  'recurrence',
  'startDate',
  'initialPurchaseDate',
  'dueDay',
  'notes',
  'isArchived',
  'updatedAt',
  'schemaVersion',
  'cypherlog',
]);

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
 * Coerce billing frequency to a valid value for subscriptions.
 */
export function normalizeBillingFrequency(freq: string): BillingFrequency {
  const lower = (freq || '').toLowerCase().trim();
  if (BILLING_SET.has(lower as BillingFrequency)) return lower as BillingFrequency;
  return 'monthly';
}

/**
 * Use a stable namespace in kind 30078 d-tags to avoid collisions with other 30078 records.
 */
export function toSubscriptionDTag(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return `${SUBSCRIPTION_D_TAG_PREFIX}unknown`;
  return trimmed.startsWith(SUBSCRIPTION_D_TAG_PREFIX) ? trimmed : `${SUBSCRIPTION_D_TAG_PREFIX}${trimmed}`;
}

/**
 * Normalize subscription id from d-tag (new namespaced and legacy raw UUID forms).
 */
export function parseSubscriptionIdFromDTag(dTag: string | undefined): string | undefined {
  if (!dTag) return undefined;
  if (dTag.startsWith(SUBSCRIPTION_D_TAG_PREFIX)) {
    const raw = dTag.slice(SUBSCRIPTION_D_TAG_PREFIX.length).trim();
    return raw || undefined;
  }
  return dTag.trim() || undefined;
}

/**
 * Derive due day from MM/DD/YYYY start date.
 */
export function deriveDueDay(startDate?: string): string | undefined {
  if (!startDate) return undefined;
  const match = startDate.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return undefined;
  const day = Number.parseInt(match[2], 10);
  if (!Number.isFinite(day) || day < 1 || day > 31) return undefined;
  return String(day);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const prev = out[key];
    if (isPlainObject(prev) && isPlainObject(value)) {
      out[key] = deepMerge(prev, value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Build subscription payload for content with round-trip unknown-field preservation.
 */
export function buildSubscriptionPayload(params: {
  data: SubscriptionPayloadData;
  existingPayload?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const { data, existingPayload } = params;
  const dueDay = data.dueDay || deriveDueDay(data.startDate);
  const next: Record<string, unknown> = {
    id: data.id,
    name: (data.name || '').trim() || 'Unnamed',
    subscriptionType: (data.subscriptionType || '').trim() || 'Other',
    cost: normalizeCostForTag(data.cost),
    amount: normalizeCostForTag(data.cost),
    currency: data.currency?.trim() || undefined,
    billingFrequency: normalizeBillingFrequency(data.billingFrequency),
    recurrence: normalizeBillingFrequency(data.billingFrequency),
    startDate: data.startDate?.trim() || undefined,
    initialPurchaseDate: data.startDate?.trim() || undefined,
    dueDay,
    notes: data.notes?.trim() || undefined,
    isArchived: data.isArchived === true,
    updatedAt: data.updatedAt,
    schemaVersion: data.schemaVersion || SUBSCRIPTION_SCHEMA_VERSION,
    cypherlog: {
      companyId: data.companyId?.trim() || undefined,
      companyName: data.companyName?.trim() || undefined,
      linkedAssetType: data.linkedAssetType?.trim() || undefined,
      linkedAssetId: data.linkedAssetId?.trim() || undefined,
      linkedAssetName: data.linkedAssetName?.trim() || undefined,
    },
  };

  if (!existingPayload || !isPlainObject(existingPayload)) {
    return next;
  }

  const unmanagedBase: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(existingPayload)) {
    if (!MANAGED_PAYLOAD_KEYS.has(key)) {
      unmanagedBase[key] = value;
    }
  }

  const existingCypherlog = isPlainObject(existingPayload.cypherlog) ? existingPayload.cypherlog : {};
  const nextCypherlog = isPlainObject(next.cypherlog) ? next.cypherlog : {};
  const mergedCypherlog = deepMerge(existingCypherlog, nextCypherlog);

  return {
    ...unmanagedBase,
    ...next,
    cypherlog: mergedCypherlog,
  };
}

/**
 * Build canonical + optional tags for subscriptions (kind 30078 writes).
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
  const dueDay = data.dueDay || deriveDueDay(data.startDate);
  const updatedAt = data.updatedAt ?? Math.floor(Date.now() / 1000);
  const schemaVersion = (data.schemaVersion || SUBSCRIPTION_SCHEMA_VERSION).trim();

  const tags: string[][] = [
    ['d', toSubscriptionDTag(id)],
    ['id', id],
    ['alt', `Subscription: ${data.name || 'Unnamed'}`],
    ['name', (data.name || '').trim() || 'Unnamed'],
    ['subscription_type', (data.subscriptionType || '').trim() || 'Other'],
    ['cost', cost],
    ['amount', cost],
    ['billing_frequency', billingFrequency],
    ['recurrence', billingFrequency],
    ['updated_at', String(updatedAt)],
    ['schema_version', schemaVersion],
  ];

  if (data.currency?.trim()) tags.push(['currency', data.currency.trim()]);
  if (data.companyId?.trim()) tags.push(['company_id', data.companyId.trim()]);
  if (data.companyName?.trim()) tags.push(['company_name', data.companyName.trim()]);
  if (data.linkedAssetType?.trim()) tags.push(['linked_asset_type', data.linkedAssetType.trim()]);
  if (data.linkedAssetId?.trim()) tags.push(['linked_asset_id', data.linkedAssetId.trim()]);
  if (data.linkedAssetName?.trim()) tags.push(['linked_asset_name', data.linkedAssetName.trim()]);
  if (data.notes?.trim()) tags.push(['notes', data.notes.trim()]);
  if (data.startDate?.trim()) {
    tags.push(['start_date', data.startDate.trim()]);
    tags.push(['initial_purchase_date', data.startDate.trim()]);
  }
  if (dueDay) tags.push(['due_day', dueDay]);
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
