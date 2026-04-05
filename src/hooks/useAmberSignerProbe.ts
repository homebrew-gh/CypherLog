import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNostrLogin } from '@nostrify/react/login';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { logger } from '@/lib/logger';

type AmberProbeStatus = 'idle' | 'running' | 'passed' | 'failed';

type AmberProbeCode =
  | 'no_nip44'
  | 'nip44_encrypt_failed'
  | 'nip44_decrypt_failed'
  | 'nip44_roundtrip_mismatch'
  | 'relay_auth_sign_failed'
  | 'invalid_relay_auth_signature';

export interface AmberSignerProbeResult {
  status: AmberProbeStatus;
  code?: AmberProbeCode;
  message?: string;
}

type AmberCapableUser = {
  pubkey: string;
  signer: {
    nip44?: {
      encrypt: (peerPubkey: string, plaintext: string) => Promise<string>;
      decrypt: (peerPubkey: string, ciphertext: string) => Promise<string>;
    };
    signEvent: (event: {
      kind: number;
      content: string;
      tags: string[][];
      created_at: number;
    }) => Promise<{ kind: number; id?: string; pubkey?: string; sig?: string }>;
  };
};

const IDLE_RESULT: AmberSignerProbeResult = { status: 'idle' };
const PASSED_RESULT: AmberSignerProbeResult = { status: 'passed' };
const probeCache = new Map<string, AmberSignerProbeResult>();

function describeFailure(code: AmberProbeCode, error?: unknown): string {
  const suffix = error instanceof Error && error.message
    ? ` Amber said: ${error.message}`
    : '';

  switch (code) {
    case 'no_nip44':
      return 'Amber login succeeded, but NIP-44 is unavailable for this signer session.';
    case 'nip44_encrypt_failed':
      return `Amber login succeeded, but self-encryption with NIP-44 failed.${suffix}`;
    case 'nip44_decrypt_failed':
      return `Amber login succeeded, but self-decryption with NIP-44 failed.${suffix}`;
    case 'nip44_roundtrip_mismatch':
      return 'Amber returned decrypted data that did not match the original self-encryption probe.';
    case 'relay_auth_sign_failed':
      return `Amber login succeeded, but signing a relay-auth event (kind 22242) failed.${suffix}`;
    case 'invalid_relay_auth_signature':
      return 'Amber returned an invalid signature when Cypher Log tested relay-auth signing.';
  }
}

async function runAmberProbe(user: AmberCapableUser): Promise<AmberSignerProbeResult> {
  const nip44 = user.signer.nip44;
  if (!nip44) {
    return {
      status: 'failed',
      code: 'no_nip44',
      message: describeFailure('no_nip44'),
    };
  }

  const nonce = crypto.randomUUID();
  const plaintext = `cypherlog-amber-probe:${nonce}`;

  let ciphertext: string;
  try {
    ciphertext = await nip44.encrypt(user.pubkey, plaintext);
  } catch (error) {
    return {
      status: 'failed',
      code: 'nip44_encrypt_failed',
      message: describeFailure('nip44_encrypt_failed', error),
    };
  }

  let decrypted: string;
  try {
    decrypted = await nip44.decrypt(user.pubkey, ciphertext);
  } catch (error) {
    return {
      status: 'failed',
      code: 'nip44_decrypt_failed',
      message: describeFailure('nip44_decrypt_failed', error),
    };
  }

  if (decrypted !== plaintext) {
    return {
      status: 'failed',
      code: 'nip44_roundtrip_mismatch',
      message: describeFailure('nip44_roundtrip_mismatch'),
    };
  }

  try {
    const signed = await user.signer.signEvent({
      kind: 22242,
      created_at: Math.floor(Date.now() / 1000),
      content: '',
      tags: [
        ['relay', 'wss://relay.invalid'],
        ['challenge', nonce],
        ['alt', 'Cypher Log Amber diagnostic relay auth probe'],
      ],
    });

    if (signed.kind !== 22242 || !signed.id || !signed.pubkey || !signed.sig) {
      return {
        status: 'failed',
        code: 'invalid_relay_auth_signature',
        message: describeFailure('invalid_relay_auth_signature'),
      };
    }
  } catch (error) {
    return {
      status: 'failed',
      code: 'relay_auth_sign_failed',
      message: describeFailure('relay_auth_sign_failed', error),
    };
  }

  return PASSED_RESULT;
}

export function useAmberSignerProbe() {
  const { logins } = useNostrLogin();
  const { user } = useCurrentUser();
  const [retryNonce, setRetryNonce] = useState(0);
  const [result, setResult] = useState<AmberSignerProbeResult>(IDLE_RESULT);

  const amberLoginId = useMemo(() => {
    const login = logins[0];
    return login?.type === 'x-amber-android' ? login.id : null;
  }, [logins]);

  useEffect(() => {
    if (!amberLoginId || !user) {
      setResult(IDLE_RESULT);
      return;
    }

    if (retryNonce === 0) {
      const cached = probeCache.get(amberLoginId);
      if (cached) {
        setResult(cached);
        return;
      }
    }

    let cancelled = false;
    setResult({ status: 'running' });

    void runAmberProbe(user as AmberCapableUser).then((next) => {
      if (cancelled) return;
      probeCache.set(amberLoginId, next);
      if (next.status === 'failed') {
        logger.error('[AmberProbe]', next.code, next.message);
      }
      setResult(next);
    });

    return () => {
      cancelled = true;
    };
  }, [amberLoginId, retryNonce, user]);

  const rerun = useCallback(() => {
    if (amberLoginId) {
      probeCache.delete(amberLoginId);
    }
    setRetryNonce((n) => n + 1);
  }, [amberLoginId]);

  return {
    result,
    rerun,
  };
}
