import { useState } from 'react';
import { t, tt, useLocale } from '../i18n';
import { post } from '../App';
import type { DashboardLearningCurriculum } from '../types/messages';
import { Skeleton } from '../components/Skeleton';
import { Icon } from '../components/Icon';
import { LessonPlayer } from './LessonPlayer';


const levelColors: Record<string, string> = {
  beginner: 'color: #34d399; background: rgba(52,211,153,0.1)',
  intermediate: 'color: #60a5fa; background: rgba(96,165,250,0.1)',
  advanced: 'color: #fbbf24; background: rgba(251,191,36,0.1)',
  mixed: 'color: #a78bfa; background: rgba(167,139,250,0.1)',
};

const LEVEL_KEYS: Record<string, string> = {
  beginner: 'dash.learning.level_beginner',
  intermediate: 'dash.learning.level_intermediate',
  advanced: 'dash.learning.level_advanced',
  mixed: 'dash.learning.level_mixed',
};

const lessonTypeIcon = (type: string) =>
  type === 'exercise' ? Icon.code
  : type === 'project' ? Icon.project
  : type === 'quiz' ? Icon.quiz
  : type === 'recap' ? Icon.review
  : Icon.book;

interface Props {
  curriculums: DashboardLearningCurriculum[];
  /** True once the learning curriculums' first load has landed. */
  loaded: boolean;
  /** Make this course the active one Ava teaches, then jump to the Ava tab. */
  onSetActive?: (id: string) => void;
  /** Jump to the Ava tab (the course is already active — "Continue"). */
  onGoToAva?: () => void;
}

