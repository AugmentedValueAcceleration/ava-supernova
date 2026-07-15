import { useEffect, useMemo, useState } from 'react';
import { tt, useLocale } from '../i18n';
import { post } from '../App';
import { Icon } from '../components/Icon';
import type {
  LearnerProfile, LearnerProfilePayload, LearnerSelfAchievement,
} from '../types/messages';
import type { DerivedSkill, SkillLevel } from '@ava/core/learning';

/**
 * Progression — the learner's profile / CV. A familiar social-profile shell with
 * an honest engine: EARNED skills + certificates + achievements are derived from
 * graded performance (verified ✓, with provenance); SELF-added skills/achievements
 * are the user's own, tagged "added by you". A self skill graduates to verified
 * when its name matches an earned subject. Edits post save_learning_profile; the
 * host re-derives and re-sends so graduation shows immediately.
 */

interface Props {
  payload: LearnerProfilePayload | null;
  /** Fallbacks for the header when the profile hasn't set its own. */
  userName?: string | null;
  userAvatarUrl?: string | null;
}

const LEVEL_META: Record<SkillLevel, { labelKey: string; label: string; color: string }> = {
  novice:     { labelKey: 'ext.progression.novice',     label: 'Novice',     color: '#94a3b8' },
  familiar:   { labelKey: 'ext.progression.familiar',   label: 'Familiar',   color: '#60a5fa' },
  proficient: { labelKey: 'ext.progression.proficient', label: 'Proficient', color: '#c084fc' },
  mastered:   { labelKey: 'ext.progression.mastered',   label: 'Mastered',   color: '#34d399' },
};

const relTime = (iso: string | null): string => {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return tt('learning.progression.today', 'today');
  if (days === 1) return tt('learning.progression.yesterday', 'yesterday');
  if (days < 30) return tt('learning.progression.days_ago', '{n}d ago').replace('{n}', String(days));
  const months = Math.floor(days / 30);
  return tt('learning.progression.months_ago', '{n}mo ago').replace('{n}', String(months));
};

