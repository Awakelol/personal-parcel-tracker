import type { ParcelLocation, Place, TrackResponse } from '@shared/api';

interface AnalysisNoteProps {
  result: TrackResponse;
}

function PlaceLine({ label, place }: { label: string; place: Place }) {
  return (
    <div className="grid grid-cols-[3.25rem_1fr] gap-x-3 py-1.5">
      <dt className="text-xs leading-6 font-bold uppercase tracking-[0.14em]">{label}</dt>
      <dd>
        {place.facility && <span className="block font-mono text-[13px] leading-6 font-semibold break-words">{place.facility}</span>}
        {place.area && <span className="block text-[15px] leading-snug">{place.area}</span>}
      </dd>
    </div>
  );
}

function WhereItIs({ location }: { location: ParcelLocation }) {
  const heading = {
    at_facility: 'At a facility',
    in_transit: 'In transit',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    unknown: 'Last seen',
  }[location.state];

  const lines: [string, Place][] =
    location.state === 'in_transit' && (location.from || location.to)
      ? [
          ...(location.from ? [['From', location.from] as [string, Place]] : []),
          ...(location.to ? [['To', location.to] as [string, Place]] : []),
        ]
      : location.current
        ? [[location.state === 'delivered' ? 'In' : 'At', location.current]]
        : [];

  if (lines.length === 0) return null;

  return (
    <div className="mt-4 border-y-2 border-ink/80 py-2">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink/70">Where it is · {heading}</p>
      <dl className="mt-1 divide-y divide-ink/15">
        {lines.map(([label, place]) => (
          <PlaceLine key={label} label={label} place={place} />
        ))}
      </dl>
    </div>
  );
}

export function AnalysisNote({ result }: AnalysisNoteProps) {
  const { analysis } = result;

  return (
    <section
      aria-labelledby="analysis-heading"
      aria-busy={result.analysisPending}
      className="on-paper animate-print rounded-sm bg-sticker p-5 text-ink shadow-[0_14px_28px_-18px_rgba(0,0,0,0.55)] sm:p-6"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="analysis-heading" className="font-condensed text-xl font-extrabold uppercase tracking-wide">
          What's happening
        </h2>
        <p className="text-xs font-medium text-ink/70">Summary by Gemini, based on the scans below</p>
      </header>

      {analysis ? (
        <>
          {analysis.location && <WhereItIs location={analysis.location} />}

          <p className="mt-4 text-lg leading-snug font-medium text-pretty sm:text-xl">{analysis.summary}</p>

          {analysis.nextSteps.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em]">Likely next steps</h3>
              <ol className="mt-2 space-y-1.5">
                {analysis.nextSteps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-[15px] leading-snug">
                    <span className="font-mono text-xs leading-[1.6] text-ink/60">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {analysis.jargon.length > 0 && (
            <div className="mt-5 border-t border-ink/15 pt-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em]">Terms in the scans</h3>
              <dl className="mt-2 space-y-2 text-sm leading-snug">
                {analysis.jargon.map(({ term, explanation }) => (
                  <div key={term}>
                    <dt className="inline font-mono text-[12px] font-semibold">{term}</dt>
                    <dd className="inline"> — {explanation}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </>
      ) : result.analysisPending ? (
        <div className="mt-4 space-y-2" role="status">
          <p className="text-[15px] leading-snug">Writing the summary… the scans are already below.</p>
          <div className="h-3 w-11/12 animate-pulse rounded-sm bg-ink/10 motion-reduce:animate-none" />
          <div className="h-3 w-3/4 animate-pulse rounded-sm bg-ink/10 motion-reduce:animate-none" />
        </div>
      ) : (
        <p className="mt-3 text-[15px] leading-snug">
          {result.events.length === 0
            ? result.status === 'pending'
              ? 'Still loading this parcel’s history. New parcels can take a minute or two; this page checks again on its own.'
              : 'Nothing to summarise yet. The courier hasn’t reported any scans for this parcel.'
            : 'The summary isn’t available right now. The scan history is up to date, and this page will try the summary again in a minute.'}
        </p>
      )}
    </section>
  );
}
