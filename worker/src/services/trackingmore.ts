import type { ParcelStatus, TrackRequest, TrackingEvent, TrackingSnapshot } from '../../../shared/api';
import type { Env } from '../env';
import { AppError } from '../errors';

const BASE_URL = 'https://api.trackingmore.com/v4';
const REQUEST_TIMEOUT_MS = 10_000;

/** TrackingMore `meta.code` values we branch on. */
const META_OK = 200;
const META_TRACKING_EXISTS = 4101;

export interface TrackingLookup {
  /** Normalised timeline returned to the dashboard. */
  snapshot: TrackingSnapshot;
  /** TrackingMore payload for Gemini, reduced to status and checkpoint fields (no PII). */
  raw: TmAnalysisPayload;
}

// --- TrackingMore v4 response shapes (only the fields we read) -------------

interface TmMeta {
  code: number;
  message: string;
}

interface TmEnvelope {
  meta: TmMeta;
  data: unknown;
}

interface TmCheckpoint {
  checkpoint_date?: string | null;
  tracking_detail?: string | null;
  location?: string | null;
  city?: string | null;
  state?: string | null;
  country_iso2?: string | null;
  checkpoint_delivery_status?: string | null;
  checkpoint_delivery_substatus?: string | null;
}

interface TmCarrierInfo {
  courier_code?: string | null;
  trackinfo?: TmCheckpoint[] | null;
}

interface TmTracking {
  tracking_number: string;
  courier_code: string;
  delivery_status?: string | null;
  substatus?: string | null;
  origin_country?: string | null;
  destination_country?: string | null;
  latest_event?: string | null;
  latest_checkpoint_time?: string | null;
  transit_time?: number | null;
  origin_info?: TmCarrierInfo | null;
  destination_info?: TmCarrierInfo | null;
}

interface TmDetectedCourier {
  courier_code: string;
  courier_name?: string;
}

type TmAnalysisPayload = Pick<
  TmTracking,
  | 'tracking_number'
  | 'courier_code'
  | 'delivery_status'
  | 'substatus'
  | 'origin_country'
  | 'destination_country'
  | 'latest_event'
  | 'latest_checkpoint_time'
  | 'transit_time'
> & { checkpoints: TmCheckpoint[] };

// --- Public API -------------------------------------------------------------

export async function fetchTracking(env: Env, request: TrackRequest): Promise<TrackingLookup> {
  const apiKey = env.TRACKINGMORE_API_KEY;
  const courierCode = request.courierCode ?? (await detectCourier(apiKey, request.trackingNumber));
  const tracking = await createOrGetTracking(apiKey, request.trackingNumber, courierCode);

  const checkpoints = collectCheckpoints(tracking);

  return {
    snapshot: {
      trackingNumber: tracking.tracking_number,
      courierCode: tracking.courier_code,
      status: mapStatus(tracking.delivery_status),
      originCountry: tracking.origin_country ?? null,
      destinationCountry: tracking.destination_country ?? null,
      events: checkpoints.map(toTrackingEvent),
    },
    raw: {
      tracking_number: tracking.tracking_number,
      courier_code: tracking.courier_code,
      delivery_status: tracking.delivery_status ?? null,
      substatus: tracking.substatus ?? null,
      origin_country: tracking.origin_country ?? null,
      destination_country: tracking.destination_country ?? null,
      latest_event: tracking.latest_event ?? null,
      latest_checkpoint_time: tracking.latest_checkpoint_time ?? null,
      transit_time: tracking.transit_time ?? null,
      checkpoints,
    },
  };
}

// --- TrackingMore calls -----------------------------------------------------

async function detectCourier(apiKey: string, trackingNumber: string): Promise<string> {
  const envelope = await callTrackingMore(apiKey, 'POST', '/couriers/detect', {
    tracking_number: trackingNumber,
  });
  assertOk(envelope.meta);

  const candidates = Array.isArray(envelope.data) ? (envelope.data as TmDetectedCourier[]) : [];
  const best = candidates[0];
  if (!best?.courier_code) {
    throw new AppError(
      404,
      'NOT_FOUND',
      'Could not detect the carrier for this tracking number. Try specifying a courier code.',
    );
  }
  return best.courier_code;
}

/**
 * TrackingMore requires a tracking to be registered before results are
 * available. Creating returns results directly; if the number was already
 * registered (4101) we fetch the existing record instead.
 */
