import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrivalEstimate } from '../components/ArrivalEstimate';
import { ApiError, trackParcel } from '../lib/api';
import { ALERT_STATUSES, STATUS_LABELS, formatRelative } from '../lib/format';
import { navigate, trackUrl } from '../lib/router';
import {
  MAX_NAME_LENGTH,
  reloadSavedParcels,
  removeParcel,
  renameParcel,
  updateSnapshot,
  useSavedParcels,
} from '../lib/savedParcels';
import type { SavedParcelView } from '../lib/savedParcels';

// 17TRACK allows 3 req/s.
const REFRESH_CONCURRENCY = 2;

type RefreshState = Record<string, { status: 'loading' } | { status: 'error'; message: string }>;

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Try again.';
}

function sortParcels(parcels: SavedParcelView[]) {
  const isDelivered = (p: SavedParcelView) => p.last?.status === 'delivered';
  const eta = (p: SavedParcelView) => p.last?.estimatedDelivery?.earliest ?? '9999';
  const lastScan = (p: SavedParcelView) => p.last?.latestEvent?.timestamp ?? '';
  return {
    onTheWay: parcels.filter((p) => !isDelivered(p)).sort((a, b) => eta(a).localeCompare(eta(b))),
    delivered: parcels.filter(isDelivered).sort((a, b) => lastScan(b).localeCompare(lastScan(a))),
  };
}

export function SavedPage() {
  const { status, parcels, error } = useSavedParcels();
  const [refresh, setRefresh] = useState<RefreshState>({});
  const inFlight = useRef<AbortController | null>(null);

  const refreshParcels = useCallback(async (items: SavedParcelView[]) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setRefresh(Object.fromEntries(items.map((p) => [p.trackingNumber, { status: 'loading' as const }])));
    const queue = [...items];

    async function worker() {
      for (let parcel = queue.shift(); parcel; parcel = queue.shift()) {
        const { trackingNumber, courierCode } = parcel;
        try {
          const result = await trackParcel({ trackingNumber, courierCode, fresh: true }, controller.signal);
          updateSnapshot(result);
          setRefresh(({ [trackingNumber]: _done, ...rest }) => rest);
        } catch (err) {
          if (controller.signal.aborted) return;
          setRefresh((current) => ({ ...current, [trackingNumber]: { status: 'error', message: errorMessage(err) } }));
        }
      }
    }

    await Promise.all(Array.from({ length: REFRESH_CONCURRENCY }, worker));
  }, []);

  // Every visit: pick up saves from other devices, then re-check each parcel.
  useEffect(() => {
    let cancelled = false;
    void reloadSavedParcels().then((list) => {
      if (!cancelled && list.length > 0) void refreshParcels(list);
    });
    return () => {
      cancelled = true;
      inFlight.current?.abort();
    };
  }, [refreshParcels]);

  const { onTheWay, delivered } = sortParcels(parcels);
  const isRefreshing = Object.values(refresh).some((r) => r.status === 'loading');

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-condensed text-3xl leading-none font-black uppercase tracking-tight">
          Saved parcels <span className="font-mono text-lg font-normal text-on-page-muted">({parcels.length})</span>
        </h2>
        {parcels.length > 0 && (
          <button
            type="button"
            onClick={() => void refreshParcels(parcels)}
            disabled={isRefreshing}
            className="rounded-sm border-2 border-on-page px-3 py-1.5 text-sm font-semibold hover:bg-on-page hover:text-kraft disabled:cursor-progress disabled:opacity-60"
          >
            {isRefreshing ? 'Updating…' : 'Update all'}
          </button>
        )}
      </header>

      {status === 'loading' && <p className="mt-8 text-on-page-muted">Loading your parcels…</p>}

      {status === 'error' && (
        <div role="alert" className="on-paper mt-8 rounded-sm border-l-8 border-alert bg-paper px-5 py-4 text-ink">
          <p className="font-semibold">Couldn’t load your saved parcels.</p>
          <p className="mt-1 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 rounded-sm border-2 border-ink px-3 py-1 text-sm font-semibold"
          >
            Reload
          </button>
        </div>
      )}

      {status === 'ready' && parcels.length === 0 && (
        <div className="mt-8 rounded-sm border-2 border-dashed border-on-page/40 px-6 py-12 text-center">
          <p className="font-condensed text-2xl font-extrabold uppercase tracking-wide">No saved parcels yet</p>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-on-page-muted">
            Track a parcel, then choose <strong>Save parcel</strong> and give it a name. It will show up here, on any
            device you log in from.
          </p>
          <a href="/" onClick={(e) => (e.preventDefault(), navigate('/'))} className="mt-4 inline-block font-semibold underline">
            Track a parcel
          </a>
        </div>
      )}

      {onTheWay.length > 0 && <ParcelGroup title="On the way" parcels={onTheWay} refresh={refresh} />}
      {delivered.length > 0 && <ParcelGroup title="Delivered" parcels={delivered} refresh={refresh} />}
    </div>
  );
}

