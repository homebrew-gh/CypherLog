import { type NLoginType, NUser, useNostrLogin } from '@nostrify/react/login';
import { useNostr } from '@nostrify/react';
import { useCallback, useMemo, useRef, useEffect } from 'react';

import { clearAmberAndroidSignerCache, obtainAmberAndroidSigner } from '@/lib/amberAndroidSigner';
import { useAuthor } from './useAuthor.ts';
import { logger } from '@/lib/logger';

export function useCurrentUser() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();
  // Bunker sign-in needs the live pool; other login types must not recreate `loginToUser`
  // when `nostr` changes — a new AmberAndroidSigner per pool swap breaks serial native decrypt.
  const nostrRef = useRef(nostr);
  useEffect(() => {
    nostrRef.current = nostr;
  }, [nostr]);

  useEffect(() => {
    if (logins.length === 0) {
      clearAmberAndroidSignerCache();
    }
  }, [logins.length]);

  const loginToUser = useCallback((login: NLoginType): NUser => {
    switch (login.type) {
      case 'nsec': // Nostr login with secret key
        return NUser.fromNsecLogin(login);
      case 'bunker': // Nostr login with NIP-46 "bunker://" URI
        return NUser.fromBunkerLogin(login, nostrRef.current);
      case 'extension': // Nostr login with NIP-07 browser extension
        return NUser.fromExtensionLogin(login);
      case 'x-amber-android': {
        const pkg = login.data && typeof login.data.signerPackage === 'string' ? login.data.signerPackage : '';
        if (!pkg) {
          throw new Error('Missing Amber signer package in saved login');
        }
        return new NUser(
          login.type,
          login.pubkey,
          obtainAmberAndroidSigner(login.id, { signerPackage: pkg, pubkey: login.pubkey }),
        );
      }
      default:
        throw new Error(`Unsupported login type: ${login.type}`);
    }
  }, []);

  const users = useMemo(() => {
    const users: NUser[] = [];

    for (const login of logins) {
      try {
        const user = loginToUser(login);
        users.push(user);
      } catch {
        logger.warn('[useCurrentUser] Skipped invalid login');
      }
    }

    return users;
  }, [logins, loginToUser]);

  const user = users[0] as NUser | undefined;
  const author = useAuthor(user?.pubkey);

  // Memoize the return value to prevent unnecessary re-renders
  // When author.data changes, this will create a new object reference
  // but only when the underlying data actually changes
  return useMemo(() => ({
    user,
    users,
    ...author.data,
  }), [user, users, author.data]);
}
