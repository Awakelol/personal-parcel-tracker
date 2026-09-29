import type { TrackResponse } from '@shared/api';
import { ALERT_STATUSES, STATUS_LABELS, formatDateTime, formatRelative } from '../lib/format';
import { ArrivalEstimate } from './ArrivalEstimate';
import { Barcode } from './Barcode';

interface WaybillLabelProps {
  result: TrackResponse;
}

export function WaybillLabel({ result }: WaybillLabelProps) {
  const latest = result.events.at(-1);
  const isAlert = ALERT_STATUSES.has(result.status);

  return (
    <article
      aria-label={`Shipping label for ${result.trackingNumber}`}
      className="on-paper animate-print rounded-sm bg-paper text-ink shadow-[0_1px_0_var(--color-kraft-edge),0_14px_28px_-18px_rgba(0,0,0,0.55)]"
    >
      <header className="flex items-stretch justify-between gap-3 border-b-2 border-ink">
        <p className="font-condensed px-4 py-3 text-sm font-bold uppercase tracking-wide">
          {result.courierName ?? 'Carrier unknown'}
        </p>
        <p
          className={`font-condensed flex items-center px-4 text-base font-extrabold uppercase tracking-wide text-paper ${
            isAlert ? 'bg-alert' : 'bg-ink'
          }`}
        >
          {STATUS_LABELS[result.status]}
        </p>
      </header>

      <div className="px-4 pt-4 pb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Tracking number</p>
        <p className="font-condensed mt-1 text-4xl leading-none font-black tracking-tight break-all sm:text-5xl">
          {result.trackingNumber}
        </p>
        <Barcode value={result.trackingNumber} className="mt-4 h-16 w-full text-ink" />
      </div>

      <div className="border-t-2 border-ink px-4 py-3">
        <ArrivalEstimate
          status={result.status}
          estimate={result.estimatedDelivery}
          courierEstimate={result.courierEstimate}
          courierName={result.courierName}
          latestEvent={latest}
        />
      </div>

      <dl className="grid grid-cols-2 border-t border-paper-rule text-sm">
        <div className="border-r border-dashed border-paper-rule px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Countries</dt>
          <dd className="mt-1 font-mono text-[13px]">
            {result.originCountry || result.destinationCountry ? (
              `${result.originCountry ?? '?'} → ${result.destinationCountry ?? '?'}`
            ) : (
              <span className="text-ink-muted">Not reported</span>
            )}
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Last scan</dt>
          <dd className="mt-1 font-mono text-[13px]">
            {latest ? <time dateTime={latest.timestamp}>{formatRelative(latest.timestamp)}</time> : 'No scans yet'}
          </dd>
        </div>
      </dl>

      <p className="border-t border-paper-rule px-4 py-2 font-mono text-[11px] text-ink-muted">
        Checked <time dateTime={result.fetchedAt}>{formatDateTime(result.fetchedAt)}</time>
        {result.cached && ' · saved copy'}
      </p>
    </article>
  );
}
