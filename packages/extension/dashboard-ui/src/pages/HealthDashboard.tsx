import { useState } from 'react';
import { t, useLocale } from '../i18n';
import { WeeklyPlanView } from './WeeklyPlanView';
import type { HealthPlan } from '../types/messages';

/**
 * The Command Center "Health" tab — a glance at what's on today / this week,
 * pulled from the user's active fitness / meal / combined plans. Read-only: the
 * plans + profile live in Account → "{name}'s profile"; this just surfaces them.
 * Today first (what's on now), then the week. Was the old daily home (brief +
 * status + quick-log) — replaced 2026-06-22 per the operator's call that the
 * command center is a quick look, not a workspace. Mirrors the IDE.
 */

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'health.home.greeting.late_night';
  if (h < 12) return 'health.home.greeting.morning';
  if (h < 17) return 'health.home.greeting.afternoon';
  if (h < 21) return 'health.home.greeting.evening';
  return 'health.home.greeting.late_evening';
}

function longDate(): string {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

interface Props {
  /** Full data for active, dated plans — host-loaded (load_active_health_plans). */
  activePlans: HealthPlan[];
}

export function HealthDashboard({ activePlans }: Props) {
  useLocale();
  const [innerTab, setInnerTab] = useState<'today' | 'week'>('today');

  const tabCls = (active: boolean): string =>
    `-mb-px border-b-2 border-x-0 border-t-0 bg-transparent px-3 py-2 text-xs transition cursor-pointer ${
      active ? 'border-[var(--accent)] text-[var(--accent)] font-semibold' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
    }`;

  return (
    <div className="w-full px-6 py-8">
      <header>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{longDate()}</div>
        <h1 className="mt-1 text-[20px] font-light text-[var(--text-primary)]">{t(greetingKey())}.</h1>
      </header>

      <div className="mt-5 mb-6 flex gap-1 border-b border-[var(--border)]">
        <button onClick={() => setInnerTab('today')} className={tabCls(innerTab === 'today')}>{t('health.week.today')}</button>
        <button onClick={() => setInnerTab('week')} className={tabCls(innerTab === 'week')}>{t('health.week.title')}</button>
      </div>

      <WeeklyPlanView plans={activePlans} view={innerTab === 'today' ? 'today' : 'week'} />
    </div>
  );
}
