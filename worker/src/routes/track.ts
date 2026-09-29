import { Hono } from 'hono';
import type { HonoRequest } from 'hono';
import type { AiAnalysis, TrackResponse, TrackResult } from '../../../shared/api';
import type { AppBindings, Env } from '../env';
import { AppError, describeError } from '../errors';
import { cacheKey, cacheTtlFor, readCachedResult, writeCachedResult } from '../lib/cache';
import { parseTrackRequest } from '../lib/validation';
import { analyzeTracking } from '../services/gemini';
import { fetchTracking } from '../services/tracking';

export const trackRoute = new Hono<AppBindings>();

trackRoute.post('/', async (c) => {
  const request = parseTrackRequest(await readJsonBody(c.req));
  const key = cacheKey(request);

  const cached = await readCachedResult(c.env.TRACKING_CACHE, key);
  if (cached) {
    const response: TrackResponse = { ...cached, cached: true };
    return c.json(response);
  }

  const { snapshot, analysisInput } = await fetchTracking(c.env, request);
  // Nothing to analyse until the carrier reports its first event.
  const analysis = snapshot.events.length > 0 ? await analyzeSafely(c.env, analysisInput) : null;

  const result: TrackResult = {
    ...snapshot,
    analysis,
    fetchedAt: new Date().toISOString(),
  };

  c.executionCtx.waitUntil(
    writeCachedResult(c.env.TRACKING_CACHE, key, result, cacheTtlFor(result)),
  );

  const response: TrackResponse = { ...result, cached: false };
  return c.json(response);
});

async function readJsonBody(req: HonoRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError(400, 'INVALID_REQUEST', 'Request body must be valid JSON.');
  }
}

/** The timeline is still useful without a summary, so AI failures degrade gracefully. */
async function analyzeSafely(env: Env, analysisInput: unknown): Promise<AiAnalysis | null> {
  try {
    return await analyzeTracking(env, analysisInput);
  } catch (err) {
    console.error('Gemini analysis failed:', describeError(err));
    return null;
  }
}
