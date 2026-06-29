import { useMemo, useState } from 'react';
import { tt, useLocale } from '../i18n';
import { post } from '../App';
import { Icon } from '../components/Icon';
import type { DashboardLearningCurriculum } from '../types/messages';

/**
 * Course-path sidebar — the "you are here" map beside the Ava learning chat.
 * Shows the active course's modules → lessons with status glyphs and the current
 * lesson highlighted, so the learner (and Ava) always know where they are.
 * Clicking a lesson seeds the chat ("Let's do: …") so Ava delivers it. Collapsible.
 */

export function CoursePath({ curriculum }: { curriculum: DashboardLearningCurriculum | null }) {
  useLocale();
  const [collapsed, setCollapsed] = useState(false);

  // The "current" lesson = first not-completed lesson in document order.
  const currentLessonId = useMemo(() => {
    if (!curriculum) return null;
    for (const m of curriculum.modules) {
      for (const l of m.lessons) if (l.status !== 'completed') return l.id;
    }
    return null;
  }, [curriculum]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title={tt('learning.path.expand', 'Show course path')}
        className="flex shrink-0 items-center border-l border-[var(--border-card)] px-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <Icon.expand size={16} />
      </button>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-l border-[var(--border-card)] bg-[var(--bg-card)]">
      <div className="flex items-center justify-between border-b border-[var(--border-card)] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{tt('learning.path.title', 'Course path')}</span>
        <button onClick={() => setCollapsed(true)} title={tt('learning.path.collapse', 'Hide')} className="flex items-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"><Icon.collapse size={16} /></button>
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
