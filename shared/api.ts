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

export interface AiAnalysis {
  summary: string;
  jargon: JargonTerm[];
  nextSteps: string[];
  estimatedDelivery: DateRange | null;
  route: RouteStop[];
}

export interface TrackResult extends TrackingSnapshot {
  analysis: AiAnalysis | null;
  estimatedDelivery: EstimatedDelivery | null;
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
}

export interface SavedParcelWithLatest extends SavedParcel {
  latest: TrackResult | null;
}

export interface SaveParcelRequest {
  name: string;
  courierCode?: string;
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
