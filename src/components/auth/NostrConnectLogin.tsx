import { useState, useEffect, useCallback, useRef } from 'react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { NSecSigner, NRelay1 } from '@nostrify/nostrify';
import type { NostrEvent } from '@nostrify/types';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Copy, Check, QrCode, ExternalLink } from 'lucide-react';
import { useAppContext } from '@/hooks/useAppContext';
import { isCapacitorAndroid } from '@/lib/capacitor/amberSignerPlugin';
import { logger } from '@/lib/logger';

export interface NostrConnectResult {
  /** The remote signer's pubkey */
  remotePubkey: string;
  /** The user's pubkey (may be different from remotePubkey) */
  userPubkey: string;
  /** The client's secret key in nsec format for storage */
  clientNsec: string;
  /** The relay URL used for communication */
  relayUrl: string;
}

interface NostrConnectLoginProps {
  /** Called when connection is successfully established */
  onConnect: (result: NostrConnectResult) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** App name to display in signer apps */
  appName?: string;
  /** App URL for identification */
  appUrl?: string;
}

const PENDING_STORAGE_KEY = 'cypherlog_nostrconnect_pending_v1';
const PENDING_TTL_MS = 15 * 60 * 1000;
const CONNECT_WAIT_MS = 120_000;

interface PendingSessionV1 {
  v: 1;
  clientNsec: string;
  secret: string;
  relayUrl: string;
  connectUri: string;
  sessionStartedAt: number;
}

