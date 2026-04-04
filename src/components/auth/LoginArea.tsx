// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button.tsx';
import LoginDialog from './LoginDialog';
import SignupDialog from './SignupDialog';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { useLoginActions } from '@/hooks/useLoginActions';
import { AccountSwitcher } from './AccountSwitcher';
import { cn } from '@/lib/utils';
import { AmberSigner } from '@/lib/capacitor/amberSignerPlugin';
import { useCapacitorAndroid } from '@/hooks/useCapacitorAndroid';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

export interface LoginAreaProps {
  className?: string;
}

export function LoginArea({ className }: LoginAreaProps) {
  const { currentUser } = useLoggedInAccounts();
  const login = useLoginActions();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [expandSecondaryLogin, setExpandSecondaryLogin] = useState(false);
  const [signupDialogOpen, setSignupDialogOpen] = useState(false);
  const [amberBusy, setAmberBusy] = useState(false);
  const [amberErr, setAmberErr] = useState<string | null>(null);
  const [amberInstalled, setAmberInstalled] = useState<boolean | null>(null);

  const isAndroidApp = useCapacitorAndroid();

  useEffect(() => {
    if (!isAndroidApp || currentUser) {
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
  }, [isAndroidApp, currentUser]);

  const handleLogin = () => {
    setLoginDialogOpen(false);
    setExpandSecondaryLogin(false);
    setSignupDialogOpen(false);
    setAmberErr(null);
  };

  const openOtherSignIn = () => {
    setExpandSecondaryLogin(true);
    setLoginDialogOpen(true);
  };

  const handleAmberDirect = async () => {
    setAmberErr(null);
    setAmberBusy(true);
    try {
      await login.amberAndroid();
      handleLogin();
    } catch (e: unknown) {
      setAmberErr(e instanceof Error ? e.message : 'Amber login failed');
    } finally {
      setAmberBusy(false);
    }
  };

  return (
    <div className={cn("inline-flex items-center justify-center", className)}>
      {currentUser ? (
        <AccountSwitcher
          onAddAccountClick={() => {
            setExpandSecondaryLogin(false);
            setLoginDialogOpen(true);
          }}
        />
      ) : isAndroidApp ? (
        <div className="flex flex-col gap-2 w-full max-w-sm">
          {amberErr && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">{amberErr}</AlertDescription>
            </Alert>
          )}
          <Button
            onClick={handleAmberDirect}
            disabled={amberBusy || amberInstalled === false}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground w-full font-medium transition-all hover:bg-primary/90"
          >
            <span className="truncate">{amberBusy ? 'Opening Amber…' : 'Log in with Amber'}</span>
          </Button>
          <div className="flex gap-2 justify-center flex-wrap">
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={openOtherSignIn}>
              Other sign-in options
            </Button>
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setSignupDialogOpen(true)}>
              Sign up
            </Button>
          </div>
          {amberInstalled === false && (
            <p className="text-xs text-muted-foreground text-center px-1">
              Install Amber (NIP-55) from F-Droid or GitHub, or use Other sign-in options.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 w-full max-w-sm">
          {typeof navigator !== 'undefined' &&
            /Android/i.test(navigator.userAgent) &&
            !isAndroidApp && (
              <p className="text-[11px] text-center text-muted-foreground px-1 leading-snug">
                <strong>Log in with Amber</strong> appears when you use the installable Cypher Log Android app. In Chrome
                or a home-screen shortcut, use Log in below (secret key, extension, or Nostr Connect).
              </p>
            )}
          <div className="flex gap-3 justify-center">
            <Button
              onClick={() => setLoginDialogOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground w-full font-medium transition-all hover:bg-primary/90 animate-scale-in"
            >
              <span className="truncate">Log in</span>
            </Button>
            <Button
              onClick={() => setSignupDialogOpen(true)}
              variant="outline"
              className="flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all"
            >
              <span>Sign up</span>
            </Button>
          </div>
        </div>
      )}

      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => {
          setLoginDialogOpen(false);
          setExpandSecondaryLogin(false);
        }}
        onLogin={handleLogin}
        expandSecondaryOnOpen={expandSecondaryLogin}
      />

      <SignupDialog
        isOpen={signupDialogOpen}
        onClose={() => setSignupDialogOpen(false)}
      />
    </div>
  );
}