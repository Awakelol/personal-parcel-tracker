import { Hono } from 'hono';
import type { AiAnalysis, TrackResponse, TrackResult, TrackingEvent } from '../../../shared/api';
import type { AppBindings, Env } from '../env';
import { describeError } from '../errors';
import { cacheKey, cacheTtlFor, readCachedResult, writeCachedResult } from '../lib/cache';
import { philippineToday, resolveEstimatedDelivery } from '../lib/estimate';
import { readJsonBody } from '../lib/request';
import { parseTrackRequest } from '../lib/validation';
import { analyzeTracking } from '../services/gemini';
import { fetchTracking } from '../services/tracking';

export const trackRoute = new Hono<AppBindings>();

trackRoute.post('/', async (c) => {
  const body = await readJsonBody(c.req);
  const request = parseTrackRequest(body);
  const fresh = (body as { fresh?: unknown }).fresh === true;
  const key = cacheKey(request);

  const cached = await readCachedResult(c.env.TRACKING_CACHE, key);
  if (cached && !fresh) {
    const response: TrackResponse = { ...cached, cached: true };
    return c.json(response);
  }

  const { snapshot, carrierEstimate, analysisInput } = await fetchTracking(c.env, request);

  // Nothing new since the last summary: keep it rather than asking Gemini again.
  const analysis =
    cached?.analysis && sameEvents(cached.events, snapshot.events)
      ? cached.analysis
      : snapshot.events.length > 0
        ? await analyzeSafely(c.env, analysisInput)
        : null;

  const now = new Date();
  const result: TrackResult = {
    ...snapshot,
    analysis,
    estimatedDelivery: resolveEstimatedDelivery(snapshot.status, carrierEstimate, analysis, philippineToday(now)),
    fetchedAt: now.toISOString(),
  };

  const ttl = cacheTtlFor(result);
  if (ttl) c.executionCtx.waitUntil(writeCachedResult(c.env.TRACKING_CACHE, key, result, ttl));

  const response: TrackResponse = { ...result, cached: false };
  return c.json(response);
});

function sameEvents(a: TrackingEvent[], b: TrackingEvent[]): boolean {
  const lastA = a.at(-1);
  const lastB = b.at(-1);
  return a.length === b.length && lastA?.timestamp === lastB?.timestamp && lastA?.description === lastB?.description;
}

// A missing summary shouldn't cost the user the timeline.
async function analyzeSafely(env: Env, analysisInput: unknown): Promise<AiAnalysis | null> {
  try {
    return await analyzeTracking(env, analysisInput);
  } catch (err) {
    console.error('Gemini analysis failed:', describeError(err));
    return null;
  }
}
