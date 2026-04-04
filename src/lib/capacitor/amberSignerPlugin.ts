import { Capacitor, registerPlugin, WebPlugin } from '@capacitor/core';

export interface AmberSignerPlugin {
  isAvailable(): Promise<{ installed: boolean }>;
  getPublicKey(options: { permissionsJson: string }): Promise<{ pubkey: string; packageName: string }>;
  signEvent(options: {
    eventJson: string;
    signerPackage: string;
    pubkey: string;
    requestId: string;
  }): Promise<{ eventJson: string }>;
  nip44Encrypt(options: {
    plaintext: string;
    peerPubkey: string;
    signerPackage: string;
    pubkey: string;
    requestId: string;
  }): Promise<{ result: string }>;
  nip44Decrypt(options: {
    ciphertext: string;
    peerPubkey: string;
    signerPackage: string;
    pubkey: string;
    requestId: string;
  }): Promise<{ result: string }>;
}

class AmberSignerWeb extends WebPlugin implements AmberSignerPlugin {
  async isAvailable(): Promise<{ installed: boolean }> {
    return { installed: false };
  }

  async getPublicKey(): Promise<{ pubkey: string; packageName: string }> {
    throw new Error('Amber (NIP-55) login is only available in the Cypher Log Android app.');
  }

  async signEvent(): Promise<{ eventJson: string }> {
    throw new Error('Amber signer is only available in the Cypher Log Android app.');
  }

  async nip44Encrypt(): Promise<{ result: string }> {
    throw new Error('Amber signer is only available in the Cypher Log Android app.');
  }

  async nip44Decrypt(): Promise<{ result: string }> {
    throw new Error('Amber signer is only available in the Cypher Log Android app.');
  }
}

export const AmberSigner = registerPlugin<AmberSignerPlugin>('AmberSigner', {
  web: () => new AmberSignerWeb(),
});

/**
 * True when running inside the Cypher Log Android WebView (Capacitor).
 * Prefer `window.androidBridge` because it is set by the native layer and avoids
 * rare timing cases where `getPlatform()` has not updated yet on first paint.
 */
export function isCapacitorAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as Window & { androidBridge?: unknown };
  if (win.androidBridge != null) return true;
  try {
    return Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}
