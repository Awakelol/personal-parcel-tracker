import type { DateRange, TrackRequest, TrackingSnapshot } from '../../../shared/api';
import type { Env } from '../env';
import { AppError } from '../errors';
import { FLASH_17TRACK_CARRIER_ID, SPX_17TRACK_CARRIER_ID, resolveRoute } from '../lib/carriers';
import { fetchFlashLive, normalizeFlash } from './flash';
import { fetch17TrackRaw, normalize17Track } from './seventeentrack';
import { fetchSpxRaw, normalizeSpx } from './spx';

export interface TrackingLookup {
  snapshot: TrackingSnapshot;
  carrierEstimate: DateRange | null;
  /** Raw upstream data minus PII, for Gemini. */
  analysisInput: unknown;
}

export async function fetchTracking(env: Env, request: TrackRequest): Promise<TrackingLookup> {
  const route = resolveRoute(request);

  if (route.provider === '17track') {
    // 17TRACK's copy of Flash can lag hours behind, so read Flash's own page first.
    if (route.carrierId === FLASH_17TRACK_CARRIER_ID) {
      const live = await fetchFlashLive(env.BROWSER, env.TRACKING_CACHE, request.trackingNumber);
      if (live && live.routes.length > 0) return normalizeFlash(live);
    }
    return trackVia17Track(env, request.trackingNumber, route.carrierId);
  }

  try {
    return normalizeSpx(request.trackingNumber, await fetchSpxRaw(request.trackingNumber));
  } catch (err) {
    // The SPX endpoint is unofficial; if it's down, use 17TRACK instead.
    const isTransient =
      err instanceof AppError && (err.code === 'UPSTREAM_ERROR' || err.code === 'RATE_LIMITED');
    if (!isTransient) throw err;

    console.warn(`SPX direct lookup failed (${err.message}); falling back to 17TRACK.`);
    return trackVia17Track(env, request.trackingNumber, SPX_17TRACK_CARRIER_ID);
  }
}

async function trackVia17Track(
  env: Env,
  trackingNumber: string,
  carrierId: number | undefined,
): Promise<TrackingLookup> {
  return normalize17Track(await fetch17TrackRaw(env.SEVENTEENTRACK_API_KEY, trackingNumber, carrierId));
}
