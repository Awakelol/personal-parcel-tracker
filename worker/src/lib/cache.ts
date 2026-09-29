import type { TrackRequest, TrackResult } from '../../../shared/api';
import { describeError } from '../errors';

/** Bump when the TrackResult shape changes so stale entries are ignored. */
const CACHE_VERSION = 'v1';

export const CACHE_TTL_SECONDS = 60 * 60;

/**
 * Shorter TTL used when Gemini analysis failed, so a transient AI outage
 * doesn't pin a summary-less result for a full hour.
 */
export const DEGRADED_CACHE_TTL_SECONDS = 5 * 60;

export function cacheKey(request: TrackRequest): string {
  const courier = request.courierCode ?? 'auto';
  return `track:${CACHE_VERSION}:${courier}:${request.trackingNumber}`;
}

/** Returns the cached result, or `null` on a miss or KV failure. */
export async function readCachedResult(
  kv: KVNamespace,
  key: string,
): Promise<TrackResult | null> {
  try {
    return await kv.get<TrackResult>(key, 'json');
  } catch (err) {
    console.warn('KV read failed:', describeError(err));
    return null;
  }
}

export async function writeCachedResult(
  kv: KVNamespace,
  key: string,
  result: TrackResult,
  ttlSeconds: number,
): Promise<void> {
  try {
    await kv.put(key, JSON.stringify(result), { expirationTtl: ttlSeconds });
  } catch (err) {
    console.warn('KV write failed:', describeError(err));
  }
}
