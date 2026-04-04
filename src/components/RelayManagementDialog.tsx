import { Shield, Globe, Lock, ExternalLink, Cloud, HelpCircle, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { RelayListManager } from '@/components/RelayListManager';
import { BlossomServerManager } from '@/components/BlossomServerManager';
import { usePrivateRelayBackfill } from '@/hooks/usePrivateRelayBackfill';
import { useDataSyncStatus } from '@/hooks/useDataSyncStatus';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface RelayManagementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'relays' | 'media';
}

export function RelayManagementDialog({ isOpen, onClose, defaultTab = 'relays' }: RelayManagementDialogProps) {
  const [isRelayInfoOpen, setIsRelayInfoOpen] = useState(false);
  const [isBlossomInfoOpen, setIsBlossomInfoOpen] = useState(false);
  const {
    eligible,
    pendingSyncCount,
    pendingSyncLoading,
    pendingSyncFetched,
    refetchPendingSync,
    runBackfill,
    isRunning,
    error,
  } = usePrivateRelayBackfill();

  const { user } = useCurrentUser();
  const { refetchFromRelays, isFetchingRelayData } = useDataSyncStatus();

  const handleSyncToPrivate = () => {
    // Sync last 90 days to private relay(s) so all events are on all relays
    const ninetyDaysAgo = Math.floor(Date.now() / 1000) - 90 * 86400;
    runBackfill({ since: ninetyDaysAgo, manual: true });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-xl max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Relay Configuration</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={defaultTab} className="w-full flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="relays" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <span>Relays</span>
            </TabsTrigger>
            <TabsTrigger value="media" className="flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              <span>Media</span>
            </TabsTrigger>
          </TabsList>

          {/* Relays Tab */}
          <TabsContent value="relays" className="space-y-4 mt-4 flex-1 overflow-y-auto pr-1">
            {/* Private Relays Info - Collapsible */}
            <Collapsible open={isRelayInfoOpen} onOpenChange={setIsRelayInfoOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors">
                <Lock className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200 flex-1 text-left">
                  About Private Relays
                </span>
                <ChevronDown className={`h-4 w-4 text-amber-600 transition-transform ${isRelayInfoOpen ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-3">
                <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50">
                  <Shield className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>Recommended for sensitive data:</strong> While Cypher Log encrypts your private data with NIP-44, using a private relay adds an extra layer of security. Private relays restrict who can read and write data, ensuring your encrypted information isn't stored on public servers.
                  </AlertDescription>
                </Alert>

                <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30 p-4 space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    To use a private relay:
                  </p>
                  <ol className="text-sm text-slate-600 dark:text-slate-400 list-decimal list-inside space-y-1.5">
                    <li>Set up your own relay or use a paid private relay service</li>
                    <li>Add the relay URL in the Relays section below</li>
                    <li>Click the settings icon and enable "Private Relay"</li>
                    <li>Optionally disable write access on public relays</li>
                  </ol>
                  
                  <div className="pt-2">
                    <p className="text-xs text-slate-500 dark:text-slate-500">
                      Popular private relay options:
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <a 
                        href="https://relay.tools" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 hover:underline"
                      >
                        relay.tools
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <span className="text-slate-300 dark:text-slate-600">•</span>
                      <a 
                        href="https://github.com/hoytech/strfry" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 hover:underline"
                      >
                        strfry (self-hosted)
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <span className="text-slate-300 dark:text-slate-600">•</span>
                      <a 
                        href="https://github.com/nostr-relay/nostr-relay" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 hover:underline"
                      >
                        nostr-relay (self-hosted)
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <span className="text-slate-300 dark:text-slate-600">•</span>
                      <a 
                        href="https://docs.start9.com/service-guides/nostr/nostr-rs-relay.html" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 hover:underline"
                      >
                        Start9 Nostr RS Relay
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <span className="text-slate-300 dark:text-slate-600">•</span>
                      <a 
                        href="https://apps.umbrel.com/app/nostr-relay" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 hover:underline"
                      >
                        Umbrel Nostr Relay
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {user && (
              <Alert>
                <RefreshCw
                  className={`h-4 w-4 ${isFetchingRelayData ? 'animate-spin' : ''}`}
                  aria-hidden
                />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="text-sm">
                      <strong>Sync from relays</strong> loads your Cypher Log events from your relays into this device.
                      Use this if the app finished loading but data did not appear (slow network or first connection).
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void refetchFromRelays()}
                      disabled={isFetchingRelayData}
                    >
                      {isFetchingRelayData ? 'Syncing…' : 'Sync from relays'}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Private relay backfill: sync data to private relay(s) */}
            {eligible && (
              <Alert className="border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/50">
                <RefreshCw className={`h-4 w-4 text-emerald-600 ${isRunning ? 'animate-spin' : ''}`} />
                <AlertDescription>
                  <div className="space-y-2">
                    {error && (
                      <p className="text-sm text-destructive font-medium">{error.message}</p>
                    )}
                    {pendingSyncLoading ? (
                      <p className="text-sm text-emerald-800 dark:text-emerald-200">
                        Checking how many events are not yet on your private relay…
                      </p>
                    ) : !pendingSyncFetched ? (
                      <p className="text-sm text-emerald-800 dark:text-emerald-200">
                        Check how many events on your other relays are not yet on your private relay (one read from your private relay).
                      </p>
                    ) : pendingSyncCount > 0 ? (
                      <p className="text-sm text-emerald-800 dark:text-emerald-200">
                        You have <strong>{pendingSyncCount}</strong> event{pendingSyncCount !== 1 ? 's' : ''} on your other relays that are not yet on your private relay. Sync now for a full backup.
                      </p>
                    ) : (
                      <p className="text-sm text-emerald-800 dark:text-emerald-200">
                        Your private relay is up to date with recent data.
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleSyncToPrivate}
                        disabled={isRunning}
                      >
                        {isRunning ? 'Syncing…' : 'Sync to private relay'}
                        {pendingSyncCount > 0 && !isRunning && (
                          <span className="ml-1.5 rounded-full bg-emerald-200 dark:bg-emerald-800 px-1.5 text-xs">
                            {pendingSyncCount}
                          </span>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void refetchPendingSync()}
                        disabled={pendingSyncLoading}
                      >
                        {pendingSyncLoading ? 'Checking…' : pendingSyncFetched ? 'Check again' : 'Check'}
                      </Button>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Relays Section */}
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Nostr relays are servers that store and distribute your data. A green indicator means the relay is reachable; red means it cannot be reached.
              </p>
              
              <RelayListManager />
            </div>
          </TabsContent>

          {/* Media Servers Tab */}
          <TabsContent value="media" className="space-y-4 mt-4 flex-1 overflow-y-auto pr-1">
            {/* Blossom Info - Collapsible */}
            <Collapsible open={isBlossomInfoOpen} onOpenChange={setIsBlossomInfoOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-md border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/30 hover:bg-sky-100/50 dark:hover:bg-sky-900/30 transition-colors">
                <HelpCircle className="h-4 w-4 text-sky-600 shrink-0" />
                <span className="text-sm font-medium text-sky-800 dark:text-sky-200 flex-1 text-left">
                  What is a Blossom Media Server?
                </span>
                <ChevronDown className={`h-4 w-4 text-sky-600 transition-transform ${isBlossomInfoOpen ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-3">
                <Alert className="border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/50">
                  <Cloud className="h-4 w-4 text-sky-600" />
                  <AlertDescription className="text-sm text-sky-800 dark:text-sky-200">
                    <strong>Blossom</strong> is a protocol for storing and serving media files (images, videos, documents) on the Nostr network. Unlike relays which store text data, Blossom servers specialize in hosting your media files and making them accessible via URLs.
                  </AlertDescription>
                </Alert>

                {/* Public vs Private Warning */}
                <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50">
                  <Lock className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>Privacy Notice:</strong> Cypher Log stores sensitive data like receipts, warranty documents, and appliance manuals. To protect your privacy, file uploads are only allowed to servers you've marked as "Private". Public Blossom servers (like Primal's free tier) store files openly and should not be used for sensitive documents.
                  </AlertDescription>
                </Alert>

                <div className="rounded-lg border border-dashed border-sky-300 dark:border-sky-700 bg-sky-50/50 dark:bg-sky-950/30 p-4 space-y-3">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Public vs Private Servers:
                  </p>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 list-disc list-inside space-y-1.5">
                    <li><strong>Public servers:</strong> Anyone can view uploaded files. Good for sharing photos publicly, but NOT for receipts or documents.</li>
                    <li><strong>Private servers:</strong> Only you can access your files. Use these for sensitive uploads like receipts, warranties, and documents.</li>
                  </ul>
                  
                  <Separator className="my-3" />
                  
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Recommended Services:
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mb-2">
                    These paid services offer storage for your files:
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <a 
                        href="https://nostr.build" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-sky-700 dark:text-sky-400 hover:underline font-medium"
                      >
                        nostr.build
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <span className="text-xs text-slate-500">- Use URL: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">https://nostr.build/</code></span>
                    </div>
                    <div className="flex items-start gap-2">
                      <a 
                        href="https://satellite.earth" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-sky-700 dark:text-sky-400 hover:underline font-medium"
                      >
                        Satellite.earth
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <span className="text-xs text-slate-500">- Use URL: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">https://cdn.satellite.earth/</code></span>
                    </div>
                  </div>
                  
                  <Separator className="my-3" />
                  
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Self-Hosted Options (Most Private):
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mb-2">
                    Run your own Blossom server for full control over your data:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a 
                      href="https://github.com/hzrd149/blossom-server" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-sky-700 dark:text-sky-400 hover:underline"
                    >
                      blossom-server
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <span className="text-slate-300 dark:text-slate-600">•</span>
                    <a 
                      href="https://github.com/scsibug/nostr-rs-relay" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-sky-700 dark:text-sky-400 hover:underline"
                    >
                      nostr-rs-relay (with blossom)
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <Separator className="my-3" />

                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    How to Enable File Uploads:
                  </p>
                  <ol className="text-sm text-slate-600 dark:text-slate-400 list-decimal list-inside space-y-1.5">
                    <li>Add a Blossom server URL below (or use an existing one)</li>
                    <li>Click the settings icon on the server</li>
                    <li>Enable "Private Server" for servers you trust with sensitive data</li>
                    <li><strong>In-app viewing (PDF/images):</strong> Your server must send CORS headers so files can be shown in the app. <a href="https://github.com/hzrd149/blossom-server" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 hover:underline">blossom-server</a> does this by default; with another server or a reverse proxy, add <code className="text-xs bg-muted px-1 rounded">Access-Control-Allow-Origin: *</code> to file responses.</li>
                  </ol>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Blossom Servers Section */}
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Blossom servers store your uploaded images, videos, and other media files. A green indicator means the server is reachable.
              </p>
              
              <BlossomServerManager />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
