import { useEffect, useState } from 'react';

import { isCapacitorAndroid } from '@/lib/capacitor/amberSignerPlugin';

/**
 * Reliable Android-shell detection for UI that should only show in the native app
 * (e.g. Log in with Amber). The WebView bridge can appear shortly after first paint,
 * so we re-check a few times and on window focus.
 */
export function useCapacitorAndroid(): boolean {
  const [value, setValue] = useState(() =>
    typeof window !== 'undefined' ? isCapacitorAndroid() : false,
  );

  useEffect(() => {
    const refresh = () => {
      setValue((prev) => {
        const next = isCapacitorAndroid();
        return next === prev ? prev : next;
      });
    };

    refresh();
    const timeouts = [50, 150, 400, 1000, 2500].map((ms) => window.setTimeout(refresh, ms));
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      timeouts.forEach(clearTimeout);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return value;
}
