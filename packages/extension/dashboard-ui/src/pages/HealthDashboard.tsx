import { useCallback, useMemo, useState } from 'react';
import { t, useLocale } from '../i18n';
import type { HealthDailyLog, HealthDailyPlan, HealthProfile } from '../types/messages';

/**
 * Health Dashboard — the daily display surface, top-level entry in
 * the command centre. Reads from the local-first HealthProfile
 * (Profile tab) and the per-date HealthDailyPlan (this surface's
 * own state).
 *
 * Layout, top to bottom:
 *   1. Ava's morning brief (paragraph in her voice)
 *   2. Today's plan (single-column timeline)
 *   3. Status row (three numbers: readiness / nutrition / load)
 *   4. Quick log row (meal / water / sleep / mood, one-tap)
 *   5. Why drawer (collapsible reasoning, when Ava has adjusted)
 *
 * Aesthetic register: calm, generous spacing, journal not dashboard.
 * Empty states are deliberate — "no plan yet" reads as honest rest
 * day, not unfinished software.
 *
 * Generation handlers (brief, plan creation, log capture) land in
 * follow-up commits; this shell defines the slots and the data path
 * so the layout is locked before behaviour fills it in.
 */

interface Props {
  profile: HealthProfile | null;
  plan: HealthDailyPlan | null;
  onSavePlan: (plan: HealthDailyPlan) => void;
  onGenerateMorningBrief: (date: string) => void;
  briefGenerating: boolean;
  briefError: string | null;
  // Jumps to the Health & Nutrition page's Profile tab — the goals
  // pointer and empty-state both use it so the dashboard's references
  // to goals have somewhere to lead.
  onNavigateToProfile: () => void;
}

export function HealthDashboard({
  profile, plan, onSavePlan, onGenerateMorningBrief, briefGenerating, briefError, onNavigateToProfile,
}: Props) {
  useLocale();
  const today = todayIso();
  const greeting = useMemo(() => greetingFor(new Date()), []);
  const profileEmpty = useMemo(() => isProfileEmpty(profile), [profile]);
  // Goals unset but the profile isn't otherwise empty — the brief
  // talks about goals, so the operator needs a direct route to set
  // them. (Fully-empty profiles get the ProfileEmptyState instead.)
  const goalUnset = !profile?.goals?.primary && !profile?.goals?.weekly_focus;

  // Quick-log writes — every log action lands on today's plan. When no
  // plan exists yet (common: the operator logs water before Ava has
  // written anything) we mint a fresh empty plan for the date so the
  // first log still has somewhere to live.
  const commitLog = useCallback((mutate: (log: HealthDailyLog) => HealthDailyLog) => {
    const base = plan ?? freshDailyPlan(today);
    onSavePlan({
      ...base,
      log: mutate(base.log),
      updated_at: new Date().toISOString(),
    });
  }, [plan, today, onSavePlan]);

  const quickLog = useMemo<QuickLogApi>(() => ({
    addWater: (ml) => commitLog(l => ({ ...l, water_ml: Math.max(0, l.water_ml + ml) })),
    resetWater: () => commitLog(l => ({ ...l, water_ml: 0 })),
    setSleep: (hours) => commitLog(l => ({ ...l, sleep_hours: hours })),
    setMood: (mood) => commitLog(l => ({ ...l, mood })),
    addMeal: (meal) => commitLog(l => ({
      ...l,
      meals: [...l.meals, { id: logId(), time: nowHHMM(), ...meal }],
    })),
    removeMeal: (id) => commitLog(l => ({ ...l, meals: l.meals.filter(m => m.id !== id) })),
  }), [commitLog]);

  // Inner tab — Overview (the synthesis: brief / status / log) vs
  // Plans (today's meals + training). Persisted so the operator lands
  // back where they were. Separate localStorage key from the Command
  // Centre's outer tab. Multi-week plan management lives in the
  // Planner's Plans tab — this surface is today only.
  const [innerTab, setInnerTab] = useState<HealthInnerTab>(() => {
    try {
      const stored = localStorage.getItem('ava-ext-health-tab');
      return stored === 'plans' ? 'plans' : 'overview';
    } catch { return 'overview'; }
  });
  const switchInnerTab = (next: HealthInnerTab) => {
    setInnerTab(next);
    try { localStorage.setItem('ava-ext-health-tab', next); } catch { /* quota / disabled */ }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Header — calm greeting, date, registers the dashboard's
          quiet tone before anything else loads. */}
      <header>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {formatLongDate(new Date())}
        </div>
        <h1 className="mt-1 text-[20px] font-light text-[var(--text-primary)]">
          {t(greeting)}.
        </h1>
      </header>

      {/* Inner tab nav — Overview / Plans */}
      <div className="mt-5 mb-6 flex gap-1 border-b border-[var(--border)]">
        <InnerTabBtn label={t('health.home.tab.overview')} active={innerTab === 'overview'} onClick={() => switchInnerTab('overview')} />
        <InnerTabBtn label={t('health.home.tab.plans')} active={innerTab === 'plans'} onClick={() => switchInnerTab('plans')} />
      </div>

      {/* If the profile is empty there's nothing for Ava to read,
          so the dashboard prompts setup instead of guessing. Shown
          on both tabs since both depend on the profile. */}
      {profileEmpty && (
        <div className="mb-6">
          <ProfileEmptyState onNavigateToProfile={onNavigateToProfile} />
        </div>
      )}

      {/* ── Overview — the synthesis ──────────────────────────────── */}
      {innerTab === 'overview' && (
        <div className="space-y-8">
          <Section title={t('health.home.section.brief')}>
            <BriefBlock
              plan={plan}
              profileEmpty={profileEmpty}
              generating={briefGenerating}
              error={briefError}
              onGenerate={() => onGenerateMorningBrief(today)}
            />
            {!profileEmpty && goalUnset && (
              <GoalsPointer onNavigateToProfile={onNavigateToProfile} />
            )}
          </Section>

          <Section title={t('health.home.section.where_you_are')}>
            <StatusRow plan={plan} profile={profile} />
          </Section>

          <Section title={t('health.home.section.quick_log')}>
            <QuickLogRow plan={plan} api={quickLog} />
          </Section>

          <WhyDrawer reasoning={plan?.brief_reasoning ?? null} />
        </div>
      )}

      {/* ── Plans — today's meals + training (the daily slice). The
          multi-week plan library / editor lives in the Planner. ──── */}
      {innerTab === 'plans' && (
        <div className="space-y-8">
          <TodayPlanView plan={plan} />
        </div>
      )}

      <footer className="pt-8 text-[10px] text-[var(--text-muted)]">
        {t('health.home.footer', { date: today })}
      </footer>
    </div>
  );
}

