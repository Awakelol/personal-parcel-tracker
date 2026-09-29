import type { TrackRequest, TrackingSnapshot } from '../../../shared/api';
import type { Env } from '../env';
import { AppError } from '../errors';

export interface TrackingLookup {
  /** Normalised timeline returned to the dashboard. */
  snapshot: TrackingSnapshot;
  /** Raw TrackingMore payload, forwarded to Gemini for analysis. */
  raw: unknown;
}

/** Fetches the raw timeline from TrackingMore. Implemented in Phase 2. */
export async function fetchTracking(_env: Env, _request: TrackRequest): Promise<TrackingLookup> {
  throw new AppError(501, 'NOT_IMPLEMENTED', 'TrackingMore integration is not implemented yet.');
}
