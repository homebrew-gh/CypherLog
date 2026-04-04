/**
 * Kinds stored in plaintext on the private relay. Used to decide when to
 * route reads to the private relay (fast load on login/refresh) vs public only.
 * Must match the kinds used in backfill (see usePrivateRelayBackfill).
 */
import {
  APPLIANCE_KIND,
  VEHICLE_KIND,
  MAINTENANCE_KIND,
  COMPANY_KIND,
  COMPANY_WORK_LOG_KIND,
  SUBSCRIPTION_KIND,
  WARRANTY_KIND,
  MAINTENANCE_COMPLETION_KIND,
  PET_KIND,
  PROJECT_KIND,
  PROJECT_ENTRY_KIND,
  PROJECT_TASK_KIND,
  PROJECT_MATERIAL_KIND,
  PROJECT_RESEARCH_KIND,
  PROPERTY_KIND,
  VET_VISIT_KIND,
} from '@/lib/types';

export const PRIVATE_DATA_KINDS = [
  APPLIANCE_KIND,
  VEHICLE_KIND,
  MAINTENANCE_KIND,
  COMPANY_KIND,
  COMPANY_WORK_LOG_KIND,
  SUBSCRIPTION_KIND,
  WARRANTY_KIND,
  MAINTENANCE_COMPLETION_KIND,
  PET_KIND,
  PROJECT_KIND,
  PROJECT_ENTRY_KIND,
  PROJECT_TASK_KIND,
  PROJECT_MATERIAL_KIND,
  PROJECT_RESEARCH_KIND,
  PROPERTY_KIND,
  VET_VISIT_KIND,
] as const;

const SET = new Set<number>(PRIVATE_DATA_KINDS);

/** NIP-65 relay list */
const NIP65_RELAY_LIST_KIND = 10002;

/** Kind 0 profile metadata */
const METADATA_KIND = 0;

const OWNED_RELAY_READ_KINDS = new Set<number>([METADATA_KIND, NIP65_RELAY_LIST_KIND]);

export function isPrivateDataKind(kind: number): boolean {
  return SET.has(kind);
}

/**
 * When the user has a private relay, also read these self-authored kinds there.
 * CypherLog plaintext kinds use {@link isPrivateDataKind}; profile (0) and NIP-65 (10002)
 * are included so relay list and metadata are not public-relay-only (common with Amber + private relay).
 */
export function isOwnedRelayReadKind(kind: number): boolean {
  return SET.has(kind) || OWNED_RELAY_READ_KINDS.has(kind);
}
