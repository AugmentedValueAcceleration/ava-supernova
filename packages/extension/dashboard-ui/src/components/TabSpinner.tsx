/**
 * The small spinner that sits beside a tab label while that tab is rendering.
 *
 * Paired with useTabTransition — see that hook for why a spinner here needs a
 * transition to be visible at all, and why one set in the same tick as the
 * render never paints.
 *
 * Deliberately after the label rather than replacing it: the label is how you
 * know which tab you clicked, and swapping it for a spinner would take that away
 * at exactly the moment you want confirming. The sidebar does replace its icon,
 * because there the label is separate and nothing is lost.
 *
 * Twelve lines of CSS rather than a dependency. This bundle was 9.97MB two days
 * ago and a rotating border is not worth a package.
 */
export function TabSpinner() {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="ml-1.5 inline-block h-[10px] w-[10px] animate-spin rounded-full align-middle"
      style={{
        border: '1.5px solid color-mix(in srgb, var(--accent) 25%, transparent)',
        borderTopColor: 'var(--accent)',
      }}
    />
  );
}
