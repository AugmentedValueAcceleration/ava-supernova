import { useState } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import type { DashboardLearningCurriculum } from '../types/messages';
import { SectionGroup } from '../components/SectionGroup';
import { StorageBadge } from '../components/StorageBadge';

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

const typeIcons: Record<string, string> = {
  concept: '📖', exercise: '💻', project: '🛠', quiz: '❓', recap: '🔄',
};

interface Props {
  curriculums: DashboardLearningCurriculum[];
}

export function Learning({ curriculums }: Props) {
  useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

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
                  {mod.status === 'completed' && <span className="text-emerald-400 text-[10px]">✓</span>}
                  {mod.status === 'locked' && <span className="text-[10px] text-[var(--text-muted)]">🔒</span>}
                  {mod.status === 'in_progress' && <span className="text-[10px] text-[var(--accent)]">{Math.round(mod.progress_percent)}%</span>}
                  <svg className={`w-3 h-3 text-[var(--text-muted)] transition ${expandedModules.has(mod.id) ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {expandedModules.has(mod.id) && (
                <div className="border-t border-[var(--border-card)]">
                  {mod.lessons.map(lesson => (
                    <div
                      key={lesson.id}
                      className="flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-[var(--border-card)] last:border-b-0"
                    >
                      <span>{typeIcons[lesson.type] || '📖'}</span>
                      <span className={lesson.status === 'completed' ? 'line-through text-[var(--text-muted)]' : 'text-white'}>
                        {lesson.title}
                      </span>
                      {lesson.status === 'completed' && <span className="text-emerald-400 ml-auto">✓</span>}
                      {lesson.score !== null && <span className="text-[var(--text-muted)] ml-auto">{lesson.score}%</span>}
                    </div>
                  ))}
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
      <div className="flex items-center gap-2.5 mb-1">
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.learning.title')}</h1>
        <StorageBadge />
      </div>
      <p className="text-[13px] text-[#6c7086] mb-6 mt-1.5">
        {t('dash.learning.subtitle')}
      </p>

      {curriculums.length === 0 ? (
        <>
          <SectionGroup label={t('dash.learning.how_it_works')}>
            <div className="space-y-3">
              <Step icon="💬" title={t('dash.learning.step1')} desc={t('dash.learning.step1_desc')} />
              <Step icon="🧠" title={t('dash.learning.step2')} desc={t('dash.learning.step2_desc')} />
              <Step icon="📚" title={t('dash.learning.step3')} desc={t('dash.learning.step3_desc')} />
              <Step icon="🎓" title={t('dash.learning.step4')} desc={t('dash.learning.step4_desc')} />
            </div>
          </SectionGroup>

          <div className="mt-4 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)]/30 p-4 text-center">
            <p className="text-xs text-[var(--text-muted)]">
              {t('dash.learning.empty')}
            </p>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {curriculums.map(curr => (
            <button
              key={curr.id}
              onClick={() => { setSelectedId(curr.id); setExpandedModules(new Set()); }}
              className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-3 text-left hover:border-[var(--accent)]/30 transition bg-transparent cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase"
                  style={levelColors[curr.level] ? { ...Object.fromEntries(levelColors[curr.level].split(';').map(s => s.trim().split(':').map(v => v.trim()))) } : {}}
                >
                  {t(LEVEL_KEYS[curr.level] ?? 'dash.learning.level_mixed')}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">{curr.subject}</span>
              </div>
              <p className="text-sm font-medium text-white">{curr.title}</p>

              <div className="mt-2">
                <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-input)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${curr.progress_percent}%`, background: 'linear-gradient(to right, var(--gradient-start), var(--gradient-end))' }}
                  />
                </div>
                <span className="text-[9px] text-[var(--text-muted)] mt-1 block">
                  {curr.status === 'completed' ? t('dash.learning.completed') : t('dash.learning.pct_complete').replace('{pct}', String(Math.round(curr.progress_percent)))}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Step({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex gap-2 items-start">
      <span className="text-base shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-white font-medium">{title}</p>
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{desc}</p>
      </div>
    </div>
  );
}
