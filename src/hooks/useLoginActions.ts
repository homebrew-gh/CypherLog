import { useNostr } from '@nostrify/react';
import { NLogin, type NLoginType, useNostrLogin } from '@nostrify/react/login';

import { AmberSigner, isCapacitorAndroid } from '@/lib/capacitor/amberSignerPlugin';
import { normalizeSignerPubkey } from '@/lib/normalizeSignerPubkey';

/** NIP-55 default permissions for get_public_key (Amber pre-approval for typical Cypher Log usage). */
const AMBER_GET_PUBLIC_KEY_PERMISSIONS = JSON.stringify([
  { type: 'sign_event' },
  { type: 'nip44_encrypt' },
  { type: 'nip44_decrypt' },
  { type: 'nip04_encrypt' },
  { type: 'nip04_decrypt' },
]);

// NOTE: This file should not be edited except for adding new login methods.

export function useLoginActions() {
  const { nostr } = useNostr();
  const { logins, addLogin, removeLogin } = useNostrLogin();

  return {
    // Login with a Nostr secret key
    nsec(nsec: string): void {
      const login = NLogin.fromNsec(nsec);
      addLogin(login);
    },
    // Login with a NIP-46 "bunker://" URI
    async bunker(uri: string): Promise<void> {
      const login = await NLogin.fromBunker(uri, nostr);
      addLogin(login);
    },
    // Login with a NIP-07 browser extension
    async extension(): Promise<void> {
      const login = await NLogin.fromExtension();
      addLogin(login);
    },
    /** Android app only: NIP-55 signer (e.g. Amber). */
    async amberAndroid(): Promise<void> {
      if (!isCapacitorAndroid()) {
        throw new Error('Amber login is only available in the Cypher Log Android app.');
      }
      const avail = await AmberSigner.isAvailable();
      if (!avail.installed) {
        throw new Error(
          'No NIP-55 signer found. Install Amber (com.greenart7c3.nostrsigner) from F-Droid or GitHub.',
        );
      }
      const { pubkey: rawPubkey, packageName } = await AmberSigner.getPublicKey({
        permissionsJson: AMBER_GET_PUBLIC_KEY_PERMISSIONS,
      });
      const pubkey = normalizeSignerPubkey(rawPubkey);
      if (!packageName) {
        throw new Error('Signer did not return a package name. Update Amber and try again.');
      }
      const login: NLoginType = {
        id: `x-amber-android:${pubkey}`,
        type: 'x-amber-android',
        pubkey,
        createdAt: new Date().toISOString(),
        data: { signerPackage: packageName },
      };
      addLogin(login);
    },
    // Login with NIP-46 NostrConnect (client-initiated connection).
    // Store login in the same shape as NLogin.fromBunker() so NUser.fromBunkerLogin()
    // can build the signer and useCurrentUser() returns a valid user (dashboard loads).
    async nostrconnect(remotePubkey: string, userPubkey: string, clientNsec: string, relayUrl: string): Promise<void> {
      const login = {
        id: `bunker:${userPubkey}`,
        type: 'bunker' as const,
        pubkey: userPubkey,
        createdAt: new Date().toISOString(),
        data: {
          bunkerPubkey: remotePubkey,
          clientNsec: clientNsec as `nsec1${string}`,
          relays: [relayUrl],
        },
      } as unknown as NLoginType;

      addLogin(login);
    },
    // Log out the current user
    async logout(): Promise<void> {
      const login = logins[0];
      if (login) {
        removeLogin(login.id);
      }
    }
  };
}
