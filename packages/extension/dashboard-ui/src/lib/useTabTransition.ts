import { useEffect, useState, useTransition } from 'react';

/**
 * Switching a tab, with a spinner that can actually appear.
 *
 * ── The problem a plain spinner cannot solve ──
 *
 * Tab switches on the big pages fetch nothing. Library's was `setTab(key)` and
 * nothing else. The delay you feel is React re-rendering the new tab — Library
 * is ~2,000 lines with twenty-odd mapped lists — and during a render the main
 * thread is blocked. So setting a "loading" flag in the same tick does nothing
 * visible: React renders straight through and the browser never gets a frame to
 * paint the spinner in. You would see nothing, then the new tab. That is why
 * clicking a tab felt silent while the sidebar spinner worked fine — the sidebar
 * waits on data arriving over postMessage, which yields.
 *
 * ── Why useTransition fixes it ──
 *
 * It marks the tab change as non-urgent. React paints the urgent update first —
 * which is the pending state set below — and only then renders the new tab. So
 * the spinner has a frame to exist in.
 *
 * It also scales itself honestly. A fast switch finishes inside a frame and the
 * spinner never shows; a slow one shows it for as long as the work takes. No
 * threshold to pick, and no spinner flashing on a switch that was instant.
 *
 * ── Why this is a hook and not three copies ──
 *
 * Three pages need it. Three copies of the same four lines is how two of them
 * end up subtly different six months from now, which has happened in this
 * codebase more than once.
 *
 * Usage:
 *   const { current, pending, switchTo } = useTabTransition<MyTab>('papers');
 *   <button onClick={() => switchTo(tb.key)} className={tabClass(current === tb.key)}>
 *     {tb.label}{pending === tb.key && <TabSpinner />}
 *   </button>
 *   {current === 'papers' && <Papers … />}
 */
export function useTabTransition<T extends string>(
  /** Accepts a lazy initialiser, like useState, because History's starting tab
   *  comes from a one-shot deep link in localStorage that must be read and
   *  cleared exactly once rather than on every render. */
  initial: T | (() => T),
): {
  /** The tab actually being rendered. */
  current: T;
  /** The tab being switched TO while the switch is in flight, else null. */
  pending: T | null;
  /** For a tab the USER clicked — deferred, so the spinner paints first. */
  switchTo: (next: T) => void;
  /**
   * For a programmatic change — syncing from a prop, or jumping tabs as part of
   * another action. Immediate and without a spinner, because nobody clicked a
   * tab and there is nothing to acknowledge.
   *
   * Health needs this: its setTab is called from an effect that syncs an
   * `initialTab` prop and from inside other handlers, and routing those through
   * a transition would defer state changes on paths that expect them to land at
   * once.
   */
  setNow: (next: T) => void;
} {
  const [current, setCurrent] = useState<T>(initial);  // lazy initialiser passes straight through
  const [target, setTarget] = useState<T | null>(null);
  const [isPending, startTransition] = useTransition();

  const switchTo = (next: T) => {
    if (next === current) return;
    // Urgent, deliberately — this is the update that gets painted before the
    // expensive one, and the whole point is that it lands first.
    setTarget(next);
    startTransition(() => setCurrent(next));
  };

  // Clear once the transition has settled. Without this the spinner would stay
  // on the tab you just arrived at, which reads as "still working" forever.
  useEffect(() => {
    if (!isPending) setTarget(null);
  }, [isPending]);

  return { current, pending: isPending ? target : null, switchTo, setNow: setCurrent };
}
