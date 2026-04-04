import { Receipt } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { MaintenanceCompletion } from '@/lib/types';

interface MaintenanceReceiptThumbProps {
  completion: MaintenanceCompletion;
  /** Compact: icon + "Receipt" link only. Full: small image preview when MIME looks like an image. */
  compact?: boolean;
  className?: string;
}

function isLikelyImage(url: string, mime?: string): boolean {
  if (mime?.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif)(\?|$)/i.test(url);
}

export function MaintenanceReceiptThumb({
  completion,
  compact = true,
  className,
}: MaintenanceReceiptThumbProps) {
  const url = completion.receiptUrl;
  if (!url) return null;

  const showThumb = !compact && isLikelyImage(url, completion.receiptMime);

  return (
    <div className={cn('space-y-1', className)}>
      {showThumb && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block max-w-full rounded-md border border-green-200 dark:border-green-800 overflow-hidden"
        >
          <img
            src={url}
            alt="Maintenance receipt"
            className="max-h-20 w-auto max-w-full object-cover"
            loading="lazy"
          />
        </a>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
      >
        <Receipt className="h-3 w-3 shrink-0" aria-hidden />
        {showThumb ? 'Open full size' : 'Receipt'}
      </a>
    </div>
  );
}
