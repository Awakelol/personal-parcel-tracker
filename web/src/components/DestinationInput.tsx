import { useId, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { MAX_DESTINATION_LENGTH } from '../lib/savedParcels';
import { isKnownPlace, searchPlaces } from '../lib/placeSearch';

interface DestinationInputProps {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  className?: string;
}

/** City/province picker with suggestions that forgive misspellings. */
export function DestinationInput({ value, onChange, onCancel, className = '' }: DestinationInputProps) {
  const listId = useId();
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(0);
  const suggestions = useMemo(() => (isKnownPlace(value) ? [] : searchPlaces(value)), [value]);
  const showList = open && suggestions.length > 0;

  function pick(label: string) {
    onChange(label);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (showList) setOpen(false);
      else onCancel();
      return;
    }
    if (!showList) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(suggestions[active] ?? suggestions[0]!);
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        aria-label="Destination (city or province)"
        autoFocus
        autoComplete="off"
        value={value}
        maxLength={MAX_DESTINATION_LENGTH}
        placeholder="Start typing a city or province"
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        className={className}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-sm border-2 border-ink bg-paper text-sm text-ink shadow-lg"
        >
          {suggestions.map((label, index) => (
            <li
              key={label}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // mousedown, not click, so the input's blur doesn't close the list first.
              onMouseDown={(e) => (e.preventDefault(), pick(label))}
              onMouseEnter={() => setActive(index)}
              className={`cursor-pointer px-3 py-2 ${index === active ? 'bg-sticker' : ''}`}
            >
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Saving is only allowed for a place from the list, or empty to clear. */
export function destinationError(value: string): string | null {
  return value.trim() === '' || isKnownPlace(value) ? null : 'Pick a place from the suggestions.';
}
