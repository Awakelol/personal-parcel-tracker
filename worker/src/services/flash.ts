import puppeteer from '@cloudflare/puppeteer';
import type { ParcelStatus, TrackingEvent } from '../../../shared/api';
import { courierName } from '../lib/carriers';
import { isRecord } from '../lib/http';
import { splitBracketedLocation } from '../lib/scans';
import { describeError } from '../errors';
import type { TrackingLookup } from './tracking';

// Flash Express PH, read live from its public tracking page in a real browser
// (the page sits behind a JS check that plain requests can't pass). We read
// the JSON the page itself loads, at personal-use volume.
const TRACKING_PAGE = 'https://www.flashexpress.ph/fle/tracking?se=';
const TRACKING_API = '/webApi/tools/tracking';
const TIMEOUT_MS = 25_000;
// Short reuse window so quick re-opens don't spend browser time.
const LIVE_CACHE_TTL_SECONDS = 10 * 60;

// The response also has phone numbers, rider names, delivery addresses and
// signature photos; those are deliberately not part of these types.
interface FlashRoute {
  message?: string | null;
  route_action?: string | null;
  routed_at?: string | null;
  state_text?: string | null;
}

export interface FlashParcel {
  pno: string;
  stateText: string | null;
  routes: FlashRoute[];
}

const cacheKey = (trackingNumber: string) => `flash-live:${trackingNumber}`;

/** Live Flash data, or null if the page couldn't be read (caller falls back to 17TRACK). */
export async function fetchFlashLive(
  browser: Fetcher | undefined,
  kv: KVNamespace,
  trackingNumber: string,
): Promise<FlashParcel | null> {
  if (!browser) return null;
  const cached = await kv.get<FlashParcel>(cacheKey(trackingNumber), 'json').catch(() => null);
  if (cached) return cached;

  const started = Date.now();
  let instance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    instance = await puppeteer.launch(browser);
    const page = await instance.newPage();
    const response = page.waitForResponse(
      (r) => r.url().includes(TRACKING_API) && r.request().method() === 'POST',
      { timeout: TIMEOUT_MS },
    );
    await page.goto(TRACKING_PAGE + encodeURIComponent(trackingNumber), { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    const parcel = toParcel(await (await response).json(), trackingNumber);
    console.log(`Flash live lookup in ${Date.now() - started}ms: ${parcel ? `${parcel.routes.length} scans` : 'not found'}`);
    if (parcel) await kv.put(cacheKey(trackingNumber), JSON.stringify(parcel), { expirationTtl: LIVE_CACHE_TTL_SECONDS });
    return parcel;
  } catch (err) {
    console.warn(`Flash live lookup failed after ${Date.now() - started}ms:`, describeError(err));
    return null;
  } finally {
    await instance?.close().catch(() => undefined);
  }
}

// Keeps only the safe fields of Flash's response.
function toParcel(body: unknown, trackingNumber: string): FlashParcel | null {
  if (!isRecord(body) || body.code !== 1 || !isRecord(body.data) || !Array.isArray(body.data.list)) return null;
  const item = body.data.list.find((x) => isRecord(x) && x.pno_display === trackingNumber) ?? body.data.list[0];
  if (!isRecord(item) || !Array.isArray(item.routes)) return null;
  const text = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    pno: trackingNumber,
    stateText: text(item.state_text),
    routes: item.routes.filter(isRecord).map((r) => ({
      message: text(r.message),
      route_action: text(r.route_action),
      routed_at: text(r.routed_at),
      state_text: text(r.state_text),
    })),
  };
}

// "2026-10-01 09:56:37" is Philippine time.
function toIso(routedAt: string | null | undefined): string | null {
  const match = routedAt && /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(routedAt);
  return match ? `${match[1]}T${match[2]}+08:00` : null;
}

const ACTION_STATUS: Record<string, ParcelStatus> = {
  DELIVERY_CONFIRM: 'delivered',
  DELIVERY_TICKET_CREATION_SCAN: 'out_for_delivery',
};

function statusOf(parcel: FlashParcel, newestFirst: FlashRoute[]): ParcelStatus {
  const latest = newestFirst[0];
  if (!latest) return 'pending';
  const action = latest.route_action ?? '';
  if (ACTION_STATUS[action]) return ACTION_STATUS[action];
  const text = `${parcel.stateText ?? ''} ${latest.state_text ?? ''}`.toLowerCase();
  if (text.includes('delivered')) return 'delivered';
  if (text.includes('return')) return 'exception';
  if (text.includes('fail') || text.includes('problem') || text.includes('detain')) return 'failed_attempt';
  if (!action) return 'info_received';
  return 'in_transit';
}

export function normalizeFlash(parcel: FlashParcel): TrackingLookup {
  const newestFirst = parcel.routes.filter((r) => r.message && toIso(r.routed_at));
  const events: TrackingEvent[] = [...newestFirst].reverse().map((r) => {
    const { description, location } = splitBracketedLocation(r.message!);
    return { timestamp: toIso(r.routed_at)!, description, location };
  });

  return {
    snapshot: {
      trackingNumber: parcel.pno,
      courierCode: 'flash-ph',
      courierName: courierName('flash-ph'),
      status: statusOf(parcel, newestFirst),
      originCountry: 'PH',
      destinationCountry: 'PH',
      events,
    },
    carrierEstimate: null,
    // Scan text, time, type and place only.
    analysisInput: {
      source: 'Flash Express Philippines (live)',
      tracking_number: parcel.pno,
      status: parcel.stateText,
      events: events.map((e, i) => ({
        time: e.timestamp,
        type: [...newestFirst].reverse()[i]?.route_action ?? null,
        description: e.description,
        location: e.location,
      })),
    },
  };
}
