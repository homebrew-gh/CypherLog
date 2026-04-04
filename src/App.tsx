// NOTE: This file should normally not be modified unless you are adding a new provider.
// To add new routes, edit the AppRouter.tsx file.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHead, UnheadProvider } from '@unhead/react/client';
import { InferSeoMetaPlugin } from '@unhead/addons';
import { Suspense } from 'react';
import NostrProvider from '@/components/NostrProvider';
import { NostrSync } from '@/components/NostrSync';
import { PWAManager } from '@/components/PWAManager';
import { PersistentStorageManager } from '@/components/PersistentStorageManager';
import { SessionManager } from '@/components/SessionManager';
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NostrLoginProvider } from '@nostrify/react/login';
import { AppProvider } from '@/components/AppProvider';
import { NWCProvider } from '@/contexts/NWCContext';
import { UserPreferencesProvider } from '@/contexts/UserPreferencesContext';
import { EncryptionProvider } from '@/contexts/EncryptionContext';
import { AppConfig } from '@/contexts/AppContext';
import { DEFAULT_RELAY_METADATA_ENTRIES } from '@/lib/defaultAppRelays';
import AppRouter from './AppRouter';

const head = createHead({
  plugins: [
    InferSeoMetaPlugin(),
  ],
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60000, // 1 minute
      gcTime: Infinity,
      retry: 3, // Retry failed queries up to 3 times (important for mobile networks)
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff: 1s, 2s, 4s, max 10s
    },
  },
});

const defaultConfig: AppConfig = {
  theme: "dark",
  relayMetadata: {
    relays: DEFAULT_RELAY_METADATA_ENTRIES,
    updatedAt: 0,
  },
};

export function App() {
  return (
    <UnheadProvider head={head}>
      <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig}>
        <QueryClientProvider client={queryClient}>
          <NostrLoginProvider storageKey='nostr:login'>
            <SessionManager />
            <NostrProvider>
              <NWCProvider>
                <UserPreferencesProvider>
                  <NostrSync />
                  <EncryptionProvider>
                    <TooltipProvider>
                      <Toaster />
                      <PWAManager />
                      <PersistentStorageManager />
                      <Suspense>
                        <AppRouter />
                      </Suspense>
                    </TooltipProvider>
                  </EncryptionProvider>
                </UserPreferencesProvider>
              </NWCProvider>
            </NostrProvider>
          </NostrLoginProvider>
        </QueryClientProvider>
      </AppProvider>
    </UnheadProvider>
  );
}

export default App;
