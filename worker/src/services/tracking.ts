import type { TrackRequest, TrackingSnapshot } from '../../../shared/api';
import type { Env } from '../env';
import { AppError } from '../errors';
import { SPX_17TRACK_CARRIER_ID, resolveRoute } from '../lib/carriers';
import { fetch17TrackRaw, normalize17Track } from './seventeentrack';
import { fetchSpxRaw, normalizeSpx } from './spx';

export interface TrackingLookup {
  /** Normalised timeline returned to the dashboard. */
  snapshot: TrackingSnapshot;
  /** PII-free subset of the upstream's raw JSON, forwarded to Gemini. */
  analysisInput: unknown;
}

/** Fetches from SPX directly for SPX numbers, and from 17TRACK for everything else. */
export async function fetchTracking(env: Env, request: TrackRequest): Promise<TrackingLookup> {
  const route = resolveRoute(request);

  if (route.provider === '17track') {
    return trackVia17Track(env, request.trackingNumber, route.carrierId);
  }

  try {
    return normalizeSpx(request.trackingNumber, await fetchSpxRaw(request.trackingNumber));
  } catch (err) {
    // SPX's endpoint is unofficial; if it's blocked or down, spend a 17TRACK
    // quota unit rather than fail. A definitive "not found" is not retried.
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