function readPendingSession(): PendingSessionV1 | null {
  try {
    const raw = sessionStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingSessionV1;
    if (parsed.v !== 1 || !parsed.clientNsec || !parsed.connectUri || !parsed.relayUrl) return null;
    if (Date.now() - parsed.sessionStartedAt > PENDING_TTL_MS) {
      sessionStorage.removeItem(PENDING_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePendingSession(session: PendingSessionV1): void {
  try {
    sessionStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // private mode / quota
  }
}

function clearPendingSession(): void {
  try {
    sessionStorage.removeItem(PENDING_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function decodeNsecToSecretKey(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') {
    throw new Error('Invalid nsec in pending session');
  }
  return decoded.data;
}

async function tryProcessConnectResponse(
  event: NostrEvent,
  clientSigner: NSecSigner,
  clientSecretKey: Uint8Array,
  relayUrl: string,
): Promise<NostrConnectResult | null> {
  let decrypted: string;
  try {
    decrypted = await clientSigner.nip44!.decrypt(event.pubkey, event.content);
  } catch {
    try {
      decrypted = await clientSigner.nip04!.decrypt(event.pubkey, event.content);
    } catch {
      return null;
    }
  }

  let response: { error?: string; result?: unknown };
  try {
    response = JSON.parse(decrypted) as { error?: string; result?: unknown };
  } catch {
    return null;
  }

  if (response.error) {
    return null;
  }

  if (!response.result) {
    return null;
  }

  const remotePubkey = event.pubkey;
  const resultStr = typeof response.result === 'string' ? response.result : '';
  const resultIsHexPubkey = /^[0-9a-f]{64}$/i.test(resultStr);
  const userPubkey = resultIsHexPubkey ? resultStr : remotePubkey;

  return {
    remotePubkey,
    userPubkey,
    clientNsec: nip19.nsecEncode(clientSecretKey),
    relayUrl,
  };
}

export function NostrConnectLogin({
  onConnect,
  onError,
  appName = 'CypherLog',
  appUrl = typeof window !== 'undefined' ? window.location.origin : '',
}: NostrConnectLoginProps) {
  const { config } = useAppContext();
  const onConnectRef = useRef(onConnect);
  const onErrorRef = useRef(onError);
  const appNameRef = useRef(appName);
  const appUrlRef = useRef(appUrl);
  const configRef = useRef(config);

  onConnectRef.current = onConnect;
  onErrorRef.current = onError;
  appNameRef.current = appName;
  appUrlRef.current = appUrl;
  configRef.current = config;

  const [connectUri, setConnectUri] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>('');

  const connectionRef = useRef<{
    clientSecretKey: Uint8Array;
    secret: string;
    relay: NRelay1;
    relayUrl: string;
    sessionStartedAt: number;
    aborted: boolean;
  } | null>(null);

  const completedRef = useRef(false);
  const isAndroidApp = isCapacitorAndroid();

  const getConnectRelay = useCallback(() => {
    const writeRelay = configRef.current.relayMetadata.relays.find((r) => r.write);
    return writeRelay?.url ?? 'wss://relay.damus.io';
  }, []);

  const generateSecret = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => chars[b % chars.length]).join('');
  };

  const finishConnect = useCallback((result: NostrConnectResult) => {
    if (completedRef.current) return;
    completedRef.current = true;

    const ref = connectionRef.current;
    if (ref) {
      ref.aborted = true;
      try {
        ref.relay.close();
      } catch {
        // ignore
      }
    }
    connectionRef.current = null;

    clearPendingSession();
    setIsConnecting(false);
    setError('');
    onConnectRef.current(result);
  }, []);

  const queryPastConnectResponses = useCallback(
    async (
      relay: NRelay1,
      clientSecretKey: Uint8Array,
      clientPubkey: string,
      relayUrl: string,
      sessionStartedAt: number,
    ): Promise<NostrConnectResult | null> => {
      const clientSigner = new NSecSigner(clientSecretKey);
      const since = Math.max(0, Math.floor(sessionStartedAt / 1000) - 300);

      let past: NostrEvent[];
      try {
        past = await relay.query([{ kinds: [24133], '#p': [clientPubkey], since, limit: 50 }], {
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        return null;
      }

      const sorted = [...past].sort((a, b) => b.created_at - a.created_at);
      for (const event of sorted) {
        if (event.created_at < since) continue;
        const parsed = await tryProcessConnectResponse(event, clientSigner, clientSecretKey, relayUrl);
        if (parsed) return parsed;
      }
      return null;
    },
    [],
  );

  const waitForConnection = useCallback(
    async (
      relay: NRelay1,
      clientSecretKey: Uint8Array,
      clientPubkey: string,
      relayUrl: string,
      sessionStartedAt: number,
    ) => {
      const clientSigner = new NSecSigner(clientSecretKey);

      try {
        const fromPast = await queryPastConnectResponses(
          relay,
          clientSecretKey,
          clientPubkey,
          relayUrl,
          sessionStartedAt,
        );
        if (completedRef.current) return;
        if (fromPast) {
          finishConnect(fromPast);
          return;
        }

        if (connectionRef.current?.aborted) return;

        const timeout = AbortSignal.timeout(CONNECT_WAIT_MS);
        const sub = relay.req([{ kinds: [24133], '#p': [clientPubkey], limit: 1 }], { signal: timeout });

        for await (const msg of sub) {
          if (connectionRef.current?.aborted || completedRef.current) {
            break;
          }

          if (msg[0] === 'EVENT') {
            const event = msg[2];
            const parsed = await tryProcessConnectResponse(event, clientSigner, clientSecretKey, relayUrl);
            if (parsed) {
              finishConnect(parsed);
              return;
            }
          }
        }

        if (!completedRef.current && !connectionRef.current?.aborted) {
          const err = new Error(
            'No response from your signer yet. Return to this screen after approving in Amber, or tap refresh if you waited more than a few minutes.',
          );
          setError(err.message);
          setIsConnecting(false);
          onErrorRef.current?.(err);
        }
      } catch (err) {
        if (connectionRef.current?.aborted || completedRef.current) {
          return;
        }
        logger.error('[NostrConnectLogin] Connection error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Connection failed';
        setError(errorMessage);
        setIsConnecting(false);
        onErrorRef.current?.(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [finishConnect, queryPastConnectResponses],
  );

  const recoverAfterForeground = useCallback(async () => {
    const ref = connectionRef.current;
    if (!ref || ref.aborted || completedRef.current || !isConnecting) return;

    const clientPubkey = getPublicKey(ref.clientSecretKey);
    const probe = new NRelay1(ref.relayUrl);

    try {
      const found = await queryPastConnectResponses(
        probe,
        ref.clientSecretKey,
        clientPubkey,
        ref.relayUrl,
        ref.sessionStartedAt,
      );
      if (found && !completedRef.current) {
        ref.aborted = true;
        try {
          ref.relay.close();
        } catch {
          // ignore
        }
        finishConnect(found);
      }
    } catch {
      // ignore — main subscription may still deliver
    } finally {
      try {
        await probe.close();
      } catch {
        // ignore
      }
    }
  }, [finishConnect, isConnecting, queryPastConnectResponses]);

  const generateConnection = useCallback(async () => {
    setIsGenerating(true);
    setError('');
    setConnectUri('');
    setQrDataUrl('');
    completedRef.current = false;

    if (connectionRef.current) {
      connectionRef.current.aborted = true;
      try {
        await connectionRef.current.relay.close();
      } catch {
        // ignore
      }
      connectionRef.current = null;
    }

    const now = Date.now();
    const existing = readPendingSession();

    try {
      if (existing && now - existing.sessionStartedAt < PENDING_TTL_MS) {
        const clientSecretKey = decodeNsecToSecretKey(existing.clientNsec);
        const clientPubkey = getPublicKey(clientSecretKey);

        setConnectUri(existing.connectUri);
        const qrUrl = await QRCode.toDataURL(existing.connectUri, {
          width: 280,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        });
        setQrDataUrl(qrUrl);

        const relay = new NRelay1(existing.relayUrl);
        connectionRef.current = {
          clientSecretKey,
          secret: existing.secret,
          relay,
          relayUrl: existing.relayUrl,
          sessionStartedAt: existing.sessionStartedAt,
          aborted: false,
        };

        setIsGenerating(false);
        setIsConnecting(true);

        await waitForConnection(relay, clientSecretKey, clientPubkey, existing.relayUrl, existing.sessionStartedAt);
        return;
      }
    } catch {
      clearPendingSession();
    }

    try {
      const clientSecretKey = generateSecretKey();
      const clientPubkey = getPublicKey(clientSecretKey);
      const secret = generateSecret();
      const relayUrl = getConnectRelay();
      const sessionStartedAt = Date.now();

      const params = new URLSearchParams();
      params.set('relay', relayUrl);
      params.set('secret', secret);
      params.set('name', appNameRef.current);
      params.set('url', appUrlRef.current);
      params.set('perms', 'sign_event,nip04_encrypt,nip04_decrypt,nip44_encrypt,nip44_decrypt');

      const uri = `nostrconnect://${clientPubkey}?${params.toString()}`;
      setConnectUri(uri);

      const qrUrl = await QRCode.toDataURL(uri, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrDataUrl(qrUrl);

      writePendingSession({
        v: 1,
        clientNsec: nip19.nsecEncode(clientSecretKey),
        secret,
        relayUrl,
        connectUri: uri,
        sessionStartedAt,
      });

      const relay = new NRelay1(relayUrl);
      connectionRef.current = {
        clientSecretKey,
        secret,
        relay,
        relayUrl,
        sessionStartedAt,
        aborted: false,
      };

      setIsGenerating(false);
      setIsConnecting(true);

      await waitForConnection(relay, clientSecretKey, clientPubkey, relayUrl, sessionStartedAt);
    } catch (err) {
      logger.error('[NostrConnectLogin] Error generating connection:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate connection');
      setIsGenerating(false);
      setIsConnecting(false);
      onErrorRef.current?.(err instanceof Error ? err : new Error('Failed to generate connection'));
    }
  }, [getConnectRelay, waitForConnection]);

  const copyToClipboard = async () => {
    if (!connectUri) return;
    try {
      await navigator.clipboard.writeText(connectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    void generateConnection();

    return () => {
      if (connectionRef.current) {
        connectionRef.current.aborted = true;
        try {
          void connectionRef.current.relay.close();
        } catch {
          // ignore
        }
      }
    };
  }, [generateConnection]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void recoverAfterForeground();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [recoverAfterForeground]);

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg space-y-2 border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
        <p className="text-xs text-amber-900 dark:text-amber-200">
          Scan this QR code with your Nostr signer app (like{' '}
          <a
            href="https://nsec.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-700 dark:text-amber-300 hover:underline font-medium"
          >
            nsec.app
          </a>
          ,{' '}
          <a
            href="https://github.com/greenart7c3/Amber"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-700 dark:text-amber-300 hover:underline font-medium"
          >
            Amber
          </a>
          , or another NIP-46 compatible signer).
        </p>
        <p className="text-xs text-amber-900 dark:text-amber-200">
          Both devices talk through Nostr relays (not directly). Keep your signer app open and connected to the same
          relay for the first load; profile and data may take a bit longer than with a local key.
        </p>
        {isAndroidApp && (
          <p className="text-xs font-medium text-amber-950 dark:text-amber-100">
            <strong>Android:</strong> After you approve the connection in Amber, use the system back button to return
            here. The same QR pairing stays active for several minutes—avoid tapping refresh unless you need a new
            session. For signing without relay handshakes, use &quot;Log in with Amber&quot; at the top of this screen.
          </p>
        )}
        <p className="text-xs text-amber-900 dark:text-amber-200">
          Because Cypher Log stores your data encrypted, remote signers (e.g. Amber) can have trouble loading your
          profile and data—timeouts and failed loads are common. For the most reliable experience, use a local key
          (nsec) or a browser extension.
        </p>
      </div>

      <div className="flex flex-col items-center space-y-4">
        {isGenerating ? (
          <div className="w-[280px] h-[280px] flex items-center justify-center bg-muted rounded-lg">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : qrDataUrl ? (
          <div className="relative">
            <img
              src={qrDataUrl}
              alt="NostrConnect QR Code"
              className="rounded-lg border shadow-sm"
              width={280}
              height={280}
            />
            {isConnecting && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Waiting for connection...</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-[280px] h-[280px] flex items-center justify-center bg-muted rounded-lg border-2 border-dashed">
            <QrCode className="h-12 w-12 text-muted-foreground" />
          </div>
        )}

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        <div className="flex gap-2 w-full">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={copyToClipboard}
            disabled={!connectUri || isGenerating}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-1.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1.5" />
                Copy URI
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clearPendingSession();
              void generateConnection();
            }}
            disabled={isGenerating}
          >
            <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <a
        href="https://nostrconnect.org"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ExternalLink className="h-3 w-3" />
        <span>Learn more about Nostr Connect</span>
      </a>
    </div>
  );
}
