import type { ParcelStatus, TrackingEvent } from '../../../shared/api';
import { courierCodeFor17TrackId, courierName } from '../lib/carriers';
import { fetchJson, isRecord, upstreamError } from '../lib/http';
import { AppError } from '../errors';
import type { TrackingLookup } from './tracking';

const BASE_URL = 'https://api.17track.net/track/v2.4';

/** 17TRACK usually has results seconds after registration; wait once before re-polling. */
const REGISTRATION_SETTLE_MS = 2_500;

const ERR_IP_NOT_ALLOWED = -18010001;
const ERR_INVALID_KEY = -18010002;
const ERR_INVALID_NUMBER_FORMAT = -18010012;
const ERR_ALREADY_REGISTERED = -18019901;
const ERR_NOT_REGISTERED = -18019902;
const ERR_CARRIER_NOT_DETECTED = -18019903;
const ERR_QUOTA_EXHAUSTED = -18019908;
const ERR_NO_INFO_YET = -18019909;

// --- 17TRACK v2.4 response shapes (only the fields we read) ----------------

interface StError {
  code: number;
  message: string;
}

interface StAddress {
  country?: string | null;
  state?: string | null;
  city?: string | null;
}

export interface StEvent {
  time_iso?: string | null;
  time_utc?: string | null;
  description?: string | null;
  location?: string | null;
  stage?: string | null;
  sub_status?: string | null;
  address?: StAddress | null;
}

interface StProvider {
  provider?: { key?: number; name?: string | null } | null;
  events?: StEvent[] | null;
}

export interface StTrackInfo {
  shipping_info?: {
    shipper_address?: StAddress | null;
    recipient_address?: StAddress | null;
  } | null;
  latest_status?: { status?: string | null; sub_status?: string | null } | null;
  latest_event?: StEvent | null;
  time_metrics?: Record<string, unknown> | null;
  milestone?: unknown[] | null;
  tracking?: { providers?: StProvider[] | null } | null;
}

/** One `gettrackinfo` item. `track_info` is null while 17TRACK is still fetching. */
export interface SeventeenTrackRaw {
  number: string;
  carrier: number | null;
  track_info: StTrackInfo | null;
}

interface StItemRequest {
  number: string;
  carrier?: number;
}

interface StResult {
  accepted: Record<string, unknown>[];
  rejected: { number?: string; carrier?: number; error: StError }[];
}

type TrackInfoOutcome =
  | { kind: 'ok'; item: SeventeenTrackRaw }
  | { kind: 'pending' }
  | { kind: 'not_registered' };

// --- Public API -------------------------------------------------------------

/**
 * Fetches the raw 17TRACK tracking JSON. Registers the number (1 quota unit)
 * only if it isn't registered yet, so repeat lookups are free.
 */
export async function fetch17TrackRaw(
  apiKey: string,
  trackingNumber: string,
  carrierId: number | undefined,
): Promise<SeventeenTrackRaw> {
  let carrier = carrierId ?? null;
  let outcome = await getTrackInfo(apiKey, itemRequest(trackingNumber, carrier));

  if (outcome.kind === 'not_registered') {
    carrier = (await register(apiKey, itemRequest(trackingNumber, carrier))) ?? carrier;
    await new Promise((resolve) => setTimeout(resolve, REGISTRATION_SETTLE_MS));
    outcome = await getTrackInfo(apiKey, itemRequest(trackingNumber, carrier));
  }

  if (outcome.kind === 'ok') return outcome.item;
  return { number: trackingNumber, carrier, track_info: null };
}

export function normalize17Track(raw: SeventeenTrackRaw): TrackingLookup {
  const info = raw.track_info;
  const providers = info?.tracking?.providers ?? [];
  const events = collectEvents(providers);
  const code = raw.carrier ? courierCodeFor17TrackId(raw.carrier) : 'unknown';
  const providerName = providers.find((p) => p.provider?.name)?.provider?.name ?? null;

  return {
    snapshot: {
      trackingNumber: raw.number,
      courierCode: code,
      courierName: courierName(code) ?? providerName,
      status: info ? mapStatus(info.latest_status?.status) : 'pending',
      originCountry: info?.shipping_info?.shipper_address?.country ?? null,
      destinationCountry: info?.shipping_info?.recipient_address?.country ?? null,
      events: events.map(toTrackingEvent),
    },
    // Drops shipping_info streets/postcodes and misc_info reference numbers.
    analysisInput: {
      source: '17TRACK',
      tracking_number: raw.number,
      carrier: providerName,
      latest_status: info?.latest_status ?? null,
      time_metrics: info?.time_metrics ?? null,
      milestone: info?.milestone ?? null,
      origin_country: info?.shipping_info?.shipper_address?.country ?? null,
      destination_country: info?.shipping_info?.recipient_address?.country ?? null,
      events: events.map((e) => ({
        time: e.time_iso ?? e.time_utc ?? null,
        description: e.description ?? null,
        location: eventLocation(e),
        stage: e.stage ?? null,
        sub_status: e.sub_status ?? null,
      })),
    },
  };
}

