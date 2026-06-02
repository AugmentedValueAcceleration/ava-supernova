import { useLocale, tt } from '../i18n';
import type { SessionTaskUI } from '../types/messages';

/**
 * Collapsed Tasks rail — the always-visible spine.
 *
 * The whole point (operator's design principle): task tracking advertises
 * itself. A thin rail with a vertical "Tasks" label sits permanently on the
 * edge, so a user never has to discover that Ava tracks tasks — and it does
 * double duty as a live status indicator:
 *   • Ava working  → her progress ring (done/total) with a soft pulse
 *   • idle, has tasks → the active-task count
 *   • idle, empty  → just the label + a checklist glyph
 * A grip button straddles the border at mid-height to expand.
 */

const RAIL_WIDTH = 34;

interface TasksSpineProps {
  activeCount: number;
  sessionTasks: SessionTaskUI[];
  onExpand: () => void;
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 9;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? done / total : 0;
  const allDone = total > 0 && done === total;
  const color = allDone ? '#34d399' : '#A855F7';
  return (
    <span className="relative flex items-center justify-center" style={{ width: 24, height: 24 }}>
      {!allDone && (
        <span
          className="absolute inline-flex rounded-full animate-ping opacity-60"
          style={{ width: 22, height: 22, background: 'rgba(168,85,247,0.25)' }}
        />
      )}
      <svg width="24" height="24" viewBox="0 0 24 24" className="relative -rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" stroke="rgba(168,85,247,0.18)" strokeWidth="2.5" />
        <circle
          cx="12" cy="12" r={r} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={`${pct * circ} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <span className="absolute text-[8px] font-semibold" style={{ color }}>
        {allDone ? '✓' : `${done}/${total}`}
      </span>
    </span>
  );
}

export function TasksSpine({ activeCount, sessionTasks, onExpand }: TasksSpineProps) {
  useLocale();
  const total = sessionTasks.length;
  const done = sessionTasks.filter(t => t.status === 'completed').length;
  const avaWorking = total > 0 && done < total;

  return (
    <div
      className="relative flex-shrink-0 h-full"
      style={{
        width: RAIL_WIDTH,
        borderLeft: '1px solid rgba(168, 85, 247, 0.12)',
        background: 'radial-gradient(ellipse 120% 40% at 50% 0%, rgba(168, 85, 247, 0.08) 0%, transparent 70%), linear-gradient(180deg, rgba(26,16,40,0.9) 0%, rgba(20,13,34,0.95) 100%)',
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
          background: '#0f0a1a',
          border: '1px solid rgba(168, 85, 247, 0.35)',
          color: '#A855F7',
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
        {/* Live status */}
        {avaWorking ? (
          <ProgressRing done={done} total={total} />
        ) : activeCount > 0 ? (
          <span
            className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold"
            style={{ background: 'rgba(168,85,247,0.15)', color: '#A855F7' }}
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
