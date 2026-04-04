// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useRef, useState, useEffect } from 'react';
import { Upload, AlertTriangle, ChevronDown, ExternalLink, QrCode, Shield, Info, Camera, X, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useLoginActions } from '@/hooks/useLoginActions';
import { DialogTitle } from '@radix-ui/react-dialog';
import { NostrConnectLogin, type NostrConnectResult } from './NostrConnectLogin';
import { logger } from '@/lib/logger';
import { AmberSigner, isCapacitorAndroid } from '@/lib/capacitor/amberSignerPlugin';

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
}

const validateNsec = (nsec: string) => {
  return /^nsec1[a-zA-Z0-9]{58}$/.test(nsec);
};

const validateBunkerUri = (uri: string) => {
  return uri.startsWith('bunker://');
};

const LoginDialog: React.FC<LoginDialogProps> = ({ isOpen, onClose, onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [nsec, setNsec] = useState('');
  const [bunkerUri, setBunkerUri] = useState('');
  const [errors, setErrors] = useState<{
    nsec?: string;
    bunker?: string;
    file?: string;
    extension?: string;
    qr?: string;
    amber?: string;
  }>({});
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('bunker');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const login = useLoginActions();

  // Reset all state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      // Reset state when dialog opens
      setIsLoading(false);
      setIsFileLoading(false);
      setNsec('');
      setBunkerUri('');
      setErrors({});
      setShowQrScanner(false);
      setActiveTab('bunker');
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } else {
      // Clean up camera when dialog closes
      stopQrScanner();
    }
  }, [isOpen]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      stopQrScanner();
    };
  }, []);

  const stopQrScanner = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowQrScanner(false);
  };

  const startQrScanner = async () => {
    setErrors(prev => ({ ...prev, qr: undefined }));
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      
      streamRef.current = stream;
      setShowQrScanner(true);
      
      // Wait for video element to be available
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play();
          scanQrCode();
        }
      }, 100);
    } catch (error) {
      logger.error('Failed to access camera:', error);
      setErrors(prev => ({
        ...prev,
        qr: 'Could not access camera. Please check permissions or enter the bunker URI manually.'
      }));
    }
  };

  const scanQrCode = () => {
    if (!videoRef.current || !streamRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    const checkForQR = async () => {
      if (!streamRef.current || !context) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
          // Use BarcodeDetector if available (Chrome, Edge)
          if ('BarcodeDetector' in window) {
            const barcodeDetector = new (window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => { detect: (source: HTMLCanvasElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector({
              formats: ['qr_code']
            });
            const barcodes = await barcodeDetector.detect(canvas);
            
            if (barcodes.length > 0) {
              const value = barcodes[0].rawValue;
              if (validateBunkerUri(value)) {
                setBunkerUri(value);
                stopQrScanner();
                return;
              }
            }
          }
        } catch {
          // BarcodeDetector not supported or failed, continue scanning
        }
      }

      // Continue scanning
      if (streamRef.current) {
        requestAnimationFrame(checkForQR);
      }
    };

    checkForQR();
  };

  const handleExtensionLogin = async () => {
    setIsLoading(true);
    setErrors(prev => ({ ...prev, extension: undefined }));

    try {
      if (!('nostr' in window)) {
        throw new Error('Nostr extension not found. Please install a NIP-07 extension.');
      }
      await login.extension();
      onLogin();
      onClose();
    } catch (e: unknown) {
      const error = e as Error;
      logger.error('Extension login failed:', error);
      setErrors(prev => ({
        ...prev,
        extension: error instanceof Error ? error.message : 'Extension login failed'
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const executeLogin = (key: string) => {
    setIsLoading(true);
    setErrors({});

    // Use a timeout to allow the UI to update before the synchronous login call
    setTimeout(() => {
      try {
        login.nsec(key);
        onLogin();
        onClose();
      } catch {
        setErrors({ nsec: "Failed to login with this key. Please check that it's correct." });
        setIsLoading(false);
      }
    }, 50);
  };

  const handleKeyLogin = () => {
    if (!nsec.trim()) {
      setErrors(prev => ({ ...prev, nsec: 'Please enter your secret key' }));
      return;
    }

    if (!validateNsec(nsec)) {
      setErrors(prev => ({ ...prev, nsec: 'Invalid secret key format. Must be a valid nsec starting with nsec1.' }));
      return;
    }
    executeLogin(nsec);
  };

  const handleBunkerLogin = async () => {
    if (!bunkerUri.trim()) {
      setErrors(prev => ({ ...prev, bunker: 'Please enter a bunker URI' }));
      return;
    }

    if (!validateBunkerUri(bunkerUri)) {
      setErrors(prev => ({ ...prev, bunker: 'Invalid bunker URI format. Must start with bunker://' }));
      return;
    }

    setIsLoading(true);
    setErrors(prev => ({ ...prev, bunker: undefined }));

    try {
      await login.bunker(bunkerUri);
      onLogin();
      onClose();
      // Clear the URI from memory
      setBunkerUri('');
    } catch {
      setErrors(prev => ({
        ...prev,
        bunker: 'Failed to connect to bunker. Please check the URI and try again.'
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsFileLoading(true);
    setErrors({});

    const reader = new FileReader();
    reader.onload = (event) => {
      setIsFileLoading(false);
      const content = event.target?.result as string;
      if (content) {
        const trimmedContent = content.trim();
        if (validateNsec(trimmedContent)) {
          executeLogin(trimmedContent);
        } else {
          setErrors({ file: 'File does not contain a valid secret key.' });
        }
      } else {
        setErrors({ file: 'Could not read file content.' });
      }
    };
    reader.onerror = () => {
      setIsFileLoading(false);
      setErrors({ file: 'Failed to read file.' });
    };
    reader.readAsText(file);
  };

  const openNsecApp = () => {
    window.open('https://nsec.app', '_blank', 'noopener,noreferrer');
  };

  // Handle NostrConnect connection
  const handleNostrConnect = async (result: NostrConnectResult) => {
    setIsLoading(true);
    setErrors({});
    
    try {
      // Pass userPubkey from the handshake - no need for another round trip
      await login.nostrconnect(result.remotePubkey, result.userPubkey, result.clientNsec, result.relayUrl);
      onLogin();
      onClose();
    } catch (err) {
      logger.error('[LoginDialog] NostrConnect login failed:', err);
      setErrors(prev => ({
        ...prev,
        bunker: 'Failed to save login. Please try again.'
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const hasExtension = 'nostr' in window;
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);
  const isAndroidApp = isCapacitorAndroid();
  const [amberInstalled, setAmberInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isOpen || !isAndroidApp) {
      setAmberInstalled(null);
      return;
    }
    let cancelled = false;
    AmberSigner.isAvailable()
      .then((r) => {
        if (!cancelled) setAmberInstalled(r.installed);
      })
      .catch(() => {
        if (!cancelled) setAmberInstalled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAndroidApp]);

  const handleAmberLogin = async () => {
    setIsLoading(true);
    setErrors((prev) => ({ ...prev, amber: undefined }));
    try {
      await login.amberAndroid();
      onLogin();
      onClose();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Amber login failed';
      logger.error('[LoginDialog] Amber login failed:', e);
      setErrors((prev) => ({ ...prev, amber: message }));
    } finally {
      setIsLoading(false);
    }
  };

  const renderBunkerTab = () => (
    <div className="space-y-4">
      {/* nsec.app Quick Setup */}
      <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/20">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-lg shrink-0">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm">Recommended: nsec.app</h4>
            <p className="text-xs text-muted-foreground mt-1">
              A secure web-based key manager. Your keys never leave your device.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-8 text-xs"
              onClick={openNsecApp}
            >
              <ExternalLink className="h-3 w-3 mr-1.5" />
              Open nsec.app
            </Button>
          </div>
        </div>
      </div>

      {/* QR Scanner */}
      {showQrScanner ? (
        <div className="relative rounded-lg overflow-hidden bg-black aspect-square">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-white/50 rounded-lg" />
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="absolute top-2 right-2"
            onClick={stopQrScanner}
          >
            <X className="h-4 w-4" />
          </Button>
          <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/80">
            Point camera at bunker QR code
          </p>
        </div>
      ) : (
        <form onSubmit={(e) => {
          e.preventDefault();
          handleBunkerLogin();
        }} className='space-y-3'>
          <div className='space-y-2'>
            <div className="flex gap-2">
              <Input
                id='bunkerUri'
                value={bunkerUri}
                onChange={(e) => {
                  setBunkerUri(e.target.value);
                  if (errors.bunker) setErrors(prev => ({ ...prev, bunker: undefined }));
                }}
                className={`flex-1 rounded-lg ${errors.bunker ? 'border-red-500' : ''}`}
                placeholder='bunker://...'
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={startQrScanner}
                title="Scan QR Code"
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
            {errors.bunker && (
              <p className="text-sm text-red-500">{errors.bunker}</p>
            )}
            {errors.qr && (
              <p className="text-sm text-amber-600">{errors.qr}</p>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            className='w-full'
            disabled={isLoading || !bunkerUri.trim()}
          >
            {isLoading ? 'Connecting...' : 'Connect'}
          </Button>
        </form>
      )}

      {/* What is a bunker? */}
      <a
        href="https://nostrlogin.org"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Info className="h-3.5 w-3.5" />
        <span>What is a remote signer (bunker)?</span>
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );

  const renderKeyTab = () => (
    <form onSubmit={(e) => {
      e.preventDefault();
      handleKeyLogin();
    }} className='space-y-4'>
      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
        <p className="text-xs text-amber-800 dark:text-amber-200">
          <strong>Not recommended:</strong> Entering your secret key directly is less secure. Consider using a remote signer instead.
        </p>
      </div>

      <div className='space-y-2'>
        <Input
          id='nsec'
          type="password"
          value={nsec}
          onChange={(e) => {
            setNsec(e.target.value);
            if (errors.nsec) setErrors(prev => ({ ...prev, nsec: undefined }));
          }}
          className={`rounded-lg ${
            errors.nsec ? 'border-red-500 focus-visible:ring-red-500' : ''
          }`}
          placeholder='nsec1...'
          autoComplete="off"
        />
        {errors.nsec && (
          <p className="text-sm text-red-500">{errors.nsec}</p>
        )}
      </div>

      <div className="flex space-x-2">
        <Button
          type="submit"
          size="lg"
          disabled={isLoading || !nsec.trim()}
          className="flex-1"
        >
          {isLoading ? 'Verifying...' : 'Log in'}
        </Button>

        <input
          type="file"
          accept=".txt"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileUpload}
        />
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || isFileLoading}
          className="px-3"
          title="Upload key file"
        >
          <Upload className="w-4 h-4" />
        </Button>
      </div>

      {errors.file && (
        <p className="text-sm text-red-500 text-center">{errors.file}</p>
      )}
    </form>
  );

  const renderNostrConnectTab = () => (
    <NostrConnectLogin
      onConnect={handleNostrConnect}
      onError={(error) => {
        setErrors(prev => ({
          ...prev,
          bunker: error.message
        }));
      }}
    />
  );

  const renderTabs = () => (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-3 bg-muted/80 rounded-lg mb-4">
        <TabsTrigger value="bunker" className="flex items-center gap-2">
          <QrCode className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Remote Signer</span>
          <span className="sm:hidden">Bunker</span>
        </TabsTrigger>
        <TabsTrigger value="connect" className="flex items-center gap-2">
          <Smartphone className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Nostr Connect</span>
          <span className="sm:hidden">Connect</span>
        </TabsTrigger>
        <TabsTrigger value="key" className="flex items-center gap-2">
          <span>Secret Key</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value='bunker'>
        {renderBunkerTab()}
      </TabsContent>

      <TabsContent value='connect'>
        {renderNostrConnectTab()}
      </TabsContent>

      <TabsContent value='key'>
        {renderKeyTab()}
      </TabsContent>
    </Tabs>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90dvh] p-0 gap-6 overflow-hidden rounded-2xl overflow-y-auto">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-lg font-semibold leading-none tracking-tight text-center">
            Log in
          </DialogTitle>
        </DialogHeader>

        <div className="flex size-32 text-6xl bg-primary/10 rounded-full items-center justify-center justify-self-center">
          <Shield className="h-14 w-14 text-primary" />
        </div>

        <div className='px-6 pb-6 space-y-4 overflow-y-auto'>
          {isAndroidApp && (
            <div className="space-y-2">
              {errors.amber && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{errors.amber}</AlertDescription>
                </Alert>
              )}
              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 space-y-2">
                <p className="text-xs text-amber-900 dark:text-amber-200">
                  Opens <strong>Amber</strong> (or another NIP-55 signer) to approve your public key. Each sign and
                  NIP-44 encrypt/decrypt may prompt Amber again unless you use &quot;remember&quot; in Amber.
                </p>
                <Button
                  className="w-full h-11"
                  onClick={handleAmberLogin}
                  disabled={isLoading || amberInstalled === false}
                >
                  {isLoading ? 'Opening Amber…' : 'Log in with Amber'}
                </Button>
                {amberInstalled === false && (
                  <p className="text-xs text-muted-foreground text-center">
                    Install{' '}
                    <a
                      href="https://f-droid.org/packages/com.greenart7c3.nostrsigner/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Amber on F-Droid
                    </a>{' '}
                    or{' '}
                    <a
                      href="https://github.com/greenart7c3/Amber/releases"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      GitHub
                    </a>
                    .
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Extension Login - shown if extension is available */}
          {hasExtension && (
            <div className="space-y-3">
              {errors.extension && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{errors.extension}</AlertDescription>
                </Alert>
              )}
              <Button
                className="w-full h-12 px-9"
                onClick={handleExtensionLogin}
                disabled={isLoading}
              >
                {isLoading ? 'Logging in...' : 'Log in with Extension'}
              </Button>
            </div>
          )}

          {/* Tabs - wrapped in collapsible if extension is available, otherwise shown directly */}
          {hasExtension ? (
            <Collapsible className="space-y-4" open={isMoreOptionsOpen} onOpenChange={setIsMoreOptionsOpen}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <span>More Options</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isMoreOptionsOpen ? 'rotate-180' : ''}`} />
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent>
                {renderTabs()}
              </CollapsibleContent>
            </Collapsible>
          ) : (
            renderTabs()
          )}
        </div>
      </DialogContent>
    </Dialog>
    );
  };

export default LoginDialog;
