/**
 * Persistent publish outbox: signed events are stored in IndexedDB and flushed
 * per relay until every target relay has accepted the event (unlike NPool.event,
 * which succeeds if any relay accepts).
 */

import type { NostrEvent } from '@nostrify/nostrify';
import { logger } from '@/lib/logger';

const DB_NAME = 'cypherlog-publish-outbox';
const DB_VERSION = 1;
const STORE = 'jobs';

const PER_RELAY_TIMEOUT_MS = 15_000;
const DEFAULT_JOB_TIMEOUT_MS = 180_000;
const WAIT_POLL_MS = 250;
const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 120_000;

export interface OutboxNostr {
  relay(url: string): {
    event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void>;
  };
}

export interface PublishOutboxJob {
  id: string;
  event: NostrEvent;
  remainingRelays: string[];
  attemptCount: number;
  nextAttemptAt: number;
  lastError?: string;
  createdAt: number;
}

export function isPublishOutboxSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Single attempt: publish to each relay in parallel. Returns URLs that failed.
 */
export async function attemptPublishToRelays(
  nostr: OutboxNostr,
  event: NostrEvent,
  relayUrls: string[]
): Promise<string[]> {
  const urls = uniqueRelayUrls(relayUrls);
  if (urls.length === 0) return [];

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        await nostr.relay(url).event(event, {
          signal: AbortSignal.timeout(PER_RELAY_TIMEOUT_MS),
        });
        return { url, ok: true as const };
      } catch {
        return { url, ok: false as const };
      }
    })
  );

  return results.filter((r) => !r.ok).map((r) => r.url);
}

let dbPromise: Promise<IDBDatabase> | null = null;

function isClosedDatabaseError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'InvalidStateError') return true;
  if (error instanceof Error && /closed|closing/i.test(error.message)) return true;
  return false;
}

function openDB(): Promise<IDBDatabase> {
  if (!isPublishOutboxSupported()) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      logger.error('[PublishOutbox] Failed to open database');
      reject(request.error);
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
  });

  return dbPromise;
}

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

function uniqueRelayUrls(urls: string[]): string[] {
  return [...new Set(urls.filter((u) => typeof u === 'string' && u.length > 0))];
}

function backoffMs(attemptCount: number): number {
  const exp = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** Math.max(0, attemptCount - 1));
  const jitter = Math.floor(Math.random() * 500);
  return exp + jitter;
}

export async function enqueuePublishJob(
  event: NostrEvent,
  relayUrls: string[]
): Promise<string | null> {
  const remainingRelays = uniqueRelayUrls(relayUrls);
  if (remainingRelays.length === 0) {
    logger.warn('[PublishOutbox] No relay URLs; skipping enqueue');
    return null;
  }

  if (!isPublishOutboxSupported()) {
    return null;
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const job: PublishOutboxJob = {
    id,
    event,
    remainingRelays,
    attemptCount: 0,
    nextAttemptAt: 0,
    createdAt: now,
  };

  await withDB(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).put(job);
      })
  );

  return id;
}

export async function getPublishJob(id: string): Promise<PublishOutboxJob | null> {
  return withDB(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        req.onsuccess = () => resolve((req.result as PublishOutboxJob | undefined) ?? null);
        req.onerror = () => reject(req.error);
      })
  );
}

async function deletePublishJob(id: string): Promise<void> {
  await withDB(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).delete(id);
      })
  );
}

async function putPublishJob(job: PublishOutboxJob): Promise<void> {
  await withDB(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).put(job);
      })
  );
}

async function listAllJobs(): Promise<PublishOutboxJob[]> {
  if (!isPublishOutboxSupported()) {
    return [];
  }
  return withDB(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = () => resolve((req.result as PublishOutboxJob[]) ?? []);
        req.onerror = () => reject(req.error);
      })
  );
}

/**
 * Try each remaining relay once; update or delete the job.
 */
export async function processPublishJob(nostr: OutboxNostr, job: PublishOutboxJob): Promise<void> {
  const now = Date.now();
  if (job.remainingRelays.length === 0) {
    await deletePublishJob(job.id);
    return;
  }
  if (now < job.nextAttemptAt) {
    return;
  }

  const prevRemaining = job.remainingRelays.length;

  const stillFailed = await attemptPublishToRelays(nostr, job.event, job.remainingRelays);

  if (stillFailed.length === 0) {
    await deletePublishJob(job.id);
    logger.log('[PublishOutbox] Job complete', job.id, job.event.kind);
    return;
  }

  const madeProgress = stillFailed.length < prevRemaining;
  const attemptCount = job.attemptCount + 1;
  const nextAttemptAt = madeProgress ? now + Math.min(INITIAL_BACKOFF_MS, 500) : now + backoffMs(attemptCount);

  await putPublishJob({
    ...job,
    remainingRelays: stillFailed,
    attemptCount,
    nextAttemptAt,
    lastError: stillFailed.length > 0 ? 'Relay rejected or unreachable' : job.lastError,
  });
}

