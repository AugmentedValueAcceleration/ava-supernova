// ─── Copy a day, or a week ──────────────────────────────────────────────────
//
// Two modes rather than two features: the same act at different scales, and
// somebody building a longer programme wants the week one far more often.
//
// This is the ONE action in the builder that destroys work — every other edit
// changes a single field — so it says what it will overwrite BEFORE doing it. A
// target that already has something on it is marked, and the count is on the
// button, not in a confirmation nobody reads.
//
// The copy and progression rules are @ava/core's, shared with the IDE.

import { useState, useMemo } from 'react';
import { t, useLocale } from '../i18n';
import { Sheet } from './ShoppingListSheet';
import { Select } from './Select';
import {
  duplicateDay, duplicateWeek, weekCount, daysInWeek, progressDays,
  type Progression,
} from '../../../../core/dist/health/duplicate.js';
import type { HealthPlan } from '../types/messages';

export function DuplicateSheet({ plan, fromDay, onApply, onClose }: {
  plan: HealthPlan;
  fromDay: number;
  onApply: (next: HealthPlan) => void;
  onClose: () => void;
}) {
  useLocale();
  const weeks = weekCount(plan);
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [targetDays, setTargetDays] = useState<Set<number>>(() => new Set());
  const [targetWeek, setTargetWeek] = useState<number | null>(null);
  const [progression, setProgression] = useState<Progression>('same');

  const sourceWeek = Math.floor((fromDay - 1) / 7) + 1;
  const source = plan.days.find(d => d.day_index === fromDay);
  const sourceEmpty = !source || (source.training.length === 0 && source.meals.length === 0);

  const hasContent = (index: number) => {
    const d = plan.days.find(x => x.day_index === index);
    return !!d && (d.training.length > 0 || d.meals.length > 0);
  };

  // Counted up front and shown on the button — not discovered afterwards.
  const willReplace = useMemo(() => {
    if (mode === 'day') return [...targetDays].filter(hasContent).length;
    if (targetWeek == null) return 0;
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const target = (targetWeek - 1) * 7 + 1 + i;
      const src = (sourceWeek - 1) * 7 + 1 + i;
      if (plan.days.some(d => d.day_index === src) && hasContent(target)) n++;
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, targetDays, targetWeek, plan, sourceWeek]);

  const canApply = mode === 'day' ? targetDays.size > 0 : targetWeek != null;

  const apply = () => {
    if (!canApply) return;
    // Copy first, then step the COPY forward — never the source. Repeating
    // week one unchanged for a month is what this is here to prevent, and
    // stepping the source would rewrite work already done.
    if (mode === 'day') {
      const targets = [...targetDays];
      onApply(progressDays(duplicateDay(plan, fromDay, targets), targets, progression));
    } else if (targetWeek != null) {
      const copied = duplicateWeek(plan, sourceWeek, targetWeek);
      onApply(progressDays(copied, daysInWeek(copied, targetWeek), progression));
    }
    onClose();
  };

  const allDays = plan.days.map(d => d.day_index).filter(i => i !== fromDay);

  return (
    <Sheet title={t('health.dup.title')} subtitle={source?.title ?? null} onClose={onClose}>
      {sourceEmpty ? (
        <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">{t('health.dup.nothing_to_copy')}</div>
      ) : (
        <div className="space-y-4">
          {/* Week mode only exists once there is a second week. */}
          {weeks > 1 && (
            <div className="flex gap-1.5">
              {(['day', 'week'] as const).map(mo => (
                <button key={mo} type="button" onClick={() => setMode(mo)}
                  className={`rounded-full border px-3 py-1 text-[11px] transition cursor-pointer ${
                    mode === mo
                      ? 'border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}>
                  {t(mo === 'day' ? 'health.dup.mode_day' : 'health.dup.mode_week')}
                </button>
              ))}
            </div>
          )}

          {mode === 'day' ? (
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                {t('health.dup.pick_days', { n: fromDay })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allDays.map(i => {
                  const on = targetDays.has(i);
                  const occupied = hasContent(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      title={occupied ? t('health.dup.has_content') : undefined}
                      onClick={() => setTargetDays(prev => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        return next;
                      })}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition cursor-pointer ${
                        on
                          ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                          : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40'
                      }`}
                    >
                      {t('health.dup.day_n', { n: i })}
                      {/* Marked BEFORE the copy, so nothing is lost by surprise. */}
                      {occupied && <span className="ml-1 text-amber-300">•</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                {t('health.dup.pick_week', { n: sourceWeek })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: weeks }, (_, i) => i + 1).filter(w => w !== sourceWeek).map(w => (
                  <button key={w} type="button" onClick={() => setTargetWeek(w)}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] transition cursor-pointer ${
                      targetWeek === w
                        ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40'
                    }`}>
                    {t('health.dup.week_n', { n: w })}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* An explicit choice, never a silent rule. Load cannot be stepped
              honestly here — weight is free text, and adding 2.5% to
              "bodyweight" is nonsense — so volume is what is offered. */}
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('health.dup.progression')}</div>
            <Select
              value={progression}
              onChange={v => setProgression(v as Progression)}
              options={[
                { value: 'same', label: t('health.dup.prog_same') },
                { value: 'one_more_rep', label: t('health.dup.prog_rep') },
                { value: 'one_more_set', label: t('health.dup.prog_set') },
              ]}
            />
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">{t('health.dup.prog_hint')}</p>
          </div>

          {willReplace > 0 && (
            <p className="rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
              {willReplace === 1
                ? t('health.dup.will_replace_one')
                : t('health.dup.will_replace_many', { n: willReplace })}
            </p>
          )}

          <button
            type="button"
            onClick={apply}
            disabled={!canApply}
            className="w-full rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-[12px] font-medium text-[var(--accent)] transition enabled:cursor-pointer enabled:hover:bg-[var(--accent)]/20 disabled:opacity-40"
          >
            {t('health.dup.apply')}
          </button>
        </div>
      )}
    </Sheet>
  );
}
