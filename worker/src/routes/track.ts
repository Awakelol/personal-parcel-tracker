import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AiAnalysis, TrackRequest, TrackResponse, TrackResult } from '../../../shared/api';
import type { AppBindings, Env } from '../env';
import { describeError } from '../errors';
import { readAnalysis, scansSignature, stashAnalysisInput, takeAnalysisInput, writeAnalysis } from '../lib/analysisCache';
import { cacheKey, cacheTtlFor, readCachedResult, writeCachedResult } from '../lib/cache';
import { localToday, resolveEstimates } from '../lib/estimate';
import { readJsonBody } from '../lib/request';
import { parseTrackRequest } from '../lib/validation';
import { analyzeTracking } from '../services/gemini';
import { fetchTracking } from '../services/tracking';

type Ctx = Context<AppBindings>;

export const trackRoute = new Hono<AppBindings>();

trackRoute.post('/', async (c) => {
  const body = (await readJsonBody(c.req)) as Record<string, unknown>;
  const request = parseTrackRequest(body);
  const key = cacheKey(request);

  if (body.fresh !== true) {
    const cached = await readCachedResult(c.env.TRACKING_CACHE, key);
    if (cached) return respond(c, cached, true);
  }

  const { snapshot, carrierEstimate, analysisInput } = await fetchTracking(c.env, request);
  const signature = await scansSignature(snapshot.events);
  let analysis = snapshot.events.length > 0 ? await readAnalysis(c.env.TRACKING_CACHE, key, signature) : null;
  let analysisPending = false;

  if (!analysis && snapshot.events.length > 0) {
    if (body.deferAnalysis === true) {
      analysisPending = true;
      c.executionCtx.waitUntil(stashAnalysisInput(c.env.TRACKING_CACHE, key, analysisInput));
    } else {
      analysis = await generateAnalysis(c.env, key, signature, analysisInput);
    }
  }

  const result: TrackResult = {
    ...snapshot,
    analysis,
    analysisPending,
    ...resolveEstimates(snapshot.status, carrierEstimate, analysis, localToday(c.env.TIMEZONE)),
    fetchedAt: new Date().toISOString(),
  };
  store(c, key, result);
  return respond(c, result, false);
});

// Second half of a deferred lookup: writes (or finds) the summary.
trackRoute.post('/analysis', async (c) => {
  const request = parseTrackRequest(await readJsonBody(c.req));
  const key = cacheKey(request);

  const cached = await readCachedResult(c.env.TRACKING_CACHE, key);
  if (!cached) return respond(c, await lookUpNow(c, request, key), false);
  if (cached.analysis || cached.events.length === 0) return respond(c, { ...cached, analysisPending: false }, true);

  const signature = await scansSignature(cached.events);
  let analysis = await readAnalysis(c.env.TRACKING_CACHE, key, signature);
  if (!analysis) {
    const input = (await takeAnalysisInput(c.env.TRACKING_CACHE, key)) ?? (await fetchTracking(c.env, request)).analysisInput;
    analysis = await generateAnalysis(c.env, key, signature, input);
  }

  const result: TrackResult = {
    ...cached,
    analysis,
    analysisPending: false,
    ...resolveEstimates(cached.status, cached.courierEstimate ?? null, analysis, localToday(c.env.TIMEZONE)),
  };
  store(c, key, result);
  return respond(c, result, false);
});

async function lookUpNow(c: Ctx, request: TrackRequest, key: string): Promise<TrackResult> {
  const { snapshot, carrierEstimate, analysisInput } = await fetchTracking(c.env, request);
  const signature = await scansSignature(snapshot.events);
  const analysis =
    snapshot.events.length === 0
      ? null
      : ((await readAnalysis(c.env.TRACKING_CACHE, key, signature)) ??
        (await generateAnalysis(c.env, key, signature, analysisInput)));
  const result: TrackResult = {
    ...snapshot,
    analysis,
    analysisPending: false,
    ...resolveEstimates(snapshot.status, carrierEstimate, analysis, localToday(c.env.TIMEZONE)),
    fetchedAt: new Date().toISOString(),
  };
  store(c, key, result);
  return result;
}

// A missing summary shouldn't cost the user the timeline.
async function generateAnalysis(env: Env, key: string, signature: string, input: unknown): Promise<AiAnalysis | null> {
  const started = Date.now();
  try {
    const analysis = await analyzeTracking(env, input);
    console.log(`Gemini summary written in ${Date.now() - started}ms`);
    await writeAnalysis(env.TRACKING_CACHE, key, signature, analysis);
    return analysis;
  } catch (err) {
    console.error(`Gemini analysis failed after ${Date.now() - started}ms:`, describeError(err));
    return null;
  }
}

function store(c: Ctx, key: string, result: TrackResult): void {
  const ttl = cacheTtlFor(result);
  if (ttl) c.executionCtx.waitUntil(writeCachedResult(c.env.TRACKING_CACHE, key, result, ttl));
}

function respond(c: Ctx, result: TrackResult, cached: boolean) {
  const response: TrackResponse = { ...result, cached };
  return c.json(response);
}
