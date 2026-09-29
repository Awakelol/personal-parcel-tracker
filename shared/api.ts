export const COURIERS = [
  { code: 'spx-ph', name: 'SPX Express (PH)' },
  { code: 'jnt-ph', name: 'J&T Express (PH)' },
  { code: 'ninjavan-ph', name: 'Ninja Van (PH)' },
  { code: 'flash-ph', name: 'Flash Express (PH)' },
] as const;

export type CourierCode = (typeof COURIERS)[number]['code'];

export interface TrackRequest {
  trackingNumber: string;
  // A CourierCode or numeric 17TRACK carrier id; detected if omitted.
  courierCode?: string;
  /** Skip the cache and ask the courier/17TRACK again. */
  fresh?: boolean;
  /** Return scans right away and write the summary separately. */
  deferAnalysis?: boolean;
}

export type ParcelStatus =
  | 'pending'
  | 'not_found'
  | 'info_received'
  | 'in_transit'
  | 'available_for_pickup'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed_attempt'
  | 'exception'
  | 'expired'
  | 'unknown';

export interface TrackingEvent {
  timestamp: string;
  description: string;
  location: string | null;
}

export interface TrackingSnapshot {
  trackingNumber: string;
  courierCode: string;
  courierName: string | null;
  status: ParcelStatus;
  originCountry: string | null;
  destinationCountry: string | null;
  /** Oldest first. */
  events: TrackingEvent[];
}

export interface JargonTerm {
  term: string;
  explanation: string;
}

/** YYYY-MM-DD */
export interface DateRange {
  earliest: string;
  latest: string;
}

export interface EstimatedDelivery extends DateRange {
  source: 'carrier' | 'gemini';
}

export type RouteStopRole = 'origin' | 'visited' | 'current' | 'next' | 'destination';

export interface RouteStop {
  name: string;
  lat: number;
  lng: number;
  role: RouteStopRole;
}

export interface Place {
  /** Facility name as written in the scans, e.g. "11 PN5-HUB_Santa Rosa". */
  facility: string | null;
  /** City and province, e.g. "Santa Rosa City, Laguna". */
  area: string | null;
}

export interface ParcelLocation {
  state: 'at_facility' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'unknown';
  current: Place | null;
  /** Set when moving between facilities. */
  from: Place | null;
  to: Place | null;
}

export interface AiAnalysis {
  summary: string;
  jargon: JargonTerm[];
  nextSteps: string[];
  estimatedDelivery: DateRange | null;
  route: RouteStop[];
  location: ParcelLocation | null;
}

export interface TrackResult extends TrackingSnapshot {
  analysis: AiAnalysis | null;
  /** The summary is still being written; fetch it from /api/track/analysis. */
  analysisPending: boolean;
  /** Gemini's estimate, or the courier's when Gemini has none. */
  estimatedDelivery: EstimatedDelivery | null;
  /** The courier's own estimate, when it gives one. */
  courierEstimate: DateRange | null;
  fetchedAt: string;
}

export interface TrackResponse extends TrackResult {
  cached: boolean;
}

export interface Account {
  email: string;
}

export interface SavedParcel {
  trackingNumber: string;
  courierCode?: string;
  name: string;
  savedAt: string;
  /** Latest scan the user has viewed ("timestamp|description"). */
  seenLatest?: string;
}

export interface SavedParcelWithLatest extends SavedParcel {
  latest: TrackResult | null;
}

export interface SaveParcelRequest {
  name: string;
  courierCode?: string;
  seenLatest?: string;
}

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
  };
}
