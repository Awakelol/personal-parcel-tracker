import type { AiAnalysis, TrackingEvent } from '../../../shared/api';
import { describeError } from '../errors';

// Summaries are keyed by the exact scans they describe, so Gemini only runs
// again when a parcel gets new scans. Bump the version when the prompt changes.
const ANALYSIS_VERSION = 'a1';
const ANALYSIS_TTL_SECONDS = 30 * 24 * 60 * 60;
const INPUT_TTL_SECONDS = 10 * 60;

export async function scansSignature(events: TrackingEvent[]): Promise<string> {
  const text = events.map((e) => `${e.timestamp}|${e.description}`).join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const analysisKey = (trackKey: string, signature: string) => `analysis:${ANALYSIS_VERSION}:${trackKey}:${signature}`;
const inputKey = (trackKey: string) => `analysis-input:${trackKey}`;

export async function readAnalysis(kv: KVNamespace, trackKey: string, signature: string): Promise<AiAnalysis | null> {
  try {
    return await kv.get<AiAnalysis>(analysisKey(trackKey, signature), 'json');
  } catch (err) {
    console.warn('KV read failed:', describeError(err));
    return null;
  }
}

export async function writeAnalysis(kv: KVNamespace, trackKey: string, signature: string, analysis: AiAnalysis) {
  try {
    await kv.put(analysisKey(trackKey, signature), JSON.stringify(analysis), { expirationTtl: ANALYSIS_TTL_SECONDS });
  } catch (err) {
    console.warn('KV write failed:', describeError(err));
  }
}

/** Keeps the (PII-free) Gemini input around while the summary is written separately. */
export async function stashAnalysisInput(kv: KVNamespace, trackKey: string, input: unknown) {
  try {
    await kv.put(inputKey(trackKey), JSON.stringify(input), { expirationTtl: INPUT_TTL_SECONDS });
  } catch (err) {
    console.warn('KV write failed:', describeError(err));
  }
}

export async function takeAnalysisInput(kv: KVNamespace, trackKey: string): Promise<unknown | null> {
  try {
    return await kv.get(inputKey(trackKey), 'json');
  } catch {
    return null;
  }
}
