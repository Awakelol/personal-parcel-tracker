import type { AiAnalysis, DateRange, EstimatedDelivery, ParcelStatus } from '../../../shared/api';
import type { HistoryEstimate } from './knowledge';

const NO_ESTIMATE_STATUSES: ReadonlySet<ParcelStatus> = new Set([
  'delivered',
  'expired',
  'not_found',
  'exception',
]);

// Summaries are reused for weeks, so estimates that have passed are dropped.
function upcoming(range: DateRange | null | undefined, today: string): DateRange | null {
  if (!range || range.latest < today) return null;
  return { earliest: range.earliest < today ? today : range.earliest, latest: range.latest };
}

export interface Estimates {
  estimatedDelivery: EstimatedDelivery | null;
  courierEstimate: DateRange | null;
}

// Gemini's estimate leads; the courier's is shown alongside it.
export function resolveEstimates(
  status: ParcelStatus,
  carrierEstimate: DateRange | null,
  analysis: AiAnalysis | null,
  today: string,
  history: HistoryEstimate | null = null,
): Estimates {
  if (NO_ESTIMATE_STATUSES.has(status)) return { estimatedDelivery: null, courierEstimate: null };
  const courier = upcoming(carrierEstimate, today);
  const gemini = upcoming(analysis?.estimatedDelivery, today);
  const learned = upcoming(history, today);
  // Real transit times from past parcels beat Gemini's educated guess.
  const estimatedDelivery = learned && history
    ? { ...learned, source: 'history' as const, basedOn: history.basedOn }
    : gemini
      ? { ...gemini, source: 'gemini' as const }
      : courier
        ? { ...courier, source: 'carrier' as const }
        : null;
  return {
    estimatedDelivery,
    courierEstimate: courier,
  };
}

const DEFAULT_TIMEZONE = 'Asia/Manila';

/** Today's date (YYYY-MM-DD) in `timeZone`; a bad zone falls back to the default. */
export function localToday(timeZone: string | undefined, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || DEFAULT_TIMEZONE }).format(now);
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    console.warn(`Invalid TIMEZONE "${timeZone}", using ${DEFAULT_TIMEZONE}.`);
    return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIMEZONE }).format(now);
  }
}
