import { useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';

import type { OutboxNostr } from '@/lib/publishOutbox';
import { flushPublishOutbox, isPublishOutboxSupported } from '@/lib/publishOutbox';
import { logger } from '@/lib/logger';

const FLUSH_INTERVAL_MS = 15_000;

/**
 * Periodically flushes the persistent publish outbox so retries continue after
 * navigation, reload, or transient relay failures.
 */
export function PublishOutboxManager() {
  const { nostr } = useNostr();
  const nostrRef = useRef(nostr);
  nostrRef.current = nostr;

  useEffect(() => {
    if (!isPublishOutboxSupported()) {
      return;
    }

    const run = () => {
      void flushPublishOutbox(nostrRef.current as unknown as OutboxNostr).catch((e) =>
        logger.warn('[PublishOutbox] Background flush failed:', e)
      );
    };

    run();
    const interval = window.setInterval(run, FLUSH_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    const onOnline = () => run();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return null;
}
