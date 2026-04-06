/**
 * Local-first event cache using IndexedDB
 * 
 * Stores Nostr events locally for instant loading on app start.
 * Data is synced with relays in the background.
 * 
 * NOTE: This is a low-level storage utility. Console.error is kept for genuine
 * errors but sensitive data is never logged.
 */

import type { NostrEvent } from '@nostrify/nostrify';
import { logger } from '@/lib/logger';

const DB_NAME = 'cypherlog-event-cache';
const DB_VERSION = 1;
const EVENTS_STORE = 'events';
const META_STORE = 'meta';

// Cache metadata
interface CacheMeta {
  key: string;
  lastSyncedAt: number;
  pubkey: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function isClosedDatabaseError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'InvalidStateError') return true;
  if (error instanceof Error && /closed|closing/i.test(error.message)) return true;
  return false;
}

/**
 * Open or create the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      logger.error('[EventCache] Failed to open database');
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Events store - keyed by kind:pubkey:id for efficient lookups
      if (!db.objectStoreNames.contains(EVENTS_STORE)) {
        const eventsStore = db.createObjectStore(EVENTS_STORE, { keyPath: 'cacheKey' });
        // Index by kind and pubkey for querying
        eventsStore.createIndex('kindPubkey', ['kind', 'pubkey'], { unique: false });
        eventsStore.createIndex('pubkey', 'pubkey', { unique: false });
      }

      // Metadata store - tracks last sync times
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
  });

  return dbPromise;
}

/**
 * Run an operation with the DB. If the DB was closed (e.g. by another tab or eviction),
 * clear the cached connection and retry once so concurrent callers get a fresh connection.
 */
async function withDB<T>(op: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDB();
  try {
    return await op(db);
  } catch (error) {
    if (isClosedDatabaseError(error)) {
      dbPromise = null;
      return openDB().then((freshDb) => op(freshDb));
    }
    throw error;
  }
}

/** NIP-44 encrypted content marker; plaintext preferred when deduping */
const ENCRYPTED_CONTENT_MARKER = 'nip44:';

/**
 * Logical key for deduplication: same key = same logical entity (plain + encrypted copies).
 * Replaceable: (kind, pubkey). Addressable: (kind, pubkey, d). Regular: event id (no dedupe).
 */
export function getLogicalKey(event: NostrEvent): string {
  if (event.kind >= 30000) {
    const dTag = event.tags.find(t => t[0] === 'd')?.[1] || '';
    return `${event.kind}:${event.pubkey}:${dTag}`;
  }
  if (event.kind >= 10000 && event.kind < 20000) {
    return `${event.kind}:${event.pubkey}`;
  }
  return event.id;
}

/**
 * Dedupe events by logical key, preferring plaintext so we avoid unnecessary decryption.
 * Use before caching when multiple signed variants share the same logical key (e.g. same addressable `d` tag).
 */
export function dedupeEventsByLogicalKey(events: NostrEvent[]): NostrEvent[] {
  const byKey = new Map<string, NostrEvent>();
  for (const event of events) {
    const key = getLogicalKey(event);
    const existing = byKey.get(key);
    const isPlain = !event.content?.startsWith(ENCRYPTED_CONTENT_MARKER);
    if (!existing || (isPlain && existing.content?.startsWith(ENCRYPTED_CONTENT_MARKER))) {
      byKey.set(key, event);
    }
  }
  return [...byKey.values()];
}

/**
 * Generate a unique cache key for an event
 */
function getCacheKey(event: NostrEvent): string {
  // For addressable events (kind >= 30000), use kind:pubkey:d-tag when d is present
  if (event.kind >= 30000) {
    const dTag = event.tags.find(t => t[0] === 'd')?.[1] ?? '';
    if (dTag) return `${event.kind}:${event.pubkey}:${dTag}`;
    // No d tag (e.g. empty/minimal events from other clients): use event id so each is stored
    return event.id;
  }
  // For regular events, use the event id
  return event.id;
}

/**
 * Store events in the cache
 */
