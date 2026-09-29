import { useSyncExternalStore } from 'react';

/** Two pages don't justify a router library: pathname + History API is enough. */
export type Page = 'track' | 'saved';

export interface Route {
  page: Page;
  /** Increments on every navigation (links, back/forward) — not on replaceState. */
  key: number;
}

function pageFromPath(pathname: string): Page {
  return pathname.replace(/\/+$/, '') === '/saved' ? 'saved' : 'track';
}

const listeners = new Set<() => void>();
let current: Route = { page: pageFromPath(window.location.pathname), key: 0 };

function handleNavigation(): void {
  current = { page: pageFromPath(window.location.pathname), key: current.key + 1 };
  listeners.forEach((listener) => listener());
}

window.addEventListener('popstate', handleNavigation);

export function navigate(url: string): void {
  window.history.pushState(null, '', url);
  handleNavigation();
  window.scrollTo({ top: 0 });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => current);
}

/** URL of the track page for a parcel, e.g. /?n=PH123&c=spx-ph */
export function trackUrl(trackingNumber: string, courierCode?: string): string {
  const params = new URLSearchParams({ n: trackingNumber });
  if (courierCode) params.set('c', courierCode);
  return `/?${params.toString()}`;
}
