import type { DateRange, ParcelLocation, ParcelStatus, TrackingEvent } from '../../../shared/api';
import { describeError } from '../errors';

// Learned from every tracked parcel (shared across accounts): which facility
// sits where, which hub-to-hub legs couriers use, and how long they take.
// Only courier, facility names, timings and destination areas are stored;
// parcels are identified by a one-way hash so legs aren't counted twice.

const MIN_OBSERVATIONS = 3;
const MAX_PATH_LEGS = 4;

export interface Arrival {
  facility: string;
  area: string | null;
  time: number;
}

export interface Journey {
  arrivals: Arrival[];
  /** Set when the latest scan says "in transit from A to B". */
  headingTo: string | null;
  deliveredAt: number | null;
}

export interface RouteFacts {
  /** Facts only ever come from parcels of this same courier. */
  courier: string;
  last_hub: { facility: string; area: string | null } | null;
  heading_to: { facility: string; area: string | null; times_seen: number; typical_hours: number | null } | null;
  usual_next_hops: { facility: string; area: string | null; times_seen: number; typical_hours: number }[];
}

export interface HistoryEstimate extends DateRange {
  basedOn: number;
}

// --- Reading scans ------------------------------------------------------------

const ARRIVED_AT_FACILITY = /arrived at (?:the )?sorting facility\s*:\s*(.+?)\.?$/i;
const HAS_ARRIVED = /has arrived (?!and\b|at\b)([A-Z0-9][^,.]*[^\s,.])/;
const IN_TRANSIT_FROM_TO = /in transit from (.+?) to (.+?)\.?$/i;
const DELIVERED = /\bdelivered\b/i;

