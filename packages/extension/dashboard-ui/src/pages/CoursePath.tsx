import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tt, useLocale } from '../i18n';
import { post } from '../App';
import { Icon } from '../components/Icon';
import type { DashboardLearningCurriculum } from '../types/messages';

/**
 * Course-path sidebar — the "you are here" map beside the Ava learning chat.
 * Shows the active course's modules → lessons with status glyphs and the current
 * lesson highlighted, so the learner (and Ava) always know where they are.
 * Clicking a lesson seeds the chat ("Let's do: …") so Ava delivers it.
 *
 * Collapse + resize mirror the chat's Tasks sidebar (chat/components/TasksPanel
 * + TasksSpine): a drag handle on the inner edge, a grip that never moves
 * between states, and a self-advertising rail when collapsed. Width and
 * collapsed state persist per-user.
 */

const MIN_WIDTH = 200;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 240;
const RAIL_WIDTH = 34; // matches TasksSpine
const WIDTH_KEY = 'ava-course-path-width';
const COLLAPSED_KEY = 'ava-course-path-collapsed';

/** Progress ring — mirrors TasksSpine's, so the two rails read identically. */
function ProgressRing({ percent }: { percent: number }) {
  const r = 9;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, percent / 100));
  const allDone = pct >= 1;
  const color = allDone ? '#34d399' : 'var(--accent)';
  return (
    <span className="relative flex items-center justify-center" style={{ width: 24, height: 24 }}>
      <svg width="24" height="24" viewBox="0 0 24 24" className="relative -rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" stroke="color-mix(in srgb, var(--accent) 18%, transparent)" strokeWidth="2.5" />
        <circle
          cx="12" cy="12" r={r} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={`${pct * circ} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <span className="absolute text-[8px] font-semibold" style={{ color }}>
        {allDone ? '✓' : `${Math.round(percent)}`}
      </span>
    </span>
  );
}

/**
 * Collapsed rail — the always-visible spine. Same chrome as the chat's
 * TasksSpine: 34px, vertical label, grip straddling the border at mid-height,
 * and a live status glyph (course progress) so it earns its width.
 */
function CoursePathSpine({ curriculum, onExpand }: { curriculum: DashboardLearningCurriculum | null; onExpand: () => void }) {
  useLocale();
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
      {/* Grip — same spot the expanded panel's sits, so it never jumps. */}
      <button
        onClick={onExpand}
        title={tt('learning.path.expand', 'Show course path')}
        aria-label={tt('learning.path.expand', 'Show course path')}
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

      <button
        onClick={onExpand}
        title={tt('learning.path.expand', 'Show course path')}
        className="group flex flex-col items-center gap-3 w-full h-full pt-3 bg-transparent border-none cursor-pointer"
      >
        {curriculum ? (
          <ProgressRing percent={curriculum.progress_percent} />
        ) : (
          <span className="opacity-40 group-hover:opacity-70 transition text-[var(--text-muted)]">
            <Icon.course size={15} />
          </span>
        )}
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.25em] opacity-50 group-hover:opacity-80 transition"
          style={{ writingMode: 'vertical-rl' }}
        >
          {tt('learning.path.title', 'Course path')}
        </span>
      </button>
    </div>
  );
}

export function CoursePath({ curriculum }: { curriculum: DashboardLearningCurriculum | null }) {
  useLocale();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const [width, setWidth] = useState(() => {
    try {
      const raw = Number(localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(raw) && raw > 0) return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, raw));
    } catch { /* ignore */ }
    return DEFAULT_WIDTH;
  });

  const setCollapsedPersist = useCallback((next: boolean) => {
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  // ── Drag resize — smooth with rAF, persist on mouseup. Mirrors TasksPanel. ──
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width);
  const widthRef = useRef(width);
  const rafRef = useRef<number | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = widthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      if (rafRef.current !== null) return; // throttle to 1 rAF
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        // Panel is on the right edge, so dragging left widens it.
        const delta = startX.current - e.clientX;
        const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
        widthRef.current = next;
        setWidth(next);
      });
    };
    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      try { localStorage.setItem(WIDTH_KEY, String(widthRef.current)); } catch { /* ignore */ }
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // The "current" lesson = first not-completed lesson in document order.
  const currentLessonId = useMemo(() => {
    if (!curriculum) return null;
    for (const m of curriculum.modules) {
      for (const l of m.lessons) if (l.status !== 'completed') return l.id;
    }
    return null;
  }, [curriculum]);

  if (collapsed) {
    return <CoursePathSpine curriculum={curriculum} onExpand={() => setCollapsedPersist(false)} />;
  }

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l border-[var(--border-card)] bg-[var(--bg-card)]"
      style={{ width, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH }}
    >
      {/* Drag handle — inner edge, same as TasksPanel. */}
      <div
        onMouseDown={onMouseDown}
        className="absolute left-0 top-0 bottom-0 z-10 hover:bg-[var(--accent)]/20 transition-colors"
        style={{ width: 4, cursor: 'col-resize' }}
      />

      {/* Grip — same position as the spine's, points right to collapse. The
          single, never-moving expand/collapse control. */}
      <button
        onClick={() => setCollapsedPersist(true)}
        title={tt('learning.path.collapse', 'Hide')}
        aria-label={tt('learning.path.collapse', 'Hide')}
        className="absolute top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-6 h-6 rounded-full
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
          <path d="M5.646 3.646a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L9.293 8 5.646 4.354a.5.5 0 0 1 0-.708z" />
        </svg>
      </button>

      <div className="flex items-center justify-between border-b border-[var(--border-card)] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{tt('learning.path.title', 'Course path')}</span>
      </div>

      {!curriculum ? (
        <div className="px-3 py-6 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
          {tt('learning.path.empty', 'No active course. Ask Ava to teach you something, or set one active from My Courses.')}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Course header + progress */}
          <div className="border-b border-[var(--border-card)] px-3 py-2.5">
            <div className="text-[12px] font-semibold text-[#cdd6f4]">{curriculum.title}</div>
            <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{curriculum.subject}</div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--bg-input)]">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${curriculum.progress_percent}%` }} />
            </div>
            <div className="mt-1 text-[9px] text-[var(--text-muted)]">{Math.round(curriculum.progress_percent)}%</div>
          </div>

          {/* Modules → lessons */}
          <div className="px-1.5 py-1.5">
            {curriculum.modules.map((mod, mi) => (
              <div key={mod.id} className="mb-1">
                <div className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                  <span className="w-3 text-[9px] text-[var(--text-muted)]">{mi + 1}</span>
                  <span className="flex-1 truncate">{mod.title}</span>
                  {mod.status === 'completed' && <Icon.done size={13} className="text-emerald-400" />}
                  {mod.status === 'locked' && <Icon.locked size={13} className="text-[var(--text-muted)]" />}
                </div>
                {mod.lessons.map((lesson) => {
                  const isCurrent = lesson.id === currentLessonId;
                  const LGlyph = lesson.status === 'completed' ? Icon.done : isCurrent || lesson.status === 'in_progress' ? Icon.current : Icon.todo;
                  return (
                    <button
                      key={lesson.id}
                      onClick={() => post({ type: 'send_message', text: `Let's do: ${lesson.title}`, mode: 'teach', surface: 'learning', courseId: curriculum.id })}
                      title={tt('learning.path.start_lesson', 'Start this lesson with Ava')}
                      className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 pl-5 text-left text-[11px] transition ${
                        isCurrent
                          ? 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)] font-medium'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
                      }`}
                    >
                      <span className={`flex w-4 justify-center ${lesson.status === 'completed' ? 'text-emerald-400' : isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}><LGlyph size={13} /></span>
                      <span className={`flex-1 truncate ${lesson.status === 'completed' ? 'line-through opacity-70' : ''}`}>{lesson.title}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
