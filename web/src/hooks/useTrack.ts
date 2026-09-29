import { useCallback, useRef, useState } from 'react';
import type { TrackRequest, TrackResponse } from '@shared/api';
import { ApiError, fetchAnalysis, trackParcel } from '../lib/api';

export type TrackState =
  | { status: 'idle' }
  | { status: 'loading'; request: TrackRequest }
  | { status: 'success'; request: TrackRequest; result: TrackResponse }
  | { status: 'error'; request: TrackRequest; error: ApiError };

export function useTrack() {
  const [state, setState] = useState<TrackState>({ status: 'idle' });
  const inFlight = useRef<AbortController | null>(null);

  // `silent` refreshes in the background: no loading state, errors ignored.
  const track = useCallback(async (request: TrackRequest, { silent = false } = {}): Promise<TrackResponse | null> => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    if (!silent) setState({ status: 'loading', request });
    try {
      const result = await trackParcel(request, controller.signal);
      setState({ status: 'success', request, result });
      if (!result.analysisPending) return result;

      // Scans are on screen; now wait for the summary.
      try {
        const full = await fetchAnalysis(request, controller.signal);
        setState({ status: 'success', request, result: full });
        return full;
      } catch {
        if (controller.signal.aborted) return null;
        const withoutSummary = { ...result, analysisPending: false };
        setState({ status: 'success', request, result: withoutSummary });
        return withoutSummary;
      }
    } catch (err) {
      if (controller.signal.aborted || silent) return null;
      const error =
        err instanceof ApiError ? err : new ApiError('INTERNAL_ERROR', 'Tracking failed unexpectedly. Try again.');
      setState({ status: 'error', request, error });
      return null;
    }
  }, []);

  return { state, track };
}
