import type { EstimatedDelivery, ParcelStatus, TrackingEvent } from '@shared/api';
import { formatArrivalHint, formatDateRange, formatDay } from '../lib/format';

interface ArrivalEstimateProps {
  status: ParcelStatus;
  estimate: EstimatedDelivery | null;
  latestEvent: TrackingEvent | null | undefined;
  /** `lg` on the label, `sm` on saved-parcel cards. */
  size?: 'lg' | 'sm';
}

const SOURCE_NOTE: Record<EstimatedDelivery['source'], string> = {
  carrier: 'Courier’s estimate',
  gemini: 'Estimated by Gemini from the scans',
};

/** "Arrives Oct 1 – 4 · in 2–5 days", or when it was delivered. */
export function ArrivalEstimate({ status, estimate, latestEvent, size = 'lg' }: ArrivalEstimateProps) {
  const valueClass =
    size === 'lg'
      ? 'font-condensed text-3xl leading-none font-black'
      : 'font-condensed text-xl leading-none font-extrabold';

  if (status === 'delivered') {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Delivered</p>
        <p className={`mt-1 ${valueClass}`}>{latestEvent ? formatDay(latestEvent.timestamp) : 'Yes'}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Estimated arrival</p>
      {estimate ? (
        <>
          <p className={`mt-1 ${valueClass}`}>
            {formatDateRange(estimate)}{' '}
            <span className="font-sans text-sm font-semibold tracking-normal text-ink-muted" style={{ fontStretch: '100%' }}>
              {formatArrivalHint(estimate)}
            </span>
          </p>
          {size === 'lg' && <p className="mt-1 text-xs text-ink-muted">{SOURCE_NOTE[estimate.source]}</p>}
        </>
      ) : (
        <p className="mt-1 text-sm text-ink-muted">No estimate yet</p>
      )}
    </div>
  );
}
