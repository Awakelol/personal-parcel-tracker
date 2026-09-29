import type { AiAnalysis, DateRange, EstimatedDelivery, ParcelStatus } from '../../../shared/api';

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
): Estimates {
  if (NO_ESTIMATE_STATUSES.has(status)) return { estimatedDelivery: null, courierEstimate: null };
  const courier = upcoming(carrierEstimate, today);
  const gemini = upcoming(analysis?.estimatedDelivery, today);
  return {
    estimatedDelivery: gemini ? { ...gemini, source: 'gemini' } : courier ? { ...courier, source: 'carrier' } : null,
    courierEstimate: courier,
  };
}

export function philippineToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
}
