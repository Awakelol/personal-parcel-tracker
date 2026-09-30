import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AiAnalysis, DateRange, TrackRequest, TrackResponse, TrackResult, TrackingSnapshot } from '../../../shared/api';
import type { AppBindings, Env } from '../env';
import { describeError } from '../errors';
import { readAnalysis, scansSignature, stashAnalysisInput, takeAnalysisInput, writeAnalysis } from '../lib/analysisCache';
import { cacheKey, cacheTtlFor, readCachedResult, writeCachedResult } from '../lib/cache';
import { localToday, resolveEstimates } from '../lib/estimate';
import type { Estimates } from '../lib/estimate';
import { extractJourney, historyEstimate, learnAreas, recordJourney, routeFacts } from '../lib/knowledge';
import { readJsonBody } from '../lib/request';
import { parseDestination, parseTrackRequest } from '../lib/validation';
import { analyzeTracking } from '../services/gemini';
import { fetchTracking } from '../services/tracking';

type Ctx = Context<AppBindings>;
type Parcel = Pick<TrackingSnapshot, 'trackingNumber' | 'courierCode' | 'status' | 'events'>;

export const trackRoute = new Hono<AppBindings>();

trackRoute.post('/', async (c) => {
  const body = (await readJsonBody(c.req)) as Record<string, unknown>;
  const request = parseTrackRequest(body);
  const destination = parseDestination(body.destination);
  const key = cacheKey(request);

  if (body.fresh !== true && !destination) {
    const cached = await readCachedResult(c.env.TRACKING_CACHE, key);
    if (cached) return respond(c, cached, true);
  }

  const { snapshot, carrierEstimate, analysisInput } = await fetchTracking(c.env, request);
  learnFrom(c, snapshot, destination);
  const signature = await scansSignature(snapshot.events, destination);
  let analysis = snapshot.events.length > 0 ? await readAnalysis(c.env.TRACKING_CACHE, key, signature) : null;
  let analysisPending = false;

  if (!analysis && snapshot.events.length > 0) {
    if (body.deferAnalysis === true) {
      analysisPending = true;
      c.executionCtx.waitUntil(stashAnalysisInput(c.env.TRACKING_CACHE, key, analysisInput));
    } else {
      analysis = await generateAnalysis(c.env, key, signature, analysisInput, snapshot, destination);
    }
  }

  const result: TrackResult = {
    ...snapshot,
    analysis,
    analysisPending,
    ...(await estimates(c.env, snapshot, carrierEstimate, analysis, destination)),
    fetchedAt: new Date().toISOString(),
  };
  store(c, key, result);
  return respond(c, result, false);
});

// Second half of a deferred lookup: writes (or finds) the summary.
trackRoute.post('/analysis', async (c) => {
  const body = (await readJsonBody(c.req)) as Record<string, unknown>;
  const request = parseTrackRequest(body);
  const destination = parseDestination(body.destination);
  const key = cacheKey(request);

  const cached = await readCachedResult(c.env.TRACKING_CACHE, key);
  if (!cached) return respond(c, await lookUpNow(c, request, key, destination), false);
  if ((cached.analysis && !destination) || cached.events.length === 0) {
    return respond(c, { ...cached, analysisPending: false }, true);
  }

  const signature = await scansSignature(cached.events, destination);
  let analysis = await readAnalysis(c.env.TRACKING_CACHE, key, signature);
  if (!analysis) {
    const input = (await takeAnalysisInput(c.env.TRACKING_CACHE, key)) ?? (await fetchTracking(c.env, request)).analysisInput;
    analysis = await generateAnalysis(c.env, key, signature, input, cached, destination);
  }

  const result: TrackResult = {
    ...cached,
    analysis,
    analysisPending: false,
    ...(await estimates(c.env, cached, cached.courierEstimate ?? null, analysis, destination)),
  };
  store(c, key, result);
  return respond(c, result, false);
});

async function lookUpNow(c: Ctx, request: TrackRequest, key: string, destination?: string): Promise<TrackResult> {
  const { snapshot, carrierEstimate, analysisInput } = await fetchTracking(c.env, request);
  learnFrom(c, snapshot, destination);
  const signature = await scansSignature(snapshot.events, destination);
  const analysis =
    snapshot.events.length === 0
      ? null
      : ((await readAnalysis(c.env.TRACKING_CACHE, key, signature)) ??
        (await generateAnalysis(c.env, key, signature, analysisInput, snapshot, destination)));
  const result: TrackResult = {
    ...snapshot,
    analysis,
    analysisPending: false,
    ...(await estimates(c.env, snapshot, carrierEstimate, analysis, destination)),
    fetchedAt: new Date().toISOString(),
  };
  store(c, key, result);
  return result;
}

// Every lookup adds its hubs and legs to the shared, per-courier history.
function learnFrom(c: Ctx, parcel: Parcel, destination: string | undefined): void {
  const journey = extractJourney(parcel.events, parcel.status);
  c.executionCtx.waitUntil(recordJourney(c.env.KNOWLEDGE, parcel.courierCode, parcel.trackingNumber, journey, destination));
}

async function estimates(
  env: Env,
  parcel: Parcel,
  carrierEstimate: DateRange | null,
  analysis: AiAnalysis | null,
  destination: string | undefined,
): Promise<Estimates> {
  const journey = extractJourney(parcel.events, parcel.status);
  const history = await historyEstimate(env.KNOWLEDGE, parcel.courierCode, journey, destination, env.TIMEZONE || 'Asia/Manila');
  return resolveEstimates(parcel.status, carrierEstimate, analysis, localToday(env.TIMEZONE), history);
}

// A missing summary shouldn't cost the user the timeline.
async function generateAnalysis(
  env: Env,
  key: string,
  signature: string,
  input: unknown,
  parcel: Parcel,
  destination?: string,
): Promise<AiAnalysis | null> {
  const started = Date.now();
  try {
    const journey = extractJourney(parcel.events, parcel.status);
    const facts = await routeFacts(env.KNOWLEDGE, parcel.courierCode, journey);
    const analysis = await analyzeTracking(env, input, parcel.events.at(-1), destination, facts);
    console.log(`Gemini summary written in ${Date.now() - started}ms${facts ? ' (with route history)' : ''}`);
    await Promise.all([
      writeAnalysis(env.TRACKING_CACHE, key, signature, analysis),
      learnAreas(env.KNOWLEDGE, parcel.courierCode, analysis.location),
    ]);
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
