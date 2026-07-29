// ─── The training log ───────────────────────────────────────────────────────
//
// What actually happened, as opposed to what the plan asked for.
//
// Filled in AFTER the session on this surface. Nobody logs sets between reps at
// a keyboard, so this is not a live runner like the phone's — it opens
// pre-filled with the targets and you correct what was different. That
// difference IS the record: identical-to-plan tells us little, "3×8 at 40 not
// 3×10 at 45" tells us everything.
//
// SKIPPED IS A FIRST-CLASS ANSWER, one tap, and deliberately as easy as logging
// a set. Blank means unknown; skipped means it did not happen. Everything
// downstream — progression, what Ava notices — depends on being able to tell
// those apart, and an unknown that looks like a zero is how a plan gets made
// harder for somebody who has been struggling.

import { useState, useMemo } from 'react';
import { t, useLocale } from '../i18n';
import { Sheet } from './ShoppingListSheet';
import type { HealthPlanDay, HealthPlanExercise } from '../types/messages';
import type { GymSession, GymExercise, GymSet } from '../../../../core/dist/health/session-types.js';

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A number the user typed, or null. Never 0-from-empty: a blank weight is
 *  "not recorded", and bodyweight movements legitimately have no weight. */
function num(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Seed the session from the plan's targets so the common case — did it as
 *  written — is a single click, and only the differences need typing. */
export function seedFrom(day: HealthPlanDay, planId: string | null, date: string): GymSession {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    id: newId('gs'),
    date,
    source: planId ? 'plan' : 'freestyle',
    plan_id: planId,
    day_index: day.day_index,
    status: 'in-progress',
    title: day.title,
    notes: null,
    started_at: null,
    completed_at: null,
    updated_at: now,
    exercises: day.training.map((ex: HealthPlanExercise) => ({
      id: newId('ex'),
      ref: ex.ref ?? null,
      name: ex.name,
      target_sets: ex.sets,
      target_reps: ex.reps,
      target_weight: ex.weight,
      target_rest_seconds: ex.rest_seconds,
      tempo: ex.tempo,
      notes: null,
      sets: [],
    })),
  } as GymSession;
}

