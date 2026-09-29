import type { DateRange, EstimatedDelivery, ParcelStatus, TrackingEvent } from '@shared/api';
import { formatArrivalHint, formatDateRange, formatDay } from '../lib/format';

interface ArrivalEstimateProps {
  status: ParcelStatus;
  estimate: EstimatedDelivery | null;
  courierEstimate: DateRange | null | undefined;
  courierName: string | null;
  latestEvent: TrackingEvent | null | undefined;
  size?: 'lg' | 'sm';
}

const SOURCE_NOTE: Record<EstimatedDelivery['source'], string> = {
  carrier: 'Courier’s estimate',
  gemini: 'Estimated by Gemini from the scans',
};

export function ArrivalEstimate({
  status,
  estimate,
  courierEstimate,
  courierName,
  latestEvent,
  size = 'lg',
}: ArrivalEstimateProps) {
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

  // The courier's own estimate sits under Gemini's, smaller. When it's already
  // the main estimate there's nothing to add.
  const courierLine =
    estimate?.source === 'carrier'
      ? null
      : courierEstimate
        ? `Courier’s estimate: ${formatDateRange(courierEstimate)}`
        : `${courierName ?? 'The courier'} hasn’t given an estimate`;

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
      {courierLine && (estimate || courierEstimate) && (
        <p className={`text-ink-muted ${size === 'lg' ? 'mt-2 border-t border-dashed border-paper-rule pt-2 text-xs' : 'mt-1 text-[11px]'}`}>
          {courierLine}
        </p>
      )}
    </div>
  );
}
