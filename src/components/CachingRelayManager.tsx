import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, X, Wifi, Settings, RefreshCw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useEncryptionSettings } from '@/contexts/EncryptionContext';
import { logger } from '@/lib/logger';

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

export function CachingRelayManager() {
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const { cachingRelay, setCachingRelay, isPrivateRelay } = useEncryptionSettings();

  const [newRelayUrl, setNewRelayUrl] = useState('wss://');
  const [relayStatus, setRelayStatus] = useState<RelayStatus>('unknown');
  const [isChecking, setIsChecking] = useState(false);
  const [readEnabled, setReadEnabled] = useState(true);
  const [writeEnabled, setWriteEnabled] = useState(true);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get current relay config for the caching relay
  const cachingRelayConfig = cachingRelay 
    ? config.relayMetadata.relays.find(r => r.url === cachingRelay)
    : null;

  // Sync read/write state with config
  useEffect(() => {
    if (cachingRelayConfig) {
      setReadEnabled(cachingRelayConfig.read);
      setWriteEnabled(cachingRelayConfig.write);
    }
  }, [cachingRelayConfig]);

  // Check connectivity for the caching relay
  const checkRelay = useCallback(async () => {
    if (!cachingRelay) return;
    
    setRelayStatus('checking');
    setIsChecking(true);
    const isConnected = await checkRelayConnectivity(cachingRelay);
    setRelayStatus(isConnected ? 'connected' : 'error');
    setIsChecking(false);
  }, [cachingRelay]);

  // Initial connectivity check and periodic re-check
  useEffect(() => {
    if (cachingRelay) {
      checkRelay();
      checkIntervalRef.current = setInterval(checkRelay, CONNECTIVITY_CHECK_INTERVAL);
    } else {
      setRelayStatus('unknown');
    }

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [cachingRelay, checkRelay]);

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

  const handleAddCachingRelay = () => {
    if (!isValidRelayUrl(newRelayUrl)) {
      toast({
        title: 'Invalid relay URL',
        description: 'Please enter a valid relay URL (e.g., wss://relay.primal.net)',
        variant: 'destructive',
      });
      return;
    }

    const normalized = normalizeRelayUrl(newRelayUrl);

    // Check if relay already exists in the main relay list
    const existingRelay = config.relayMetadata.relays.find(r => r.url === normalized);
    
    if (!existingRelay) {
      // Add to main relay list with read enabled (write optional for caching)
      const newRelays = [...config.relayMetadata.relays, { url: normalized, read: true, write: true }];
      saveRelays(newRelays);
    }

    // Set as caching relay
    setCachingRelay(normalized);
    setNewRelayUrl('wss://');
    
    toast({
      title: 'Caching relay set',
      description: 'This relay will be prioritized for faster loading.',
    });
  };

  const handleRemoveCachingRelay = () => {
    if (!cachingRelay) return;

    // Clear the caching relay designation (but keep in main relay list if user wants)
    setCachingRelay(null);
    
    toast({
      title: 'Caching relay removed',
      description: 'No caching relay is currently configured.',
    });
  };

  const handleToggleRead = () => {
    if (!cachingRelay) return;
    
    const newRelays = config.relayMetadata.relays.map(r =>
      r.url === cachingRelay ? { ...r, read: !r.read } : r
    );
    setReadEnabled(!readEnabled);
    saveRelays(newRelays);
  };

  const handleToggleWrite = () => {
    if (!cachingRelay) return;
    
    const newRelays = config.relayMetadata.relays.map(r =>
      r.url === cachingRelay ? { ...r, write: !r.write } : r
    );
    setWriteEnabled(!writeEnabled);
    saveRelays(newRelays);
  };

  const saveRelays = (newRelays: { url: string; read: boolean; write: boolean }[]) => {
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

  const publishNIP65RelayList = (relayList: { url: string; read: boolean; write: boolean }[]) => {
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
  };

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

  const statusInfo = getStatusInfo(relayStatus);

  return (
    <div className="space-y-4">
      {/* Current Caching Relay */}
      {cachingRelay ? (
        <div className="space-y-3">
          {/* Header with refresh button */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {relayStatus === 'connected' ? 'Caching relay connected' : relayStatus === 'error' ? 'Caching relay unreachable' : 'Checking connection...'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={checkRelay}
              disabled={isChecking}
              className="h-7 px-2 text-xs"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isChecking ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Caching Relay Display */}
          <div className="flex items-center gap-3 p-3 rounded-md border border-sky-200 bg-sky-50/50 dark:border-sky-800 dark:bg-sky-950/30">
            {/* Status Indicator */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusInfo.color}`} />
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                {statusInfo.tooltip}
              </TooltipContent>
            </Tooltip>

            <Wifi className="h-4 w-4 shrink-0 text-sky-600" />
            <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm truncate" title={cachingRelay}>
                {renderRelayUrl(cachingRelay)}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300 shrink-0">
                <Zap className="h-2.5 w-2.5 mr-0.5" />
                Caching
              </Badge>
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
                    <Label htmlFor="caching-read" className="text-sm cursor-pointer">
                      Read
                    </Label>
                    <Switch
                      id="caching-read"
                      checked={readEnabled}
                      onCheckedChange={handleToggleRead}
                      className="data-[state=checked]:bg-green-500 scale-75"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="caching-write" className="text-sm cursor-pointer">
                      Write
                    </Label>
                    <Switch
                      id="caching-write"
                      checked={writeEnabled}
                      onCheckedChange={handleToggleWrite}
                      className="data-[state=checked]:bg-blue-500 scale-75"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Caching relays are typically read-only, but you can enable write if desired.
                  </p>
                </div>
              </PopoverContent>
            </Popover>

            {/* Remove Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRemoveCachingRelay}
              className="size-5 text-muted-foreground hover:text-destructive hover:bg-transparent shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        /* Empty State - No Caching Relay */
        <div className="rounded-lg border border-dashed border-sky-300 dark:border-sky-700 bg-sky-50/30 dark:bg-sky-950/20 p-4">
          <div className="text-center space-y-2">
            <Zap className="h-8 w-8 text-sky-400 mx-auto" />
            <p className="text-sm text-muted-foreground">
              No caching relay configured
            </p>
            <p className="text-xs text-muted-foreground">
              Add a caching relay to speed up initial loading times
            </p>
          </div>
        </div>
      )}

      {/* Add Caching Relay Form */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="new-caching-relay-url" className="sr-only">
            Caching Relay URL
          </Label>
          <Input
            id="new-caching-relay-url"
            placeholder="relay.primal.net"
            value={newRelayUrl}
            onChange={(e) =>
              setNewRelayUrl(e.target.value.replace(/^wss:\/\/wss:\/\//i, 'wss://'))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddCachingRelay();
              }
            }}
          />
        </div>
        <Button
          onClick={handleAddCachingRelay}
          disabled={!isValidRelayUrl(newRelayUrl)}
          variant="outline"
          size="sm"
          className="h-10 shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          {cachingRelay ? 'Replace' : 'Add'}
        </Button>
      </div>

      {/* Quick Add Suggestions */}
      {!cachingRelay && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">Quick add:</span>
          <button
            onClick={() => {
              setNewRelayUrl('wss://relay.primal.net');
            }}
            className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
          >
            relay.primal.net
          </button>
        </div>
      )}

      {!user && (
        <p className="text-xs text-muted-foreground">
          Log in to sync your relay list with Nostr
        </p>
      )}
    </div>
  );
}