export function LogSessionSheet({ day, planId, date, existing, onSave, onClose }: {
  day: HealthPlanDay;
  planId: string | null;
  date: string;
  /** A session already logged for this day, reopened for editing. */
  existing: GymSession | null;
  onSave: (session: GymSession) => void;
  onClose: () => void;
}) {
  useLocale();
  const [session, setSession] = useState<GymSession>(() => existing ?? seedFrom(day, planId, date));
  const [saved, setSaved] = useState(false);

  const patchExercise = (id: string, next: Partial<GymExercise>) =>
    setSession(s => ({ ...s, exercises: s.exercises.map(e => (e.id === id ? { ...e, ...next } : e)) }));

  const addSet = (ex: GymExercise) => {
    const last = ex.sets[ex.sets.length - 1];
    patchExercise(ex.id, {
      sets: [...ex.sets, {
        id: newId('set'),
        // Carry the previous set forward — the second set of five is usually
        // the same as the first, and retyping it is the friction that stops
        // people logging at all.
        weight: last?.weight ?? null,
        reps: last?.reps ?? (ex.target_reps && /^\d+$/.test(ex.target_reps) ? Number(ex.target_reps) : null),
        rpe: null,
        notes: null,
        completed_at: new Date().toISOString(),
      } as GymSet],
    });
  };

  const patchSet = (ex: GymExercise, setId: string, next: Partial<GymSet>) =>
    patchExercise(ex.id, { sets: ex.sets.map(s => (s.id === setId ? { ...s, ...next } : s)) });

  const removeSet = (ex: GymExercise, setId: string) =>
    patchExercise(ex.id, { sets: ex.sets.filter(s => s.id !== setId) });

  /** Skipped is recorded as an explicit empty-with-intent: no sets, and the
   *  exercise note says so. Distinguishable from untouched, which is silence. */
  const toggleSkipped = (ex: GymExercise) => {
    const isSkipped = ex.notes === 'skipped';
    patchExercise(ex.id, { notes: isSkipped ? null : 'skipped', sets: isSkipped ? ex.sets : [] });
  };

  const loggedCount = useMemo(
    () => session.exercises.filter(e => e.sets.length > 0).length,
    [session.exercises],
  );

  const save = () => {
    const now = new Date().toISOString();
    const anyLogged = session.exercises.some(e => e.sets.length > 0);
    const anySkipped = session.exercises.some(e => e.notes === 'skipped');
    onSave({
      ...session,
      // Only a session with something in it counts as completed. One where
      // everything was skipped is 'skipped', and one nobody touched stays
      // in-progress rather than claiming to be a finished workout.
      status: anyLogged ? 'completed' : anySkipped ? 'skipped' : 'in-progress',
      completed_at: anyLogged ? now : null,
      updated_at: now,
    });
    setSaved(true);
    setTimeout(onClose, 500);
  };

  if (!day.training.length) {
    return (
      <Sheet title={t('health.log.title')} subtitle={day.title} onClose={onClose}>
        <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">{t('health.log.nothing')}</div>
      </Sheet>
    );
  }

  return (
    <Sheet title={t('health.log.title')} subtitle={day.title ?? date} onClose={onClose}>
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-muted)]">{t('health.log.prefill_note')}</p>

      <div className="space-y-3">
        {session.exercises.map(ex => {
          const skipped = ex.notes === 'skipped';
          const target = [
            ex.target_sets != null ? `${ex.target_sets}×${ex.target_reps ?? '?'}` : ex.target_reps,
            ex.target_weight,
          ].filter(Boolean).join(' · ');
          return (
            <div key={ex.id} className={`rounded-lg border px-3 py-2.5 transition ${
              skipped ? 'border-[var(--border)] bg-transparent opacity-60' : 'border-[var(--border)] bg-[var(--bg-input)]/30'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-[12px] ${skipped ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>{ex.name}</div>
                  {target && <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{target} {t('health.log.planned')}</div>}
                </div>
                {/* As easy as logging — see the note at the top of this file. */}
                <button type="button" onClick={() => toggleSkipped(ex)}
                  className={`shrink-0 cursor-pointer rounded-md border px-2.5 py-1 text-[10px] font-medium transition ${
                    skipped
                      ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}>
                  {t('health.log.skipped')}
                </button>
              </div>

              {!skipped && (
                <>
                  {ex.sets.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {ex.sets.map((s, i) => (
                        <div key={s.id} className="flex items-center gap-2">
                          <span className="w-4 shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">{i + 1}</span>
                          <input inputMode="decimal" value={s.weight ?? ''} placeholder="—"
                            onChange={e => patchSet(ex, s.id, { weight: num(e.target.value) })}
                            className="w-16 rounded border border-[var(--border-input)] bg-[#1a1028] px-2 py-1 text-[11px] text-white outline-none focus:border-[var(--accent)]" />
                          <span className="text-[10px] text-[var(--text-muted)]">{t('health.log.weight')}</span>
                          <input inputMode="numeric" value={s.reps ?? ''} placeholder="—"
                            onChange={e => patchSet(ex, s.id, { reps: num(e.target.value) })}
                            className="w-14 rounded border border-[var(--border-input)] bg-[#1a1028] px-2 py-1 text-[11px] text-white outline-none focus:border-[var(--accent)]" />
                          <span className="text-[10px] text-[var(--text-muted)]">{t('health.log.reps')}</span>
                          <button type="button" onClick={() => removeSet(ex, s.id)} title={t('health.log.remove_set')}
                            className="ml-auto cursor-pointer border-none bg-transparent px-1 text-[var(--text-muted)] transition hover:text-red-300">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => addSet(ex)}
                    className="mt-2 cursor-pointer rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-2.5 py-1 text-[10px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/15">
                    + {t('health.log.add_set')}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('health.log.notes')}</div>
        <textarea rows={2} value={session.notes ?? ''}
          onChange={e => setSession(s => ({ ...s, notes: e.target.value || null }))}
          placeholder={t('health.log.notes_placeholder')}
          className="w-full resize-y rounded-lg border border-[var(--border-input)] bg-[#1a1028] px-3 py-2 font-[inherit] text-[12px] text-white outline-none focus:border-[var(--accent)]" />
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-muted)]">{t('health.log.skipped_hint')}</p>

      <button type="button" onClick={save} disabled={saved}
        className="mt-3 w-full rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-[12px] font-medium text-[var(--accent)] transition enabled:cursor-pointer enabled:hover:bg-[var(--accent)]/20 disabled:opacity-50">
        {saved ? t('health.log.saved') : `${t('health.log.save')}${loggedCount ? ` · ${loggedCount} ${t('health.log.logged_count')}` : ''}`}
      </button>
    </Sheet>
  );
}
