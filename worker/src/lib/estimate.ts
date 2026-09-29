import type { AiAnalysis, DateRange, EstimatedDelivery, ParcelStatus } from '../../../shared/api';

/** Statuses where an arrival estimate is meaningless. */
const NO_ESTIMATE_STATUSES: ReadonlySet<ParcelStatus> = new Set([
  'delivered',
  'expired',
  'not_found',
  'exception',
]);

/** Prefers the carrier's own estimate while it's still in the future, then Gemini's. */
export function resolveEstimatedDelivery(
  status: ParcelStatus,
  carrierEstimate: DateRange | null,
  analysis: AiAnalysis | null,
  today: string,
): EstimatedDelivery | null {
  if (NO_ESTIMATE_STATUSES.has(status)) return null;
  if (carrierEstimate && carrierEstimate.latest >= today) return { ...carrierEstimate, source: 'carrier' };
  if (analysis?.estimatedDelivery) return { ...analysis.estimatedDelivery, source: 'gemini' };
  return null;
}

/** Today's date (YYYY-MM-DD) in the Philippines. */
export function philippineToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
}
