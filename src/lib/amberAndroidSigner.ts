import type { NostrEvent, NostrSigner } from '@nostrify/types';
import { AmberSigner } from '@/lib/capacitor/amberSignerPlugin';

function randomRequestId(): string {
  return crypto.randomUUID();
}

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
  }

  get nip44(): NostrSigner['nip44'] {
    return {
      encrypt: async (peerPubkey: string, plaintext: string): Promise<string> => {
        const { result } = await AmberSigner.nip44Encrypt({
          plaintext,
          peerPubkey,
          signerPackage: this.options.signerPackage,
          pubkey: this.options.pubkey,
          requestId: randomRequestId(),
        });
        return result;
      },
      decrypt: async (peerPubkey: string, ciphertext: string): Promise<string> => {
        const { result } = await AmberSigner.nip44Decrypt({
          ciphertext,
          peerPubkey,
          signerPackage: this.options.signerPackage,
          pubkey: this.options.pubkey,
          requestId: randomRequestId(),
        });
        return result;
      },
    };
  }
}
