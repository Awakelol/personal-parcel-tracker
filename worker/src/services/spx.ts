import type { ParcelStatus, TrackingEvent } from '../../../shared/api';
import { courierName } from '../lib/carriers';
import { fetchJson, isRecord, upstreamError } from '../lib/http';
import { AppError } from '../errors';
import type { TrackingLookup } from './tracking';

/**
 * SPX Philippines' public tracking endpoint (the one spx.ph's tracking page
 * calls). Undocumented: field names below were taken from open-source SPX
 * trackers and may change without notice.
 */
const SPX_TRACKING_URL = 'https://spx.ph/shipment/order/open/order/get_order_info';

/** Appears in `message` when SPX has no order for the number. */
const SPX_NOT_FOUND_CODE = '-2023002';

/**
 * The response also carries receiver_name, full_address, lat/lng and an ePOD
 * photo URL. Those are PII and deliberately not declared here, so nothing
 * downstream can read them by accident.
 */
export interface SpxRecord {
  /** 0 = internal record that spx.ph hides from buyers (e.g. "SLSTN Created"). */
  display_flag?: number | null;
  actual_time?: number | string | null;
  buyer_description?: string | null;
  description?: string | null;
  milestone_name?: string | null;
  tracking_code?: string | null;
  current_location?: { location_name?: string | null } | string | null;
}

export interface SpxResponse {
  retcode: number;
  message?: string;
  data?: {
    sls_tracking_info?: {
      sls_tn?: string;
      /** Newest first. */
      records?: SpxRecord[] | null;
    } | null;
  } | null;
}

/** Fetches the raw SPX tracking JSON for a tracking number. */
export async function fetchSpxRaw(trackingNumber: string): Promise<SpxResponse> {
  const query = new URLSearchParams({ spx_tn: trackingNumber, language_code: 'en' });
  const { status, body } = await fetchJson(
    `${SPX_TRACKING_URL}?${query.toString()}`,
    { headers: { Accept: 'application/json' } },
    'SPX',
  );

  if (!isRecord(body) || typeof body.retcode !== 'number') {
    throw upstreamError(`SPX returned an unexpected response (HTTP ${status}).`);
  }

  const response = body as unknown as SpxResponse;
  if (response.retcode !== 0) {
    if (response.message?.includes(SPX_NOT_FOUND_CODE)) {
      throw new AppError(404, 'NOT_FOUND', 'SPX has no record of this tracking number.');
    }
    console.warn(`SPX error ${response.retcode}: ${response.message ?? ''}`);
    throw upstreamError('SPX tracking lookup failed.');
  }
  return response;
}

export function normalizeSpx(trackingNumber: string, raw: SpxResponse): TrackingLookup {
  const records = (raw.data?.sls_tracking_info?.records ?? []).filter((r) => r.display_flag !== 0);
  const events = records
    .map(toTrackingEvent)
    .filter((e): e is TrackingEvent => e !== null)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  const latest = records[0];

  return {
    snapshot: {
      trackingNumber,
      courierCode: 'spx-ph',
      courierName: courierName('spx-ph'),
      status: inferStatus(latest, events.length),
      originCountry: 'PH',
      destinationCountry: 'PH',
      events,
    },
    // SPX's public endpoint has no delivery estimate; Gemini provides one.
    carrierEstimate: null,
    // Only event text, time and hub name — never recipient fields.
    analysisInput: {
      source: 'SPX Express Philippines',
      tracking_number: trackingNumber,
      records: records.map((r) => ({
        time: toIsoTime(r.actual_time),
        milestone: r.milestone_name ?? null,
        description: r.buyer_description ?? r.description ?? null,
        location: locationName(r.current_location),
      })),
    },
  };
}

function toTrackingEvent(record: SpxRecord): TrackingEvent | null {
  const timestamp = toIsoTime(record.actual_time);
  const description = record.buyer_description ?? record.description ?? record.milestone_name;
  if (!timestamp || !description) return null;
  return { timestamp, description, location: locationName(record.current_location) };
}

/** SPX sends Unix seconds; tolerate milliseconds and preformatted strings too. */
function toIsoTime(value: SpxRecord['actual_time']): string | null {
  if (typeof value === 'number' && value > 0) {
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
  return null;
}

function locationName(location: SpxRecord['current_location']): string | null {
  if (typeof location === 'string') return location || null;
  return location?.location_name || null;
}

/** SPX has no status enum we know of, so infer from the latest milestone text. */
function inferStatus(latest: SpxRecord | undefined, eventCount: number): ParcelStatus {
  if (!latest || eventCount === 0) return 'pending';
  const text = `${latest.milestone_name ?? ''} ${latest.buyer_description ?? ''}`.toLowerCase();
  if (text.includes('delivered') && !text.includes('undelivered')) return 'delivered';
  if (text.includes('out for delivery')) return 'out_for_delivery';
  if (text.includes('fail') || text.includes('undelivered')) return 'failed_attempt';
  if (text.includes('return')) return 'exception';
  if (text.includes('created') || text.includes('preparing')) return 'info_received';
  return 'in_transit';
}
