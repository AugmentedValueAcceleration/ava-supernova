import { useMemo } from 'react';
import { t, useLocale } from '../i18n';
import { Icon } from '../components/Icon';
import type { HealthPlan } from '../types/messages';

/**
 * This week / today at a glance — the Command Center health tab. Lays the
 * active fitness / meal / combined plans' training + meals onto the current
 * week (Mon–Sun), today highlighted. Read-only; the plans live in
 * Account → "{name}'s profile". Mirror of the IDE's WeeklyPlanView — the IDE
 * self-loads from local files; here the host hands the active plans in as a
 * prop (load_active_health_plans).
 */

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function planDayDateKey(startDate: string, dayIndex: number): string {
  const d = new Date(`${startDate}T00:00:00`);
  d.setDate(d.getDate() + dayIndex - 1);
  return ymd(d);
}

interface DayCell {
  date: Date;
  key: string;
  training: string[];
  trainingTitle: string | null;
  meals: Array<{ slot: string; name: string }>;
}

export function WeeklyPlanView({ plans, view }: { plans: HealthPlan[]; view: 'today' | 'week' }) {
  useLocale();
  const todayKey = ymd(new Date());

  const cells = useMemo<DayCell[]>(() => {
    const monday = startOfWeek(new Date());
    const week: DayCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      week.push({ date, key: ymd(date), training: [], trainingTitle: null, meals: [] });
    }
    const byKey = new Map(week.map(c => [c.key, c]));
    for (const plan of plans) {
      if (!plan.start_date) continue;
      for (const day of plan.days) {
        const cell = byKey.get(planDayDateKey(plan.start_date, day.day_index));
        if (!cell) continue;
        if (plan.type === 'fitness' || plan.type === 'combined') {
          if (day.title && !cell.trainingTitle) cell.trainingTitle = day.title;
          for (const ex of day.training) if (ex.name) cell.training.push(ex.name);
        }
        if (plan.type === 'meal' || plan.type === 'combined') {
          for (const m of day.meals) if (m.name) cell.meals.push({ slot: m.slot, name: m.name });
        }
      }
    }
    return week;
  }, [plans]);

  if (plans.length === 0) {
    return (
      <div className="mx-auto mt-2 max-w-[520px] rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-6 py-7 text-center">
        <div className="mb-2 flex justify-center text-[var(--accent)]"><Icon.calendar size={28} /></div>
        <div className="mb-1.5 text-[14px] font-semibold text-[var(--text-primary)]">{t('health.week.empty.title')}</div>
        <p className="m-0 text-[12px] leading-relaxed text-[var(--text-muted)]">{t('health.week.empty.body')}</p>
      </div>
    );
  }

  if (view === 'today') {
    const today = cells.find(c => c.key === todayKey);
    const tr = today?.training ?? [];
    const ml = today?.meals ?? [];
    const nothing = tr.length === 0 && ml.length === 0;
    return (
      <div className="flex flex-col gap-[18px]">
        <div className="text-[13px] text-[var(--text-muted)]">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          {today?.trainingTitle && <span className="font-semibold text-[var(--text-primary)]"> · {today.trainingTitle}</span>}
        </div>
        {tr.length > 0 && (
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{t('health.week.training')}</div>
            <div className="flex flex-col gap-1.5">
              {tr.map((name, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-[var(--accent)]/15 bg-[var(--accent)]/[0.06] px-3 py-2 text-[13px] text-[var(--text-primary)]">
                  <span aria-hidden><Icon.fitness size={12} /></span>{name}
                </div>
              ))}
            </div>
          </div>
        )}
        {ml.length > 0 && (
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{t('health.week.meals')}</div>
            <div className="flex flex-col gap-1.5">
              {ml.map((m, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[13px] text-[var(--text-primary)]">
                  <span aria-hidden><Icon.meal size={12} /></span><span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{m.slot}</span>{m.name}
                </div>
              ))}
            </div>
          </div>
        )}
        {nothing && <div className="py-5 text-[12px] italic text-[var(--text-muted)]">{t('health.week.today_rest')}</div>}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-7 gap-2">
      {cells.map((cell) => {
        const isToday = cell.key === todayKey;
        const rest = cell.training.length === 0 && cell.meals.length === 0;
        return (
          <div key={cell.key} className={`flex min-h-[150px] flex-col gap-2 rounded-lg p-2.5 border ${isToday ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10' : 'border-[var(--accent)]/12 bg-white/[0.015]'}`}>
            <div className="flex items-baseline justify-between">
              <span className={`text-[10px] uppercase tracking-wide ${isToday ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                {cell.date.toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
              <span className={`text-[12px] ${isToday ? 'font-bold text-white' : 'font-medium text-[var(--text-muted)]'}`}>{cell.date.getDate()}</span>
            </div>
            {cell.trainingTitle && <div className="text-[11px] font-semibold text-[var(--text-primary)]">{cell.trainingTitle}</div>}
            {cell.training.length > 0 && (
              <div className="flex flex-col gap-[3px]">
                {cell.training.slice(0, 4).map((name, i) => (
                  <div key={i} className="flex gap-1 text-[10px] leading-tight text-[var(--text-secondary)]"><span aria-hidden className="opacity-70"><Icon.fitness size={11} /></span><span className="truncate">{name}</span></div>
                ))}
                {cell.training.length > 4 && <div className="text-[9px] text-[var(--text-muted)]">+{cell.training.length - 4} more</div>}
              </div>
            )}
            {cell.meals.length > 0 && (
              <div className="mt-auto flex flex-col gap-[3px]">
                {cell.meals.slice(0, 4).map((m, i) => (
                  <div key={i} className="flex gap-1 text-[10px] leading-tight text-[var(--text-secondary)]"><span aria-hidden className="opacity-70"><Icon.meal size={11} /></span><span className="truncate">{m.name}</span></div>
                ))}
                {cell.meals.length > 4 && <div className="text-[9px] text-[var(--text-muted)]">+{cell.meals.length - 4} more</div>}
              </div>
            )}
            {rest && <div className="mt-1 text-[10px] italic text-[var(--text-muted)]">{t('health.week.rest')}</div>}
          </div>
        );
      })}
    </div>
  );
}