type HealthInnerTab = 'overview' | 'plans';

function InnerTabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 border-x-0 border-t-0 bg-transparent px-4 py-2 text-xs transition cursor-pointer ${
        active
          ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
          : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      }`}
    >
      {label}
    </button>
  );
}

// ── Sections + blocks ────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-3">{title}</h2>
      {children}
    </section>
  );
}

function ProfileEmptyState({ onNavigateToProfile }: { onNavigateToProfile: () => void }) {
  return (
    <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-3">
      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
        {t('health.home.empty.before')}<strong>{t('health.home.empty.profile')}</strong>{t('health.home.empty.after')}
      </p>
      <button
        type="button"
        onClick={onNavigateToProfile}
        className="mt-2.5 inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer"
      >
        {t('health.home.empty.cta')} <span aria-hidden>→</span>
      </button>
    </div>
  );
}

/**
 * Goals pointer — shows when the profile has data but no goal set.
 * The brief and plan both reference goals, so without this the
 * operator reads "Ava mentions my goals" with no visible way to set
 * them. Leads straight to the Profile tab where goals live.
 */
function GoalsPointer({ onNavigateToProfile }: { onNavigateToProfile: () => void }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-2.5">
      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
        {t('health.home.goals.prompt')}
      </p>
      <button
        type="button"
        onClick={onNavigateToProfile}
        className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer"
      >
        {t('health.home.goals.cta')} <span aria-hidden>→</span>
      </button>
    </div>
  );
}

function BriefBlock({
  plan, profileEmpty, generating, error, onGenerate,
}: {
  plan: HealthDailyPlan | null;
  profileEmpty: boolean;
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  const brief = plan?.morning_brief;
  return (
    <div>
      {brief ? (
        <p className="text-[15px] leading-[1.7] text-[var(--text-primary)] font-light">{brief}</p>
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-transparent px-4 py-5 text-[12px] text-[var(--text-muted)] italic leading-relaxed">
          {profileEmpty
            ? t('health.home.brief.empty_profile')
            : t('health.home.brief.empty')}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] text-red-300/90 leading-relaxed">
          {error}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-[11px]">
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating || profileEmpty}
          className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {generating
            ? t('health.home.brief.writing')
            : brief
              ? t('health.home.brief.rewrite')
              : t('health.home.brief.write')}
        </button>
        <span className="text-[10px] text-[var(--text-muted)] leading-relaxed">
          {t('health.home.brief.snapshot_note')}
        </span>
      </div>
    </div>
  );
}

/**
 * Today's content — meals + training for the current day, split into
 * rich-card strips. Rendered on the Overview tab (this is "today");
 * the Plans tab now carries the multi-week plan library.
 *
 * Empty states are deliberate "rest" treatments, not blanks. When the
 * active plan projects into the day (Phase D) these strips fill from
 * its day slice; for now they read from the per-date HealthDailyPlan.
 */
function TodayPlanView({ plan }: { plan: HealthDailyPlan | null }) {
  const items = plan?.items ?? [];
  const meals = items.filter(i => i.kind === 'meal');
  const training = items.filter(i => i.kind === 'workout' || i.kind === 'mobility');
  const recovery = items.filter(i => i.kind === 'rest' || i.kind === 'sleep' || i.kind === 'note');

  return (
    <>
      <Section title={t('health.home.section.todays_meals')}>
        {meals.length === 0 ? (
          <PlansEmptyCard
            title={t('health.home.meals.empty_title')}
            body={t('health.home.meals.empty_body')}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {meals.map(m => <PlanItemCard key={m.id} item={m} accent="amber" />)}
          </div>
        )}
      </Section>

      <Section title={t('health.home.section.todays_training')}>
        {training.length === 0 ? (
          <PlansEmptyCard
            title={t('health.home.training.empty_title')}
            body={t('health.home.training.empty_body')}
          />
        ) : (
          <div className="space-y-2">
            {training.map(item => <PlanItemCard key={item.id} item={item} accent="accent" />)}
          </div>
        )}
      </Section>

      {recovery.length > 0 && (
        <Section title={t('health.home.section.recovery')}>
          <div className="space-y-2">
            {recovery.map(r => <PlanItemCard key={r.id} item={r} accent="slate" />)}
          </div>
        </Section>
      )}
    </>
  );
}

function PlansEmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-transparent px-4 py-6 text-center">
      <div className="text-[12px] text-[var(--text-secondary)]">{title}</div>
      <div className="mt-1.5 mx-auto max-w-sm text-[10px] text-[var(--text-muted)] italic leading-relaxed">{body}</div>
    </div>
  );
}

function PlanItemCard({
  item, accent,
}: {
  item: HealthDailyPlan['items'][number];
  accent: 'amber' | 'accent' | 'slate';
}) {
  const accentBar =
    accent === 'amber' ? 'bg-amber-400/70' :
    accent === 'accent' ? 'bg-[var(--accent)]' :
    'bg-slate-400/50';
  const done = item.status === 'done';
  return (
    <div
      className={`flex items-stretch gap-0 overflow-hidden rounded-lg border transition ${
        done
          ? 'border-[var(--border)] bg-[var(--accent)]/5'
          : item.status === 'skipped'
            ? 'border-[var(--border)] bg-transparent opacity-60'
            : 'border-[var(--border)] bg-transparent hover:border-[var(--accent)]/40'
      }`}
    >
      <div className={`w-1 shrink-0 ${accentBar}`} aria-hidden />
      <div className="flex-1 min-w-0 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className={`text-[12px] ${done ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
            {item.title}
          </div>
          <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">{item.time}</span>
        </div>
        {item.detail && (
          <div className="mt-1 text-[10px] text-[var(--text-muted)] leading-relaxed">{item.detail}</div>
        )}
        {item.duration_minutes != null && (
          <div className="mt-1 text-[10px] text-[var(--text-muted)]">{t('health.home.n_min', { n: item.duration_minutes })}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Status row — three honest, today-scoped reads. Everything here is
 * computed from the day's own log + plan + the profile; nothing
 * reaches for a rolling baseline or week trend, because the
 * dashboard only loads one day at a time. When multi-day history
 * lands (alongside plan generation) the hints can graduate to
 * "vs your baseline" framing — until then they say what they mean.
 */
function StatusRow({ plan, profile }: { plan: HealthDailyPlan | null; profile: HealthProfile | null }) {
  const readiness = useMemo(() => computeReadiness(profile, plan), [profile, plan]);
  const nutrition = useMemo(() => computeNutrition(profile, plan), [profile, plan]);
  const training = useMemo(() => computeTrainingLoad(plan), [plan]);
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatusTile label={t('health.home.status.readiness')} value={readiness.value} hint={readiness.hint} />
      <StatusTile label={t('health.home.status.nutrition')} value={nutrition.value} hint={nutrition.hint} />
      <StatusTile label={t('health.home.status.training_load')} value={training.value} hint={training.hint} />
    </div>
  );
}

interface StatusFigure { value: string; hint: string }

/**
 * Readiness — how rested + how you feel today, weighted 60/40
 * towards sleep. Measured against your own sleep target (from the
 * profile schedule), not a rolling baseline we don't have. Returns
 * a calm word band rather than a bare number.
 */
function computeReadiness(profile: HealthProfile | null, plan: HealthDailyPlan | null): StatusFigure {
  const sleep = plan?.log.sleep_hours ?? null;
  const mood = plan?.log.mood ?? null;
  if (sleep == null && mood == null) {
    return { value: '—', hint: t('health.home.readiness.empty') };
  }
  const target = targetSleepHours(profile);
  let scoreSum = 0;
  let weightSum = 0;
  if (sleep != null) { scoreSum += Math.min(sleep / target, 1) * 0.6; weightSum += 0.6; }
  if (mood != null)  { scoreSum += (mood / 5) * 0.4;                   weightSum += 0.4; }
  const pct = Math.round((scoreSum / weightSum) * 100);
  const word = pct >= 80 ? t('health.home.readiness.strong') : pct >= 60 ? t('health.home.readiness.good') : pct >= 40 ? t('health.home.readiness.fair') : t('health.home.readiness.low');
  const bits: string[] = [];
  if (sleep != null) bits.push(t('health.home.readiness.sleep_of', { actual: formatHours(sleep), target: formatHours(target) }));
  if (mood != null)  bits.push(t('health.home.readiness.mood', { n: mood }));
  return { value: word, hint: bits.join(' · ') };
}

/**
 * Nutrition — meals logged today, with protein measured against a
 * goal-derived target (≈1.6–2.0 g/kg by primary goal). Calories are
 * shown as a raw total, not vs a target: a calorie target needs an
 * activity estimate the profile doesn't carry, so we don't fake one.
 */
function computeNutrition(profile: HealthProfile | null, plan: HealthDailyPlan | null): StatusFigure {
  const meals = plan?.log.meals ?? [];
  const water = plan?.log.water_ml ?? 0;
  if (meals.length === 0 && water === 0) {
    return { value: '—', hint: t('health.home.nutrition.empty') };
  }
  const protein = meals.reduce((a, m) => a + (m.protein_g ?? 0), 0);
  const kcal = meals.reduce((a, m) => a + (m.calories ?? 0), 0);
  const proteinTarget = proteinTargetG(profile);
  const value = meals.length > 0 ? (meals.length === 1 ? t('health.home.nutrition.meals_one') : t('health.home.nutrition.meals', { n: meals.length })) : '—';
  const bits: string[] = [];
  if (protein > 0) {
    bits.push(proteinTarget != null
      ? t('health.home.nutrition.protein_of', { actual: Math.round(protein), target: proteinTarget })
      : t('health.home.nutrition.protein', { n: Math.round(protein) }));
  }
  if (kcal > 0) bits.push(t('health.home.nutrition.kcal', { n: kcal }));
  bits.push(t('health.home.nutrition.water', { n: water }));
  return { value, hint: bits.join(' · ') };
}

/**
 * Training load — today's planned vs completed training, drawn
 * straight from the plan's workout + mobility items. No week trend:
 * the dashboard holds one day. An empty training set reads as an
 * honest rest day, not a blank.
 */
function computeTrainingLoad(plan: HealthDailyPlan | null): StatusFigure {
  const training = (plan?.items ?? []).filter(i => i.kind === 'workout' || i.kind === 'mobility');
  if (training.length === 0) {
    return { value: t('health.home.training_load.rest_day'), hint: t('health.home.training_load.none') };
  }
  const doneItems = training.filter(i => i.status === 'done');
  const plannedMin = training.reduce((a, i) => a + (i.duration_minutes ?? 0), 0);
  const doneMin = doneItems.reduce((a, i) => a + (i.duration_minutes ?? 0), 0);
  if (plannedMin > 0) {
    return {
      value: t('health.home.training_load.min_of', { done: doneMin, planned: plannedMin }),
      hint: training.length === 1
        ? t('health.home.training_load.sessions_done_one', { done: doneItems.length })
        : t('health.home.training_load.sessions_done', { done: doneItems.length, total: training.length }),
    };
  }
  return {
    value: `${doneItems.length}/${training.length}`,
    hint: training.length === 1 ? t('health.home.training_load.done_today_one') : t('health.home.training_load.done_today'),
  };
}

/** Target sleep duration in hours from the profile's bedtime→wake
 *  window, wrapping past midnight. Falls back to 8h when unset. */
function targetSleepHours(profile: HealthProfile | null): number {
  const bed = parseHHMM(profile?.schedule.sleep_target.bedtime ?? null);
  const wake = parseHHMM(profile?.schedule.sleep_target.wake ?? null);
  if (bed == null || wake == null) return 8;
  let mins = wake - bed;
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

/** Daily protein target in grams — bodyweight × a goal-driven factor.
 *  Null when weight is unset (no honest target without it). */
function proteinTargetG(profile: HealthProfile | null): number | null {
  const kg = profile?.body.weight_kg;
  if (kg == null) return null;
  const goal = profile?.goals.primary;
  const factor =
    goal === 'muscle_gain' || goal === 'athletic' ? 2.0 :
    goal === 'fat_loss' ? 1.8 :
    1.6;
  return Math.round(kg * factor);
}

/** "HH:MM" → minutes since midnight, or null if malformed. */
function parseHHMM(s: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Compact hours label — "7.5h", "8h". */
function formatHours(h: number): string {
  return `${Number(h.toFixed(1))}h`;
}

function StatusTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-3">
      <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-[18px] font-light text-[var(--text-primary)]">{value}</div>
      <div className="mt-1 text-[10px] text-[var(--text-muted)] leading-relaxed">{hint}</div>
    </div>
  );
}

/**
 * Quick log — meal / water / sleep / mood capture, no modal. Each
 * tile toggles a compact inline editor below the row; the tile label
 * reflects what's already logged so the row doubles as today's
 * at-a-glance log summary. Every action writes straight through to
 * the plan via the QuickLogApi.
 */
interface QuickLogApi {
  addWater: (ml: number) => void;
  resetWater: () => void;
  setSleep: (hours: number | null) => void;
  setMood: (mood: 1 | 2 | 3 | 4 | 5 | null) => void;
  addMeal: (meal: { description: string; calories: number | null; protein_g: number | null }) => void;
  removeMeal: (id: string) => void;
}

type QuickLogKind = 'meal' | 'water' | 'sleep' | 'mood';

const MOOD_FACE: Record<number, string> = { 1: '😔', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };
const MOOD_LABEL_KEY: Record<number, string> = { 1: 'health.home.mood.drained', 2: 'health.home.mood.low', 3: 'health.home.mood.okay', 4: 'health.home.mood.good', 5: 'health.home.mood.thriving' };
const moodLabel = (m: number): string => t(MOOD_LABEL_KEY[m]);

function QuickLogRow({ plan, api }: { plan: HealthDailyPlan | null; api: QuickLogApi }) {
  const [open, setOpen] = useState<QuickLogKind | null>(null);
  const log = plan?.log;
  const meals = log?.meals ?? [];
  const water = log?.water_ml ?? 0;
  const sleep = log?.sleep_hours ?? null;
  const mood = log?.mood ?? null;
  const toggle = (k: QuickLogKind) => setOpen(o => (o === k ? null : k));

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <LogButton label={meals.length > 0 ? t('health.home.log.meals_count', { n: meals.length }) : t('health.home.log.add_meal')} active={open === 'meal'} onClick={() => toggle('meal')} />
        <LogButton label={water > 0 ? t('health.home.log.water_count', { v: formatWater(water) }) : t('health.home.log.add_water')} active={open === 'water'} onClick={() => toggle('water')} />
        <LogButton label={sleep != null ? t('health.home.log.sleep_count', { v: formatHours(sleep) }) : t('health.home.log.add_sleep')} active={open === 'sleep'} onClick={() => toggle('sleep')} />
        <LogButton label={mood != null ? t('health.home.log.mood_count', { face: MOOD_FACE[mood] }) : t('health.home.log.add_mood')} active={open === 'mood'} onClick={() => toggle('mood')} />
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/[0.04] px-4 py-3">
          {open === 'meal'  && <MealEditor meals={meals} onAdd={api.addMeal} onRemove={api.removeMeal} />}
          {open === 'water' && <WaterEditor water={water} onAdd={api.addWater} onReset={api.resetWater} />}
          {open === 'sleep' && <SleepEditor sleep={sleep} onSet={api.setSleep} />}
          {open === 'mood'  && <MoodEditor mood={mood} onSet={api.setMood} />}
        </div>
      )}
    </div>
  );
}

function LogButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-[12px] transition cursor-pointer ${
        active
          ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10 text-[var(--accent)]'
          : 'border-[var(--border)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]'
      }`}
    >
      {label}
    </button>
  );
}

function EditorChip({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
    >
      {children}
    </button>
  );
}

function WaterEditor({ water, onAdd, onReset }: { water: number; onAdd: (ml: number) => void; onReset: () => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-[var(--text-muted)]">{t('health.home.water.today')}</span>
        <span className="text-[14px] font-light text-[var(--text-primary)]">{formatWater(water)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <EditorChip onClick={() => onAdd(250)}>{t('health.home.water.add_250')}</EditorChip>
        <EditorChip onClick={() => onAdd(500)}>{t('health.home.water.add_500')}</EditorChip>
        <EditorChip onClick={() => onAdd(-250)} disabled={water <= 0}>{t('health.home.water.sub_250')}</EditorChip>
        <EditorChip onClick={onReset} disabled={water <= 0}>{t('health.home.water.reset')}</EditorChip>
      </div>
    </div>
  );
}

function SleepEditor({ sleep, onSet }: { sleep: number | null; onSet: (h: number | null) => void }) {
  const current = sleep ?? 7.5;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-[var(--text-muted)]">{t('health.home.sleep.last_night')}</span>
        <span className="text-[14px] font-light text-[var(--text-primary)]">
          {sleep != null ? formatHours(sleep) : t('health.home.sleep.not_logged')}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <EditorChip onClick={() => onSet(Math.max(0, round1(current - 0.5)))}>{t('health.home.sleep.sub_30')}</EditorChip>
        <span className="min-w-[3.5rem] text-center text-[13px] text-[var(--text-primary)]">{formatHours(current)}</span>
        <EditorChip onClick={() => onSet(Math.min(14, round1(current + 0.5)))}>{t('health.home.sleep.add_30')}</EditorChip>
        {sleep != null && <EditorChip onClick={() => onSet(null)}>{t('health.home.sleep.clear')}</EditorChip>}
      </div>
    </div>
  );
}

function MoodEditor({ mood, onSet }: { mood: number | null; onSet: (m: 1 | 2 | 3 | 4 | 5 | null) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-[var(--text-muted)]">{t('health.home.mood.how_you_feel')}</span>
        {mood != null && (
          <button
            type="button"
            onClick={() => onSet(null)}
            className="border-none bg-transparent text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] transition cursor-pointer"
          >
            {t('health.home.sleep.clear')}
          </button>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        {([1, 2, 3, 4, 5] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => onSet(m)}
            aria-label={moodLabel(m)}
            title={moodLabel(m)}
            className={`flex-1 rounded-lg border py-2 text-[18px] transition cursor-pointer ${
              mood === m
                ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10'
                : 'border-[var(--border)] bg-transparent hover:border-[var(--accent)]/40'
            }`}
          >
            {MOOD_FACE[m]}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
        <span>{t('health.home.mood.drained')}</span>
        <span>{t('health.home.mood.thriving')}</span>
      </div>
    </div>
  );
}

function MealEditor({ meals, onAdd, onRemove }: {
  meals: HealthDailyLog['meals'];
  onAdd: (m: { description: string; calories: number | null; protein_g: number | null }) => void;
  onRemove: (id: string) => void;
}) {
  const [desc, setDesc] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const canAdd = desc.trim().length > 0;
  const numOrNull = (s: string): number | null => {
    const n = Number(s.trim());
    return s.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  const submit = () => {
    if (!canAdd) return;
    onAdd({ description: desc.trim(), calories: numOrNull(kcal), protein_g: numOrNull(protein) });
    setDesc('');
    setKcal('');
    setProtein('');
  };
  const fieldCls =
    'rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]/50 transition';

  return (
    <div>
      {meals.length > 0 && (
        <ul className="mb-3 space-y-1">
          {meals.map(m => (
            <li key={m.id} className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="min-w-0 truncate text-[var(--text-primary)]">
                <span className="font-mono text-[10px] text-[var(--text-muted)]">{m.time}</span>{' '}
                {m.description ?? t('health.home.meal.fallback')}
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                {(m.calories != null || m.protein_g != null) && (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {[
                      m.calories != null ? t('health.home.meal.kcal', { n: m.calories }) : null,
                      m.protein_g != null ? t('health.home.meal.protein_g', { n: m.protein_g }) : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(m.id)}
                  aria-label={t('health.home.meal.remove')}
                  className="border-none bg-transparent text-[var(--text-muted)] hover:text-red-300 transition cursor-pointer"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <input
          value={desc}
          onChange={e => setDesc(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder={t('health.home.meal.desc_placeholder')}
          className={`w-full ${fieldCls}`}
        />
        <div className="flex gap-2">
          <input
            value={kcal}
            onChange={e => setKcal(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            inputMode="numeric"
            placeholder={t('health.home.meal.kcal_placeholder')}
            className={`min-w-0 flex-1 ${fieldCls}`}
          />
          <input
            value={protein}
            onChange={e => setProtein(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            inputMode="numeric"
            placeholder={t('health.home.meal.protein_placeholder')}
            className={`min-w-0 flex-1 ${fieldCls}`}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canAdd}
            className="shrink-0 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-1.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('health.home.meal.add')}
          </button>
        </div>
      </div>
    </div>
  );
}

function WhyDrawer({ reasoning }: { reasoning: string | null }) {
  const [open, setOpen] = useState(false);
  if (!reasoning) return null;
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] transition flex items-center gap-1"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>{t('health.home.why.title')}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-[var(--border)] bg-transparent px-4 py-3 text-[12px] text-[var(--text-secondary)] leading-relaxed">
          {reasoning}
        </div>
      )}
    </section>
  );
}

// ── Utilities ────────────────────────────────────────────────────────

/** A blank plan for a date — minted when the operator logs something
 *  before any plan exists, so the first log still has a home. */
function freshDailyPlan(date: string): HealthDailyPlan {
  return {
    schema_version: 1,
    date,
    morning_brief: null,
    brief_reasoning: null,
    items: [],
    log: { meals: [], water_ml: 0, sleep_hours: null, mood: null },
    updated_at: null,
  };
}

/** Stable id for a logged meal — UUID where available, else a short
 *  time-seeded fallback (webview crypto is normally present, but the
 *  fallback keeps logging working if it isn't). */
function logId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through to fallback */ }
  return `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Current local time as "HH:MM" — stamps the moment a meal is logged. */
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Water volume label — litres past 1 L, millilitres below. */
function formatWater(ml: number): string {
  if (ml >= 1000) return `${Number((ml / 1000).toFixed(1))} L`;
  return `${ml} ml`;
}

/** Round to one decimal — guards float drift on the 0.5h sleep steps. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5)  return 'health.home.greeting.late_night';
  if (h < 12) return 'health.home.greeting.morning';
  if (h < 17) return 'health.home.greeting.afternoon';
  if (h < 21) return 'health.home.greeting.evening';
  return 'health.home.greeting.late_evening';
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function isProfileEmpty(p: HealthProfile | null): boolean {
  if (!p) return true;
  // Treat as empty when none of the load-bearing fields exist yet.
  const hasBody = p.body.height_cm != null || p.body.weight_kg != null || p.body.sex !== null;
  const hasGoal = p.goals.primary !== null;
  return !(hasBody || hasGoal);
}
