/**
 * NIP-55 (Android signer) permission payload for `get_public_key`.
 * Amber and similar signers often require an explicit `kind` on each `sign_event`
 * permission; a bare `{ type: "sign_event" }` may not cover Cypher Log's kinds.
 * @see https://github.com/nostr-protocol/nips/blob/master/55.md
 */
import {
  APPLIANCE_KIND,
  COMPANY_KIND,
  COMPANY_WORK_LOG_KIND,
  MAINTENANCE_KIND,
  MAINTENANCE_COMPLETION_KIND,
  PET_KIND,
  PROJECT_ENTRY_KIND,
  PROJECT_KIND,
  PROJECT_MATERIAL_KIND,
  PROJECT_RESEARCH_KIND,
  PROJECT_TASK_KIND,
  PROPERTY_KIND,
  SUBSCRIPTION_KIND,
  SUBSCRIPTION_KIND_LEGACY,
  VEHICLE_KIND,
  VET_VISIT_KIND,
  WARRANTY_KIND,
} from '@/lib/types';

/** NIP-42 relay authentication (see NostrProvider). */
const NIP42_AUTH_KIND = 22242;

/** Blossom delete authorization (useUploadFile). */
const BLOSSOM_DELETE_KIND = 24242;

/** NIP-57 zap request (useZaps). */
const ZAP_REQUEST_KIND = 9734;

/** NIP-98 HTTP auth (useShakespeare). */
const NIP98_KIND = 27235;

/** NIP-22 comments. */
const COMMENT_KIND = 1111;

/**
 * Bump when Cypher Log expands the Amber permission envelope so saved Android
 * sign-ins can be re-authorized automatically.
 */
export const AMBER_PERMISSION_SCHEMA_VERSION = 2;

const CYPHERLOG_DATA_KINDS = [
  APPLIANCE_KIND,
  VEHICLE_KIND,
  COMPANY_KIND,
  COMPANY_WORK_LOG_KIND,
  MAINTENANCE_KIND,
  MAINTENANCE_COMPLETION_KIND,
  SUBSCRIPTION_KIND,
  SUBSCRIPTION_KIND_LEGACY,
  WARRANTY_KIND,
  PET_KIND,
  PROJECT_KIND,
  PROJECT_ENTRY_KIND,
  PROJECT_TASK_KIND,
  PROJECT_MATERIAL_KIND,
  PROJECT_RESEARCH_KIND,
  PROPERTY_KIND,
  VET_VISIT_KIND,
] as const;

/** Other kinds the app may sign (profile, relays, deletes, DMs, zaps, etc.). */
const OTHER_SIGNED_KINDS = [
  NIP42_AUTH_KIND,
  0,
  10002,
  5,
  1,
  COMMENT_KIND,
  4,
  13,
  1059,
  NIP98_KIND,
  ZAP_REQUEST_KIND,
  BLOSSOM_DELETE_KIND,
] as const;

function uniqueSortedKinds(): number[] {
  const set = new Set<number>([...CYPHERLOG_DATA_KINDS, ...OTHER_SIGNED_KINDS]);
  return [...set].sort((a, b) => a - b);
}

type Nip55Permission =
  | { type: 'sign_event'; kind: number }
  | { type: 'nip44_encrypt' }
  | { type: 'nip44_decrypt' }
  | { type: 'nip04_encrypt' }
  | { type: 'nip04_decrypt' };

/**
 * JSON string for Amber `get_public_key` `permissions` extra.
 * Users who logged in before this list existed may need to log out and sign in again
 * so Amber can store the expanded permissions.
 */
export function buildAmberGetPublicKeyPermissionsJson(): string {
  const permissions: Nip55Permission[] = uniqueSortedKinds().map((kind) => ({
    type: 'sign_event',
    kind,
  }));
  permissions.push(
    { type: 'nip44_encrypt' },
    { type: 'nip44_decrypt' },
    { type: 'nip04_encrypt' },
    { type: 'nip04_decrypt' },
  );
  return JSON.stringify(permissions);
}
