import type { TrackRequest, TrackResult } from '../../../shared/api';
import { describeError } from '../errors';
import { resolveRoute } from './carriers';

/** Bump when the TrackResult shape changes so stale entries are ignored. */
const CACHE_VERSION = 'v3';

export const CACHE_TTL_SECONDS = 60 * 60;

// Partial results (no summary, or no scans yet) expire sooner.
export const PARTIAL_CACHE_TTL_SECONDS = 5 * 60;

export function cacheTtlFor(result: TrackResult): number {
  const isComplete = result.analysis !== null && result.events.length > 0;
  return isComplete ? CACHE_TTL_SECONDS : PARTIAL_CACHE_TTL_SECONDS;
}

// Key on the resolved source so e.g. `jnt-ph` and `100240` share an entry.
export function cacheKey(request: TrackRequest): string {
  const route = resolveRoute(request);
  const source = route.provider === 'spx' ? 'spx' : `17track-${route.carrierId ?? 'auto'}`;
  return `track:${CACHE_VERSION}:${source}:${request.trackingNumber}`;
}

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
