import { useLocale, tt } from '../../i18n';

/**
 * Collapsed Tasks rail — the always-visible spine.
 *
 * Task tracking advertises itself: a thin rail with a vertical "Tasks" label
 * sits permanently on the edge, so a user never has to discover that Ava tracks
 * tasks — and it doubles as a live status indicator:
 *   • Ava working  → her progress ring (done/total) with a soft pulse
 *   • idle, has tasks → the active-task count
 *   • idle, empty  → just the label + a checklist glyph
 * A grip button straddles the border at mid-height to expand.
 */

const RAIL_WIDTH = 34;

interface TasksSpineProps {
  activeCount: number;
  onExpand: () => void;
}

export function TasksSpine({ activeCount, onExpand }: TasksSpineProps) {
  useLocale();
  // Her session progress ring used to live here. Gone with the band it
  // mirrored: the rail counts what YOU still have to do, and nothing else.

  return (
    <div
      className="relative flex-shrink-0 h-full"
      style={{
        width: RAIL_WIDTH,
        borderLeft: '1px solid var(--border-card)',
        background: 'radial-gradient(ellipse 120% 40% at 50% 0%, color-mix(in srgb, var(--accent) 8%, transparent) 0%, transparent 70%), linear-gradient(180deg, rgba(26,16,40,0.9) 0%, rgba(20,13,34,0.95) 100%)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Grip — straddles the border at mid-height. The "pull me open" affordance. */}
      <button
        onClick={onExpand}
        title={tt('tasks.open', 'Open tasks')}
        aria-label={tt('tasks.open', 'Open tasks')}
        className="absolute top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-6 h-6 rounded-full
                   cursor-pointer transition hover:scale-110"
        style={{
          left: -12,
          background: 'var(--bg-page)',
          border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
          color: 'var(--accent)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M10.354 3.646a.5.5 0 0 1 0 .708L6.707 8l3.647 3.646a.5.5 0 0 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 0 1 .708 0z" />
        </svg>
      </button>

      {/* Rail body — also fully clickable to expand. */}
      <button
        onClick={onExpand}
        title={tt('tasks.open', 'Open tasks')}
        className="group flex flex-col items-center gap-3 w-full h-full pt-3 bg-transparent border-none cursor-pointer"
      >
        {/* Outstanding count — yours. */}
        {activeCount > 0 ? (
          <span
            className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold"
            style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}
          >
            {activeCount > 99 ? '99+' : activeCount}
          </span>
        ) : (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" className="opacity-40 group-hover:opacity-70 transition">
            <path d="M3.75 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 3.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 7.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 11.5h8v1H6v-1z" />
          </svg>
        )}

        {/* Vertical label — the self-explanatory part. */}
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.25em] opacity-50 group-hover:opacity-80 transition"
          style={{ writingMode: 'vertical-rl' }}
        >
          {tt('tasks.title', 'Tasks')}
        </span>
      </button>
    </div>
  );
}

export { RAIL_WIDTH };
