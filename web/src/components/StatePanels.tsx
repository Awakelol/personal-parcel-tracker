import { COURIERS } from '@shared/api';
import type { ApiError } from '../lib/api';

const LABEL_OUTLINE = 'rounded-sm border-2 border-dashed border-on-page/40';

export function EmptyState() {
  return (
    <div className={`${LABEL_OUTLINE} px-6 py-12 text-center`}>
      <p className="font-condensed text-2xl font-extrabold uppercase tracking-wide">No label printed yet</p>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-on-page-muted">
        Paste a tracking number above. The courier is detected automatically for{' '}
        {COURIERS.map((c) => c.name.replace(/ \(PH\)$/, '')).join(', ')} and most other carriers.
      </p>
    </div>
  );
}

export function LoadingState({ trackingNumber }: { trackingNumber: string }) {
  return (
    <div role="status" className="grid gap-6 md:grid-cols-[1.35fr_1fr]">
      <div className="h-56 animate-pulse rounded-sm bg-sticker/60 motion-reduce:animate-none" />
      <div className="on-paper rounded-sm bg-paper p-4 text-ink">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Printing label…</p>
        <p className="font-condensed mt-2 text-3xl font-black break-all">{trackingNumber}</p>
        <div className="mt-4 h-16 animate-pulse rounded-sm bg-ink/10 motion-reduce:animate-none" />
        <p className="mt-3 text-sm text-ink-muted">Getting the latest scans and a summary. New lookups can take up to 20 seconds; repeat visits are instant.</p>
      </div>
    </div>
  );
}

const ERROR_TITLES: Record<ApiError['code'], string> = {
  UNAUTHORIZED: 'Logged out',
  INVALID_REQUEST: 'Check the tracking number',
  NOT_FOUND: 'No parcel found',
  RATE_LIMITED: 'Too many lookups',
  UPSTREAM_ERROR: 'Courier data unavailable',
  INTERNAL_ERROR: 'Tracking failed',
  NETWORK: 'Can’t connect',
};

const ERROR_HINTS: Partial<Record<ApiError['code'], string>> = {
  NOT_FOUND: 'Double-check the number, or choose the courier instead of detecting it.',
  UPSTREAM_ERROR: 'The courier or tracking service didn’t respond properly. Try again in a minute.',
  RATE_LIMITED: 'Wait a minute before tracking again.',
};

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const hint = ERROR_HINTS[error.code];
  return (
    <div role="alert" className="on-paper rounded-sm border-l-8 border-alert bg-paper px-5 py-4 text-ink">
      <p className="font-condensed text-xl font-extrabold uppercase tracking-wide">{ERROR_TITLES[error.code]}</p>
      <p className="mt-1 text-[15px]">{error.message}</p>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
      {error.code !== 'INVALID_REQUEST' && (
        <button
          type="button"
          onClick={error.code === 'UNAUTHORIZED' ? () => window.location.reload() : onRetry}
          className="mt-3 rounded-sm border-2 border-ink px-3 py-1 text-sm font-semibold hover:bg-ink hover:text-paper"
        >
          {error.code === 'UNAUTHORIZED' ? 'Log in again' : 'Try again'}
        </button>
      )}
    </div>
  );
}