function ParcelGroup({ title, parcels, refresh }: { title: string; parcels: SavedParcelView[]; refresh: RefreshState }) {
  return (
    <section className="mt-8">
      <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-on-page-muted">
        {title} <span className="font-mono font-normal">({parcels.length})</span>
      </h3>
      <ul className="mt-3 grid gap-4 md:grid-cols-2">
        {parcels.map((parcel) => (
          <li key={parcel.trackingNumber}>
            <SavedParcelCard parcel={parcel} refresh={refresh[parcel.trackingNumber]} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SavedParcelCard({ parcel, refresh }: { parcel: SavedParcelView; refresh: RefreshState[string] | undefined }) {
  const [renaming, setRenaming] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [name, setName] = useState(parcel.name);
  const [actionError, setActionError] = useState<string | null>(null);
  const { last } = parcel;
  const url = trackUrl(parcel.trackingNumber, parcel.courierCode);

  useEffect(() => {
    if (!confirmRemove) return;
    const timer = setTimeout(() => setConfirmRemove(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmRemove]);

  async function run(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRenaming(false);
    void run(() => renameParcel(parcel.trackingNumber, name));
  }

  const footerNote = actionError
    ? actionError
    : refresh?.status === 'loading'
      ? 'Updating…'
      : refresh?.status === 'error'
        ? `Couldn’t update: ${refresh.message}`
        : last
          ? `Checked ${formatRelative(last.fetchedAt)}`
          : '';
  const footerIsError = !!actionError || refresh?.status === 'error';

  return (
    <article className="on-paper flex h-full flex-col rounded-sm bg-paper text-ink shadow-[0_1px_0_var(--color-kraft-edge),0_14px_28px_-18px_rgba(0,0,0,0.55)]">
      <header className="flex items-stretch justify-between gap-3 border-b-2 border-ink">
        {renaming ? (
          <form onSubmit={handleRename} className="flex min-w-0 flex-1 gap-2 px-3 py-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              required
              autoFocus
              aria-label="Parcel name"
              onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)}
              className="min-w-0 flex-1 rounded-sm border-2 border-ink px-2 py-1"
            />
            <button type="submit" className="text-sm font-semibold underline">
              Save
            </button>
          </form>
        ) : (
          <a
            href={url}
            onClick={(e) => (e.preventDefault(), navigate(url))}
            className="font-condensed min-w-0 px-4 py-3 text-2xl leading-none font-black uppercase tracking-tight break-words hover:underline"
          >
            {parcel.name}
          </a>
        )}
        {last && (
          <p
            className={`font-condensed flex shrink-0 items-center px-3 text-sm font-extrabold uppercase tracking-wide text-paper ${
              ALERT_STATUSES.has(last.status) ? 'bg-alert' : 'bg-ink'
            }`}
          >
            {STATUS_LABELS[last.status]}
          </p>
        )}
      </header>

      <p className="px-4 pt-3 font-mono text-[12px] text-ink-muted">
        {last?.courierName ? `${last.courierName} · ` : ''}
        {parcel.trackingNumber}
      </p>

      <div className="grid flex-1 gap-4 px-4 py-3 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Latest update</p>
          {last?.latestEvent ? (
            <>
              <p className="mt-1 leading-snug">{last.latestEvent.description}</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                {[last.latestEvent.location, formatRelative(last.latestEvent.timestamp)].filter(Boolean).join(' · ')}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">{refresh?.status === 'loading' ? 'Checking…' : 'No scans yet'}</p>
          )}
        </div>
        {last && (
          <ArrivalEstimate status={last.status} estimate={last.estimatedDelivery} latestEvent={last.latestEvent} size="sm" />
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-paper-rule px-4 py-2 text-xs">
        <span className={footerIsError ? 'text-alert' : 'text-ink-muted'} role={footerIsError ? 'alert' : undefined}>
          {footerNote}
        </span>
        <span className="flex gap-3 font-semibold">
          <button type="button" onClick={() => (setName(parcel.name), setRenaming(true))} className="underline">
            Rename
          </button>
          <button
            type="button"
            onClick={() => (confirmRemove ? void run(() => removeParcel(parcel.trackingNumber)) : setConfirmRemove(true))}
            className={`underline ${confirmRemove ? 'text-alert' : ''}`}
          >
            {confirmRemove ? 'Confirm remove' : 'Remove'}
          </button>
        </span>
      </footer>
    </article>
  );
}
