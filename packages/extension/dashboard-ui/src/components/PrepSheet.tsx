// ─── Prep & batch cooking ───────────────────────────────────────────────────
//
// Where the cooking actually lands in a week.
//
// A meal plan tells you what to eat. It does not tell you that Tuesday needs
// ninety minutes at the hob after work, that Thursday's dish had to be
// marinating since Wednesday, or that you are about to cook the same chilli
// three times when once would do. That is the difference between a plan that
// survives a work week and one abandoned on day three.
//
// The reasoning is @ava/core's `weekPrep`, shared with the IDE — including the
// two things it deliberately refuses to trust: `batch_portions` (a seeded
// constant across 78% of the library) and `total_time_minutes` as workload
// (elapsed, not effort — its maximum is thirty days).

import { useMemo } from 'react';
import { t, useLocale } from '../i18n';
import { weekPrep, shortDuration, type PrepDay, type CookOnce } from '../../../../core/dist/health/prep.js';
import { Sheet } from './ShoppingListSheet';
import type { HealthPlan, HealthProfile } from '../types/messages';

export function PrepSheet({ plan, profile, onClose }: {
  plan: HealthPlan;
  /** Live profile — extension plans carry no profile_snapshot. */
  profile: HealthProfile | null;
  onClose: () => void;
}) {
  useLocale();

  // Real dates when the plan is placed in time — that is the only thing that
  // makes weekday-vs-weekend, and therefore a time budget, mean anything.
  const sources = useMemo(() => {
    const start = plan.start_date ? Date.parse(`${plan.start_date}T00:00:00Z`) : NaN;
    return plan.days.map(day => ({
      day,
      date: Number.isNaN(start)
        ? null
        : new Date(start + (day.day_index - 1) * 86_400_000).toISOString().slice(0, 10),
    }));
  }, [plan.days, plan.start_date]);

  // Null is UNKNOWN, never zero: with no stated budget nothing is called
  // heavy, because there is nothing to be heavy against.
  const kitchen = profile?.kitchen ?? null;

  const prep = useMemo(() => weekPrep(sources, kitchen), [sources, kitchen]);
  const cooked = prep.days.filter(d => d.minutes > 0);
  const anyBudget = prep.days.some(d => d.budget != null);

  return (
    <Sheet title={t('health.prep.title')} subtitle={plan.title} onClose={onClose}>
      {!cooked.length ? (
        <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">{t('health.prep.nothing')}</div>
      ) : (
        <div className="space-y-5">
          {/* The week at a glance */}
          <div className="flex flex-wrap gap-4 text-[11px]">
            <Stat label={t('health.prep.hands_on')} value={shortDuration(prep.totalMinutes)} />
            {prep.heaviest != null && (
              <Stat label={t('health.prep.heaviest')} value={`${t('health.plans.day_n', { n: prep.heaviest })}`} />
            )}
            {prep.minutesSaved > 0 && (
              <Stat label={t('health.prep.saves')} value={shortDuration(prep.minutesSaved)} tone="good" />
            )}
          </div>

          {/* A budget nobody has given is not a budget of zero — say so rather
              than colouring every day green against nothing. */}
          {!anyBudget && (
            <p className="rounded-lg border border-[var(--border)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
              {t('health.prep.no_budget')}
            </p>
          )}

          {/* Per-day load */}
          <div className="space-y-1.5">
            {prep.days.map(d => <DayBar key={d.day_index} day={d} max={Math.max(...prep.days.map(x => x.minutes), 1)} />)}
          </div>

          {/* Start ahead — unattended time, which is not work but does decide
              which evening you have to begin. */}
          {prep.days.some(d => d.startAhead.length > 0) && (
            <section>
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('health.prep.start_ahead')}</h3>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{t('health.prep.start_ahead_hint')}</p>
              <ul className="mt-2 space-y-1.5">
                {prep.days.flatMap(d => d.startAhead.map(s => (
                  <li key={`${d.day_index}-${s.mealId}`} className="flex items-baseline justify-between gap-3 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2">
                    <span className="min-w-0 text-[12px] text-[var(--text-primary)]">{s.name}</span>
                    <span className="shrink-0 text-[11px] text-amber-200/90">
                      {t('health.plans.day_n', { n: d.day_index })} · {s.daysAhead === 1
                        ? t('health.prep.day_before')
                        : `${s.daysAhead} ${t('health.prep.days_before')}`}
                    </span>
                  </li>
                )))}
              </ul>
            </section>
          )}

          {/* Cook once — derived from the PLAN (the same dish, more than once,
              inside the days the library says it keeps), never from the
              batch_portions column, which is a seeded 12 across most of it. */}
          {prep.cookOnce.length > 0 && (
            <section>
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('health.prep.cook_once')}</h3>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{t('health.prep.cook_once_hint')}</p>
              <ul className="mt-2 space-y-1.5">
                {prep.cookOnce.map(c => <CookOnceRow key={c.slug} c={c} />)}
              </ul>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className={`mt-0.5 text-[14px] font-medium ${tone === 'good' ? 'text-emerald-300' : 'text-[var(--text-primary)]'}`}>{value}</div>
    </div>
  );
}

function DayBar({ day, max }: { day: PrepDay; max: number }) {
  const pct = Math.round((day.minutes / max) * 100);
  const over = day.overBy != null;
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-[11px] text-[var(--text-muted)]">
        {t('health.plans.day_n', { n: day.day_index })}
      </span>
      <div className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-[var(--border)]/40">
        {day.minutes > 0 && (
          <div
            className={`h-full rounded transition-all ${over ? 'bg-amber-400/60' : 'bg-[var(--accent)]/50'}`}
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        )}
      </div>
      <span className={`w-24 shrink-0 text-right text-[11px] tabular-nums ${over ? 'text-amber-300' : 'text-[var(--text-secondary)]'}`}>
        {day.minutes > 0 ? shortDuration(day.minutes) : <span className="text-[var(--text-muted)]">{t('health.prep.no_cooking')}</span>}
      </span>
      {/* Only ever shown against a budget somebody actually stated. */}
      {over && (
        <span className="shrink-0 text-[10px] text-amber-300/80">
          {shortDuration(day.overBy!)} {t('health.prep.over_budget')}
        </span>
      )}
    </div>
  );
}

function CookOnceRow({ c }: { c: CookOnce }) {
  return (
    <li className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-[12px] text-[var(--text-primary)]">{c.name}</span>
        <span className="shrink-0 text-[11px] text-emerald-300">−{shortDuration(c.minutesSaved)}</span>
      </div>
      <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
        {t('health.prep.cook_on_day')} {c.cookOn} · {c.servings} {t('health.prep.make_servings')} ·{' '}
        {t('health.prep.covers_days')} {c.covers.join(', ')} · {t('health.prep.keeps_days')} {c.keepsDays}
      </div>
    </li>
  );
}
