import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { TrackResponse } from '@shared/api';
import { ApiError } from '../lib/api';
import { navigate } from '../lib/router';
import { MAX_NAME_LENGTH, removeParcel, renameParcel, saveParcel, useSavedParcels } from '../lib/savedParcels';

interface SaveParcelBarProps {
  result: TrackResponse;
  courierCode?: string;
}

export function SaveParcelBar({ result, courierCode }: SaveParcelBarProps) {
  const { parcels } = useSavedParcels();
  const saved = parcels.find((p) => p.trackingNumber === result.trackingNumber);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEditing() {
    setName(saved?.name ?? '');
    setError(null);
    setEditing(true);
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t work. Try again.');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setEditing(false);
    const courier = courierCode ?? (result.courierCode !== 'unknown' ? result.courierCode : undefined);
    void run(() => (saved ? renameParcel(result.trackingNumber, name) : saveParcel(result, name, courier)));
  }

  const errorMessage = error && (
    <p role="alert" className="mt-2 text-sm font-semibold">
      {error}
    </p>
  );

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <label className="block min-w-0 flex-1 basis-64">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-on-page-muted">
            {saved ? 'Rename parcel' : 'Name this parcel'}
          </span>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="e.g. Birthday gift"
            required
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            className="mt-1.5 block h-11 w-full rounded-sm border-2 border-ink bg-paper px-3 text-base text-ink"
          />
        </label>
        <button
          type="submit"
          className="font-condensed h-11 rounded-sm border-2 border-ink bg-ink px-5 font-extrabold uppercase tracking-wider text-paper dark:border-on-page dark:bg-on-page dark:text-kraft"
        >
          {saved ? 'Rename' : 'Save'}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="h-11 px-2 text-sm font-semibold underline">
          Cancel
        </button>
      </form>
    );
  }

  if (!saved) {
    return (
      <div>
        <button
          type="button"
          onClick={startEditing}
          className="font-condensed rounded-sm border-2 border-on-page px-4 py-2 font-extrabold uppercase tracking-wider hover:bg-on-page hover:text-kraft"
        >
          + Save parcel
        </button>
        {errorMessage}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-condensed text-3xl leading-none font-black uppercase tracking-tight break-words sm:text-4xl">
          {saved.name}
        </h2>
        <p className="flex gap-3 text-sm font-semibold">
          <a href="/saved" onClick={(e) => (e.preventDefault(), navigate('/saved'))} className="underline">
            Saved
          </a>
          <button type="button" onClick={startEditing} className="underline">
            Rename
          </button>
          <button type="button" onClick={() => void run(() => removeParcel(saved.trackingNumber))} className="underline">
            Remove
          </button>
        </p>
      </div>
      {errorMessage}
    </div>
  );
}