export function Learning({ curriculums, loaded, onSetActive, onGoToAva }: Props) {
  useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [playingLessonId, setPlayingLessonId] = useState<string | null>(null);

  const selected = curriculums.find(c => c.id === selectedId);

  function deleteCurriculum(id: string) {
    post({ type: 'delete_curriculum', id });
    setSelectedId(null);
  }

  const toggleModule = (id: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Detail view
  if (selected) {
    // Playing a lesson — hand off to the interactive player.
    const playing = playingLessonId
      ? selected.modules.flatMap(m => m.lessons).find(l => l.id === playingLessonId)
      : null;
    if (playing) {
      return <LessonPlayer lesson={playing} curriculumId={selected.id} onClose={() => setPlayingLessonId(null)} />;
    }
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setSelectedId(null)}
            className="text-xs text-[var(--text-muted)] hover:text-white transition bg-transparent border-none cursor-pointer"
          >
            ← {t('dash.learning.back')}
          </button>
          <button
            onClick={() => deleteCurriculum(selected.id)}
            className="text-[10px] text-red-400 hover:text-red-300 bg-transparent border border-red-400/20 hover:border-red-400/40 rounded-md px-2.5 py-1 cursor-pointer transition"
          >
            Delete
          </button>
        </div>

        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
              style={levelColors[selected.level] ? { ...Object.fromEntries(levelColors[selected.level].split(';').map(s => s.trim().split(':').map(v => v.trim()))) } : {}}
            >
              {t(LEVEL_KEYS[selected.level] ?? 'dash.learning.level_mixed')}
            </span>
            {selected.estimated_hours && (
              <span className="text-[10px] text-[var(--text-muted)]">~{selected.estimated_hours}h</span>
            )}
          </div>
          <h1 className="text-lg font-bold text-white">{selected.title}</h1>
          {selected.description && (
            <p className="text-xs text-[var(--text-secondary)] mt-1">{selected.description}</p>
          )}

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-[var(--text-muted)]">{t('dash.learning.progress')}</span>
              <span className="text-[10px] font-medium text-white">{Math.round(selected.progress_percent)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-input)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${selected.progress_percent}%`, background: 'linear-gradient(to right, var(--gradient-start), var(--gradient-end))' }}
              />
            </div>
          </div>
        </div>

        {/* Modules */}
        <div className="space-y-2">
          {selected.modules.map((mod, mi) => (
            <div key={mod.id} className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] overflow-hidden">
              <button
                onClick={() => toggleModule(mod.id)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--bg-input)] transition bg-transparent border-none cursor-pointer text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] w-4">{mi + 1}</span>
                  <span className="text-xs font-medium text-white">{mod.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  {mod.status === 'completed' && <Icon.done size={13} className="text-emerald-400" />}
                  {mod.status === 'locked' && <Icon.locked size={13} className="text-[var(--text-muted)]" />}
                  {mod.status === 'in_progress' && <span className="text-[10px] text-[var(--accent)]">{Math.round(mod.progress_percent)}%</span>}
                  <svg className={`w-3 h-3 text-[var(--text-muted)] transition ${expandedModules.has(mod.id) ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {expandedModules.has(mod.id) && (
                <div className="border-t border-[var(--border-card)]">
                  {mod.lessons.map(lesson => {
                    const interactive = (lesson.steps?.length ?? 0) > 0;
                    return (
                      <button
                        key={lesson.id}
                        onClick={() => setPlayingLessonId(lesson.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] border-0 border-b border-[var(--border-card)] last:border-b-0 bg-transparent cursor-pointer text-left hover:bg-[var(--bg-input)] transition"
                      >
                        <span className="text-[var(--text-muted)]">{(() => { const L = lessonTypeIcon(lesson.type); return <L size={14} />; })()}</span>
                        <span className={`flex-1 ${lesson.status === 'completed' ? 'line-through text-[var(--text-muted)]' : 'text-white'}`}>
                          {lesson.title}
                        </span>
                        {interactive && <span className="text-[8px] font-bold uppercase tracking-wide text-[var(--accent)]">interactive</span>}
                        {lesson.status === 'completed' && <Icon.done size={13} className="text-emerald-400" />}
                        {lesson.score !== null && lesson.status !== 'completed' && <span className="text-[var(--text-muted)]">{lesson.score}%</span>}
                        <Icon.play size={12} className="text-[var(--text-muted)] opacity-40" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div>
      {!loaded ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <Skeleton key={i} height={78} radius={8} />)}
        </div>
      ) : curriculums.length === 0 ? (
        <>
          {/* Empty manager — a clear "start your first course" CTA in the new
              design language, then the how-it-works as secondary guidance. */}
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] p-6 text-center">
            <div className="mb-2 flex justify-center text-[var(--accent)]"><Icon.course size={36} /></div>
            <div className="text-sm font-semibold text-[#cdd6f4]">{tt('learning.courses.empty_title', 'No courses yet')}</div>
            <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-[var(--text-muted)]">
              {tt('learning.courses.empty_body', 'Ask Ava to build your first course — she assesses your level, builds a curriculum, and teaches it one concept at a time. It lands here as a course you can manage, set active, and track.')}
            </p>
            <button
              onClick={() => onGoToAva?.()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-white transition hover:opacity-90"
            >
              {tt('learning.courses.start', 'Start a course with Ava')} →
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Step icon={<Icon.chat size={20} />} title={tt('learning.courses.how1', 'Tell Ava')} desc={tt('learning.courses.how1_desc', 'Say what you want to learn.')} />
            <Step icon={<Icon.books size={20} />} title={tt('learning.courses.how2', 'She builds it')} desc={tt('learning.courses.how2_desc', 'A real curriculum, set active here.')} />
            <Step icon={<Icon.course size={20} />} title={tt('learning.courses.how3', 'Learn & earn')} desc={tt('learning.courses.how3_desc', 'Taught at your pace; skills land in Progression.')} />
          </div>
        </>
      ) : (
        <div className="space-y-5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => { post({ type: 'load_learning' }); post({ type: 'load_learning_profile' }); }}
              className={`${cardBtn} inline-flex items-center gap-1.5`}
              title={tt('learning.courses.refresh', 'Refresh')}
            >
              <Icon.review size={13} />{tt('learning.courses.refresh', 'Refresh')}
            </button>
          </div>
          {([
            { key: 'active', label: tt('learning.courses.active', 'Active'), items: curriculums.filter(c => c.status === 'active') },
            { key: 'paused', label: tt('learning.courses.in_progress', 'In progress'), items: curriculums.filter(c => c.status !== 'active' && c.status !== 'completed') },
            { key: 'completed', label: tt('learning.courses.completed', 'Completed'), items: curriculums.filter(c => c.status === 'completed') },
          ] as const).filter(g => g.items.length > 0).map(group => (
            <div key={group.key}>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{group.label}</div>
              <div className="space-y-2">
                {group.items.map(curr => (
                  <CourseCard
                    key={curr.id}
                    curr={curr}
                    onOpen={() => { setSelectedId(curr.id); setExpandedModules(new Set()); }}
                    onSetActive={onSetActive}
                    onGoToAva={onGoToAva}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// One shared button style so every card action matches — outlined-accent pill.
const cardBtn = 'rounded-md border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-1 text-[11px] font-medium text-[var(--accent)] transition hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]';
// Same pill, danger-tinted — destructive but visually consistent.
const dangerBtn = 'rounded-md border border-[#f38ba8]/40 bg-[#f38ba8]/10 px-3 py-1 text-[11px] font-medium text-[#f38ba8] transition hover:bg-[#f38ba8]/20';

function CourseCard({ curr, onOpen, onSetActive, onGoToAva }: {
  curr: DashboardLearningCurriculum;
  onOpen: () => void;
  onSetActive?: (id: string) => void;
  onGoToAva?: () => void;
}) {
  const isActive = curr.status === 'active';
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={`rounded-lg border bg-[var(--bg-card)] p-3 transition ${isActive ? 'border-[var(--accent)]/40' : 'border-[var(--border-card)] hover:border-[var(--accent)]/30'}`}>
      <div onClick={onOpen} className="cursor-pointer">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase"
            style={levelColors[curr.level] ? { ...Object.fromEntries(levelColors[curr.level].split(';').map(s => s.trim().split(':').map(v => v.trim()))) } : {}}
          >
            {t(LEVEL_KEYS[curr.level] ?? 'dash.learning.level_mixed')}
          </span>
          <span className="text-[10px] text-[var(--text-muted)]">{curr.subject}</span>
          {isActive && <span className="ml-auto flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--accent)]"><Icon.done size={12} /> {tt('learning.courses.active_tag', 'Active')}</span>}
        </div>
        <p className="text-sm font-medium text-white">{curr.title}</p>
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-input)]">
            <div className="h-full rounded-full" style={{ width: `${curr.progress_percent}%`, background: 'linear-gradient(to right, var(--gradient-start), var(--gradient-end))' }} />
          </div>
          <span className="text-[9px] text-[var(--text-muted)] mt-1 block">
            {curr.status === 'completed' ? t('dash.learning.completed') : t('dash.learning.pct_complete').replace('{pct}', String(Math.round(curr.progress_percent)))}
          </span>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <span className="text-[11px] text-[var(--text-secondary)]">{tt('learning.courses.delete_confirm', 'Delete this course?')}</span>
            <button onClick={() => { post({ type: 'delete_curriculum', id: curr.id }); setConfirming(false); }} className={dangerBtn}>
              {tt('learning.courses.delete', 'Delete')}
            </button>
            <button onClick={() => setConfirming(false)} className={cardBtn}>
              {tt('learning.courses.cancel', 'Cancel')}
            </button>
          </>
        ) : (
          <>
            {isActive ? (
              <button onClick={() => onGoToAva?.()} className={cardBtn}>
                {tt('learning.courses.continue', 'Continue with Ava')} →
              </button>
            ) : (
              <button onClick={() => onSetActive?.(curr.id)} className={cardBtn}>
                {curr.status === 'completed' ? tt('learning.courses.revisit', 'Revisit') : tt('learning.courses.set_active', 'Set active')}
              </button>
            )}
            <button onClick={onOpen} className={cardBtn}>
              {tt('learning.courses.view', 'View path')}
            </button>
            <button onClick={() => setConfirming(true)} className={dangerBtn} title={tt('learning.courses.delete', 'Delete')}>
              {tt('learning.courses.delete', 'Delete')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Step({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
      <span className="text-[var(--accent)]" aria-hidden>{icon}</span>
      <p className="mt-1.5 text-xs font-medium text-white">{title}</p>
      <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--text-muted)]">{desc}</p>
    </div>
  );
}
