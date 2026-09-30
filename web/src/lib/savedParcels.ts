import { useSyncExternalStore } from 'react';
import type { DateRange, EstimatedDelivery, ParcelStatus, SavedParcel, TrackResult, TrackingEvent } from '@shared/api';
import { ApiError, deleteParcel, listParcels, markParcelSeen, putParcel } from './api';

export const MAX_NAME_LENGTH = 60;

// Parcels from the old localStorage-only format are imported to the account once.
const LEGACY_STORAGE_KEY = 'parcel-tracker:saved';

export interface SavedSnapshot {
  status: ParcelStatus;
  courierName: string | null;
  latestEvent: TrackingEvent | null;
  estimatedDelivery: EstimatedDelivery | null;
  courierEstimate: DateRange | null;
  fetchedAt: string;
  /** Scans that arrived after the one the user last viewed. */
  newScans: number;
}

export interface SavedParcelView extends SavedParcel {
  last?: SavedSnapshot;
}

export interface SavedState {
  status: 'loading' | 'ready' | 'error';
  parcels: SavedParcelView[];
  error?: string;
}

let state: SavedState = { status: 'loading', parcels: [] };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: SavedState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function setParcels(parcels: SavedParcelView[]): void {
  setState({ ...state, parcels });
}

// The whole list is one record on the server, so send writes one at a time.
let writeQueue: Promise<unknown> = Promise.resolve();
function queued<T>(write: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(write, write);
  writeQueue = run.catch(() => undefined);
  return run;
}

export function scanKey(event: TrackingEvent | null | undefined): string | undefined {
  return event ? `${event.timestamp}|${event.description}`.slice(0, 300) : undefined;
}

function countNewScans(events: TrackingEvent[], seenLatest: string | undefined): number {
  if (!seenLatest || events.length === 0) return 0;
  const index = events.findIndex((e) => scanKey(e) === seenLatest);
  if (index >= 0) return events.length - 1 - index;
  // The seen scan is gone (e.g. the carrier reworded it); compare by time.
  const seenTime = Date.parse(seenLatest.split('|')[0] ?? '');
  return Number.isNaN(seenTime) ? 0 : events.filter((e) => Date.parse(e.timestamp) > seenTime).length;
}

export function snapshotOf(result: TrackResult, seenLatest?: string): SavedSnapshot {
  return {
    status: result.status,
    courierName: result.courierName,
    latestEvent: result.events.at(-1) ?? null,
    estimatedDelivery: result.estimatedDelivery,
    courierEstimate: result.courierEstimate ?? null,
    fetchedAt: result.fetchedAt,
    newScans: countNewScans(result.events, seenLatest),
  };
}

async function importLegacyParcels(): Promise<void> {
  let legacy: SavedParcel[] = [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? '[]');
    if (Array.isArray(parsed)) legacy = parsed as SavedParcel[];
  } catch {
    return;
  }
  if (legacy.length === 0) return;

  for (const parcel of legacy) {
    await putParcel(parcel.trackingNumber, { name: parcel.name, courierCode: parcel.courierCode });
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

async function fetchList(): Promise<SavedParcelView[]> {
  const previous = new Map(state.parcels.map((p) => [p.trackingNumber, p.last]));
  const parcels = await listParcels();
  // Keep what's already on screen when the server's cache has expired.
  return parcels.map(({ latest, ...parcel }) => {
    const last = latest ? snapshotOf(latest, parcel.seenLatest) : previous.get(parcel.trackingNumber);
    return { ...parcel, ...(last && { last }) };
  });
}

export function loadSavedParcels(): Promise<void> {
  loading ??= (async () => {
    try {
      await importLegacyParcels();
      setState({ status: 'ready', parcels: await fetchList() });
    } catch (err) {
      loading = null;
      setState({ ...state, status: 'error', error: err instanceof ApiError ? err.message : 'Could not load saved parcels.' });
    }
  })();
  return loading;
}

export function isSaved(trackingNumber: string): boolean {
  const normalized = trackingNumber.replace(/[\s-]/g, '').toUpperCase();
  return state.parcels.some((p) => p.trackingNumber === normalized);
}

/** Re-fetches the list (e.g. to pick up saves from another device). */
export async function reloadSavedParcels(): Promise<SavedParcelView[]> {
  await loadSavedParcels();
  try {
    setState({ status: 'ready', parcels: await fetchList() });
  } catch {
    // Keep showing the list we have.
  }
  return state.parcels;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSavedParcels(): SavedState {
  return useSyncExternalStore(subscribe, () => state);
}

export function unreadCount(parcels: SavedParcelView[]): number {
  return parcels.filter((p) => (p.last?.newScans ?? 0) > 0).length;
}

async function optimistic(next: SavedParcelView[], commit: () => Promise<unknown>): Promise<void> {
  const previous = state.parcels;
  setParcels(next);
  try {
    await queued(commit);
  } catch (err) {
    setParcels(previous);
    throw err;
  }
}

export function saveParcel(result: TrackResult, name: string, courierCode?: string): Promise<void> {
  const seenLatest = scanKey(result.events.at(-1));
  const parcel: SavedParcelView = {
    trackingNumber: result.trackingNumber,
    ...(courierCode && { courierCode }),
    name: name.trim().slice(0, MAX_NAME_LENGTH),
    savedAt: new Date().toISOString(),
    ...(seenLatest && { seenLatest }),
    last: snapshotOf(result, seenLatest),
  };
  return optimistic(
    [parcel, ...state.parcels.filter((p) => p.trackingNumber !== parcel.trackingNumber)],
    () => putParcel(parcel.trackingNumber, { name: parcel.name, courierCode, seenLatest }),
  );
}

export function renameParcel(trackingNumber: string, name: string): Promise<void> {
  const parcel = state.parcels.find((p) => p.trackingNumber === trackingNumber);
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!parcel || !trimmed) return Promise.resolve();
  return optimistic(
    state.parcels.map((p) => (p.trackingNumber === trackingNumber ? { ...p, name: trimmed } : p)),
    () => putParcel(trackingNumber, { name: trimmed, courierCode: parcel.courierCode }),
  );
}

export function removeParcel(trackingNumber: string): Promise<void> {
  return optimistic(
    state.parcels.filter((p) => p.trackingNumber !== trackingNumber),
    () => deleteParcel(trackingNumber),
  );
}

/** The user has looked at this parcel's latest scan: clear its "new update" badge. */
export function markSeen(result: TrackResult): void {
  const parcel = state.parcels.find((p) => p.trackingNumber === result.trackingNumber);
  const latest = scanKey(result.events.at(-1));
  if (!parcel || !latest || parcel.seenLatest === latest) return;

  setParcels(
    state.parcels.map((p) =>
      p.trackingNumber === result.trackingNumber ? { ...p, seenLatest: latest, last: snapshotOf(result, latest) } : p,
    ),
  );
  void queued(() => markParcelSeen(result.trackingNumber, latest)).catch(() => {
    // Not critical: the badge would just reappear on another device.
  });
}

// Local only; the server reads its own cache.
export function updateSnapshot(result: TrackResult): void {
  const parcel = state.parcels.find((p) => p.trackingNumber === result.trackingNumber);
  if (!parcel) return;
  // Parcels with no seenLatest yet start out "seen" at their current scan.
  if (!parcel.seenLatest) {
    markSeen(result);
    return;
  }
  setParcels(
    state.parcels.map((p) =>
      p.trackingNumber === result.trackingNumber ? { ...p, last: snapshotOf(result, p.seenLatest) } : p,
    ),
  );
}
