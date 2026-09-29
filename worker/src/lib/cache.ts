import type { TrackRequest, TrackResult } from '../../../shared/api';
import { describeError } from '../errors';
import { resolveRoute } from './carriers';

/** Bump when the TrackResult shape changes so stale entries are ignored. */
const CACHE_VERSION = 'v3';

export const CACHE_TTL_SECONDS = 60 * 60;

/**
 * Shorter TTL for partial results, so a transient Gemini outage or a freshly
 * registered number with no carrier events yet isn't pinned for an hour.
 */
export const PARTIAL_CACHE_TTL_SECONDS = 5 * 60;

export function cacheTtlFor(result: TrackResult): number {
  const isComplete = result.analysis !== null && result.events.length > 0;
  return isComplete ? CACHE_TTL_SECONDS : PARTIAL_CACHE_TTL_SECONDS;
}

/**
 * Keyed by where the lookup actually goes, so equivalent requests (an SPX
 * number with or without `spx-ph`, `jnt-ph` vs `100240`) share one entry and
 * one Gemini analysis.
 */
export function cacheKey(request: TrackRequest): string {
  const route = resolveRoute(request);
  const source = route.provider === 'spx' ? 'spx' : `17track-${route.carrierId ?? 'auto'}`;
  return `track:${CACHE_VERSION}:${source}:${request.trackingNumber}`;
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
