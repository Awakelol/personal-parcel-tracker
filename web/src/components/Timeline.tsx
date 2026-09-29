import { useMemo, useState } from 'react';
import type { TrackingEvent } from '@shared/api';
import { formatDay, formatTime } from '../lib/format';

interface TimelineProps {
  events: TrackingEvent[];
}

interface DayGroup {
  day: string;
  events: { event: TrackingEvent; isLatest: boolean }[];
}

/** The carrier's scans, grouped by day. `events` arrives oldest first. */
export function Timeline({ events }: TimelineProps) {
  const [newestFirst, setNewestFirst] = useState(true);

  const groups = useMemo(() => {
    const latest = events.at(-1);
    const ordered = newestFirst ? [...events].reverse() : events;
    const result: DayGroup[] = [];
    for (const event of ordered) {
      const day = formatDay(event.timestamp);
      const entry = { event, isLatest: event === latest };
      const current = result.at(-1);
      if (current?.day === day) current.events.push(entry);
      else result.push({ day, events: [entry] });
    }
    return result;
  }, [events, newestFirst]);

  return (
    <section
      aria-labelledby="timeline-heading"
      className="on-paper rounded-sm bg-paper text-ink shadow-[0_1px_0_var(--color-kraft-edge),0_14px_28px_-18px_rgba(0,0,0,0.55)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-4 py-3 sm:px-6">
        <h2 id="timeline-heading" className="font-condensed text-xl font-extrabold uppercase tracking-wide">
          Scan history <span className="font-mono text-sm font-normal text-ink-muted">({events.length})</span>
        </h2>
        {events.length > 1 && (
          <button
            type="button"
            onClick={() => setNewestFirst((v) => !v)}
            aria-label={`Showing ${newestFirst ? 'newest' : 'oldest'} first. Switch order.`}
            className="rounded-sm border border-ink/25 px-2.5 py-1 text-xs font-semibold hover:bg-ink/5"
          >
            {newestFirst ? 'Newest first' : 'Oldest first'} <span aria-hidden="true">⇅</span>
          </button>
        )}
      </header>

      {events.length === 0 ? (
        <p className="px-4 py-6 text-[15px] sm:px-6">
          No scans yet. Couriers usually report the first scan within a day of the label being created.
        </p>
      ) : (
        <div className="px-4 py-2 sm:px-6">
          {groups.map((group) => (
            <div key={group.day} className="py-3">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                {group.day}
              </h3>
              <ol className="mt-2">
                {group.events.map(({ event, isLatest }) => (
                  <li
                    key={`${event.timestamp}|${event.description}`}
                    className="relative grid grid-cols-[4.5rem_1fr] gap-x-4 border-l border-paper-rule py-2 pl-5 sm:grid-cols-[5.5rem_1fr]"
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute top-3 -left-[5px] size-[9px] rounded-full border-2 border-ink ${
                        isLatest ? 'bg-ink' : 'bg-paper'
                      }`}
                    />
                    <time dateTime={event.timestamp} className="font-mono text-[12px] leading-6 text-ink-muted">
                      {formatTime(event.timestamp)}
                    </time>
                    <div className="min-w-0">
                      <p className={`leading-snug ${isLatest ? 'font-semibold' : ''}`}>
                        {event.description}
                        {isLatest && <span className="sr-only"> (latest scan)</span>}
                      </p>
                      {event.location && <p className="mt-0.5 text-sm text-ink-muted">{event.location}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
