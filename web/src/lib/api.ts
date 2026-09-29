import type {
  Account,
  ApiErrorBody,
  ErrorCode,
  SaveParcelRequest,
  SavedParcel,
  SavedParcelWithLatest,
  TrackRequest,
  TrackResponse,
} from '@shared/api';

export class ApiError extends Error {
  readonly code: ErrorCode | 'NETWORK';

  constructor(code: ErrorCode | 'NETWORK', message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

const SESSION_EXPIRED = 'Your login has expired. Reload the page to log in again.';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    // Access answers an expired session with a redirect to its login page;
    // don't follow it into a cross-origin fetch.
    response = await fetch(path, { ...init, redirect: 'manual' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('NETWORK', "Can't reach the server. Check your connection and try again.");
  }

  if (response.type === 'opaqueredirect' || response.status === 401) {
    throw new ApiError('UNAUTHORIZED', SESSION_EXPIRED);
  }
  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ApiError(error?.code ?? 'INTERNAL_ERROR', error?.message ?? `Request failed (HTTP ${response.status}).`);
  }
  return body as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export function trackParcel(req: TrackRequest, signal?: AbortSignal): Promise<TrackResponse> {
  return request('/api/track', { ...jsonInit('POST', req), signal });
}

export function getAccount(): Promise<Account> {
  return request('/api/me');
}

export function listParcels(): Promise<SavedParcelWithLatest[]> {
  return request('/api/parcels');
}

export function putParcel(trackingNumber: string, body: SaveParcelRequest): Promise<SavedParcel> {
  return request(`/api/parcels/${encodeURIComponent(trackingNumber)}`, jsonInit('PUT', body));
}

export function deleteParcel(trackingNumber: string): Promise<void> {
  return request(`/api/parcels/${encodeURIComponent(trackingNumber)}`, { method: 'DELETE' });
}