async function createOrGetTracking(
  apiKey: string,
  trackingNumber: string,
  courierCode: string,
): Promise<TmTracking> {
  const created = await callTrackingMore(apiKey, 'POST', '/trackings/create', {
    tracking_number: trackingNumber,
    courier_code: courierCode,
  });

  if (created.meta.code === META_OK && isTmTracking(created.data)) {
    return created.data;
  }
  if (created.meta.code !== META_TRACKING_EXISTS) {
    assertOk(created.meta);
    throw upstreamError('TrackingMore returned an unexpected create response.');
  }

  const query = new URLSearchParams({ tracking_numbers: trackingNumber, courier_code: courierCode });
  const existing = await callTrackingMore(apiKey, 'GET', `/trackings/get?${query.toString()}`);
  assertOk(existing.meta);

  const match = Array.isArray(existing.data) ? existing.data.find(isTmTracking) : undefined;
  if (!match) {
    throw new AppError(404, 'NOT_FOUND', 'No tracking information found for this number.');
  }
  return match;
}

async function callTrackingMore(
  apiKey: string,
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, string>,
): Promise<TmEnvelope> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Tracking-Api-Key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
    throw upstreamError(timedOut ? 'TrackingMore timed out.' : 'Could not reach TrackingMore.');
  }

  // TrackingMore reports errors in `meta` and may use non-2xx statuses for them,
  // so parse the body regardless of HTTP status.
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw upstreamError(`TrackingMore returned a non-JSON response (HTTP ${response.status}).`);
  }

  if (!isEnvelope(payload)) {
    throw upstreamError(`TrackingMore returned an unexpected response (HTTP ${response.status}).`);
  }
  return payload;
}

function assertOk(meta: TmMeta): void {
  if (meta.code === META_OK) return;

  console.warn(`TrackingMore error ${meta.code}: ${meta.message}`);

  if (meta.code === 401 || meta.code === 403) {
    throw upstreamError('TrackingMore rejected the API key.');
  }
  if (meta.code === 429 || meta.code === 4103) {
    throw new AppError(429, 'RATE_LIMITED', 'TrackingMore rate limit or quota reached. Try again later.');
  }
  // 41xx codes describe problems with the tracking number or courier code.
  if (meta.code >= 4100 && meta.code < 4200) {
    throw new AppError(400, 'INVALID_REQUEST', meta.message);
  }
  throw upstreamError(`TrackingMore error: ${meta.message}`);
}

function upstreamError(message: string): AppError {
  return new AppError(502, 'UPSTREAM_ERROR', message);
}

// --- Normalisation ----------------------------------------------------------

const STATUS_MAP: Record<string, ParcelStatus> = {
  pending: 'pending',
  notfound: 'not_found',
  inforeceived: 'info_received',
  transit: 'in_transit',
  pickup: 'out_for_delivery',
  delivered: 'delivered',
  undelivered: 'failed_attempt',
  exception: 'exception',
  expired: 'expired',
};

function mapStatus(status: string | null | undefined): ParcelStatus {
  return (status && STATUS_MAP[status]) || 'unknown';
}

/** Merges origin and destination carrier checkpoints, deduplicated, oldest first. */
function collectCheckpoints(tracking: TmTracking): TmCheckpoint[] {
  const all = [
    ...(tracking.origin_info?.trackinfo ?? []),
    ...(tracking.destination_info?.trackinfo ?? []),
  ].filter((cp) => cp.checkpoint_date && cp.tracking_detail);

  const seen = new Set<string>();
  const unique = all.filter((cp) => {
    const key = `${cp.checkpoint_date}|${cp.tracking_detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.sort((a, b) => timeOf(a) - timeOf(b));
}

function timeOf(cp: TmCheckpoint): number {
  const time = Date.parse(cp.checkpoint_date ?? '');
  return Number.isNaN(time) ? 0 : time;
}

function toTrackingEvent(cp: TmCheckpoint): TrackingEvent {
  const composedLocation = [cp.city, cp.state, cp.country_iso2].filter(Boolean).join(', ');
  return {
    timestamp: cp.checkpoint_date ?? '',
    description: cp.tracking_detail ?? '',
    location: cp.location || composedLocation || null,
  };
}

// --- Type guards ------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEnvelope(value: unknown): value is TmEnvelope {
  if (!isRecord(value) || !isRecord(value.meta)) return false;
  return typeof value.meta.code === 'number' && typeof value.meta.message === 'string';
}

function isTmTracking(value: unknown): value is TmTracking {
  return (
    isRecord(value) &&
    typeof value.tracking_number === 'string' &&
    typeof value.courier_code === 'string'
  );
}