export function Progression({ payload, userName, userAvatarUrl }: Props) {
  useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LearnerProfile | null>(null);

  // Re-seed the edit draft whenever a fresh profile arrives (e.g. after save).
  useEffect(() => { if (payload) setDraft(payload.profile); }, [payload]);

  const prog = payload?.progression;
  const profile = payload?.profile;

  // Merge earned + self skills, deduped by lower-cased name (earned wins → graduation).
  const skills = useMemo(() => {
    const earned = prog?.skills ?? [];
    const earnedNames = new Set(earned.map((s) => s.name.toLowerCase()));
    const self = (profile?.self.skills ?? []).filter((s) => !earnedNames.has(s.trim().toLowerCase()));
    return { earned, self };
  }, [prog, profile]);

  if (!payload || !prog || !profile) {
    return <div className="px-2 py-10 text-center text-[13px] text-[var(--text-muted)]">{tt('learning.progression.loading', 'Loading your profile…')}</div>;
  }

  const displayName = profile.identity.display_name || userName || tt('learning.progression.learner', 'Learner');
  const initial = (displayName || 'A').trim().charAt(0).toUpperCase();
  const hasData = prog.skills.length > 0 || prog.certificates.length > 0 || prog.stats.coursesCompleted > 0;

  const saveDraft = (next: LearnerProfile) => { post({ type: 'save_learning_profile', profile: next }); setEditing(false); };

  return (
    <div className="space-y-5">
      {/* ── Header card ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <div className="flex items-start gap-4">
          {userAvatarUrl
            ? <img src={userAvatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
            : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white" style={{ background: 'linear-gradient(135deg, var(--accent), #7c3aed)' }}>{initial}</div>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-lg font-semibold text-[#cdd6f4]">{displayName}</h2>
              <button onClick={() => setEditing((v) => !v)} className="shrink-0 rounded-lg border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-1 text-[11px] font-medium text-[var(--accent)] transition hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]">
                {editing ? tt('learning.progression.done', 'Done') : tt('learning.progression.edit', 'Edit profile')}
              </button>
            </div>
            {profile.identity.headline && !editing && <p className="mt-0.5 text-[12px] text-[var(--accent)]">{profile.identity.headline}</p>}
            {profile.identity.bio && !editing && <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">{profile.identity.bio}</p>}
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat icon={<Icon.streak size={15} />} value={prog.stats.currentStreak} label={tt('learning.progression.stat.streak', 'day streak')} />
          <Stat icon={<Icon.course size={15} />} value={prog.stats.coursesTotal} label={tt('learning.progression.stat.courses', 'courses')} />
          <Stat icon={<Icon.books size={15} />} value={prog.stats.lessonsMastered} label={tt('learning.progression.stat.lessons', 'lessons')} />
          <Stat icon={<Icon.clock size={15} />} value={prog.stats.totalHours} label={tt('learning.progression.stat.hours', 'hours')} />
          <Stat icon={<Icon.verified size={15} />} value={prog.stats.avgScore != null ? `${prog.stats.avgScore}%` : '—'} label={tt('learning.progression.stat.avg', 'avg score')} />
        </div>

        {editing && draft && <EditPanel draft={draft} setDraft={setDraft} onSave={saveDraft} />}
      </div>

      {!hasData && !editing && (
        <div className="rounded-xl border border-dashed border-[var(--border-card)] p-6 text-center text-[12px] text-[var(--text-muted)]">
          {tt('learning.progression.empty', 'Finish a course in the Ava tab and your earned skills, certificates and a shareable CV start building here. You can add your own skills any time.')}
        </div>
      )}

      {/* ── Skills ───────────────────────────────────────────────── */}
      {(skills.earned.length > 0 || skills.self.length > 0) && (
        <Section title={tt('learning.progression.skills', 'Skills')}>
          <div className="flex flex-wrap gap-2">
            {skills.earned.map((s) => <EarnedSkillChip key={s.name} skill={s} />)}
            {skills.self.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)]">
                {s}
                <span className="rounded px-1 py-0.5 text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{tt('learning.progression.self_tag', 'added by you')}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* ── Certificates ─────────────────────────────────────────── */}
      {prog.certificates.length > 0 && (
        <Section
          title={tt('learning.progression.certificates', 'Certificates')}
          action={
            <div className="flex gap-2">
              <button onClick={() => post({ type: 'export_cv' })} className="rounded-lg border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]">{tt('learning.progression.export_cv', 'Export CV')}</button>
              <button onClick={() => post({ type: 'open_progression_folder' })} className="rounded-lg border border-[var(--border-input)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[#cdd6f4]">{tt('learning.progression.open_folder', 'Open folder')}</button>
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {prog.certificates.map((c) => (
              <div key={c.id} className="flex flex-col rounded-xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] p-4">
                <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]"><Icon.certificate size={12} /> {tt('learning.progression.cert_badge', 'Certificate')}</div>
                <div className="text-[13px] font-semibold text-[#cdd6f4]">{c.title}</div>
                <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{c.subject} · {c.level}</div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--text-secondary)] tabular-nums">
                  <span>✓ {c.score}%</span>
                  <span>{c.completedAt ? new Date(c.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
                </div>
                <button onClick={() => post({ type: 'export_certificate', certId: c.id })} className="mt-3 w-full rounded-lg border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] py-1.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]">{tt('learning.progression.export_cert', 'Export certificate')}</button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Achievements ─────────────────────────────────────────── */}
      {(prog.achievements.length > 0 || (profile.self.achievements.length > 0)) && (
        <Section title={tt('learning.progression.achievements', 'Achievements')}>
          <div className="flex flex-wrap gap-2">
            {prog.achievements.map((a) => {
              const AIcon = a.id.startsWith('streak') ? Icon.streak : a.id.startsWith('course') || a.id === 'first-course' ? Icon.course : a.id.startsWith('lessons') ? Icon.books : Icon.star;
              return (
              <span key={a.id} className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-1.5 text-[12px] text-[#cdd6f4]">
                <span className="text-[var(--accent)]" aria-hidden><AIcon size={14} /></span>{a.title}
              </span>
              );
            })}
            {profile.self.achievements.map((a, i) => (
              <span key={`self-${i}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)]">
                <span aria-hidden><Icon.achievement size={14} /></span>{a.title}
                <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{tt('learning.progression.self_tag', 'added by you')}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* ── Activity heatmap ─────────────────────────────────────── */}
      {Object.keys(prog.stats.activity).length > 0 && (
        <Section title={tt('learning.progression.activity', 'Activity')}>
          <Heatmap activity={prog.stats.activity} />
        </Section>
      )}
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-center">
      <div className="flex items-center justify-center gap-1 text-base font-bold text-[#cdd6f4] tabular-nums"><span className="text-[var(--accent)]" aria-hidden>{icon}</span>{value}</div>
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-[#cdd6f4]">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function EarnedSkillChip({ skill }: { skill: DerivedSkill }) {
  const meta = LEVEL_META[skill.level];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px]"
      style={{ borderColor: `${meta.color}55`, background: `${meta.color}12`, color: '#cdd6f4' }}
      title={`${tt('learning.progression.verified', 'Verified')} · ${skill.lessonsMastered}/${skill.lessonsTotal} ${tt('learning.progression.lessons_mastered', 'lessons mastered')}${skill.avgScore != null ? ` · ${skill.avgScore}%` : ''}${skill.lastPracticed ? ` · ${relTime(skill.lastPracticed)}` : ''}`}
    >
      <span style={{ color: meta.color }} aria-hidden><Icon.verified size={13} /></span>
      {skill.name}
      <span className="rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: meta.color }}>{tt(meta.labelKey, meta.label)}</span>
      {skill.stale && <span title={tt('learning.progression.stale', 'Time for a refresh')} aria-hidden><Icon.clock size={12} /></span>}
    </span>
  );
}

function Heatmap({ activity }: { activity: Record<string, number> }) {
  // Last ~17 weeks (119 days), GitHub-style columns of 7.
  const days: { date: string; count: number }[] = [];
  const today = new Date();
  for (let i = 118; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: activity[key] ?? 0 });
  }
  const intensity = (n: number) => n === 0 ? 'rgba(148,163,184,0.10)' : n < 2 ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : n < 4 ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : 'var(--accent)';
  const cols: { date: string; count: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7));
  return (
    <div className="flex gap-[3px] overflow-x-auto rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
      {cols.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-[3px]">
          {col.map((d) => <div key={d.date} title={`${d.date}: ${d.count}`} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: intensity(d.count) }} />)}
        </div>
      ))}
    </div>
  );
}

// ── Edit panel ──────────────────────────────────────────────────────────────
function EditPanel({ draft, setDraft, onSave }: { draft: LearnerProfile; setDraft: (p: LearnerProfile) => void; onSave: (p: LearnerProfile) => void }) {
  const [newSkill, setNewSkill] = useState('');
  const [newAchv, setNewAchv] = useState('');

  const set = (patch: Partial<LearnerProfile['identity']>) => setDraft({ ...draft, identity: { ...draft.identity, ...patch } });
  const addSkill = () => { const s = newSkill.trim(); if (s && !draft.self.skills.includes(s)) setDraft({ ...draft, self: { ...draft.self, skills: [...draft.self.skills, s] } }); setNewSkill(''); };
  const rmSkill = (s: string) => setDraft({ ...draft, self: { ...draft.self, skills: draft.self.skills.filter((x) => x !== s) } });
  const addAchv = () => { const t = newAchv.trim(); if (t) setDraft({ ...draft, self: { ...draft.self, achievements: [...draft.self.achievements, { title: t } as LearnerSelfAchievement] } }); setNewAchv(''); };
  const rmAchv = (i: number) => setDraft({ ...draft, self: { ...draft.self, achievements: draft.self.achievements.filter((_, x) => x !== i) } });

  const inputCls = 'w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-[12px] text-[#cdd6f4] outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]';

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)]/40 p-4">
      <input className={inputCls} placeholder={tt('learning.progression.headline_ph', 'Headline — e.g. Learning Rust & systems design')} value={draft.identity.headline ?? ''} onChange={(e) => set({ headline: e.target.value })} />
      <textarea className={`${inputCls} resize-none`} rows={2} placeholder={tt('learning.progression.bio_ph', 'A short bio')} value={draft.identity.bio ?? ''} onChange={(e) => set({ bio: e.target.value })} />

      <div>
        <div className="mb-1 text-[11px] text-[var(--text-muted)]">{tt('learning.progression.add_skills', 'Your skills (added by you)')}</div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {draft.self.skills.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">{s}<button onClick={() => rmSkill(s)} className="text-[var(--text-muted)] hover:text-[#f38ba8]">✕</button></span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={inputCls} placeholder={tt('learning.progression.skill_ph', 'Add a skill')} value={newSkill} onChange={(e) => setNewSkill(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }} />
          <button onClick={addSkill} className="shrink-0 rounded-lg border border-[var(--border-input)] px-3 text-[12px] text-[var(--text-secondary)] hover:text-[#cdd6f4]">{tt('learning.progression.add', 'Add')}</button>
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px] text-[var(--text-muted)]">{tt('learning.progression.add_achievements', 'Your achievements (added by you)')}</div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {draft.self.achievements.map((a, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">{a.title}<button onClick={() => rmAchv(i)} className="text-[var(--text-muted)] hover:text-[#f38ba8]">✕</button></span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={inputCls} placeholder={tt('learning.progression.achievement_ph', 'Add an achievement — e.g. Shipped my first app')} value={newAchv} onChange={(e) => setNewAchv(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAchv(); } }} />
          <button onClick={addAchv} className="shrink-0 rounded-lg border border-[var(--border-input)] px-3 text-[12px] text-[var(--text-secondary)] hover:text-[#cdd6f4]">{tt('learning.progression.add', 'Add')}</button>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => onSave(draft)} className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90">{tt('learning.progression.save', 'Save profile')}</button>
      </div>
    </div>
  );
}
