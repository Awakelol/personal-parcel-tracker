import { useState } from 'react';
import type { FormEvent } from 'react';
import { COURIERS } from '@shared/api';
import type { TrackRequest } from '@shared/api';
import type { RecentSearch } from '../hooks/useRecentSearches';

interface SearchBarProps {
  initial: TrackRequest | null;
  isLoading: boolean;
  recent: RecentSearch[];
  onTrack: (request: TrackRequest) => void;
  onForget: (trackingNumber: string) => void;
}

export function SearchBar({ initial, isLoading, recent, onTrack, onForget }: SearchBarProps) {
  const [trackingNumber, setTrackingNumber] = useState(initial?.trackingNumber ?? '');
  const [courierCode, setCourierCode] = useState(initial?.courierCode ?? '');

  function submit(number: string, courier: string) {
    const cleaned = number.trim();
    if (!cleaned) return;
    onTrack(courier ? { trackingNumber: cleaned, courierCode: courier } : { trackingNumber: cleaned });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(trackingNumber, courierCode);
  }

  function trackRecent(item: RecentSearch) {
    setTrackingNumber(item.trackingNumber);
    setCourierCode(item.courierCode ?? '');
    submit(item.trackingNumber, item.courierCode ?? '');
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-on-page-muted">Tracking number</span>
          <input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="e.g. PH123456789012A"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            className="mt-1.5 block h-12 w-full rounded-sm border-2 border-ink bg-paper px-3.5 font-mono text-base text-ink uppercase placeholder:normal-case placeholder:text-ink-muted/70"
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-on-page-muted">Courier</span>
          <select
            value={courierCode}
            onChange={(e) => setCourierCode(e.target.value)}
            className="mt-1.5 block h-12 w-full rounded-sm border-2 border-ink bg-paper px-3 text-base text-ink sm:w-52"
          >
            <option value="">Detect automatically</option>
            {COURIERS.map((courier) => (
              <option key={courier.code} value={courier.code}>
                {courier.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={isLoading}
          className="font-condensed h-12 rounded-sm border-2 border-ink bg-ink px-7 text-lg font-extrabold uppercase tracking-wider text-paper transition-colors hover:bg-ink/85 disabled:cursor-progress disabled:opacity-70 dark:border-on-page dark:bg-on-page dark:text-kraft"
        >
          {isLoading ? 'Tracking…' : 'Track'}
        </button>
      </form>

      {recent.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-on-page-muted">Recent</span>
          {recent.map((item) => (
            <span key={item.trackingNumber} className="inline-flex items-stretch rounded-sm bg-paper text-ink">
              <button
                type="button"
                onClick={() => trackRecent(item)}
                className="py-1 pr-1.5 pl-2.5 text-left font-mono text-[12px] hover:underline"
                title={item.courierName ?? undefined}
              >
                {item.trackingNumber}
              </button>
              <button
                type="button"
                onClick={() => onForget(item.trackingNumber)}
                aria-label={`Remove ${item.trackingNumber} from recent`}
                className="border-l border-paper-rule px-2 text-ink-muted hover:text-ink"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
