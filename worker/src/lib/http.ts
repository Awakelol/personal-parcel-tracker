import { AppError } from '../errors';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface JsonResponse {
  status: number;
  body: unknown;
}

/**
 * fetch() with a timeout that always parses the body as JSON, regardless of
 * HTTP status — both upstreams report errors inside the JSON body.
 * `source` names the upstream in client-facing error messages.
 */
export async function fetchJson(
  url: string,
  init: RequestInit,
  source: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<JsonResponse> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
    throw upstreamError(timedOut ? `${source} timed out.` : `Could not reach ${source}.`);
  }

  if (response.status === 429) {
    throw new AppError(429, 'RATE_LIMITED', `${source} rate limit reached. Try again shortly.`);
  }

  try {
    return { status: response.status, body: await response.json() };
  } catch {
    throw upstreamError(`${source} returned a non-JSON response (HTTP ${response.status}).`);
  }
}

export function upstreamError(message: string): AppError {
  return new AppError(502, 'UPSTREAM_ERROR', message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
