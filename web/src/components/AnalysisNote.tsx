import type { TrackResponse } from '@shared/api';

interface AnalysisNoteProps {
  result: TrackResponse;
}

export function AnalysisNote({ result }: AnalysisNoteProps) {
  const { analysis } = result;

  return (
    <section
      aria-labelledby="analysis-heading"
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
          <p className="mt-3 text-lg leading-snug font-medium text-pretty sm:text-xl">{analysis.summary}</p>

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
      ) : (
        <p className="mt-3 text-[15px] leading-snug">
          {result.events.length === 0
            ? result.status === 'pending'
              ? 'Still loading this parcel’s history. New parcels can take a minute or two, so try again shortly.'
              : 'Nothing to summarise yet. The courier hasn’t reported any scans for this parcel.'
            : 'The summary isn’t available right now. The scan history is up to date; check again in a few minutes for a summary.'}
        </p>
      )}
    </section>
  );
}
