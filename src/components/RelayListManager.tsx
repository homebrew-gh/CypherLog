import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, X, Wifi, Settings, Lock, RefreshCw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { isRelayUrlSecure } from '@/lib/relay';
import { logger } from '@/lib/logger';

interface Relay {
  url: string;
  read: boolean;
  write: boolean;
}

type RelayStatus = 'checking' | 'connected' | 'error' | 'unknown';

// Check relay connectivity by attempting a WebSocket connection
async function checkRelayConnectivity(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 5000); // 5 second timeout

      ws.onopen = () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        ws.close();
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
}

// Interval for periodic connectivity checks (30 seconds)
const CONNECTIVITY_CHECK_INTERVAL = 30000;

export function RelayListManager() {
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const { isPrivateRelay, setPrivateRelay, isCachingRelay } = useEncryptionSettings();

  const [relays, setRelays] = useState<Relay[]>(config.relayMetadata.relays);
  const [newRelayUrl, setNewRelayUrl] = useState('wss://');
  const [relayStatuses, setRelayStatuses] = useState<Record<string, RelayStatus>>({});
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [relayToRemove, setRelayToRemove] = useState<string | null>(null);
  const [relayToMarkPrivate, setRelayToMarkPrivate] = useState<{ url: string } | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Use a ref to track config relays for the interval callback to avoid recreating it
  const configRelaysRef = useRef(config.relayMetadata.relays);
  configRelaysRef.current = config.relayMetadata.relays;

  // Check connectivity for a single relay
  const _checkRelay = useCallback(async (url: string) => {
    setRelayStatuses(prev => ({ ...prev, [url]: 'checking' }));
    const isConnected = await checkRelayConnectivity(url);
    setRelayStatuses(prev => ({ ...prev, [url]: isConnected ? 'connected' : 'error' }));
  }, []);

  // Check connectivity for all relays - stable function that reads from ref
  const checkAllRelays = useCallback(async () => {
    const currentRelays = configRelaysRef.current;
    setIsCheckingAll(true);
    const urls = currentRelays.map(r => r.url);
    
    // Set all to checking
    setRelayStatuses(prev => {
      const newStatuses = { ...prev };
      urls.forEach(url => {
        newStatuses[url] = 'checking';
      });
      return newStatuses;
    });

    // Check all in parallel
    await Promise.all(urls.map(async (url) => {
      const isConnected = await checkRelayConnectivity(url);
      setRelayStatuses(prev => ({ ...prev, [url]: isConnected ? 'connected' : 'error' }));
    }));

    setIsCheckingAll(false);
  }, []);

  // Sync local state with config when it changes (e.g., from NostrProvider sync)
  useEffect(() => {
    setRelays(config.relayMetadata.relays);
  }, [config.relayMetadata.relays]);

  // Initial connectivity check and periodic re-check - runs only once on mount
  useEffect(() => {
    // Initial check
    checkAllRelays();

    // Set up periodic check
    checkIntervalRef.current = setInterval(checkAllRelays, CONNECTIVITY_CHECK_INTERVAL);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [checkAllRelays]);

  const normalizeRelayUrl = (url: string): string => {
    url = url.trim();
    try {
      return new URL(url).toString();
    } catch {
      try {
        return new URL(`wss://${url}`).toString();
      } catch {
        return url;
      }
    }
  };

  const isValidRelayUrl = (url: string): boolean => {
    const trimmed = url.trim();
    if (!trimmed) return false;

    const normalized = normalizeRelayUrl(trimmed);
    try {
      new URL(normalized);
      return true;
    } catch {
      return false;
    }
  };

  const handleAddRelay = () => {
    if (!isValidRelayUrl(newRelayUrl)) {
      toast({
        title: 'Invalid relay URL',
        description: 'Please enter a valid relay URL (e.g., wss://relay.example.com)',
        variant: 'destructive',
      });
      return;
    }

    const normalized = normalizeRelayUrl(newRelayUrl);

    if (relays.some(r => r.url === normalized)) {
      toast({
        title: 'Relay already exists',
        description: 'This relay is already in your list.',
        variant: 'destructive',
      });
      return;
    }

    const newRelays = [...relays, { url: normalized, read: true, write: true }];
    setRelays(newRelays);
    setNewRelayUrl('wss://');

    saveRelays(newRelays);
  };

  const handleRemoveRelay = (url: string) => {
    setRelayToRemove(url);
  };

  const confirmRemoveRelay = () => {
    if (!relayToRemove) return;
    const newRelays = relays.filter(r => r.url !== relayToRemove);
    setRelays(newRelays);
    saveRelays(newRelays);
    setRelayToRemove(null);
  };

  const handleToggleRead = (url: string) => {
    const newRelays = relays.map(r =>
      r.url === url ? { ...r, read: !r.read } : r
    );
    setRelays(newRelays);
    saveRelays(newRelays);
  };

  const handleToggleWrite = (url: string) => {
    const newRelays = relays.map(r =>
      r.url === url ? { ...r, write: !r.write } : r
    );
    setRelays(newRelays);
    saveRelays(newRelays);
  };

  const saveRelays = (newRelays: Relay[]) => {
    const now = Math.floor(Date.now() / 1000);

    // Update local config
    updateConfig((current) => ({
      ...current,
      relayMetadata: {
        relays: newRelays,
        updatedAt: now,
      },
    }));

    // Publish to Nostr if user is logged in
    if (user) {
      publishNIP65RelayList(newRelays);
    }
  };

  const publishNIP65RelayList = (relayList: Relay[]) => {
    // NIP-65 must exclude private relays (they are stored encrypted in NIP-78 only)
    const publicRelays = relayList.filter((r) => !isPrivateRelay(r.url));
    const tags = publicRelays.map(relay => {
      if (relay.read && relay.write) {
        return ['r', relay.url];
      } else if (relay.read) {
        return ['r', relay.url, 'read'];
      } else if (relay.write) {
        return ['r', relay.url, 'write'];
      }
      // If neither read nor write, don't include (shouldn't happen)
      return null;
    }).filter((tag): tag is string[] => tag !== null);

    publishEvent(
      {
        kind: 10002,
        content: '',
        tags,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Relay list published',
            description: 'Your relay list has been published to Nostr.',
          });
        },
        onError: (error) => {
          logger.error('Failed to publish relay list:', error);
          toast({
            title: 'Failed to publish relay list',
            description: 'There was an error publishing your relay list to Nostr.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const renderRelayUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'wss:') {
        if (parsed.pathname === '/') {
          return parsed.host;
        } else {
          return parsed.host + parsed.pathname;
        }
      } else {
        return parsed.href;
      }
    } catch {
      return url;
    }
  }

  // Filter out the caching relay (it's shown in its own section) and sort with private ones first
  const sortedRelays = [...relays]
    .filter(r => !isCachingRelay(r.url))
    .sort((a, b) => {
      const aIsPrivate = isPrivateRelay(a.url);
      const bIsPrivate = isPrivateRelay(b.url);
      
      // Private relays first
      if (aIsPrivate && !bIsPrivate) return -1;
      if (!aIsPrivate && bIsPrivate) return 1;
      
      return 0;
    });

  // Get status indicator color and tooltip
  const getStatusInfo = (status: RelayStatus) => {
    switch (status) {
      case 'connected':
        return { color: 'bg-green-500', tooltip: 'Connected' };
      case 'error':
        return { color: 'bg-red-500', tooltip: 'Cannot reach relay' };
      case 'checking':
        return { color: 'bg-yellow-500 animate-pulse', tooltip: 'Checking...' };
      default:
        return { color: 'bg-slate-400', tooltip: 'Unknown' };
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {Object.values(relayStatuses).filter(s => s === 'connected').length} of {relays.length} relays connected
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={checkAllRelays}
          disabled={isCheckingAll}
          className="h-7 px-2 text-xs"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isCheckingAll ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Relay List */}
      <div className="space-y-2">
        {sortedRelays.map((relay) => {
          const isPrivate = isPrivateRelay(relay.url);
          const status = relayStatuses[relay.url] || 'unknown';
          const statusInfo = getStatusInfo(status);
          
          return (
            <div
              key={relay.url}
              className={`flex items-center gap-3 p-3 rounded-md border ${
                isPrivate 
                  ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30' 
                  : 'bg-muted/20'
              }`}
            >
              {/* Status Indicator */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusInfo.color}`} />
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  {statusInfo.tooltip}
                </TooltipContent>
              </Tooltip>

              <Wifi className={`h-4 w-4 shrink-0 ${isPrivate ? 'text-amber-600' : 'text-muted-foreground'}`} />
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm truncate" title={relay.url}>
                  {renderRelayUrl(relay.url)}
                </span>
                {isPrivate && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 shrink-0">
                    <Lock className="h-2.5 w-2.5 mr-0.5" />
                    Private
                  </Badge>
                )}
              </div>

              {/* Settings Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56" align="end">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`read-${relay.url}`} className="text-sm cursor-pointer">
                        Read
                      </Label>
                      <Switch
                        id={`read-${relay.url}`}
                        checked={relay.read}
                        onCheckedChange={() => handleToggleRead(relay.url)}
                        className="data-[state=checked]:bg-green-500 scale-75"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`write-${relay.url}`} className="text-sm cursor-pointer">
                        Write
                      </Label>
                      <Switch
                        id={`write-${relay.url}`}
                        checked={relay.write}
                        onCheckedChange={() => handleToggleWrite(relay.url)}
                        className="data-[state=checked]:bg-blue-500 scale-75"
                      />
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Label
                              htmlFor={`private-${relay.url}`}
                              className={`text-sm flex items-center gap-1 ${isRelayUrlSecure(relay.url) ? 'cursor-pointer' : 'cursor-not-allowed text-muted-foreground'}`}
                            >
                              <Lock className="h-3 w-3" />
                              Private Relay
                            </Label>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs max-w-[200px]">
                            {isRelayUrlSecure(relay.url)
                              ? 'Prioritized for sensitive data. Data on private relays is stored in plaintext—only for self-hosted or trusted relays.'
                              : 'Private relays require wss:// so traffic is encrypted. Use a secure relay URL to mark as private.'}
                          </TooltipContent>
                        </Tooltip>
                        <p className="text-[10px] text-muted-foreground">
                          {isRelayUrlSecure(relay.url) ? 'Prioritized for sensitive data' : 'wss:// required'}
                        </p>
                      </div>
                      <Switch
                        id={`private-${relay.url}`}
                        checked={isPrivate}
                        disabled={!isRelayUrlSecure(relay.url)}
                        onCheckedChange={(checked) => {
                          if (!isRelayUrlSecure(relay.url)) return;
                          if (checked) {
                            setRelayToMarkPrivate({ url: relay.url });
                          } else {
                            setPrivateRelay(relay.url, false);
                          }
                        }}
                        className="data-[state=checked]:bg-amber-500 scale-75"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Remove Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveRelay(relay.url)}
                className="size-5 text-muted-foreground hover:text-destructive hover:bg-transparent shrink-0"
                disabled={relays.length <= 1}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>

      {/* Add Relay Form */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="new-relay-url" className="sr-only">
            Relay URL
          </Label>
          <Input
            id="new-relay-url"
            placeholder="relay.example.com"
            value={newRelayUrl}
            onChange={(e) =>
              setNewRelayUrl(e.target.value.replace(/^wss:\/\/wss:\/\//i, 'wss://'))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddRelay();
              }
            }}
          />
        </div>
        <Button
          onClick={handleAddRelay}
          disabled={!isValidRelayUrl(newRelayUrl)}
          variant="outline"
          size="sm"
          className="h-10 shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Relay
        </Button>
      </div>

      {!user && (
        <p className="text-xs text-muted-foreground">
          Log in to sync your relay list with Nostr
        </p>
      )}

      {/* Mark Relay Private – Warning & I understand */}
      <AlertDialog open={!!relayToMarkPrivate} onOpenChange={(open) => !open && setRelayToMarkPrivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark relay as private?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Data sent to private relays is stored in <strong>plaintext</strong> on that relay. Only use private for self-hosted or fully trusted relays.
                </p>
                <p className="text-sm text-muted-foreground">
                  You must trust the relay operator and its security. If you understand and want to mark this relay as private, click &quot;I understand&quot;.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (relayToMarkPrivate) {
                  setPrivateRelay(relayToMarkPrivate.url, true);
                  setRelayToMarkPrivate(null);
                }
              }}
            >
              I understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Relay Confirmation Dialog */}
      <AlertDialog open={!!relayToRemove} onOpenChange={(open) => !open && setRelayToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Relay</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to remove <span className="font-mono text-foreground">{relayToRemove && renderRelayUrl(relayToRemove)}</span> from your relay list?
                </p>
                
                <div className="rounded-md bg-muted p-3 text-sm space-y-2">
                  <div className="flex gap-2">
                    <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <p className="font-medium text-foreground">What happens when you remove a relay:</p>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                        <li>Home Log will stop reading from and writing to this relay</li>
                        <li>Your existing data on this relay will <strong className="text-foreground">not</strong> be automatically deleted</li>
                        <li>Your encrypted data remains unreadable to others without your private key</li>
                        <li>Deletion requests cannot guarantee removal from all relays due to Nostr's decentralized nature</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  If you're concerned about data on this relay, remember that Home Log encrypts your sensitive data (appliances, vehicles, maintenance records) using NIP-44 encryption. This data is unreadable without your private key.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveRelay}>
              Remove Relay
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}