// --- 17TRACK calls ----------------------------------------------------------

function itemRequest(number: string, carrier: number | null): StItemRequest {
  return carrier ? { number, carrier } : { number };
}

async function getTrackInfo(apiKey: string, request: StItemRequest): Promise<TrackInfoOutcome> {
  const { accepted, rejected } = await call17Track(apiKey, '/gettrackinfo', [request]);

  const item = accepted[0];
  if (item && isRecord(item.track_info)) {
    return {
      kind: 'ok',
      item: {
        number: typeof item.number === 'string' ? item.number : request.number,
        carrier: typeof item.carrier === 'number' ? item.carrier : (request.carrier ?? null),
        track_info: item.track_info as StTrackInfo,
      },
    };
  }

  const error = rejected[0]?.error;
  if (error?.code === ERR_NOT_REGISTERED) return { kind: 'not_registered' };
  if (error?.code === ERR_NO_INFO_YET || !error) return { kind: 'pending' };
  throw fromStError(error);
}

/** Registers a number and returns the (possibly auto-detected) carrier ID. */
async function register(apiKey: string, request: StItemRequest): Promise<number | null> {
  const { accepted, rejected } = await call17Track(apiKey, '/register', [request]);

  const carrier = accepted[0]?.carrier;
  if (typeof carrier === 'number') return carrier;

  const rejection = rejected[0];
  if (rejection?.error.code === ERR_ALREADY_REGISTERED) return rejection.carrier ?? null;
  if (rejection) throw fromStError(rejection.error);
  return null;
}

async function call17Track(apiKey: string, path: string, items: StItemRequest[]): Promise<StResult> {
  const { status, body } = await fetchJson(
    `${BASE_URL}${path}`,
    {
      method: 'POST',
      headers: { '17token': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    },
    '17TRACK',
  );

  if (!isRecord(body) || typeof body.code !== 'number') {
    throw upstreamError(`17TRACK returned an unexpected response (HTTP ${status}).`);
  }

  const data = isRecord(body.data) ? body.data : {};
  if (body.code !== 0) {
    const errors = Array.isArray(data.errors) ? (data.errors as StError[]) : [];
    throw fromStError(errors[0] ?? { code: body.code, message: 'Unknown 17TRACK error.' });
  }

  return {
    accepted: Array.isArray(data.accepted) ? data.accepted.filter(isRecord) : [],
    rejected: Array.isArray(data.rejected) ? (data.rejected as StResult['rejected']) : [],
  };
}

function fromStError(error: StError): AppError {
  console.warn(`17TRACK error ${error.code}: ${error.message}`);
  switch (error.code) {
    case ERR_INVALID_KEY:
      return upstreamError('17TRACK rejected the API key.');
    case ERR_IP_NOT_ALLOWED:
      return upstreamError('17TRACK blocked this server IP. Clear the IP allow-list in the 17TRACK dashboard.');
    case ERR_QUOTA_EXHAUSTED:
      return new AppError(429, 'RATE_LIMITED', '17TRACK free quota is used up.');
    case ERR_CARRIER_NOT_DETECTED:
      return new AppError(404, 'NOT_FOUND', 'Could not detect the carrier. Try choosing one explicitly.');
    case ERR_INVALID_NUMBER_FORMAT:
      return new AppError(400, 'INVALID_REQUEST', error.message);
    default:
      return upstreamError(`17TRACK error: ${error.message}`);
  }
}

// --- Normalisation ----------------------------------------------------------

const STATUS_MAP: Record<string, ParcelStatus> = {
  NotFound: 'not_found',
  InfoReceived: 'info_received',
  InTransit: 'in_transit',
  Expired: 'expired',
  AvailableForPickup: 'available_for_pickup',
  OutForDelivery: 'out_for_delivery',
  DeliveryFailure: 'failed_attempt',
  Delivered: 'delivered',
  Exception: 'exception',
};

function mapStatus(status: string | null | undefined): ParcelStatus {
  return (status && STATUS_MAP[status]) || 'unknown';
}

/** Merges all providers' events (e.g. origin + last-mile), deduplicated, oldest first. */
function collectEvents(providers: StProvider[]): StEvent[] {
  const seen = new Set<string>();
  return providers
    .flatMap((p) => p.events ?? [])
    .filter((e) => {
      const time = e.time_utc ?? e.time_iso;
      if (!time || !e.description) return false;
      const key = `${time}|${e.description}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => eventTime(a) - eventTime(b));
}

function eventTime(event: StEvent): number {
  const time = Date.parse(event.time_utc ?? event.time_iso ?? '');
  return Number.isNaN(time) ? 0 : time;
}

function eventLocation(event: StEvent): string | null {
  if (event.location) return event.location;
  const { city, state, country } = event.address ?? {};
  return [city, state, country].filter(Boolean).join(', ') || null;
}

function toTrackingEvent(event: StEvent): TrackingEvent {
  return {
    timestamp: event.time_iso ?? event.time_utc ?? '',
    description: event.description ?? '',
    location: eventLocation(event),
  };
}
