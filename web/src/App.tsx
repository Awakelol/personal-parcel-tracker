import type { MouseEvent, ReactNode } from 'react';
import { navigate, useRoute } from './lib/router';
import { useSavedParcels } from './lib/savedParcels';
import { SavedPage } from './pages/SavedPage';
import { TrackPage } from './pages/TrackPage';

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(href);
  }
  return (
    <a
      href={href}
      onClick={handleClick}
      aria-current={active ? 'page' : undefined}
      className={`border-b-2 pb-0.5 text-sm font-bold uppercase tracking-[0.12em] ${
        active ? 'border-on-page' : 'border-transparent text-on-page-muted hover:text-on-page'
      }`}
    >
      {children}
    </a>
  );
}

export function App() {
  const { page, key } = useRoute();
  const savedCount = useSavedParcels().length;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="font-condensed text-4xl leading-none font-black uppercase tracking-tight sm:text-5xl">
            Parcel tracker
          </h1>
          <p className="mt-2 text-[15px] text-on-page-muted">Where your parcels are, and what happens next.</p>
        </div>
        <nav aria-label="Pages" className="flex gap-5">
          <NavLink href="/" active={page === 'track'}>
            Track
          </NavLink>
          <NavLink href="/saved" active={page === 'saved'}>
            Saved <span className="font-mono font-normal">({savedCount})</span>
          </NavLink>
        </nav>
      </header>

      {/* Keyed per navigation so opening a saved parcel starts a fresh lookup. */}
      <main>{page === 'saved' ? <SavedPage key={key} /> : <TrackPage key={key} />}</main>
    </div>
  );
}