/** Pulls the facility sequence out of normalised scans (oldest first). */
export function extractJourney(events: TrackingEvent[], status: ParcelStatus): Journey {
  const arrivals: Arrival[] = [];
  let deliveredAt: number | null = null;

  for (const event of events) {
    const time = Date.parse(event.timestamp);
    if (Number.isNaN(time)) continue;
    const match = ARRIVED_AT_FACILITY.exec(event.description) ?? HAS_ARRIVED.exec(event.description);
    if (match?.[1]) {
      const facility = match[1].trim();
      // SPX puts the facility name in the location field; that isn't an area.
      const area = event.location && event.location !== facility ? event.location : null;
      if (arrivals.at(-1)?.facility !== facility) arrivals.push({ facility, area, time });
    }
    if (DELIVERED.test(event.description) && !/undelivered|not delivered/i.test(event.description)) {
      deliveredAt = time;
    }
  }

  const latest = events.at(-1);
  const transit = latest ? IN_TRANSIT_FROM_TO.exec(latest.description) : null;
  return {
    arrivals,
    headingTo: transit?.[2]?.trim() ?? null,
    deliveredAt: status === 'delivered' ? deliveredAt ?? (latest ? Date.parse(latest.timestamp) : null) : null,
  };
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// --- Storage (D1) ---------------------------------------------------------------

let schemaReady: Promise<unknown> | null = null;

function ensureSchema(db: D1Database): Promise<unknown> {
  schemaReady ??= db
    .batch([
      db.prepare('CREATE TABLE IF NOT EXISTS hubs (courier TEXT NOT NULL, facility TEXT NOT NULL, area TEXT, updated_at TEXT, PRIMARY KEY (courier, facility))'),
      db.prepare('CREATE TABLE IF NOT EXISTS legs (parcel TEXT NOT NULL, courier TEXT NOT NULL, from_facility TEXT NOT NULL, to_facility TEXT NOT NULL, hours REAL NOT NULL, observed_at TEXT NOT NULL, PRIMARY KEY (parcel, from_facility, to_facility))'),
      db.prepare('CREATE INDEX IF NOT EXISTS legs_by_from ON legs (courier, from_facility)'),
      db.prepare('CREATE TABLE IF NOT EXISTS last_mile (parcel TEXT PRIMARY KEY, courier TEXT NOT NULL, facility TEXT NOT NULL, dest_area TEXT, hours REAL NOT NULL, observed_at TEXT NOT NULL)'),
      db.prepare('CREATE INDEX IF NOT EXISTS last_mile_by_facility ON last_mile (courier, facility)'),
    ])
    .catch((err) => {
      schemaReady = null;
      throw err;
    });
  return schemaReady;
}

async function parcelId(courier: string, trackingNumber: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${courier}|${trackingNumber}`));
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function recordJourney(
  db: D1Database,
  courier: string,
  trackingNumber: string,
  journey: Journey,
  destination: string | undefined,
): Promise<void> {
  if (journey.arrivals.length === 0 || courier === 'unknown') return;
  try {
    await ensureSchema(db);
    const parcel = await parcelId(courier, trackingNumber);
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];

    for (const arrival of journey.arrivals) {
      statements.push(
        db
          .prepare(
            'INSERT INTO hubs (courier, facility, area, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (courier, facility) DO UPDATE SET area = COALESCE(hubs.area, excluded.area), updated_at = excluded.updated_at',
          )
          .bind(courier, arrival.facility, arrival.area, now),
      );
    }
    for (let i = 1; i < journey.arrivals.length; i++) {
      const from = journey.arrivals[i - 1]!;
      const to = journey.arrivals[i]!;
      const hours = (to.time - from.time) / 3_600_000;
      if (hours <= 0 || hours > 24 * 30) continue;
      statements.push(
        db
          .prepare('INSERT OR IGNORE INTO legs (parcel, courier, from_facility, to_facility, hours, observed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
          .bind(parcel, courier, from.facility, to.facility, hours, now),
      );
    }
    const last = journey.arrivals.at(-1)!;
    if (journey.deliveredAt && journey.deliveredAt > last.time) {
      statements.push(
        db
          .prepare('INSERT OR IGNORE INTO last_mile (parcel, courier, facility, dest_area, hours, observed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
          .bind(parcel, courier, last.facility, destination ?? null, (journey.deliveredAt - last.time) / 3_600_000, now),
      );
    }
    await db.batch(statements);
  } catch (err) {
    console.warn('Recording journey failed:', describeError(err));
  }
}

/** Fills in areas for hubs the scans didn't locate, from Gemini's reading. */
export async function learnAreas(db: D1Database, courier: string, location: ParcelLocation | null): Promise<void> {
  const places = [location?.current, location?.from, location?.to].filter((p) => p?.facility && p.area);
  if (places.length === 0) return;
  try {
    await ensureSchema(db);
    await db.batch(
      places.map((p) =>
        db.prepare('UPDATE hubs SET area = ?3 WHERE courier = ?1 AND facility = ?2 AND area IS NULL').bind(courier, p!.facility, p!.area),
      ),
    );
  } catch (err) {
    console.warn('Learning hub areas failed:', describeError(err));
  }
}

// --- Recall ---------------------------------------------------------------------

async function hubArea(db: D1Database, courier: string, facility: string): Promise<string | null> {
  const row = await db.prepare('SELECT area FROM hubs WHERE courier = ?1 AND facility = ?2').bind(courier, facility).first<{ area: string | null }>();
  return row?.area ?? null;
}

async function legStats(db: D1Database, courier: string, from: string) {
  const { results } = await db
    .prepare('SELECT to_facility, hours FROM legs WHERE courier = ?1 AND from_facility = ?2 ORDER BY observed_at DESC LIMIT 500')
    .bind(courier, from)
    .all<{ to_facility: string; hours: number }>();
  const byTo = new Map<string, number[]>();
  for (const row of results) byTo.set(row.to_facility, [...(byTo.get(row.to_facility) ?? []), row.hours]);
  return [...byTo].map(([to, hours]) => ({ to, count: hours.length, typicalHours: median(hours) }));
}

/** Short, relevant facts for Gemini: the parcel's hub, where it's heading, and usual next hops. */
export async function routeFacts(db: D1Database, courier: string, journey: Journey): Promise<RouteFacts | null> {
  const last = journey.arrivals.at(-1);
  if (!last || courier === 'unknown') return null;
  try {
    await ensureSchema(db);
    const round = (h: number) => Math.round(h * 10) / 10;
    const fromLast = await legStats(db, courier, last.facility);
    const heading = journey.headingTo ? fromLast.find((s) => s.to === journey.headingTo) : undefined;
    const hopsFrom = journey.headingTo ? await legStats(db, courier, journey.headingTo) : fromLast;

    const facts: RouteFacts = {
      courier,
      last_hub: { facility: last.facility, area: last.area ?? (await hubArea(db, courier, last.facility)) },
      heading_to: journey.headingTo
        ? {
            facility: journey.headingTo,
            area: await hubArea(db, courier, journey.headingTo),
            times_seen: heading?.count ?? 0,
            typical_hours: heading ? round(heading.typicalHours) : null,
          }
        : null,
      usual_next_hops: await Promise.all(
        hopsFrom
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
          .map(async (s) => ({
            facility: s.to,
            area: await hubArea(db, courier, s.to),
            times_seen: s.count,
            typical_hours: round(s.typicalHours),
          })),
      ),
    };
    return facts.heading_to || facts.usual_next_hops.length > 0 || facts.last_hub?.area ? facts : null;
  } catch (err) {
    console.warn('Reading route facts failed:', describeError(err));
    return null;
  }
}

/**
 * Arrival window from past parcels: the known legs from the parcel's last hub
 * to a hub in the destination area, plus that hub's usual last mile. Only used
 * when every step has been seen at least MIN_OBSERVATIONS times.
 */
export async function historyEstimate(
  db: D1Database,
  courier: string,
  journey: Journey,
  destination: string | undefined,
  timeZone: string,
): Promise<HistoryEstimate | null> {
  const last = journey.arrivals.at(-1);
  if (!last || !destination || journey.deliveredAt) return null;
  const province = destination.split(',').at(-1)!.trim().toLowerCase();

  try {
    await ensureSchema(db);
    // Breadth-first over well-observed legs until reaching a hub in the destination province.
    const queue: { facility: string; hours: number; seen: number }[] = [{ facility: last.facility, hours: 0, seen: Infinity }];
    const visited = new Set([last.facility]);
    while (queue.length > 0) {
      const step = queue.shift()!;
      const area = step.facility === last.facility ? last.area ?? (await hubArea(db, courier, step.facility)) : await hubArea(db, courier, step.facility);
      if (area?.toLowerCase().includes(province)) {
        const { results } = await db
          .prepare('SELECT hours FROM last_mile WHERE courier = ?1 AND facility = ?2 ORDER BY observed_at DESC LIMIT 200')
          .bind(courier, step.facility)
          .all<{ hours: number }>();
        if (results.length < MIN_OBSERVATIONS) return null;
        const totalHours = step.hours + median(results.map((r) => r.hours));
        const basedOn = Math.min(step.seen, results.length);
        return window(last.time, totalHours, basedOn, timeZone);
      }
      const depth = step.facility === last.facility ? 0 : 1;
      if (visited.size > MAX_PATH_LEGS * 4 || depth > MAX_PATH_LEGS) continue;
      for (const leg of await legStats(db, courier, step.facility)) {
        if (leg.count < MIN_OBSERVATIONS || visited.has(leg.to)) continue;
        visited.add(leg.to);
        queue.push({ facility: leg.to, hours: step.hours + leg.typicalHours, seen: Math.min(step.seen, leg.count) });
      }
    }
    return null;
  } catch (err) {
    console.warn('History estimate failed:', describeError(err));
    return null;
  }
}

function window(from: number, hours: number, basedOn: number, timeZone: string): HistoryEstimate {
  const day = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(ms));
  return {
    earliest: day(from + hours * 0.85 * 3_600_000),
    latest: day(from + hours * 1.3 * 3_600_000),
    basedOn,
  };
}
