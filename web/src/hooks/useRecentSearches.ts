import { useCallback, useState } from 'react';
import type { TrackRequest } from '@shared/api';

const STORAGE_KEY = 'parcel-tracker:recent';
const MAX_RECENT = 6;

/** Tracking numbers only (no PII), kept in this browser's localStorage. */
export interface RecentSearch extends TrackRequest {
  courierName: string | null;
}

function load(): RecentSearch[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as RecentSearch[]).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function save(items: RecentSearch[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage unavailable (private mode, quota): recents are a convenience only.
  }
}

export function useRecentSearches() {
  const [recent, setRecent] = useState<RecentSearch[]>(load);

  const remember = useCallback((item: RecentSearch) => {
    setRecent((current) => {
      const next = [item, ...current.filter((r) => r.trackingNumber !== item.trackingNumber)].slice(0, MAX_RECENT);
      save(next);
      return next;
    });
  }, []);

  const forget = useCallback((trackingNumber: string) => {
    setRecent((current) => {
      const next = current.filter((r) => r.trackingNumber !== trackingNumber);
      save(next);
      return next;
    });
  }, []);

  return { recent, remember, forget };
}
