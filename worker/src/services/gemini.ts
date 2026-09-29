import type { AiAnalysis } from '../../../shared/api';
import type { Env } from '../env';
import { AppError } from '../errors';

/** Asks Gemini to analyse the raw TrackingMore JSON. Implemented in Phase 2. */
export async function analyzeTracking(_env: Env, _rawTracking: unknown): Promise<AiAnalysis> {
  throw new AppError(501, 'NOT_IMPLEMENTED', 'Gemini integration is not implemented yet.');
}