export async function cacheEvents(events: NostrEvent[]): Promise<void> {
  if (events.length === 0) return;

  try {
    await withDB((db) => {
      const tx = db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);

      for (const event of events) {
        const cacheKey = getCacheKey(event);
        store.put({ ...event, cacheKey });
      }

      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
    await applyKindFiveDeletionsFromEvents(events);
  } catch (error) {
    logger.error('[EventCache] Failed to cache events:', error);
  }
}

/**
 * Get cached events by kind and pubkey
 */
export async function getCachedEvents(kinds: number[], pubkey: string): Promise<NostrEvent[]> {
  try {
    return await withDB((db) => {
      const tx = db.transaction(EVENTS_STORE, 'readonly');
      const store = tx.objectStore(EVENTS_STORE);
      const index = store.index('kindPubkey');

      const events: NostrEvent[] = [];

      const run = (): Promise<NostrEvent[]> =>
        new Promise((resolve, reject) => {
          let pending = kinds.length;
          if (pending === 0) return resolve(events);

          for (const kind of kinds) {
            const request = index.getAll([kind, pubkey]);
            request.onsuccess = () => {
              const results = request.result || [];
              for (const result of results) {
                const { cacheKey: _k, ...event } = result;
                events.push(event as NostrEvent);
              }
              if (--pending === 0) resolve(events);
            };
            request.onerror = () => reject(request.error);
          }
        });

      return run();
    });
  } catch (error) {
    logger.error('[EventCache] Failed to get cached events:', error);
    return [];
  }
}

/**
 * Delete an event from the cache
 */
export async function deleteCachedEvent(event: NostrEvent): Promise<void> {
  try {
    await withDB((db) => {
      const tx = db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      store.delete(getCacheKey(event));
      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
  } catch (error) {
    logger.error('[EventCache] Failed to delete cached event:', error);
  }
}

/**
 * Delete events by their addressable coordinates (kind:pubkey:d-tag)
 */
export async function deleteCachedEventByAddress(kind: number, pubkey: string, dTag: string): Promise<void> {
  try {
    const cacheKey = `${kind}:${pubkey}:${dTag}`;
    await withDB((db) => {
      const tx = db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      store.delete(cacheKey);
      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
  } catch (error) {
    logger.error('[EventCache] Failed to delete cached event by address:', error);
  }
}

/**
 * Delete events by event ID (for regular events like kind 5)
 */
export async function deleteCachedEventById(eventId: string): Promise<void> {
  try {
    await withDB((db) => {
      const tx = db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      store.delete(eventId);
      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
  } catch (error) {
    logger.error('[EventCache] Failed to delete cached event by id:', error);
  }
}

/** NIP-09 kind for deletion requests */
const KIND_DELETION = 5;

/**
 * Addressable coordinate in an `a` tag: kind (decimal), 64-hex pubkey, then d-tag (may contain colons).
 */
const A_TAG_ADDRESSABLE = /^(\d+):([0-9a-fA-F]{64}):(.+)$/;

/**
 * After storing a batch that may include kind 5 events, remove deleted targets from IndexedDB so
 * entity hooks that read raw cache rows do not flash stale items before parsers run again.
 * Runs after `put` so the same batch can both carry a deletion request and (transiently) include
 * replaced event ids to be removed.
 */
async function applyKindFiveDeletionsFromEvents(events: NostrEvent[]): Promise<void> {
  const kindFive = events.filter((e) => e.kind === KIND_DELETION);
  if (kindFive.length === 0) return;

  const idsToDelete = new Set<string>();
  const addressKeys = new Set<string>();

  for (const ev of kindFive) {
    for (const tag of ev.tags) {
      const name = tag[0];
      const value = tag[1];
      if (!value) continue;
      if (name === 'e') {
        idsToDelete.add(value);
      } else if (name === 'a') {
        const m = value.match(A_TAG_ADDRESSABLE);
        if (!m) continue;
        const kind = parseInt(m[1], 10);
        if (kind >= 30000) {
          addressKeys.add(`${kind}:${m[2]}:${m[3]}`);
        }
      }
    }
  }

  const addressDeletes = [...addressKeys].map((key) => {
    const firstColon = key.indexOf(':');
    const secondColon = key.indexOf(':', firstColon + 1);
    const kind = parseInt(key.slice(0, firstColon), 10);
    const pubkey = key.slice(firstColon + 1, secondColon);
    const dTag = key.slice(secondColon + 1);
    return { kind, pubkey, dTag };
  });

  await Promise.all([
    ...[...idsToDelete].map((id) => deleteCachedEventById(id)),
    ...addressDeletes.map((a) => deleteCachedEventByAddress(a.kind, a.pubkey, a.dTag)),
  ]);
}

/**
 * Clear all cached events for a specific pubkey
 */
export async function clearCacheForPubkey(pubkey: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(EVENTS_STORE, 'readwrite');
    const store = tx.objectStore(EVENTS_STORE);
    const index = store.index('pubkey');
    
    const request = index.getAllKeys(pubkey);
    
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const keys = request.result || [];
        for (const key of keys) {
          store.delete(key);
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    logger.error('[EventCache] Failed to clear cache for pubkey:', error);
  }
}

/**
 * Get the last sync timestamp for a cache key
 */
export async function getLastSyncTime(cacheKey: string): Promise<number | null> {
  try {
    return await withDB((db) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const request = store.get(cacheKey);
      return new Promise<number | null>((resolve, reject) => {
        request.onsuccess = () => {
          const meta = request.result as CacheMeta | undefined;
          resolve(meta?.lastSyncedAt ?? null);
        };
        request.onerror = () => reject(request.error);
      });
    });
  } catch (error) {
    logger.error('[EventCache] Failed to get last sync time:', error);
    return null;
  }
}

/**
 * Update the last sync timestamp for a cache key
 */
export async function updateLastSyncTime(cacheKey: string, pubkey: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(META_STORE, 'readwrite');
    const store = tx.objectStore(META_STORE);
    
    const meta: CacheMeta = {
      key: cacheKey,
      lastSyncedAt: Date.now(),
      pubkey,
    };
    
    store.put(meta);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    logger.error('[EventCache] Failed to update last sync time:', error);
  }
}

/**
 * Clear the entire cache (useful for debugging or logout)
 */
export async function clearAllCache(): Promise<void> {
  try {
    await withDB((db) => {
      const tx = db.transaction([EVENTS_STORE, META_STORE], 'readwrite');
      tx.objectStore(EVENTS_STORE).clear();
      tx.objectStore(META_STORE).clear();
      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
  } catch (error) {
    logger.error('[EventCache] Failed to clear all cache:', error);
  }
}

/**
 * Get a single cached event by kind and pubkey (for replaceable events like profiles)
 * Returns the most recent event if multiple exist
 */
export async function getCachedEvent(kind: number, pubkey: string): Promise<NostrEvent | null> {
  try {
    const events = await getCachedEvents([kind], pubkey);
    if (events.length === 0) return null;
    
    // Return the most recent event
    return events.reduce((latest, event) => 
      event.created_at > latest.created_at ? event : latest
    );
  } catch (error) {
    logger.error('[EventCache] Failed to get cached event:', error);
    return null;
  }
}

/**
 * Cache a single event (convenience wrapper)
 */
export async function cacheEvent(event: NostrEvent): Promise<void> {
  return cacheEvents([event]);
}
