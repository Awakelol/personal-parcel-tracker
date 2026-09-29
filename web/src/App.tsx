import { useCallback, useEffect, useState } from 'react';
import type { TrackRequest } from '@shared/api';
import { AnalysisNote } from './components/AnalysisNote';
import { SearchBar } from './components/SearchBar';
import { EmptyState, ErrorState, LoadingState } from './components/StatePanels';
import { Timeline } from './components/Timeline';
import { WaybillLabel } from './components/WaybillLabel';
import { useRecentSearches } from './hooks/useRecentSearches';
import { useTrack } from './hooks/useTrack';

/** `?n=<tracking number>&c=<courier>` makes a lookup bookmarkable. */
function requestFromUrl(): TrackRequest | null {
  const params = new URLSearchParams(window.location.search);
  const trackingNumber = params.get('n')?.trim();
  if (!trackingNumber) return null;
  const courierCode = params.get('c')?.trim();
  return courierCode ? { trackingNumber, courierCode } : { trackingNumber };
}

function writeUrl(request: TrackRequest): void {
  const params = new URLSearchParams({ n: request.trackingNumber });
  if (request.courierCode) params.set('c', request.courierCode);
  window.history.replaceState(null, '', `?${params.toString()}`);
}

export function App() {
  const [initialRequest] = useState(requestFromUrl);
  const { state, track } = useTrack();
  const { recent, remember, forget } = useRecentSearches();

  const handleTrack = useCallback(
    async (request: TrackRequest) => {
      writeUrl(request);
      const result = await track(request);
      if (result) {
        remember({ ...request, trackingNumber: result.trackingNumber, courierName: result.courierName });
      }
    },
    [track, remember],
  );

  useEffect(() => {
    // Only on first load; StrictMode's double run is harmless because a new
    // lookup cancels the one in flight.
    if (initialRequest) void handleTrack(initialRequest);
  }, [initialRequest, handleTrack]);

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      <header className="mb-8">
        <h1 className="font-condensed text-4xl leading-none font-black uppercase tracking-tight sm:text-5xl">
          Parcel tracker
        </h1>
        <p className="mt-2 text-[15px] text-on-page-muted">Where your parcels are, and what happens next.</p>
      </header>

      <SearchBar
        initial={initialRequest}
        isLoading={state.status === 'loading'}
        recent={recent}
        onTrack={(request) => void handleTrack(request)}
        onForget={forget}
      />

      <main className="mt-10" aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'idle' && <EmptyState />}

        {state.status === 'loading' && <LoadingState trackingNumber={state.request.trackingNumber} />}

        {state.status === 'error' && (
          <ErrorState error={state.error} onRetry={() => void handleTrack(state.request)} />
        )}

        {state.status === 'success' && (
          <div key={state.result.fetchedAt + state.result.trackingNumber} className="space-y-6">
            <div className="grid items-start gap-6 md:grid-cols-[1.35fr_1fr]">
              <AnalysisNote result={state.result} />
              <WaybillLabel result={state.result} />
            </div>
            <Timeline events={state.result.events} />
          </div>
        )}
      </main>
    </div>
  );
}
