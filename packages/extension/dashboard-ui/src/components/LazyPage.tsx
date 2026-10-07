import { Suspense, type ReactNode } from 'react';

/**
 * Suspense boundary for a page that is loaded on demand.
 *
 * ── Why a shared component and not a Suspense per page ──
 *
 * Several pages are being split out one at a time, and each needs the same
 * boundary with the same spinner. Three or four inline copies is how two of
 * them end up subtly different six months from now, which has happened in this
 * codebase more than once — the same reasoning as useTabTransition.
 *
 * ── Why a plain spinner works here, when a tab switch needs useTransition ──
 *
 * These are two different waits and the distinction is easy to get wrong.
 *
 * A tab switch fetches nothing: the delay is React re-rendering, which blocks
 * the main thread, so a flag set in the same tick never paints. That needs
 * useTransition.
 *
 * A lazy page DOES fetch — the browser goes and gets a chunk — and a fetch
 * yields. Suspense shows the fallback while it is in flight, so the spinner has
 * a frame to exist in without any help. Off local disk it is often a single
 * frame and never appears, which is the honest behaviour: a spinner that shows
 * only when there is something to wait for.
 *
 * The spinner deliberately matches the one Design Studio uses internally, so
 * the handoff from "chunk loading" to "page loading its own data" reads as one
 * continuous state rather than two different-looking waits.
 */
export function LazyPage({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center py-16">
          <div
            className="animate-spin"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: '2px solid var(--border-card)',
              borderTopColor: 'var(--accent)',
            }}
            role="status"
            aria-label="Loading"
          />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
