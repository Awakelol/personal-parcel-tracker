import { useCallback, useEffect, useRef, useState } from 'react';
import type { TrackRequest } from '@shared/api';
import { AnalysisNote } from '../components/AnalysisNote';
import { RouteMap } from '../components/RouteMap';
import { SaveParcelBar } from '../components/SaveParcelBar';
import { SearchBar } from '../components/SearchBar';
import { EmptyState, ErrorState, LoadingState } from '../components/StatePanels';
import { Timeline } from '../components/Timeline';
import { WaybillLabel } from '../components/WaybillLabel';
import { useRecentSearches } from '../hooks/useRecentSearches';
import { useTrack } from '../hooks/useTrack';
import { trackUrl } from '../lib/router';
import { updateSnapshot } from '../lib/savedParcels';

function requestFromUrl(): TrackRequest | null {
  const params = new URLSearchParams(window.location.search);
  const trackingNumber = params.get('n')?.trim();
  if (!trackingNumber) return null;
  const courierCode = params.get('c')?.trim();
  return courierCode ? { trackingNumber, courierCode } : { trackingNumber };
}

export function TrackPage() {
  const [initialRequest] = useState(requestFromUrl);
  const { state, track } = useTrack();
  const { recent, remember, forget } = useRecentSearches();

  const recheckCount = useRef(0);

  const handleTrack = useCallback(
    async (request: TrackRequest) => {
      recheckCount.current = 0;
      window.history.replaceState(null, '', trackUrl(request.trackingNumber, request.courierCode));
      const result = await track(request);
      if (result) {
        remember({ ...request, trackingNumber: result.trackingNumber, courierName: result.courierName });
        updateSnapshot(result);
      }
    },
    [track, remember],
  );

  useEffect(() => {
    if (initialRequest) void handleTrack(initialRequest);
  }, [initialRequest, handleTrack]);

  // New parcels can take a couple of minutes to load upstream, and a failed
  // summary is cached for a minute; check back quietly instead of making the
  // user refresh.
  useEffect(() => {
    if (state.status !== 'success') return;
    const { result, request } = state;
    const stillLoading = result.status === 'pending' && result.events.length === 0;
    const missingSummary = result.events.length > 0 && !result.analysis;
    if (!stillLoading && !missingSummary) return;
    if (recheckCount.current >= (stillLoading ? 8 : 3)) return;

    const timer = setTimeout(
      async () => {
        recheckCount.current++;
        const fresh = await track(request, { silent: true });
        if (fresh) updateSnapshot(fresh);
      },
      stillLoading ? 15_000 : 65_000,
    );
    return () => clearTimeout(timer);
  }, [state, track]);

  const route = state.status === 'success' ? (state.result.analysis?.route ?? []) : [];

  return (
    <>
      <SearchBar
        initial={initialRequest}
        isLoading={state.status === 'loading'}
        recent={recent}
        onTrack={(request) => void handleTrack(request)}
        onForget={forget}
      />

      <div className="mt-10" aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'idle' && <EmptyState />}

        {state.status === 'loading' && <LoadingState trackingNumber={state.request.trackingNumber} />}

        {state.status === 'error' && (
          <ErrorState error={state.error} onRetry={() => void handleTrack(state.request)} />
        )}

        {state.status === 'success' && (
          <div key={state.result.fetchedAt + state.result.trackingNumber} className="space-y-6">
            <SaveParcelBar result={state.result} courierCode={state.request.courierCode} />
            <div className="grid items-start gap-6 md:grid-cols-[1.35fr_1fr]">
              <AnalysisNote result={state.result} />
              <WaybillLabel result={state.result} />
            </div>
            <div className={route.length > 0 ? 'grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]' : ''}>
              {route.length > 0 && <RouteMap stops={route} />}
              <Timeline events={state.result.events} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
