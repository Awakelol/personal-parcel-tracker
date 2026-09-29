import { useMemo, useState } from 'react';
import type { RouteStop, RouteStopRole } from '@shared/api';
import { PH_MAP, projectToMap } from '../lib/phMap';

interface RouteMapProps {
  stops: RouteStop[];
}

interface Point extends RouteStop {
  x: number;
  y: number;
}

const ROLE_LABELS: Record<RouteStopRole, string> = {
  origin: 'From',
  visited: 'Passed',
  current: 'Now',
  next: 'Next',
  destination: 'Destination',
};

/** Screen size of markers/text, in px at the full-country zoom (map rendered ~340px wide). */
const UNITS_PER_PX = PH_MAP.width / 340;
const MIN_ZOOM_HEIGHT = 170;

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) if (predicate(items[i]!)) return i;
  return -1;
}

/** Viewbox around the route, same aspect ratio as the full map so nothing letterboxes. */
function routeViewBox(points: Point[]): [number, number, number, number] {
  const aspect = PH_MAP.width / PH_MAP.height;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const height = Math.max(MIN_ZOOM_HEIGHT, (maxY - minY) * 1.5, ((maxX - minX) * 1.5) / aspect);
  const width = height * aspect;
  return [(minX + maxX) / 2 - width / 2, (minY + maxY) / 2 - height / 2, width, height];
}

/** The parcel's journey on a map of the Philippines. Stops come from Gemini's reading of the scans. */
export function RouteMap({ stops }: RouteMapProps) {
  const [zoomed, setZoomed] = useState(false);

  const points = useMemo<Point[]>(() => stops.map((s) => ({ ...s, ...projectToMap(s.lat, s.lng) })), [stops]);

  // Where the parcel was last seen: the "current" stop, else the last place it passed.
  const currentIndex = findLastIndex(points, (p) => p.role === 'current');
  const lastSeenIndex =
    currentIndex >= 0 ? currentIndex : findLastIndex(points, (p) => p.role === 'origin' || p.role === 'visited');
  const traveled = lastSeenIndex >= 0 ? points.slice(0, lastSeenIndex + 1) : [];
  const ahead = points.slice(Math.max(lastSeenIndex, 0));
  const lastSeen = points[lastSeenIndex];
  const final = points.at(-1);

  const viewBox = zoomed ? routeViewBox(points) : ([0, 0, PH_MAP.width, PH_MAP.height] as const);
  const scale = viewBox[2] / PH_MAP.width; // shrink markers/text as we zoom in
  const px = (n: number) => n * UNITS_PER_PX * scale;

  const toPolyline = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

  const labelled = [lastSeen, final !== lastSeen ? final : undefined].filter((p): p is Point => !!p);
  const describe = [
    lastSeen && `last seen near ${lastSeen.name}`,
    final && final !== lastSeen && `heading to ${final.name}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <section
      aria-labelledby="route-heading"
      className="on-paper rounded-sm bg-paper text-ink shadow-[0_1px_0_var(--color-kraft-edge),0_14px_28px_-18px_rgba(0,0,0,0.55)]"
    >
      <header className="flex items-center justify-between gap-3 border-b-2 border-ink px-4 py-3">
        <h2 id="route-heading" className="font-condensed text-xl font-extrabold uppercase tracking-wide">
          Route
        </h2>
        <button
          type="button"
          onClick={() => setZoomed((z) => !z)}
          aria-pressed={zoomed}
          className="rounded-sm border border-ink/25 px-2.5 py-1 text-xs font-semibold hover:bg-ink/5"
        >
          {zoomed ? 'Show whole country' : 'Zoom to route'}
        </button>
      </header>

      <svg
        viewBox={viewBox.join(' ')}
        role="img"
        aria-label={`Map of the Philippines: ${describe || 'route'}.`}
        className="block aspect-[585/1014] w-full"
      >
        <path d={PH_MAP.path} className="fill-land stroke-ink/40" strokeWidth={0.75} vectorEffect="non-scaling-stroke" />

        {traveled.length > 1 && (
          <polyline
            points={toPolyline(traveled)}
            fill="none"
            className="stroke-ink"
            strokeWidth={2.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {ahead.length > 1 && (
          <polyline
            points={toPolyline(ahead)}
            fill="none"
            className="stroke-ink"
            strokeWidth={2}
            strokeDasharray="5 5"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {points.map((p, index) => {
          const isLastSeen = index === lastSeenIndex;
          const isAhead = index > lastSeenIndex;
          return (
            <g key={`${p.name}-${index}`}>
              {isLastSeen && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={px(9)}
                  className="animate-ping fill-sticker/70 [transform-box:fill-box] [transform-origin:center] motion-reduce:hidden"
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={px(isLastSeen ? 6 : isAhead ? 5 : 3.5)}
                className={`stroke-ink ${isLastSeen ? 'fill-sticker' : isAhead ? 'fill-paper' : 'fill-ink'}`}
                strokeWidth={isLastSeen ? 2.5 : 2}
                vectorEffect="non-scaling-stroke"
              />
              {p.role === 'destination' && <circle cx={p.x} cy={p.y} r={px(2)} className="fill-ink" />}
            </g>
          );
        })}

        {labelled.map((p) => {
          const onRight = p.x < viewBox[0] + viewBox[2] * 0.62;
          return (
            <text
              key={`label-${p.name}`}
              x={p.x + (onRight ? px(10) : -px(10))}
              y={p.y + px(4)}
              textAnchor={onRight ? 'start' : 'end'}
              className="fill-ink font-mono font-semibold"
              style={{ fontSize: px(11), paintOrder: 'stroke', stroke: 'var(--color-paper)', strokeWidth: px(3) }}
            >
              {p.name.split(',')[0]}
            </text>
          );
        })}
      </svg>

      <ol className="space-y-1.5 border-t border-paper-rule px-4 py-3 text-sm">
        {points.map((p, index) => (
          <li key={`${p.name}-${index}`} className="grid grid-cols-[4.75rem_1fr] gap-2">
            <span className="font-mono text-[11px] leading-5 font-semibold uppercase tracking-wider text-ink-muted">
              {index === lastSeenIndex && p.role !== 'current' ? 'Last seen' : ROLE_LABELS[p.role]}
            </span>
            <span className={index === lastSeenIndex ? 'font-semibold' : ''}>{p.name}</span>
          </li>
        ))}
      </ol>
      <p className="border-t border-paper-rule px-4 py-2 text-[11px] text-ink-muted">
        Places read from the scans by Gemini; positions are approximate. Map: Natural Earth.
      </p>
    </section>
  );
}
