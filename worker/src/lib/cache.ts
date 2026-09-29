import type { TrackRequest, TrackResult } from '../../../shared/api';
import { describeError } from '../errors';
import { resolveRoute } from './carriers';

/** Bump when the TrackResult shape changes so stale entries are ignored. */
const CACHE_VERSION = 'v5';

export const CACHE_TTL_SECONDS = 60 * 60;

// KV's minimum TTL; used when the summary failed so it's retried soon.
const RETRY_SOON_TTL_SECONDS = 60;

/** `null` = don't cache (still loading upstream; re-checking it is free). */
export function cacheTtlFor(result: TrackResult): number | null {
  if (result.events.length === 0) return result.status === 'pending' ? null : RETRY_SOON_TTL_SECONDS;
  return result.analysis ? CACHE_TTL_SECONDS : RETRY_SOON_TTL_SECONDS;
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
