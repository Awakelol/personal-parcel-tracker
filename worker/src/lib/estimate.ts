import type { AiAnalysis, DateRange, EstimatedDelivery, ParcelStatus } from '../../../shared/api';

const NO_ESTIMATE_STATUSES: ReadonlySet<ParcelStatus> = new Set([
  'delivered',
  'expired',
  'not_found',
  'exception',
]);

// Carrier estimate wins while it's still in the future.
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

export function philippineToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
}
