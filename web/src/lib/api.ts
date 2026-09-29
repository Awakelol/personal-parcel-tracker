import type { ApiErrorBody, ErrorCode, TrackRequest, TrackResponse } from '@shared/api';

/** Same origin in production (the Worker serves this app); proxied by Vite in dev. */
const TRACK_ENDPOINT = '/api/track';

export class TrackError extends Error {
  readonly code: ErrorCode | 'NETWORK';

  constructor(code: ErrorCode | 'NETWORK', message: string) {
    super(message);
    this.name = 'TrackError';
    this.code = code;
  }
}

export async function trackParcel(request: TrackRequest, signal?: AbortSignal): Promise<TrackResponse> {
  let response: Response;
  try {
    response = await fetch(TRACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new TrackError('NETWORK', "Can't reach the tracking service. Check your connection and try again.");
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new TrackError(error?.code ?? 'INTERNAL_ERROR', error?.message ?? `Tracking failed (HTTP ${response.status}).`);
  }
  return body as TrackResponse;
}
