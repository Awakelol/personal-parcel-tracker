import { useSyncExternalStore } from 'react';
import type { EstimatedDelivery, ParcelStatus, TrackResponse, TrackingEvent } from '@shared/api';

/**
 * Saved parcels live in this browser's localStorage: the site is public, so a
 * server-side list would be readable by anyone. Everything goes through this
 * module, so swapping in synced storage later only touches this file.
 */
const STORAGE_KEY = 'parcel-tracker:saved';
export const MAX_NAME_LENGTH = 60;

/** The last lookup, kept so the saved list renders instantly before refreshing. */
export interface SavedSnapshot {
  status: ParcelStatus;
  courierName: string | null;
  latestEvent: TrackingEvent | null;
  estimatedDelivery: EstimatedDelivery | null;
  fetchedAt: string;
}

export interface SavedParcel {
  trackingNumber: string;
  courierCode?: string;
  name: string;
  savedAt: string;
  last?: SavedSnapshot;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let parcels: SavedParcel[] = read();

function read(): SavedParcel[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((p): p is SavedParcel => typeof p?.trackingNumber === 'string' && typeof p?.name === 'string')
      : [];
  } catch {
    return [];
  }
}

function commit(next: SavedParcel[]): void {
  parcels = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the list still works for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  // Keep other open tabs in sync.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    parcels = read();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useSavedParcels(): SavedParcel[] {
  return useSyncExternalStore(subscribe, () => parcels);
}

export function findSaved(trackingNumber: string): SavedParcel | undefined {
  return parcels.find((p) => p.trackingNumber === trackingNumber);
}

export function snapshotOf(result: TrackResponse): SavedSnapshot {
  return {
    status: result.status,
    courierName: result.courierName,
    latestEvent: result.events.at(-1) ?? null,
    estimatedDelivery: result.estimatedDelivery,
    fetchedAt: result.fetchedAt,
  };
}

export function saveParcel(result: TrackResponse, name: string, courierCode?: string): void {
  const entry: SavedParcel = {
    trackingNumber: result.trackingNumber,
    ...(courierCode && { courierCode }),
    name: name.trim().slice(0, MAX_NAME_LENGTH),
    savedAt: new Date().toISOString(),
    last: snapshotOf(result),
  };
  commit([entry, ...parcels.filter((p) => p.trackingNumber !== result.trackingNumber)]);
}

export function renameParcel(trackingNumber: string, name: string): void {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return;
  commit(parcels.map((p) => (p.trackingNumber === trackingNumber ? { ...p, name: trimmed } : p)));
}

export function removeParcel(trackingNumber: string): void {
  commit(parcels.filter((p) => p.trackingNumber !== trackingNumber));
}

/** Records a fresh lookup for a saved parcel; no-op for parcels that aren't saved. */
export function updateSnapshot(result: TrackResponse): void {
  if (!findSaved(result.trackingNumber)) return;
  commit(parcels.map((p) => (p.trackingNumber === result.trackingNumber ? { ...p, last: snapshotOf(result) } : p)));
}
