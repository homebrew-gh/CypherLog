import type { NostrEvent, NostrSigner } from '@nostrify/types';
import { AmberSigner } from '@/lib/capacitor/amberSignerPlugin';

function randomRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Capacitor maps each `startActivityForResult` to a fixed `@ActivityCallback` name.
 * Concurrent calls that share the same callback (e.g. many `nip44Decrypt` at once)
 * do not all receive results — the UI can look "stuck" after Amber approves a batch.
 */
function createSerialTaskQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = tail.then(() => task());
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}

/**
 * One queue for every AmberAndroidSigner instance. `useCurrentUser` can create a new
 * signer whenever `nostr` identity changes; without a shared queue, parallel decrypts
 * from IndexedDB/hooks still hit the native plugin concurrently and results are lost.
 */
const runAllAmberNativeExclusive = createSerialTaskQueue();

export interface AmberAndroidSignerOptions {
  signerPackage: string;
  pubkey: string;
}

/**
 * NIP-55 signer bridge (Amber, etc.) for Capacitor Android — see NIP-55.
 */
export class AmberAndroidSigner implements NostrSigner {
  constructor(private readonly options: AmberAndroidSignerOptions) {}

  async getPublicKey(): Promise<string> {
    return this.options.pubkey;
  }

  async signEvent(
    event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>,
  ): Promise<NostrEvent> {
    return runAllAmberNativeExclusive(async () => {
      const template = {
        kind: event.kind,
        content: event.content ?? '',
        tags: event.tags ?? [],
        created_at: event.created_at,
      };
      const eventJson = JSON.stringify(template);
      const { eventJson: signedJson } = await AmberSigner.signEvent({
        eventJson,
        signerPackage: this.options.signerPackage,
        pubkey: this.options.pubkey,
        requestId: randomRequestId(),
      });
      const parsed = JSON.parse(signedJson) as NostrEvent;
      if (!parsed?.id || !parsed?.pubkey || !parsed?.sig) {
        throw new Error('Amber returned an invalid signed event');
      }
      return parsed;
    });
  }

  get nip44(): NostrSigner['nip44'] {
    return {
      encrypt: async (peerPubkey: string, plaintext: string): Promise<string> => {
        return runAllAmberNativeExclusive(async () => {
          const { result } = await AmberSigner.nip44Encrypt({
            plaintext,
            peerPubkey,
            signerPackage: this.options.signerPackage,
            pubkey: this.options.pubkey,
            requestId: randomRequestId(),
          });
          return result;
        });
      },
      decrypt: async (peerPubkey: string, ciphertext: string): Promise<string> => {
        return runAllAmberNativeExclusive(async () => {
          const { result } = await AmberSigner.nip44Decrypt({
            ciphertext,
            peerPubkey,
            signerPackage: this.options.signerPackage,
            pubkey: this.options.pubkey,
            requestId: randomRequestId(),
          });
          return result;
        });
      },
    };
  }
}

/** Reuse one signer per saved Amber login so `logins` reference churn does not spawn parallel native queues. */
const amberSignerByLoginId = new Map<string, AmberAndroidSigner>();

export function obtainAmberAndroidSigner(loginId: string, options: AmberAndroidSignerOptions): AmberAndroidSigner {
  const existing = amberSignerByLoginId.get(loginId);
  if (existing) return existing;
  const signer = new AmberAndroidSigner(options);
  amberSignerByLoginId.set(loginId, signer);
  return signer;
}

export function clearAmberAndroidSignerCache(): void {
  amberSignerByLoginId.clear();
}