let flushChain: Promise<void> = Promise.resolve();

/**
 * Process all due jobs sequentially (per job, relays in parallel).
 */
export function flushPublishOutbox(nostr: OutboxNostr): Promise<void> {
  flushChain = flushChain.then(() => flushPublishOutboxInner(nostr));
  return flushChain;
}

async function flushPublishOutboxInner(nostr: OutboxNostr): Promise<void> {
  if (!isPublishOutboxSupported()) {
    return;
  }
  const jobs = await listAllJobs();
  const now = Date.now();
  const due = jobs.filter((j) => j.remainingRelays.length > 0 && j.nextAttemptAt <= now);
  due.sort((a, b) => a.createdAt - b.createdAt);

  for (const job of due) {
    try {
      await processPublishJob(nostr, job);
    } catch (e) {
      logger.error('[PublishOutbox] processPublishJob error:', job.id, e);
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = globalThis.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        globalThis.clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

/**
 * Enqueue then block until the job is fully delivered or timeout.
 * Continues flushing in the caller loop so concurrent jobs make progress.
 */
async function waitUntilRelaysAccept(
  nostr: OutboxNostr,
  event: NostrEvent,
  relayUrls: string[],
  options?: { signal?: AbortSignal; jobTimeoutMs?: number }
): Promise<void> {
  const jobTimeoutMs = options?.jobTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
  const deadline = Date.now() + jobTimeoutMs;
  const signal = options?.signal;
  let pending = uniqueRelayUrls(relayUrls);

  while (pending.length > 0 && Date.now() < deadline) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    pending = await attemptPublishToRelays(nostr, event, pending);
    if (pending.length > 0) {
      await sleep(WAIT_POLL_MS, signal);
    }
  }

  if (pending.length > 0) {
    throw new Error(
      `Publish timed out after ${jobTimeoutMs}ms; ${pending.length} relay(s) still pending`
    );
  }
}

export async function publishEventThroughOutbox(
  nostr: OutboxNostr,
  event: NostrEvent,
  relayUrls: string[],
  options?: { signal?: AbortSignal; jobTimeoutMs?: number }
): Promise<void> {
  const urls = uniqueRelayUrls(relayUrls);
  if (urls.length === 0) {
    throw new Error('No write relays configured for publish');
  }

  if (!isPublishOutboxSupported()) {
    await waitUntilRelaysAccept(nostr, event, urls, options);
    return;
  }

  const jobId = await enqueuePublishJob(event, urls);
  if (!jobId) {
    throw new Error('Failed to enqueue publish job');
  }

  const jobTimeoutMs = options?.jobTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
  const deadline = Date.now() + jobTimeoutMs;
  const signal = options?.signal;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    await flushPublishOutbox(nostr);

    const job = await getPublishJob(jobId);
    if (!job || job.remainingRelays.length === 0) {
      return;
    }

    await sleep(WAIT_POLL_MS, signal);
  }

  const pending = (await getPublishJob(jobId))?.remainingRelays.length ?? 0;
  throw new Error(
    `Publish timed out after ${jobTimeoutMs}ms; ${pending} relay(s) still pending (will retry in background)`
  );
}

const BACKFILL_WAIT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Wait until all given job ids are completed (removed from outbox) or timeout.
 */
export async function waitForPublishJobs(
  nostr: OutboxNostr,
  jobIds: (string | null)[],
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<void> {
  if (!isPublishOutboxSupported()) {
    return;
  }

  const pending = new Set(jobIds.filter((id): id is string => typeof id === 'string' && id.length > 0));
  if (pending.size === 0) return;

  const timeoutMs = options?.timeoutMs ?? BACKFILL_WAIT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (pending.size > 0 && Date.now() < deadline) {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    await flushPublishOutbox(nostr);

    for (const id of [...pending]) {
      const j = await getPublishJob(id);
      if (!j || j.remainingRelays.length === 0) {
        pending.delete(id);
      }
    }

    if (pending.size > 0) {
      await sleep(WAIT_POLL_MS, options?.signal);
    }
  }

  if (pending.size > 0) {
    throw new Error(
      `Publish queue timed out after ${timeoutMs}ms; ${pending.size} job(s) still pending (will retry in background)`
    );
  }
}

export async function countPendingPublishJobs(): Promise<number> {
  if (!isPublishOutboxSupported()) {
    return 0;
  }
  const jobs = await listAllJobs();
  return jobs.filter((j) => j.remainingRelays.length > 0).length;
}
