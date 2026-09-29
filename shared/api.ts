/**
 * API contract shared between the Cloudflare Worker (`worker/`) and the
 * React dashboard (`web/`). Keep this file free of runtime dependencies.
 */

export interface TrackRequest {
  trackingNumber: string;
  /** TrackingMore courier code (e.g. "usps", "dhl"). Auto-detected when omitted. */
  courierCode?: string;
}

export type ParcelStatus =
  | 'pending'
  | 'not_found'
  | 'info_received'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed_attempt'
  | 'exception'
  | 'expired'
  | 'unknown';

export interface TrackingEvent {
  /** ISO-8601 timestamp as reported by the carrier. */
  timestamp: string;
  description: string;
  location: string | null;
}

export interface TrackingSnapshot {
  trackingNumber: string;
  courierCode: string;
  status: ParcelStatus;
  /** ISO country codes only — no addresses are stored. */
  originCountry: string | null;
  destinationCountry: string | null;
  /** Chronological, oldest event first. */
  events: TrackingEvent[];
}

export interface JargonTerm {
  term: string;
  explanation: string;
}

export interface AiAnalysis {
  /** Two-sentence summary of the parcel's current status. */
  summary: string;
  jargon: JargonTerm[];
  /** Educated guess at the remaining transit steps, in order. */
  nextSteps: string[];
}

export interface TrackResult extends TrackingSnapshot {
  /** `null` when Gemini analysis failed; the timeline is still returned. */
  analysis: AiAnalysis | null;
  fetchedAt: string;
}

export interface TrackResponse extends TrackResult {
  cached: boolean;
}

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
  };
}
