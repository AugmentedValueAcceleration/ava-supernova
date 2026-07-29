import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Icon } from '../components/Icon';
import { t, tt, useLocale } from '../i18n';
import { Select } from '../components/Select';
// The rich, tabbed catalogue detail bodies — reused so a recipe/exercise opened
// from a plan or the day view reads identically to the library, with the full
// schema (skill levels, full nutrition, diets, equipment, per-step technique).
import { ExerciseDetailBody, RecipeDetailBody } from './Health';
import { ShoppingListSheet } from '../components/ShoppingListSheet';
import { PrepSheet } from '../components/PrepSheet';
import { fillDayMeta } from '../lib/plan-meal-meta';
import { StartersSheet } from '../components/StartersSheet';
import { DuplicateSheet } from '../components/DuplicateSheet';
import { AssistSheet, dayDate, type DayProposal } from '../components/AssistSheet';
import { LogSessionSheet } from '../components/LogSessionSheet';
import type {
  HealthPlan, HealthPlanSummary, HealthPlanType, HealthPlanStatus,
  HealthPlanDay, HealthPlanExercise, HealthPlanMeal,
  HealthExerciseSummary, HealthRecipeSummary,
  HealthExerciseDetail, HealthRecipeDetail, HealthRecipeNutrition,
  HealthProfile,
  CuratedPlanSummary, CuratedPlanDetail,
  TrainingSessionSummary,
} from '../types/messages';

/**
 * Health Plans — the multi-week plan feature, mounted as the Planner's
 * "Plans" tab.
 *
 * Layout contract:
 *  - The Plans tab itself is never an overlay. It has two inner tabs:
 *    Calendar (a month grid that fits one page) and Programs (the list).
 *  - Creating or opening a plan raises ONE overlay — a single fixed
 *    size, filling the viewport, that never resizes between its phases
 *    (setup → build → add). Only an internal region scrolls; the page
 *    never does.
 */

/** The picker's search call — query + page offset + category filter. */
type PlanSearch = (o: { q: string; offset: number; category: string | null }) => void;

/** Category chips — exercises filter by workout type, recipes by course. */
const EXERCISE_CATEGORIES = ['strength', 'hypertrophy', 'conditioning', 'mobility', 'hybrid', 'yoga', 'pilates', 'running', 'cycling', 'recovery', 'hiit'];
const RECIPE_CATEGORIES = ['breakfast', 'starter', 'main', 'side', 'dessert', 'snack', 'beverage', 'sauce', 'bread'];
const PICKER_PAGE_SIZE = 24;

export interface HealthPlansProps {
  plans: HealthPlanSummary[];
  /** Full (dated) plans with days — gives the calendar real per-day content. */
  fullPlans?: HealthPlan[];
  planOpen: HealthPlan | null;
  onOpenPlan: (id: string) => void;
  onSavePlan: (plan: HealthPlan) => void;
  onDeletePlan: (id: string) => void;
  onClosePlan: () => void;
  exerciseResults: HealthExerciseSummary[];
  recipeResults: HealthRecipeSummary[];
  catalogSearching: boolean;
  exerciseTotal: number;
  recipeTotal: number;
  onSearchExercises: PlanSearch;
  onSearchRecipes: PlanSearch;
  exerciseDetails: Record<string, HealthExerciseDetail>;
  recipeDetails: Record<string, HealthRecipeDetail>;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
  /** When provided, the setup wizard shows an "Ask Ava" door beside
   *  "Build myself" — handing the chosen type to Ava in the health room
   *  (catalogue-aware, profile-loaded) instead of the manual builder.
   *  Omitted on surfaces that only offer manual building. */
  onAskAva?: (type: HealthPlanType) => void;
  /** For the shopping list (household) and the prep plan (cooking-time
   *  budget). Optional so a caller that has no profile still renders. */
  healthProfile?: HealthProfile | null;
  /** The training log — what actually happened, as opposed to what was
   *  planned. Recorded after the fact on this surface; the phone runs it live. */
  trainingLog?: {
    sessions: TrainingSessionSummary[];
    open: unknown | null;
    onLoad: (from: string, to: string) => void;
    onLoadOne: (id: string) => void;
    onSave: (session: unknown) => void;
  };
  /** Ask Ava to change ONE day. She PROPOSES — the reply is shown beside the
   *  current day and nothing is written until the operator accepts. */
  dayAssist?: {
    busy: boolean;
    error: string | null;
    proposal: DayProposal | null;
    onAsk: (args: {
      planType: HealthPlanType; goal: string | null; day: HealthPlanDay; week: HealthPlanDay[];
      instruction: string; date: string | null; profile: unknown;
    }) => void;
    onDiscard: () => void;
  };
  /** The starter shelf. A curated plan is a TEMPLATE: starting one takes a
   *  copy, so the week becomes theirs and a later correction to the template
   *  never changes it under them. See @ava/core health/starters. */
  curated?: {
    plans: CuratedPlanSummary[];
    loading: boolean;
    error: string | null;
    detail: CuratedPlanDetail | null;
    detailLoading: boolean;
    onLoad: () => void;
    onLoadDetail: (id: string) => void;
    onStart: (plan: HealthPlan, curatedId: string) => void;
  };
}

export function HealthPlans({
  plans, fullPlans, planOpen, onOpenPlan, onSavePlan, onDeletePlan, onClosePlan,
  exerciseResults, recipeResults, catalogSearching, exerciseTotal, recipeTotal, onSearchExercises, onSearchRecipes,
  exerciseDetails, recipeDetails, onLoadExerciseDetail, onLoadRecipeDetail,
  onAskAva, healthProfile = null, curated, dayAssist, trainingLog,
}: HealthPlansProps) {
  useLocale();
  const [setupOpen, setSetupOpen] = useState(false);

  return (
    <>
      <BasePlansTab plans={plans} fullPlans={fullPlans} exerciseDetails={exerciseDetails} recipeDetails={recipeDetails} onLoadExerciseDetail={onLoadExerciseDetail} onLoadRecipeDetail={onLoadRecipeDetail} onNew={() => setSetupOpen(true)} onOpen={onOpenPlan} onDelete={onDeletePlan} healthProfile={healthProfile} trainingLog={trainingLog}
        onSavePlan={onSavePlan}
        exerciseResults={exerciseResults} recipeResults={recipeResults} catalogSearching={catalogSearching} onSearchExercises={onSearchExercises} onSearchRecipes={onSearchRecipes} />
      {(setupOpen || planOpen) && (
        <PlanOverlay
          planOpen={planOpen}
        curated={curated}
        dayAssist={dayAssist}
          onCancelSetup={() => setSetupOpen(false)}
          onCreate={onSavePlan}
          onAskAva={onAskAva ? (type) => { setSetupOpen(false); onAskAva(type); } : undefined}
          onClose={() => { onClosePlan(); setSetupOpen(false); }}
          onSave={onSavePlan}
          onDelete={onDeletePlan}
          exerciseResults={exerciseResults}
          recipeResults={recipeResults}
          catalogSearching={catalogSearching}
          exerciseTotal={exerciseTotal}
          recipeTotal={recipeTotal}
          onSearchExercises={onSearchExercises}
          onSearchRecipes={onSearchRecipes}
          exerciseDetails={exerciseDetails}
          recipeDetails={recipeDetails}
          onLoadExerciseDetail={onLoadExerciseDetail}
          onLoadRecipeDetail={onLoadRecipeDetail}
        />
      )}
    </>
  );
}

/**
 * The single overlay. ONE fixed size — fills the viewport with a small
 * inset — and it never changes size as the phase advances from setup to
 * build to add. The phase content fills the panel; only a region inside
 * it scrolls.
 */
function PlanOverlay({
  planOpen, onCancelSetup, onCreate, onAskAva, onClose, onSave, onDelete,
  exerciseResults, recipeResults, catalogSearching, exerciseTotal, recipeTotal, onSearchExercises, onSearchRecipes,
  exerciseDetails, recipeDetails, onLoadExerciseDetail, onLoadRecipeDetail, healthProfile, curated, dayAssist,
}: {
  planOpen: HealthPlan | null;
  onCancelSetup: () => void;
  onCreate: (plan: HealthPlan) => void;
  onAskAva?: (type: HealthPlanType) => void;
  onClose: () => void;
  onSave: (plan: HealthPlan) => void;
  onDelete: (id: string) => void;
  exerciseResults: HealthExerciseSummary[];
  recipeResults: HealthRecipeSummary[];
  catalogSearching: boolean;
  exerciseTotal: number;
  recipeTotal: number;
  onSearchExercises: PlanSearch;
  onSearchRecipes: PlanSearch;
  exerciseDetails: Record<string, HealthExerciseDetail>;
  recipeDetails: Record<string, HealthRecipeDetail>;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
  healthProfile?: HealthProfile | null;
  curated?: HealthPlansProps['curated'];
  dayAssist?: HealthPlansProps['dayAssist'];
}) {
  return (
    /* A DRAWER, matching the calendar's day view.
       Opening a plan from Programs used to throw up a centred box, which hid
       the list you had just picked from and looked like a different product to
       the day panel one tab across. Same direction of travel: you clicked a
       plan over there, it arrives here, and the list stays behind it.
       Full height rather than max-h — a plan runs to eighty-four days, and a
       panel that shrink-wraps its content resizes as you move between them. */
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[2px]"
      onClick={planOpen ? onClose : onCancelSetup}
      style={{ animation: 'ava-fade-in 160ms ease-out' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ animation: 'ava-slide-in-right 220ms cubic-bezier(0.32, 0.72, 0, 1)' }}
        className={`flex h-full w-full flex-col overflow-hidden border-l border-[var(--accent)]/25 bg-gradient-to-b from-[#100d1a] to-[#150f22] shadow-[-24px_0_60px_rgba(0,0,0,0.5)] ${planOpen ? 'max-w-[860px]' : 'max-w-[720px]'}`}>
        {planOpen ? (
          <PlanBuilder
            plan={planOpen}
            onClose={onClose}
            onSave={onSave}
            onDelete={onDelete}
            exerciseResults={exerciseResults}
            recipeResults={recipeResults}
            catalogSearching={catalogSearching}
            exerciseTotal={exerciseTotal}
            recipeTotal={recipeTotal}
            onSearchExercises={onSearchExercises}
            onSearchRecipes={onSearchRecipes}
            exerciseDetails={exerciseDetails}
            recipeDetails={recipeDetails}
            onLoadExerciseDetail={onLoadExerciseDetail}
            onLoadRecipeDetail={onLoadRecipeDetail}
            healthProfile={healthProfile}
            dayAssist={dayAssist}
          />
        ) : (
          <PlanSetup onCancel={onCancelSetup} onCreate={onCreate} onAskAva={onAskAva} curated={curated} healthProfile={healthProfile} />
        )}
      </div>
    </div>
  );
}

// ── Shared meta + helpers ────────────────────────────────────────────

// Visual-only metadata — labels/blurbs are resolved through t() at render
// (module consts evaluate once at import, so a t() call here would freeze to
// English; the helpers below read the live locale instead).
const PLAN_TYPE_META: Record<HealthPlanType, { accent: string; tint: string }> = {
  fitness:  { accent: 'var(--accent)', tint: 'border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]' },
  meal:     { accent: '#f59e0b',       tint: 'border-amber-400/30 bg-amber-400/10 text-amber-300' },
  combined: { accent: '#34d399',       tint: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' },
};
const planTypeLabel = (type: HealthPlanType): string => t(`health.plans.type.${type}`);
const planTypeBlurb = (type: HealthPlanType): string => t(`health.plans.type.${type}.blurb`);

const PLAN_STATUS_META: Record<HealthPlanStatus, { cls: string }> = {
  draft:     { cls: 'bg-[var(--border)] text-[var(--text-muted)]' },
  active:    { cls: 'bg-emerald-400/15 text-emerald-300' },
  completed: { cls: 'bg-sky-400/15 text-sky-300' },
  archived:  { cls: 'bg-[var(--border)] text-[var(--text-muted)] opacity-70' },
};
const planStatusLabel = (status: HealthPlanStatus): string => t(`health.plans.status.${status}`);
const mealSlotLabel = (slot: HealthPlanMeal['slot']): string => t(`health.plans.slot.${slot}`);

const DURATION_PRESETS: number[] = [1, 7, 28, 56, 84];

const editInput =
  'rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-[12px] ' +
  'text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/50';

const weekdayLabel = (dow: number): string => t(`health.plans.weekday.${dow}`);
const weekdayInitial = (dow: number): string => t(`health.plans.weekday_initial.${dow}`);

function durationLabel(days: number): string {
  if (days <= 1) return t('health.plans.duration.day_one');
  const weeks = Math.round(days / 7);
  return weeks === 1 ? t('health.plans.duration.week_one') : t('health.plans.duration.weeks', { n: weeks });
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayISO(): string { return ymd(new Date()); }

function planDate(startDate: string | null, dayIndex: number): Date | null {
  if (!startDate) return null;
  const d = new Date(`${startDate}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + dayIndex - 1);
  return d;
}

function newId(prefix: string): string {
  return crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyExercise(): HealthPlanExercise {
  return { id: newId('ex'), ref: null, name: '', sets: null, reps: null, weight: null, rest_seconds: null, tempo: null, notes: null };
}
function emptyMeal(slot: HealthPlanMeal['slot']): HealthPlanMeal {
  return { id: newId('ml'), slot, ref: null, name: '', servings: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, cook_time_minutes: null, notes: null };
}
function defaultDay(dayIndex: number): HealthPlanDay {
  return { day_index: dayIndex, kind: 'rest', title: null, training: [], meals: [], notes: null };
}
function isEmptyDay(d: HealthPlanDay): boolean {
  return d.kind === 'rest' && d.training.length === 0 && d.meals.length === 0 && !d.title && !d.notes;
}

function blankPlan(type: HealthPlanType, durationDays: number): HealthPlan {
  return {
    schema_version: 1,
    id: newId('plan'),
    type,
    title: t('health.plans.new_plan_title', { type: planTypeLabel(type).toLowerCase() }),
    goal: null,
    source: 'manual',
    status: 'draft',
    duration_days: durationDays,
    start_date: todayISO(),
    profile_snapshot: null,
    days: [],
    created_at: new Date().toISOString(),
    updated_at: null,
  };
}

// ── Nutrition derivation ─────────────────────────────────────────────

const MACRO_FIELDS: Array<{ key: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'; labelKey: string; unit: string }> = [
  { key: 'calories',  labelKey: 'health.plans.macro.cal',     unit: '' },
  { key: 'protein_g', labelKey: 'health.plans.macro.protein', unit: 'g' },
  { key: 'carbs_g',   labelKey: 'health.plans.macro.carbs',   unit: 'g' },
  { key: 'fat_g',     labelKey: 'health.plans.macro.fat',     unit: 'g' },
];

function recipePerServing(slug: string, recipeDetails: Record<string, HealthRecipeDetail>): HealthRecipeNutrition | null {
  const detail = recipeDetails[slug];
  if (!detail) return null;
  const withData = detail.versions.filter(v => v.nutrition && typeof v.nutrition.calories === 'number');
  if (withData.length === 0) return null;
  return (withData.find(v => v.level === 'intermediate') ?? withData[0]).nutrition;
}

interface MealMacros { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }

function mealMacros(meal: HealthPlanMeal, recipeDetails: Record<string, HealthRecipeDetail>): {
  macros: MealMacros; derived: boolean; estimated: boolean; pending: boolean;
} {
  if (meal.ref) {
    const per = recipePerServing(meal.ref.slug, recipeDetails);
    if (!per) {
      return { macros: { calories: null, protein_g: null, carbs_g: null, fat_g: null }, derived: true, estimated: false, pending: true };
    }
    const s = meal.servings ?? 1;
    const scale = (v: number | undefined) => (typeof v === 'number' ? Math.round(v * s * 10) / 10 : null);
    return {
      macros: { calories: scale(per.calories), protein_g: scale(per.protein_g), carbs_g: scale(per.carbs_g), fat_g: scale(per.fat_g) },
      derived: true,
      estimated: per.source !== 'verified',
      pending: false,
    };
  }
  return {
    macros: { calories: meal.calories, protein_g: meal.protein_g, carbs_g: meal.carbs_g, fat_g: meal.fat_g },
    derived: false, estimated: false, pending: false,
  };
}

function dayTotals(day: HealthPlanDay, recipeDetails: Record<string, HealthRecipeDetail>): { totals: MealMacros; estimated: boolean } {
  const totals: MealMacros = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  let estimated = false;
  for (const meal of day.meals) {
    const { macros, estimated: e } = mealMacros(meal, recipeDetails);
    if (e) estimated = true;
    for (const f of MACRO_FIELDS) {
      const v = macros[f.key];
      if (typeof v === 'number') totals[f.key] = (totals[f.key] ?? 0) + v;
    }
  }
  // Round ONCE, at the end. Adding 28 per-serving figures in binary floating
  // point lands on 270.29999999999995 — arithmetically fine and unreadable.
  // Rounding each meal before summing would instead drift the total, so the
  // sum stays exact and only the presentation is tidied.
  for (const f of MACRO_FIELDS) {
    const v = totals[f.key];
    if (typeof v !== 'number') continue;
    // Calories whole; grams to one decimal — a tenth of a gram of fat is not
    // a number anybody acts on, and three decimals is just noise.
    totals[f.key] = f.key === 'calories' ? Math.round(v) : Math.round(v * 10) / 10;
  }
  return { totals, estimated };
}

// ── Base Plans tab — Calendar / Programs inner tabs ──────────────────

/** The Plans tab itself. Never an overlay. Two inner tabs: Calendar (a
 *  month grid sized to one page) and Programs (the plan list) — so the
 *  list is never stacked under the calendar forcing a scroll. */
function BasePlansTab({ plans, fullPlans, exerciseDetails, recipeDetails, onLoadExerciseDetail, onLoadRecipeDetail, onNew, onOpen, onDelete,
  onSavePlan, exerciseResults, recipeResults, catalogSearching, onSearchExercises, onSearchRecipes, healthProfile, trainingLog }: {
  plans: HealthPlanSummary[];
  /** Full (dated) plans with their days — drives the per-day content shown in
   *  the calendar cells AND the day view. Summaries alone can only draw a dot. */
  fullPlans?: HealthPlan[];
  exerciseDetails: Record<string, HealthExerciseDetail>;
  recipeDetails: Record<string, HealthRecipeDetail>;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  // Editing the calendar day view in place routes through the same save +
  // catalogue-search handlers the plan builder uses.
  onSavePlan: (plan: HealthPlan) => void;
  exerciseResults: HealthExerciseSummary[];
  recipeResults: HealthRecipeSummary[];
  catalogSearching: boolean;
  onSearchExercises: PlanSearch;
  onSearchRecipes: PlanSearch;
  healthProfile?: HealthProfile | null;
  trainingLog?: HealthPlansProps['trainingLog'];
}) {
  // A clicked calendar day opens the DAY view (what's on that date across every
  // plan), not a single plan's editor.
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [tab, setTab] = useState<'calendar' | 'programs'>('calendar');
  const [weekShopping, setWeekShopping] = useState(false);
  // Dates with a session that has something recorded in it. A session opened
  // and left empty is NOT logged — it would put a tick on a day nothing
  // happened, which is the one thing this marker must never do.
  const loggedDates = useMemo(
    () => new Set((trainingLog?.sessions ?? []).filter(s => s.logged_exercises > 0).map(s => s.date)),
    [trainingLog?.sessions],
  );
  // Default the calendar to the month of a dated plan so a created plan is
  // visible the moment the tab opens — not a blank current month.
  const [month, setMonth] = useState<Date>(() => {
    const dated = plans.find(p => p.start_date);
    return dated?.start_date ? new Date(`${dated.start_date}T00:00:00`) : new Date();
  });

  // Mark every day each plan spans: a training dot for fitness/combined, a
  // meal dot for meal/combined. This is what makes created plans actually
  // show up on the calendar (it used to be hardcoded empty).
  // Dots reflect the day's ACTUAL content (from the full dated plans), not just
  // the plan's type/range — so deleting every meal on a day clears its dot.
  const planMarks = useMemo(() => {
    const map = new Map<string, { training: boolean; meals: boolean }>();
    for (const p of fullPlans ?? []) {
      if (!p.start_date) continue;
      const start = new Date(`${p.start_date}T00:00:00`);
      if (isNaN(start.getTime())) continue;
      for (const day of p.days) {
        const hasTraining = (p.type === 'fitness' || p.type === 'combined') && day.training.some(e => e.name);
        const hasMeals = (p.type === 'meal' || p.type === 'combined') && day.meals.some(m => m.name);
        if (!hasTraining && !hasMeals) continue;
        const d = new Date(start);
        d.setDate(d.getDate() + (day.day_index - 1));
        const key = ymd(d);
        const prev = map.get(key) ?? { training: false, meals: false };
        map.set(key, { training: prev.training || hasTraining, meals: prev.meals || hasMeals });
      }
    }
    return map;
  }, [fullPlans]);

  // Per-date content — the session title + the day's moves / meals — from the
  // full dated plans, so the calendar cells show what's actually on, not a dot.
  const planContent = useMemo(() => {
    const map = new Map<string, { title: string | null; training: string[]; meals: string[] }>();
    for (const p of fullPlans ?? []) {
      if (!p.start_date) continue;
      const start = new Date(`${p.start_date}T00:00:00`);
      if (isNaN(start.getTime())) continue;
      for (const day of p.days) {
        const d = new Date(start);
        d.setDate(d.getDate() + (day.day_index - 1));
        const key = ymd(d);
        const cur = map.get(key) ?? { title: null as string | null, training: [] as string[], meals: [] as string[] };
        if (day.title && !cur.title) cur.title = day.title;
        if (p.type === 'fitness' || p.type === 'combined') for (const ex of day.training) if (ex.name) cur.training.push(ex.name);
        if (p.type === 'meal' || p.type === 'combined') for (const m of day.meals) if (m.name) cur.meals.push(m.name);
        map.set(key, cur);
      }
    }
    return map;
  }, [fullPlans]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{t('health.plans.your_plans')}</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
            {t('health.plans.your_plans_blurb')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* The WEEK, not a plan. Activating a plan only archives other active
              plans of the same TYPE, so a meal plan and a combined plan can
              both be live across the same seven days — and you make one trip to
              the shop, not one per plan. */}
          {(fullPlans ?? []).some(p => p.start_date && p.days.some(d => d.meals.length > 0)) && (
            <button
              type="button"
              onClick={() => setWeekShopping(true)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] transition cursor-pointer hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
            >
              {t('health.shopping.open')}
            </button>
          )}
          <button
            type="button"
            onClick={onNew}
            className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer"
          >
            {t('health.plans.new_plan')}
          </button>
        </div>
      </div>

      {weekShopping && (
        <ShoppingListSheet
          plan={null}
          allPlans={(fullPlans ?? []).filter(p => p.status !== 'archived')}
          profile={healthProfile ?? null}
          onClose={() => setWeekShopping(false)}
          onLoadRecipeDetail={onLoadRecipeDetail}
        />
      )}

      {/* Inner tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        {([['calendar', t('health.plans.tab.calendar')], ['programs', `${t('health.plans.tab.programs')}${plans.length ? ` · ${plans.length}` : ''}`]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 pb-2 pt-1 text-[11px] font-medium transition cursor-pointer ${
              tab === key
                ? 'border-b-2 border-[var(--accent)] text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'calendar' ? (
        <div className="flex min-h-[64vh]">
          <MonthCalendar
            logged={loggedDates}
            month={month}
            onMonthChange={setMonth}
            marks={planMarks}
            content={planContent}
            selected={null}
            onSelectDate={(key) => setDayKey(key)}
            fill
          />
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-10 text-center">
          <div className="text-[12px] text-[var(--text-secondary)]">{t('health.plans.empty_title')}</div>
          <div className="mx-auto mt-1.5 max-w-sm text-[10px] italic leading-relaxed text-[var(--text-muted)]">
            {t('health.plans.empty_hint')}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {plans.map(p => (
            <PlanCard key={p.id} plan={p} onOpen={() => onOpen(p.id)} onDelete={() => onDelete(p.id)} />
          ))}
        </div>
      )}

      {dayKey && (
        <HealthDayView
          dateKey={dayKey}
          plans={fullPlans ?? []}
          exerciseDetails={exerciseDetails}
          recipeDetails={recipeDetails}
          onLoadExerciseDetail={onLoadExerciseDetail}
          onLoadRecipeDetail={onLoadRecipeDetail}
          onClose={() => setDayKey(null)}
          onNewPlan={() => { setDayKey(null); onNew(); }}
          trainingLog={trainingLog}
          onSavePlan={onSavePlan}
          exerciseResults={exerciseResults}
          recipeResults={recipeResults}
          catalogSearching={catalogSearching}
          onSearchExercises={onSearchExercises}
          onSearchRecipes={onSearchRecipes}
        />
      )}
    </div>
  );
}

// ── Day view — a date's agenda, EXTENSIBLE by source ─────────────────────────
// A day belongs to no single plan: it's whatever is scheduled on that DATE,
// gathered from every active plan. The body is a list of SECTIONS, each fed by
// a source. Training + meals today; tasks, learning paths, a journal entry slot
// in tomorrow by adding one builder to `sections` below — the view renders
// whatever sections exist, so new content types never restructure anything.

/** The 1-based day_index a plan assigns to a calendar date, or null when the
 *  date falls outside the plan's range. Unlike planDayForDate it does NOT
 *  require the day object to exist — so an empty/rest day can still be edited. */
function dayIndexForDate(plan: HealthPlan, dateKey: string): number | null {
  if (!plan.start_date) return null;
  const start = new Date(`${plan.start_date}T00:00:00`).getTime();
  const sel = new Date(`${dateKey}T00:00:00`).getTime();
  if (isNaN(start) || isNaN(sel)) return null;
  const idx = Math.round((sel - start) / 86400000) + 1;
  if (idx < 1 || idx > plan.duration_days) return null;
  return idx;
}

function planDayForDate(plan: HealthPlan, dateKey: string): HealthPlanDay | null {
  const idx = dayIndexForDate(plan, dateKey);
  if (idx == null) return null;
  return plan.days.find(d => d.day_index === idx) ?? null;
}

interface DayAgendaItem { id: string; kind: 'exercise' | 'recipe'; slug?: string; title: string; meta?: string; slot?: string; thumb?: string | null; planId: string; planTitle: string; itemId: string; dayIndex: number }
interface DayAgendaSection { key: string; label: string; icon: React.ReactNode; accent: string; items: DayAgendaItem[] }

function HealthDayView({ dateKey, plans, exerciseDetails, recipeDetails, onLoadExerciseDetail, onLoadRecipeDetail, onClose, onNewPlan, trainingLog,
  onSavePlan, exerciseResults, recipeResults, catalogSearching, onSearchExercises, onSearchRecipes }: {
  dateKey: string;
  plans: HealthPlan[];
  exerciseDetails: Record<string, HealthExerciseDetail>;
  recipeDetails: Record<string, HealthRecipeDetail>;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
  onClose: () => void;
  onNewPlan: () => void;
  onSavePlan: (plan: HealthPlan) => void;
  exerciseResults: HealthExerciseSummary[];
  recipeResults: HealthRecipeSummary[];
  catalogSearching: boolean;
  onSearchExercises: PlanSearch;
  onSearchRecipes: PlanSearch;
  trainingLog?: HealthPlansProps['trainingLog'];
}) {
  useLocale();
  // Clicking an item opens what you clicked — its exercise / recipe detail —
  // not the plan editor.
  const [detail, setDetail] = useState<{ kind: 'exercise' | 'recipe'; slug: string; name: string } | null>(null);
  const openItem = (item: DayAgendaItem) => {
    if (!item.slug) return;
    if (item.kind === 'exercise') onLoadExerciseDetail(item.slug); else onLoadRecipeDetail(item.slug);
    setDetail({ kind: item.kind, slug: item.slug, name: item.title });
  };
  const date = new Date(`${dateKey}T00:00:00`);
  const dateLabel = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  // ── Editing: snapshot the covering plans into working copies on entering edit
  // mode; every change mutates the matching plan's day and autosaves (debounced)
  // through the same path the plan builder uses. ──────────────────────────────
  const covered = plans.some(p => dayIndexForDate(p, dateKey) != null);

  // The one plan day this date belongs to, and whether it has been logged.
  // Meals are not logged here — eating is tracked elsewhere and a food diary
  // is a different feature with a different failure mode.
  const loggableDay = useMemo(() => {
    for (const p of plans) {
      const d = planDayForDate(p, dateKey);
      if (d && d.training.length > 0) return { plan: p, day: d };
    }
    return null;
  }, [plans, dateKey]);
  // The plan day this date lands on when it carries no content — i.e. a
  // scheduled rest or active-recovery day, as opposed to a date no plan covers.
  const restDay = useMemo(() => {
    for (const p of plans) {
      const d = planDayForDate(p, dateKey);
      if (d && d.training.length === 0 && d.meals.length === 0) return d;
    }
    return null;
  }, [plans, dateKey]);
  const loggedSession = useMemo(
    () => (trainingLog?.sessions ?? []).find(s => s.date === dateKey) ?? null,
    [trainingLog?.sessions, dateKey],
  );
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState<HealthPlan[]>([]);
  // Add / swap happens INLINE inside a section (no second overlay): a compact
  // catalogue strip drops in under the section header.
  const [inlineSearch, setInlineSearch] = useState<{ section: 'training' | 'meals'; kind: 'exercise' | 'recipe'; mode: 'add' | 'swap'; planId: string; dayIndex: number; itemId?: string } | null>(null);
  // Which item's delete is awaiting confirmation (id) — same confirm style as
  // deleting a whole program.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const workingRef = useRef<HealthPlan[]>([]);
  workingRef.current = working;
  const pendingSave = useRef<Map<string, HealthPlan>>(new Map());
  const saveTimer = useRef<number | undefined>(undefined);

  const flushSaves = () => {
    if (saveTimer.current !== undefined) { clearTimeout(saveTimer.current); saveTimer.current = undefined; }
    for (const p of pendingSave.current.values()) onSavePlan(p);
    pendingSave.current.clear();
  };
  const scheduleSave = (plan: HealthPlan) => {
    pendingSave.current.set(plan.id, plan);
    if (saveTimer.current !== undefined) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushSaves, 600);
  };
  // Flush any pending save when the modal unmounts so nothing is lost.
  useEffect(() => () => flushSaves(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // The frozen-height dance is gone with the centred modal that needed it: it
  // pinned the overlay's size on entering Edit so adding a row could not resize
  // the whole box. A full-height drawer has nothing to resize, so holding a
  // measured height would only cap it on a long day.
  const panelRef = useRef<HTMLDivElement>(null);
  const [logging, setLogging] = useState(false);
  const enterEdit = () => {
    setWorking(plans.map(p => JSON.parse(JSON.stringify(p)) as HealthPlan));
    setEditing(true);
  };
  const exitEdit = () => { flushSaves(); setInlineSearch(null); setConfirmingId(null); setEditing(false); };

  // Apply a mutation to one plan's day (building the day if it doesn't exist
  // yet), persist it, and reflect it in the working copies.
  const updatePlanDay = (planId: string, dayIndex: number, mutate: (day: HealthPlanDay) => HealthPlanDay) => {
    const p = workingRef.current.find(x => x.id === planId);
    if (!p) return;
    const existing = p.days.find(d => d.day_index === dayIndex) ?? defaultDay(dayIndex);
    const nextDay = mutate(existing);
    const days = p.days.filter(d => d.day_index !== dayIndex);
    if (!isEmptyDay(nextDay)) days.push(nextDay);
    days.sort((a, b) => a.day_index - b.day_index);
    const nextPlan: HealthPlan = { ...p, days };
    // Update the ref synchronously so rapid successive edits (e.g. two quick
    // deletes) each build on the previous one — otherwise the second read would
    // see pre-edit state and its save would revert the first edit.
    const nextWorking = workingRef.current.map(x => (x.id === planId ? nextPlan : x));
    workingRef.current = nextWorking;
    setWorking(nextWorking);
    scheduleSave(nextPlan);
  };

  // Where a newly-added item lands: the active plan that owns that section on
  // this date (at most one of each in practice). null ⇒ Add disabled.
  const addTargets = useMemo(() => {
    let training: { planId: string; dayIndex: number } | null = null;
    let meals: { planId: string; dayIndex: number } | null = null;
    for (const p of working) {
      const idx = dayIndexForDate(p, dateKey);
      if (idx == null) continue;
      if (!training && (p.type === 'fitness' || p.type === 'combined')) training = { planId: p.id, dayIndex: idx };
      if (!meals && (p.type === 'meal' || p.type === 'combined')) meals = { planId: p.id, dayIndex: idx };
    }
    return { training, meals };
  }, [working, dateKey]);

  // Add a catalogue item, or swap one in place — routed to its source plan.
  const handleInlinePick = (it: { slug: string; name: string }) => {
    if (!inlineSearch) return;
    const { kind, mode, planId, dayIndex, itemId } = inlineSearch;
    if (kind === 'exercise') {
      onLoadExerciseDetail(it.slug);
      if (mode === 'add') updatePlanDay(planId, dayIndex, day => ({ ...day, kind: day.kind === 'rest' ? 'training' : day.kind, training: [...day.training, { ...emptyExercise(), ref: { kind: 'exercise', slug: it.slug }, name: it.name }] }));
      else if (itemId) updatePlanDay(planId, dayIndex, day => ({ ...day, training: day.training.map(e => (e.id === itemId ? { ...e, ref: { kind: 'exercise', slug: it.slug }, name: it.name } : e)) }));
    } else {
      onLoadRecipeDetail(it.slug);
      if (mode === 'add') updatePlanDay(planId, dayIndex, day => ({ ...day, meals: [...day.meals, { ...emptyMeal('breakfast'), ref: { kind: 'recipe', slug: it.slug }, name: it.name, servings: 1 }] }));
      else if (itemId) updatePlanDay(planId, dayIndex, day => ({ ...day, meals: day.meals.map(m => (m.id === itemId ? { ...m, ref: { kind: 'recipe', slug: it.slug }, name: it.name } : m)) }));
    }
    setInlineSearch(null);
  };
  const deleteItem = (section: 'training' | 'meals', planId: string, dayIndex: number, itemId: string) => {
    if (section === 'training') updatePlanDay(planId, dayIndex, day => ({ ...day, training: day.training.filter(e => e.id !== itemId) }));
    else updatePlanDay(planId, dayIndex, day => ({ ...day, meals: day.meals.filter(m => m.id !== itemId) }));
  };

  const { sections, mealTotals, mealsEstimated, hasMeals } = useMemo(() => {
    // While editing, render from the working copies so edits show instantly.
    const source = editing ? working : plans;
    const training: DayAgendaItem[] = [];
    const meals: DayAgendaItem[] = [];
    const allMeals: HealthPlanMeal[] = [];
    for (const p of source) {
      const idx = dayIndexForDate(p, dateKey);
      if (idx == null) continue;
      const day = p.days.find(d => d.day_index === idx);
      if (!day) continue;
      if (p.type === 'fitness' || p.type === 'combined') {
        for (const ex of day.training) if (ex.name) training.push({
          id: `${p.id}:${ex.id}`, itemId: ex.id, dayIndex: idx, kind: 'exercise', slug: ex.ref?.slug, title: ex.name, meta: exerciseSummary(ex),
          thumb: ex.ref ? (exerciseDetails[ex.ref.slug]?.thumbnail_url ?? null) : null,
          planId: p.id, planTitle: p.title,
        });
      }
      if (p.type === 'meal' || p.type === 'combined') {
        for (const meal of day.meals) if (meal.name) {
          allMeals.push(meal);
          meals.push({
            id: `${p.id}:${meal.id}`, itemId: meal.id, dayIndex: idx, kind: 'recipe', slug: meal.ref?.slug, title: meal.name, meta: mealSummary(meal, recipeDetails), slot: mealSlotLabel(meal.slot),
            thumb: meal.ref ? (recipeDetails[meal.ref.slug]?.hero_image_url ?? null) : null,
            planId: p.id, planTitle: p.title,
          });
        }
      }
    }
    const { totals, estimated } = dayTotals({ day_index: 0, kind: 'rest', title: null, training: [], meals: allMeals, notes: null }, recipeDetails);
    const sections: DayAgendaSection[] = [
      { key: 'training', label: t('health.plans.training'), icon: <Icon.fitness size={14} />, accent: 'var(--accent)', items: training },
      { key: 'meals', label: t('health.plans.meals'), icon: <Icon.meal size={14} />, accent: '#f59e0b', items: meals },
    ];
    return { sections, mealTotals: totals, mealsEstimated: estimated, hasMeals: allMeals.length > 0 };
  }, [dateKey, editing, working, plans, exerciseDetails, recipeDetails]);

  // Pull the catalogue details for the day's items so thumbnails (and meal
  // macros) resolve.
  useEffect(() => {
    for (const p of plans) {
      const day = planDayForDate(p, dateKey);
      if (!day) continue;
      for (const ex of day.training) if (ex.ref && !exerciseDetails[ex.ref.slug]) onLoadExerciseDetail(ex.ref.slug);
      for (const meal of day.meals) if (meal.ref && !recipeDetails[meal.ref.slug]) onLoadRecipeDetail(meal.ref.slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const anything = sections.some(s => s.items.length > 0);

  if (logging && trainingLog && loggableDay) {
    return (
      <LogSessionSheet
        day={loggableDay.day}
        planId={loggableDay.plan.id}
        date={dateKey}
        // Only pass a loaded session when it IS this day's — the host replies
        // asynchronously, and handing over a stale one would silently overwrite
        // a different day's work.
        existing={
          (trainingLog.open as { id?: string; date?: string } | null)?.date === dateKey
            ? trainingLog.open as never
            : null
        }
        onSave={(s) => trainingLog.onSave(s)}
        onClose={() => setLogging(false)}
      />
    );
  }

  return (
    /* A DRAWER, not a centred modal.
       A day is somewhere you step into and back out of, and the calendar it
       came from should stay visible behind it — a centred box hides the very
       thing that gives the day its context. Sliding from the right matches the
       direction of travel: you clicked a date over there, the day arrives here.
       Full height rather than max-h, because a training day runs to sixteen
       exercises and a panel that shrink-wraps its content resizes every time
       you step between days, which reads as the UI flinching. */
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[2px]" onClick={onClose}
      style={{ animation: 'ava-fade-in 160ms ease-out' }}>
      <div ref={panelRef} onClick={(e) => e.stopPropagation()}
        style={{ animation: 'ava-slide-in-right 220ms cubic-bezier(0.32, 0.72, 0, 1)' }}
        className="flex h-full w-full max-w-[560px] flex-col overflow-hidden border-l border-[var(--accent)]/25 bg-gradient-to-b from-[#100d1a] to-[#150f22] shadow-[-24px_0_60px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--accent)]/14 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]/70">{tt('health.plans.on_this_day', 'On this day')}</div>
            <h2 className="mt-0.5 text-[19px] font-semibold leading-tight text-[var(--text-primary)]">{dateLabel}</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Logging is offered only where there is training to log, and only
                for days that have already happened — you cannot record a
                session you have not done, and offering it for tomorrow invites
                exactly the fiction the log exists to avoid. */}
            {trainingLog && loggableDay && dateKey <= todayISO() && (
              <button type="button" onClick={() => {
                if (loggedSession) trainingLog.onLoadOne(loggedSession.id);
                setLogging(true);
              }}
                className={`rounded-md border px-3 py-1.5 text-[11px] font-medium transition cursor-pointer ${
                  loggedSession
                    ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]'
                }`}>
                {loggedSession
                  ? `${loggedSession.logged_exercises} ${t('health.log.logged_count')}`
                  : t('health.log.open')}
              </button>
            )}
            {covered && (
              <button type="button" onClick={() => (editing ? exitEdit() : enterEdit())} className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 cursor-pointer">
                {editing ? tt('health.plans.done', 'Done') : tt('health.plans.edit', 'Edit')}
              </button>
            )}
            <button type="button" onClick={() => { flushSaves(); onClose(); }} aria-label={t('health.plans.cancel')} className="flex h-8 w-8 items-center justify-center rounded-full border-none bg-black/30 text-[15px] text-[var(--text-muted)] hover:text-white cursor-pointer">×</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* A REST DAY IS NOT AN EMPTY DAY.
              Both used to render "Nothing scheduled this day" with a New plan
              button, so a deliberate recovery day looked like a hole somebody
              had forgotten to fill — and the entire point of scheduling rest is
              that it was a decision. A day no plan covers still gets the empty
              state, because that one genuinely is a gap. */}
          {!editing && !anything && restDay ? (
            <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/[0.04] px-5 py-10 text-center">
              <div className="text-[22px]" aria-hidden>{restDay.kind === 'active_recovery' ? '🚶' : '🌙'}</div>
              <div className="mt-2 text-[14px] font-medium text-[var(--text-primary)]">
                {restDay.title || t(restDay.kind === 'active_recovery' ? 'health.rest.recovery_title' : 'health.rest.title')}
              </div>
              <p className="mx-auto mt-1.5 max-w-[34ch] text-[11px] leading-relaxed text-[var(--text-muted)]">
                {t(restDay.kind === 'active_recovery' ? 'health.rest.recovery_blurb' : 'health.rest.blurb')}
              </p>
              {restDay.notes && (
                <p className="mx-auto mt-3 max-w-[38ch] text-[11px] italic leading-relaxed text-[var(--text-secondary)]">{restDay.notes}</p>
              )}
            </div>
          ) : !editing && !anything ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-12 text-center">
              <div className="text-[12px] text-[var(--text-secondary)]">{t('health.rest.uncovered')}</div>
              <button type="button" onClick={onNewPlan} className="mx-auto mt-3 block rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 cursor-pointer">{t('health.plans.new_plan')}</button>
            </div>
          ) : sections.map(section => {
            const sectionKey = section.key as 'training' | 'meals';
            const addTarget = sectionKey === 'training' ? addTargets.training : addTargets.meals;
            const searchKind: 'exercise' | 'recipe' = sectionKey === 'training' ? 'exercise' : 'recipe';
            const open = editing && inlineSearch?.section === sectionKey;
            return (
              <div key={section.key}>
                <div className="mb-2 flex min-h-[28px] items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    <span aria-hidden>{section.icon}</span>{section.label}
                    {section.items.length > 0 && <span className="opacity-60">· {section.items.length}</span>}
                  </div>
                  {editing && addTarget && (
                    <button type="button"
                      onClick={() => setInlineSearch(open && inlineSearch?.mode === 'add' ? null : { section: sectionKey, kind: searchKind, mode: 'add', planId: addTarget.planId, dayIndex: addTarget.dayIndex })}
                      className="shrink-0 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer">
                      {sectionKey === 'training' ? t('health.plans.add_exercises') : t('health.plans.add_recipes')}
                    </button>
                  )}
                </div>

                {open && inlineSearch && (
                  <InlineCatalogSearch
                    kind={inlineSearch.kind}
                    mode={inlineSearch.mode}
                    accent={section.accent}
                    results={inlineSearch.kind === 'exercise' ? exerciseResults : recipeResults}
                    searching={catalogSearching}
                    onSearch={inlineSearch.kind === 'exercise' ? onSearchExercises : onSearchRecipes}
                    onPick={handleInlinePick}
                    onClose={() => setInlineSearch(null)}
                  />
                )}

                {section.items.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-2.5 text-[11px] italic text-[var(--text-muted)]">
                    {sectionKey === 'training' ? tt('health.plans.no_workout', 'No workout — rest.') : tt('health.plans.no_meals', 'No meals.')}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {section.items.map(item => (
                      editing ? (
                        <div key={item.id} title={item.planTitle} className="group flex items-center gap-3 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-input)]/30 p-2 text-left">
                          <AgendaCardInner item={item} icon={section.icon} accent={section.accent} />
                          {confirmingId === item.id ? (
                            <div className="flex shrink-0 items-center gap-1.5 self-center rounded-md border border-red-500/30 bg-[var(--bg-input)] px-2 py-1">
                              <span className="text-[10px] text-[var(--text-secondary)]">{t('health.plans.delete_q')}</span>
                              <button type="button" onClick={() => { deleteItem(sectionKey, item.planId, item.dayIndex, item.itemId); setConfirmingId(null); }} className="border-none bg-transparent text-[10px] font-semibold text-red-300 hover:text-red-200 cursor-pointer">{t('health.plans.yes')}</button>
                              <button type="button" onClick={() => setConfirmingId(null)} className="border-none bg-transparent text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">{t('health.plans.no')}</button>
                            </div>
                          ) : (
                            <div className="flex shrink-0 items-center gap-0.5 self-center">
                              <button type="button" title={tt('health.plans.swap', 'Swap')}
                                onClick={() => setInlineSearch({ section: sectionKey, kind: searchKind, mode: 'swap', planId: item.planId, dayIndex: item.dayIndex, itemId: item.itemId })}
                                className="flex h-6 w-6 items-center justify-center rounded-md border-none bg-transparent text-[12px] text-[var(--text-muted)] hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] cursor-pointer">⇄</button>
                              <button type="button" title={t('health.plans.remove')}
                                onClick={() => setConfirmingId(item.id)}
                                className="flex h-6 w-6 items-center justify-center rounded-md border-none bg-transparent text-[12px] text-[var(--text-muted)] hover:bg-red-400/10 hover:text-red-300 cursor-pointer">✕</button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <button key={item.id} type="button" disabled={!item.slug} onClick={() => openItem(item)} title={item.planTitle} className="group flex items-center gap-3 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-input)]/30 p-2 text-left transition enabled:hover:border-[var(--accent)]/50 enabled:hover:bg-[var(--accent)]/5 disabled:cursor-default cursor-pointer">
                          <AgendaCardInner item={item} icon={section.icon} accent={section.accent} />
                          <span className="shrink-0 self-center text-[14px] leading-none text-[var(--accent)] opacity-0 transition group-hover:opacity-100">›</span>
                        </button>
                      )
                    ))}
                  </div>
                )}

                {sectionKey === 'meals' && hasMeals && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-amber-300/80">{t('health.plans.day_total')}</span>
                    {MACRO_FIELDS.map(f => (
                      <span key={f.key} className="text-[11px] text-[var(--text-secondary)]">{t(f.labelKey)} <span className="font-semibold text-[var(--text-primary)]">{mealTotals[f.key] ?? 0}{f.unit}</span></span>
                    ))}
                    {mealsEstimated && <span className="text-[9px] italic text-[var(--text-muted)]">{t('health.plans.estimated')}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Clicking an item opens ITS detail — the exercise guide / the recipe. */}
      {detail && (
        <ItemDetailModal
          detail={detail}
          exercise={detail.kind === 'exercise' ? exerciseDetails[detail.slug] : undefined}
          recipe={detail.kind === 'recipe' ? recipeDetails[detail.slug] : undefined}
          onClose={() => setDetail(null)}
        />
      )}

    </div>
  );
}

/** The thumbnail + title/meta/plan block — shared by the read card and the edit
 *  card so both look identical (image-1 design); only the trailing control
 *  differs (a chevron vs swap/delete). */
function AgendaCardInner({ item, icon, accent }: { item: DayAgendaItem; icon: React.ReactNode; accent: string }) {
  return (
    <>
      {/* Softer corners and a real border rather than a hairline ring: at 48px
          a rounded-md photo reads as a thumbnail in a table, and these are the
          only images on the surface — they should look considered. The border
          tints to the section accent so training and meals stay legible as
          categories without needing a label on every row. */}
      <div
        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border"
        style={{ borderColor: `color-mix(in srgb, ${accent} 28%, transparent)` }}
      >
        {item.thumb ? (
          <img src={item.thumb} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[18px] opacity-90" style={{ background: `linear-gradient(135deg, ${accent}2e, ${accent}0d)` }} aria-hidden>{icon}</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">
          {item.slot && <span className="mr-1.5 text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{item.slot}</span>}{item.title}
        </div>
        {item.meta && <div className="truncate text-[10px] text-[var(--text-muted)]">{item.meta}</div>}
        <div className="truncate text-[9px] text-[var(--text-muted)] opacity-70">{item.planTitle}</div>
      </div>
    </>
  );
}

/** Compact catalogue search that drops INLINE inside a section (no overlay).
 *  Picking a result adds it / swaps it in place. */
function InlineCatalogSearch({ kind, mode, accent, results, searching, onSearch, onPick, onClose }: {
  kind: 'exercise' | 'recipe';
  mode: 'add' | 'swap';
  accent: string;
  results: Array<HealthExerciseSummary | HealthRecipeSummary>;
  searching: boolean;
  onSearch: PlanSearch;
  onPick: (it: { slug: string; name: string }) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    const tmr = window.setTimeout(() => onSearch({ q: query.trim(), offset: 0, category: null }), query ? 300 : 0);
    return () => clearTimeout(tmr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  const icon = kind === 'exercise' ? <Icon.fitness size={14} /> : <Icon.meal size={14} />;
  return (
    <div className="mb-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/[0.05] p-2">
      <div className="mb-2 flex items-center gap-2">
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === 'exercise' ? t('health.plans.picker.search_exercises') : t('health.plans.picker.search_recipes')}
          className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none" />
        <button type="button" onClick={onClose} aria-label={t('health.plans.cancel')} className="shrink-0 rounded-md border-none bg-transparent px-1.5 py-1 text-[var(--text-muted)] hover:text-white cursor-pointer">✕</button>
      </div>
      <div className="max-h-[230px] overflow-y-auto">
        {searching && results.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-[var(--text-muted)]">{t('health.plans.searching')}</div>
        ) : results.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-[var(--text-muted)]">{kind === 'exercise' ? t('health.plans.picker.no_exercises') : t('health.plans.picker.no_recipes')}</div>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {results.map(r => {
              const slug = (r as HealthExerciseSummary | HealthRecipeSummary).slug;
              const name = (r as HealthExerciseSummary | HealthRecipeSummary).name;
              const thumb = kind === 'exercise' ? ((r as HealthExerciseSummary).thumbnail_url ?? null) : ((r as HealthRecipeSummary).hero_image_url ?? null);
              return (
                <button key={slug} type="button" onClick={() => onPick({ slug, name })}
                  className="group flex items-center gap-2.5 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-input)]/30 p-1.5 text-left transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5 cursor-pointer">
                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded ring-1 ring-inset ring-white/[0.06]">
                    {thumb ? (
                      <img src={thumb} alt="" loading="lazy" className="h-full w-full rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[14px] opacity-80" style={{ background: `linear-gradient(135deg, ${accent}2e, ${accent}0d)` }} aria-hidden>{icon}</div>
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--text-primary)]">{name}</span>
                  <span className="shrink-0 text-[12px] text-[var(--accent)] opacity-0 transition group-hover:opacity-100">{mode === 'swap' ? '⇄' : '+'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PlanCard({ plan, onOpen, onDelete }: {
  plan: HealthPlanSummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const m = PLAN_TYPE_META[plan.type];
  const s = PLAN_STATUS_META[plan.status];

  return (
    <div className="group relative overflow-hidden rounded-lg border border-[var(--border)] bg-transparent transition hover:border-[var(--accent)]/40">
      <div className="h-[3px]" style={{ background: m.accent }} aria-hidden />
      <button type="button" onClick={onOpen} className="block w-full cursor-pointer border-none bg-transparent px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${m.tint}`}>{planTypeLabel(plan.type)}</span>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${s.cls}`}>{planStatusLabel(plan.status)}</span>
        </div>
        <div className="mt-2 text-[13px] leading-snug text-[var(--text-primary)]">{plan.title}</div>
        {/* Provenance, said accurately.
            This line read "built by you" on EVERY plan, including ones Ava
            wrote and (now) starters copied off the shelf — three different
            claims printed identically. Manual keeps the original wording
            because it is the one case where it was true. */}
        <div className="mt-1 text-[10px] text-[var(--text-muted)]">
          {durationLabel(plan.duration_days)} · {
            plan.source === 'ava' ? t('health.plans.source.ava')
              : plan.source === 'curated' ? t('health.plans.source.curated')
              : t('health.plans.built_by_you')
          }
        </div>
      </button>

      {confirming ? (
        <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-md border border-red-500/30 bg-[var(--bg-input)] px-2 py-1">
          <span className="text-[10px] text-[var(--text-secondary)]">{t('health.plans.delete_q')}</span>
          <button type="button" onClick={() => { onDelete(); setConfirming(false); }} className="border-none bg-transparent text-[10px] font-semibold text-red-300 hover:text-red-200 cursor-pointer">{t('health.plans.yes')}</button>
          <button type="button" onClick={() => setConfirming(false)} className="border-none bg-transparent text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">{t('health.plans.no')}</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} title={t('health.plans.delete_plan')}
          className="absolute right-2 top-2 cursor-pointer rounded border-none bg-transparent p-1 text-[var(--text-muted)] opacity-0 transition hover:text-red-300 group-hover:opacity-100">
          ✕
        </button>
      )}
    </div>
  );
}

// ── Overlay phase: Setup ─────────────────────────────────────────────
// Fills the overlay panel — header / scrolling body / footer.

function PlanSetup({ onCancel, onCreate, onAskAva, curated, healthProfile }: {
  onCancel: () => void;
  onCreate: (plan: HealthPlan) => void;
  onAskAva?: (type: HealthPlanType) => void;
  curated?: HealthPlansProps['curated'];
  healthProfile?: HealthProfile | null;
}) {
  const [type, setType] = useState<HealthPlanType | null>(null);
  const [duration, setDuration] = useState<number>(28);
  const [shelfOpen, setShelfOpen] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--accent)]/14 px-6 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{t('health.plans.new_plan_title_short')}</h2>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{t('health.plans.setup_subtitle')}</p>
        </div>
        <button type="button" onClick={onCancel}
          className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
          {t('health.plans.cancel')}
        </button>
      </div>

      <div className="space-y-5 overflow-y-auto px-6 py-5">
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{t('health.plans.type_label')}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(['fitness', 'meal', 'combined'] as HealthPlanType[]).map(ty => {
              const m = PLAN_TYPE_META[ty];
              const on = type === ty;
              return (
                <button
                  key={ty}
                  type="button"
                  onClick={() => setType(ty)}
                  className={`rounded-lg border px-4 py-4 text-left transition cursor-pointer ${
                    on ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/40'
                  }`}
                >
                  <div className="mb-2 h-[3px] w-10 rounded" style={{ background: m.accent }} aria-hidden />
                  <div className="text-[13px] font-medium text-[var(--text-primary)]">{planTypeLabel(ty)}</div>
                  <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">{planTypeBlurb(ty)}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{t('health.plans.length_label')}</div>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map(days => (
              <button
                key={days}
                type="button"
                onClick={() => setDuration(days)}
                className={`rounded-md border px-3 py-1.5 text-[11px] font-medium transition cursor-pointer ${
                  duration === days
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40'
                }`}
              >
                {durationLabel(days)}
              </button>
            ))}
          </div>
          {onAskAva && <p className="mt-1.5 text-[10px] italic text-[var(--text-muted)]">{t('health.plans.length_ava_note')}</p>}
        </div>

        {/* The two doors — proper cards with a description each, so the choice
            reads clearly and the panel doesn't sprawl into empty space. Dimmed
            until a type is chosen. */}
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{t('health.plans.how_label')}</div>
          <div className={`grid grid-cols-1 gap-3 ${onAskAva ? 'sm:grid-cols-2' : ''}`}>
            {/* Manual door — build it yourself, day by day. */}
            <button
              type="button"
              disabled={!type}
              onClick={() => { if (type) onCreate(blankPlan(type, duration)); }}
              className={`rounded-lg border px-4 py-3 text-left transition ${
                type
                  ? 'border-[var(--accent)]/40 bg-[var(--accent)]/5 hover:border-[var(--accent)]/70 hover:bg-[var(--accent)]/10 cursor-pointer'
                  : 'border-[var(--border)] cursor-not-allowed opacity-50'
              }`}
            >
              <div className="text-[13px] font-medium text-[var(--text-primary)]">{onAskAva ? t('health.plans.build_myself') : t('health.plans.start_building')}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">{t('health.plans.build_myself_desc')}</div>
            </button>

            {/* Ava door — hand the type to Ava in the focused health room. */}
            {onAskAva && (
              <button
                type="button"
                disabled={!type}
                onClick={() => { if (type) onAskAva(type); }}
                className={`rounded-lg border px-4 py-3 text-left transition ${
                  type
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 cursor-pointer'
                    : 'border-[var(--border)] cursor-not-allowed opacity-50'
                }`}
              >
                <div className="text-[13px] font-medium text-[var(--accent)]">{t('health.plans.ask_ava')}</div>
                <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">{t('health.plans.ask_ava_hint')}</div>
              </button>
            )}
          </div>
          {!type && <p className="mt-2 text-[10px] italic text-[var(--text-muted)]">{t('health.plans.pick_type_first')}</p>}

          {/* The third door, and the fastest one. Deliberately NOT gated on
              picking a type or a length first: a starter already declares its
              own, so asking for both up front would be two questions guarding
              a shelf that answers them. */}
          {curated && (
            <button
              type="button"
              onClick={() => setShelfOpen(true)}
              className="mt-3 w-full cursor-pointer rounded-lg border border-[var(--border)] bg-transparent px-4 py-3 text-left transition hover:border-[var(--accent)]/40"
            >
              <div className="text-[13px] font-medium text-[var(--text-primary)]">{t('health.starters.open')}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">{t('health.starters.subtitle')}</div>
            </button>
          )}
        </div>
      </div>

      {shelfOpen && curated && (
        <StartersSheet
          plans={curated.plans}
          loading={curated.loading}
          error={curated.error}
          detail={curated.detail}
          detailLoading={curated.detailLoading}
          profile={healthProfile ?? null}
          onLoad={curated.onLoad}
          onLoadDetail={curated.onLoadDetail}
          onStart={(plan, id) => { curated.onStart(plan, id); onCancel(); }}
          onClose={() => setShelfOpen(false)}
        />
      )}
    </div>
  );
}

// ── Overlay phase: Builder ───────────────────────────────────────────

function PlanBuilder({
  plan, onClose, onSave, onDelete, healthProfile, dayAssist,
  exerciseResults, recipeResults, catalogSearching, exerciseTotal, recipeTotal, onSearchExercises, onSearchRecipes,
  exerciseDetails, recipeDetails, onLoadExerciseDetail, onLoadRecipeDetail,
}: {
  plan: HealthPlan;
  onClose: () => void;
  onSave: (plan: HealthPlan) => void;
  onDelete: (id: string) => void;
  exerciseResults: HealthExerciseSummary[];
  recipeResults: HealthRecipeSummary[];
  catalogSearching: boolean;
  exerciseTotal: number;
  recipeTotal: number;
  onSearchExercises: PlanSearch;
  onSearchRecipes: PlanSearch;
  exerciseDetails: Record<string, HealthExerciseDetail>;
  recipeDetails: Record<string, HealthRecipeDetail>;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
  healthProfile?: HealthProfile | null;
  dayAssist?: HealthPlansProps['dayAssist'];
}) {
  const [draft, setDraft] = useState<HealthPlan>(plan);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [confirming, setConfirming] = useState(false);
  const [picker, setPicker] = useState<'exercise' | 'recipe' | null>(null);
  const [sheet, setSheet] = useState<'shopping' | 'prep' | null>(null);
  const [duplicating, setDuplicating] = useState<number | null>(null);
  const [assisting, setAssisting] = useState(false);
  const planWeekCount = Math.max(1, Math.ceil(draft.duration_days / 7));
  const [visibleWeek, setVisibleWeek] = useState(1);
  // Follow the selection rather than fighting it: jumping to a day from
  // anywhere else (Ava, the calendar, a duplicate) must bring its week with it,
  // or the strip would show week 1 while the panel below showed day 40.
  useEffect(() => { setVisibleWeek(Math.max(1, Math.ceil(selectedDay / 7))); }, [selectedDay]);
  const saveTimer = useRef<number | undefined>(undefined);
  const prefilled = useRef<Set<string>>(new Set());

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDraft(plan);
    setSelectedDay(1);
  }, [plan.id]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const commit = useCallback((next: HealthPlan) => {
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => onSave(next), 700);
  }, [onSave]);

  const closeWithFlush = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); onSave(draft); }
    onClose();
  };

  const m = PLAN_TYPE_META[draft.type];
  const showTraining = draft.type === 'fitness' || draft.type === 'combined';
  const showMeals = draft.type === 'meal' || draft.type === 'combined';

  const dayByIndex = useMemo(() => {
    const map = new Map<number, HealthPlanDay>();
    for (const d of draft.days) map.set(d.day_index, d);
    return map;
  }, [draft.days]);


  // On open, load detail for catalogue items the plan already references.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ex = new Set<string>();
    const rec = new Set<string>();
    for (const d of plan.days) {
      for (const e of d.training) if (e.ref) ex.add(e.ref.slug);
      for (const ml of d.meals) if (ml.ref) rec.add(ml.ref.slug);
    }
    ex.forEach(s => { if (!exerciseDetails[s]) onLoadExerciseDetail(s); });
    rec.forEach(s => { if (!recipeDetails[s]) onLoadRecipeDetail(s); });
  }, [plan.id]);

  // Pre-fill an exercise's routine once its detail arrives.
  useEffect(() => {
    let changed = false;
    const days = draft.days.map(day => {
      let dayChanged = false;
      const training = day.training.map(ex => {
        if (!ex.ref || prefilled.current.has(ex.id)) return ex;
        if (ex.sets != null || ex.reps != null || ex.rest_seconds != null) { prefilled.current.add(ex.id); return ex; }
        const det = exerciseDetails[ex.ref.slug];
        if (!det) return ex;
        prefilled.current.add(ex.id);
        dayChanged = true;
        const r = det.routine;
        const setsNum = typeof r.sets === 'number' ? r.sets
          : typeof r.sets === 'string' ? (parseInt(r.sets, 10) || null) : null;
        return { ...ex, sets: setsNum, reps: r.reps_target ?? ex.reps, rest_seconds: r.rest_seconds ?? ex.rest_seconds, tempo: r.tempo ?? ex.tempo };
      });
      if (dayChanged) { changed = true; return { ...day, training }; }
      return day;
    });
    if (changed) commit({ ...draft, days });
  }, [exerciseDetails, draft, commit]);

  /**
   * Capture what the library knows about each meal, once its recipe arrives.
   *
   * Same shape as the exercise pre-fill above, and the same reason: a plan has
   * to be complete on its own. A shopping list must work in a shop with no
   * signal, so the ingredients travel WITH the plan rather than being fetched
   * when the list is opened.
   *
   * This also BACKFILLS. Every plan written before capture existed carries no
   * meta at all, so without this the shopping list would only ever work on
   * plans made from today — and the person most likely to want one already has
   * a plan. It only ever adds; a meal that has meta is never rewritten, so the
   * plan stays a record of what was chosen at the time.
   */
  useEffect(() => {
    let changed = false;
    const days = draft.days.map(day => {
      const filled = fillDayMeta(day, recipeDetails, exerciseDetails);
      if (filled.changed) changed = true;
      return filled.day;
    });
    if (changed) commit({ ...draft, days });
  }, [recipeDetails, exerciseDetails, draft, commit]);

  const upsertDay = (day: HealthPlanDay) => {
    const days = draft.days.filter(d => d.day_index !== day.day_index);
    if (!isEmptyDay(day)) days.push(day);
    days.sort((a, b) => a.day_index - b.day_index);
    commit({ ...draft, days });
  };

  const setDuration = (days: number) => {
    commit({ ...draft, duration_days: days, days: draft.days.filter(d => d.day_index <= days) });
    if (selectedDay > days) setSelectedDay(days);
  };

  const addExercises = (items: Array<{ slug: string; name: string } | null>) => {
    const day = dayByIndex.get(selectedDay) ?? defaultDay(selectedDay);
    const added: HealthPlanExercise[] = items.map(it =>
      it ? { ...emptyExercise(), ref: { kind: 'exercise', slug: it.slug }, name: it.name } : emptyExercise(),
    );
    for (const it of items) if (it) onLoadExerciseDetail(it.slug);
    upsertDay({ ...day, kind: day.kind === 'rest' ? 'training' : day.kind, training: [...day.training, ...added] });
    setPicker(null);
  };
  const addMeals = (items: Array<{ slug: string; name: string } | null>) => {
    const day = dayByIndex.get(selectedDay) ?? defaultDay(selectedDay);
    const added: HealthPlanMeal[] = items.map(it =>
      it ? { ...emptyMeal('breakfast'), ref: { kind: 'recipe', slug: it.slug }, name: it.name, servings: 1 } : emptyMeal('breakfast'),
    );
    for (const it of items) if (it) onLoadRecipeDetail(it.slug);
    upsertDay({ ...day, meals: [...day.meals, ...added] });
    setPicker(null);
  };

  const selDay = dayByIndex.get(selectedDay) ?? defaultDay(selectedDay);

  // Adding takes the overlay over as an inner panel — same fixed size.
  if (picker) {
    return (
      <CatalogPickerPanel
        kind={picker}
        results={picker === 'exercise' ? exerciseResults : recipeResults}
        total={picker === 'exercise' ? exerciseTotal : recipeTotal}
        searching={catalogSearching}
        onSearch={picker === 'exercise' ? onSearchExercises : onSearchRecipes}
        onConfirm={(items) => { if (picker === 'exercise') addExercises(items); else addMeals(items); }}
        onClose={() => setPicker(null)}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="shrink-0 space-y-2 border-b border-[var(--accent)]/14 px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={closeWithFlush}
            className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
            {t('health.plans.all_plans')}
          </button>
          <span className="text-[10px] text-[var(--text-muted)]">{t('health.plans.autosave')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${m.tint}`}>{planTypeLabel(draft.type)}</span>
          <input
            value={draft.title}
            onChange={(e) => commit({ ...draft, title: e.target.value })}
            placeholder={t('health.plans.title_placeholder')}
            className={`${editInput} min-w-[180px] flex-1 text-[14px]`}
          />
          <Select
            value={draft.status}
            onChange={(v) => commit({ ...draft, status: v as HealthPlanStatus })}
            size="sm"
            title={t('health.plans.status_select_title')}
            options={[
              { value: 'draft', label: planStatusLabel('draft') },
              { value: 'active', label: planStatusLabel('active') },
              { value: 'completed', label: planStatusLabel('completed') },
              { value: 'archived', label: planStatusLabel('archived') },
            ]}
          />
          <Select
            value={String(draft.duration_days)}
            onChange={(v) => setDuration(Number(v))}
            size="sm"
            options={DURATION_PRESETS.map(days => ({ value: String(days), label: durationLabel(days) }))}
          />
        </div>
        <input
          value={draft.goal ?? ''}
          onChange={(e) => commit({ ...draft, goal: e.target.value || null })}
          placeholder={t('health.plans.goal_placeholder')}
          className={`${editInput} w-full`}
        />
      </div>

      {/* Body — compact: pick a day from the strip, then its Workouts + Meals
          sections. No calendar; the day strip is the navigation. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {/* A WEEK AT A TIME.
            This listed every day in one wrapping row, which is fine for seven
            and unusable for eighty-four — the presets go up that far, and the
            strip became a wall of near-identical chips with no way to tell
            week two from week eleven. Weeks are picked first, days second, and
            the week tabs only appear when there is more than one. */}
        {planWeekCount > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {Array.from({ length: planWeekCount }, (_, w) => w + 1).map(w => {
              const active = w === visibleWeek;
              return (
                <button key={w} type="button" onClick={() => setVisibleWeek(w)}
                  className={`rounded-full border px-3 py-1 text-[11px] transition cursor-pointer ${
                    active
                      ? 'border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]'
                  }`}>
                  {t('health.dup.week_n', { n: w })}
                </button>
              );
            })}
          </div>
        )}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {draft.days.filter(d => Math.ceil(d.day_index / 7) === visibleWeek).map((d) => {
            const date = planDate(draft.start_date, d.day_index);
            const active = selectedDay === d.day_index;
            const has = (showTraining && d.training.length > 0) || (showMeals && d.meals.length > 0);
            return (
              <button
                key={d.day_index}
                type="button"
                onClick={() => setSelectedDay(d.day_index)}
                className={`rounded-lg border px-2.5 py-1.5 text-left transition cursor-pointer ${
                  active ? 'border-[var(--accent)] bg-[var(--accent)]/15' : 'border-[var(--border)] hover:border-[var(--accent)]/40'
                }`}
              >
                <div className={`flex items-center gap-1.5 text-[11px] font-semibold leading-none ${active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                  {t('health.plans.day_n', { n: d.day_index })}
                  {has && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />}
                </div>
                <div className="mt-1 text-[9px] leading-none text-[var(--text-muted)]">
                  {date ? date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }) : (d.kind === 'rest' ? t('health.week.rest') : '·')}
                </div>
              </button>
            );
          })}
        </div>
        {/* Copy acts on the SELECTED day, so it sits with the day strip rather
            than in the footer with the plan-level actions. */}
        <div className="mb-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDuplicating(selectedDay)}
            className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-muted)] transition cursor-pointer hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
          >
            {t('health.dup.open')}
          </button>
          {dayAssist && (
            <button
              type="button"
              onClick={() => setAssisting(true)}
              className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-medium text-[var(--accent)] transition cursor-pointer hover:bg-[var(--accent)]/20"
            >
              {t('health.assist.open')}
            </button>
          )}
        </div>
        <DayPanel
          day={selDay}
          startDate={draft.start_date}
          // Always show BOTH sections in the day view — a day is a workout AND
          // meals, regardless of the plan's headline type. Empty sections show
          // an add affordance so any plan can carry both.
          showTraining
          showMeals
          recipeDetails={recipeDetails}
          exerciseDetails={exerciseDetails}
          onChange={upsertDay}
          onAddExercises={() => setPicker('exercise')}
          onAddMeals={() => setPicker('recipe')}
          onLoadExerciseDetail={onLoadExerciseDetail}
          onLoadRecipeDetail={onLoadRecipeDetail}
        />
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--accent)]/14 px-6 py-3">
        {confirming ? (
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[var(--text-secondary)]">{t('health.plans.delete_confirm')}</span>
            <button type="button" onClick={() => { onDelete(draft.id); onClose(); }} className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-300 hover:bg-red-500/20 transition cursor-pointer">{t('health.plans.delete')}</button>
            <button type="button" onClick={() => setConfirming(false)} className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">{t('health.plans.cancel')}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-red-300 transition cursor-pointer">{t('health.plans.delete_plan')}</button>
        )}
        {/* What turns a plan into food and into a week you can actually cook.
            Only offered when the plan HAS meals — a fitness plan has nothing to
            shop for, and a disabled button would be a question with one answer. */}
        {showMeals && draft.days.some(d => d.meals.length > 0) && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setSheet('prep')}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] transition cursor-pointer hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
            >
              {t('health.prep.open')}
            </button>
            <button
              type="button"
              onClick={() => setSheet('shopping')}
              className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] transition cursor-pointer hover:bg-[var(--accent)]/20"
            >
              {t('health.shopping.open')}
            </button>
          </div>
        )}
      </div>

      {sheet === 'shopping' && (
        <ShoppingListSheet
          plan={draft}
          allPlans={[draft]}
          profile={healthProfile ?? null}
          onClose={() => setSheet(null)}
          onLoadRecipeDetail={onLoadRecipeDetail}
        />
      )}
      {sheet === 'prep' && <PrepSheet plan={draft} profile={healthProfile ?? null} onClose={() => setSheet(null)} />}
      {assisting && dayAssist && (
        <AssistSheet
          plan={draft}
          day={selDay}
          busy={dayAssist.busy}
          error={dayAssist.error}
          proposal={dayAssist.proposal}
          onAsk={(instruction) => dayAssist.onAsk({
            planType: draft.type,
            goal: draft.goal,
            day: selDay,
            // The rest of the week goes with it, so the day is balanced against
            // its neighbours rather than written in isolation.
            week: draft.days.filter(d =>
              Math.floor((d.day_index - 1) / 7) === Math.floor((selDay.day_index - 1) / 7)),
            instruction,
            date: dayDate(draft, selDay),
            profile: healthProfile ?? null,
          })}
          onApply={(next) => upsertDay(next)}
          onDiscard={dayAssist.onDiscard}
          onClose={() => { setAssisting(false); dayAssist.onDiscard(); }}
        />
      )}
      {duplicating != null && (
        <DuplicateSheet
          plan={draft}
          fromDay={duplicating}
          onApply={next => commit(next)}
          onClose={() => setDuplicating(null)}
        />
      )}
    </div>
  );
}

/** A real month calendar. Weekday columns, the month's dates, training /
 *  meal pills per day. Clicking an in-plan date selects that day. */
function MonthCalendar({ month, onMonthChange, marks, content, selected, onSelectDate, fill, logged }: {
  month: Date;
  onMonthChange: (d: Date) => void;
  marks: Map<string, { training: boolean; meals: boolean }>;
  /** Dates with a RECORDED session. A planned day and a done day should not
   *  look the same — the whole reason for keeping a log is being able to see
   *  what you actually did, and a calendar that only shows intent hides it. */
  logged?: Set<string>;
  /** Per-date plan content — the session title + the day's moves / meals — so
   *  the cells show what's actually on, not just a dot. Built from the full
   *  (dated) plans; falls back to `marks` dots where there's no detail. */
  content?: Map<string, { title: string | null; training: string[]; meals: string[] }>;
  selected: string | null;
  onSelectDate: (key: string) => void;
  /** When true, the calendar grows to fill its container and the day cells
   *  stretch to equal height (squarer, fills the page). Used by the standalone
   *  Plans calendar; the builder's compact side calendar leaves it off. */
  fill?: boolean;
}) {
  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstDow = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, mon, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const today = todayISO();
  const monthLabel = new Date(year, mon, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className={`overflow-hidden rounded-xl border border-[var(--accent)]/18 bg-gradient-to-br from-[#100d1a] to-[#181327] shadow-[0_4px_28px_rgba(0,0,0,0.28)] ${fill ? 'flex flex-1 flex-col' : ''}`}>
      <div className="flex items-center justify-between border-b border-[var(--accent)]/12 bg-[var(--accent)]/5 px-4 py-2.5">
        <button type="button" onClick={() => onMonthChange(new Date(year, mon - 1, 1))} aria-label={t('health.plans.prev_month')}
          className="flex h-7 w-7 items-center justify-center rounded-md border-none bg-[var(--accent)]/10 text-[14px] text-[var(--text-secondary)] transition hover:bg-[var(--accent)]/25 hover:text-white cursor-pointer">‹</button>
        <span className="text-[13px] font-semibold tracking-wide text-[var(--text-primary)]">{monthLabel}</span>
        <button type="button" onClick={() => onMonthChange(new Date(year, mon + 1, 1))} aria-label={t('health.plans.next_month')}
          className="flex h-7 w-7 items-center justify-center rounded-md border-none bg-[var(--accent)]/10 text-[14px] text-[var(--text-secondary)] transition hover:bg-[var(--accent)]/25 hover:text-white cursor-pointer">›</button>
      </div>

      <div className={`p-3 ${fill ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
        <div className="mb-1.5 grid grid-cols-7 gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{weekdayInitial(i)}</div>
          ))}
        </div>
        <div className={`grid grid-cols-7 gap-1.5 ${fill ? 'flex-1 auto-rows-fr' : ''}`}>
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const key = ymd(date);
            const mk = marks.get(key);
            const c = content?.get(key);
            const isToday = key === today;
            const isSelected = key === selected;
            const hasContent = !!mk && (mk.training || mk.meals);
            const isLogged = logged?.has(key) ?? false;
            const items = c ? [
              ...c.training.map((name) => ({ icon: <Icon.fitness size={11} />, name })),
              ...c.meals.map((name) => ({ icon: <Icon.meal size={11} />, name })),
            ] : [];
            const shown = items.slice(0, fill ? 4 : 2);
            const extra = items.length - shown.length;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelectDate(key)}
                className={`flex min-h-[54px] flex-col gap-1 overflow-hidden rounded-lg border p-1.5 text-left transition cursor-pointer ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15'
                    // Done outranks planned. Green is used ONLY for a session
                    // that was actually recorded, nowhere else on this surface,
                    // so it never means "we think you did this".
                    : isLogged
                      ? 'border-emerald-400/35 bg-emerald-400/[0.07] hover:border-emerald-400/60'
                      : hasContent
                        ? 'border-[var(--accent)]/22 bg-[var(--accent)]/5 hover:border-[var(--accent)]/50'
                        : 'border-[var(--accent)]/8 hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`flex h-[17px] w-[17px] items-center justify-center rounded-full text-[10px] ${
                    isToday ? 'bg-[var(--accent)] font-bold text-white'
                      : isSelected ? 'font-semibold text-[var(--accent)]'
                      : 'font-medium text-[var(--text-secondary)]'
                  }`}>
                    {date.getDate()}
                  </span>
                  {isLogged && <span className="text-[10px] leading-none text-emerald-400" title={t('health.log.logged_count')} aria-hidden>✓</span>}
                  {/* Dots only when we have no detailed content to show. */}
                  {!c && (mk?.training || mk?.meals) && (
                    <span className="flex gap-1">
                      {mk?.training && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />}
                      {mk?.meals && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />}
                    </span>
                  )}
                </div>
                {c && (
                  <div className="mt-0.5 flex min-h-0 flex-col gap-0.5 overflow-hidden">
                    {c.title && <div className="truncate text-[10px] font-semibold leading-tight text-[var(--text-primary)]">{c.title}</div>}
                    {shown.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-1 text-[9px] leading-tight text-[var(--text-secondary)]">
                        <span aria-hidden className="shrink-0 opacity-70">{it.icon}</span>
                        <span className="truncate">{it.name}</span>
                      </div>
                    ))}
                    {extra > 0 && <div className="text-[8px] text-[var(--text-muted)]">+{extra} more</div>}
                    {c.title && items.length === 0 && <div className="text-[9px] italic text-[var(--text-muted)]">{t('health.week.rest')}</div>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The selected day — a calm read view by default, full editor on demand.
 *  Viewing a plan shouldn't be a wall of input boxes; "Edit day" reveals
 *  the form. Switching days returns to the read view. */
function DayPanel({ day, startDate, showTraining, showMeals, recipeDetails, exerciseDetails, onChange, onAddExercises, onAddMeals, onLoadExerciseDetail, onLoadRecipeDetail }: {
  day: HealthPlanDay;
  startDate: string | null;
  showTraining: boolean;
  showMeals: boolean;
  recipeDetails: Record<string, HealthRecipeDetail>;
  exerciseDetails: Record<string, HealthExerciseDetail>;
  onChange: (day: HealthPlanDay) => void;
  onAddExercises: () => void;
  onAddMeals: () => void;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
}) {
  const date = planDate(startDate, day.day_index);
  const { totals, estimated } = useMemo(() => dayTotals(day, recipeDetails), [day, recipeDetails]);
  const [editing, setEditing] = useState(false);
  // Navigating to another day drops back to the calm read view.
  useEffect(() => { setEditing(false); }, [day.day_index]);

  const dayN = t('health.plans.day_n', { n: day.day_index });
  const dateLabel = date ? `${weekdayLabel(date.getDay())} ${date.getDate()} — ${dayN}` : dayN;
  const kindLabel = day.kind === 'training' ? t('health.plans.kind.training') : day.kind === 'active_recovery' ? t('health.plans.kind.active_recovery') : t('health.plans.kind.rest');
  const pillBtn = 'rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer';

  if (!editing) {
    return (
      <div className="space-y-4 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{dateLabel}</span>
          <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{kindLabel}</span>
          {day.title && <span className="text-[12px] text-[var(--text-secondary)]">{day.title}</span>}
          <button type="button" onClick={() => setEditing(true)} className={`ml-auto ${pillBtn}`}>{t('health.plans.edit_day')}</button>
        </div>
        <DayReadView day={day} exerciseDetails={exerciseDetails} recipeDetails={recipeDetails} totals={totals} estimated={estimated} onLoadExerciseDetail={onLoadExerciseDetail} onLoadRecipeDetail={onLoadRecipeDetail} />
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">{dateLabel}</span>
        <Select
          value={day.kind}
          onChange={(v) => onChange({ ...day, kind: v as HealthPlanDay['kind'] })}
          size="sm"
          options={[
            { value: 'training', label: t('health.plans.kind.training') },
            { value: 'rest', label: t('health.plans.kind.rest') },
            { value: 'active_recovery', label: t('health.plans.kind.active_recovery') },
          ]}
        />
        <input
          value={day.title ?? ''}
          onChange={(e) => onChange({ ...day, title: e.target.value || null })}
          placeholder={t('health.plans.day_title_placeholder')}
          className={`${editInput} min-w-[160px] flex-1`}
        />
        <button type="button" onClick={() => setEditing(false)} className={pillBtn}>{t('health.plans.done')}</button>
      </div>

      {showTraining && (
        <DaySection title={t('health.plans.training')} addLabel={t('health.plans.add_exercises')} empty={day.training.length === 0} onAdd={onAddExercises}
          emptyHint={t('health.plans.training_empty_hint')}>
          {day.training.map(ex => (
            <ExerciseRow
              key={ex.id}
              ex={ex}
              detail={ex.ref ? exerciseDetails[ex.ref.slug] : undefined}
              onChange={(next) => onChange({ ...day, training: day.training.map(e => (e.id === ex.id ? next : e)) })}
              onRemove={() => onChange({ ...day, training: day.training.filter(e => e.id !== ex.id) })}
            />
          ))}
        </DaySection>
      )}

      {showMeals && (
        <DaySection title={t('health.plans.meals')} addLabel={t('health.plans.add_recipes')} empty={day.meals.length === 0} onAdd={onAddMeals}
          emptyHint={t('health.plans.meals_empty_hint')}>
          {day.meals.map(meal => (
            <MealRow
              key={meal.id}
              meal={meal}
              recipeDetails={recipeDetails}
              onChange={(next) => onChange({ ...day, meals: day.meals.map(mm => (mm.id === meal.id ? next : mm)) })}
              onRemove={() => onChange({ ...day, meals: day.meals.filter(mm => mm.id !== meal.id) })}
            />
          ))}
          {day.meals.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-amber-300/80">{t('health.plans.day_total')}</span>
              {MACRO_FIELDS.map(f => (
                <span key={f.key} className="text-[11px] text-[var(--text-secondary)]">
                  {t(f.labelKey)} <span className="font-semibold text-[var(--text-primary)]">{totals[f.key] ?? 0}{f.unit}</span>
                </span>
              ))}
              {estimated && <span className="text-[9px] italic text-[var(--text-muted)]">{t('health.plans.estimated')}</span>}
            </div>
          )}
        </DaySection>
      )}

      <textarea
        value={day.notes ?? ''}
        onChange={(e) => onChange({ ...day, notes: e.target.value || null })}
        placeholder={t('health.plans.day_notes_placeholder')}
        rows={2}
        className={`${editInput} w-full resize-y`}
      />
    </div>
  );
}

/** One-line readable summary of an exercise — "3 × 12 · bodyweight · 60s rest". */
function exerciseSummary(ex: HealthPlanExercise): string {
  const parts: string[] = [];
  if (ex.sets != null && ex.reps) parts.push(`${ex.sets} × ${ex.reps}`);
  else if (ex.sets != null) parts.push(t('health.plans.n_sets', { n: ex.sets }));
  else if (ex.reps) parts.push(ex.reps);
  if (ex.weight) parts.push(ex.weight);
  if (ex.rest_seconds != null) parts.push(t('health.plans.n_rest', { n: ex.rest_seconds }));
  return parts.join('  ·  ') || '—';
}

/** One-line readable summary of a meal — "1 serving · 350 cal · 30g protein". */
function mealSummary(meal: HealthPlanMeal, recipeDetails: Record<string, HealthRecipeDetail>): string {
  const parts: string[] = [];
  if (meal.servings != null) parts.push(t('health.plans.n_servings', { n: meal.servings }));
  const { macros } = mealMacros(meal, recipeDetails);
  if (macros.calories != null) parts.push(t('health.plans.n_cal', { n: macros.calories }));
  if (macros.protein_g != null) parts.push(t('health.plans.n_protein', { n: macros.protein_g }));
  if (meal.cook_time_minutes != null) parts.push(t('health.plans.n_cook', { n: meal.cook_time_minutes }));
  return parts.join('  ·  ') || '—';
}

/** The calm, scannable view of a day — small cards, each clickable to open
 *  the exercise's technique guide or the recipe. Free-text items (no library
 *  ref) render as plain, non-clickable cards. */
function DayReadView({ day, exerciseDetails, recipeDetails, totals, estimated, onLoadExerciseDetail, onLoadRecipeDetail }: {
  day: HealthPlanDay;
  exerciseDetails: Record<string, HealthExerciseDetail>;
  recipeDetails: Record<string, HealthRecipeDetail>;
  totals: MealMacros;
  estimated: boolean;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
}) {
  const [detail, setDetail] = useState<{ kind: 'exercise' | 'recipe'; slug: string; name: string } | null>(null);

  const openExercise = (ex: HealthPlanExercise) => {
    if (!ex.ref) return;
    onLoadExerciseDetail(ex.ref.slug);
    setDetail({ kind: 'exercise', slug: ex.ref.slug, name: ex.name || t('health.plans.exercise_fallback') });
  };
  /* Pull the catalogue detail for everything on this day, because that is where
     the images live. The calendar panel does the same on the way in; without it
     the cards render their fallback icon forever and the redesign looks broken
     rather than unloaded. */
  useEffect(() => {
    for (const ex of day.training) if (ex.ref && !exerciseDetails[ex.ref.slug]) onLoadExerciseDetail(ex.ref.slug);
    for (const meal of day.meals) if (meal.ref && !recipeDetails[meal.ref.slug]) onLoadRecipeDetail(meal.ref.slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.day_index, day.training.length, day.meals.length]);

  const openMeal = (meal: HealthPlanMeal) => {
    if (!meal.ref) return;
    onLoadRecipeDetail(meal.ref.slug);
    setDetail({ kind: 'recipe', slug: meal.ref.slug, name: meal.name || t('health.plans.meal_fallback') });
  };

  /* Same card as the calendar's day panel, via AgendaCardInner — a plan opened
     from Programs and the same day opened from the calendar were two different
     designs for identical content: one with demonstration photos and recipe
     heroes, one a wall of text. The images are the point. A movement you have
     not done before is a name you cannot picture, and a meal is a decision you
     make with your eyes. */
  const cardCls = (clickable: boolean) =>
    `group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-input)]/30 px-3 py-2.5 text-left transition ${
      clickable ? 'cursor-pointer hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5' : 'cursor-default'
    }`;
  const emptyCls = 'rounded-md border border-dashed border-[var(--border)] px-3 py-2.5 text-[11px] italic text-[var(--text-muted)]';

  // Both sections always show — a day is training AND meals. Empty sections
  // read as "nothing here yet" rather than vanishing.
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
          <span aria-hidden><Icon.fitness size={14} /></span>{t('health.plans.training')}
          {day.training.length > 0 && <span className="opacity-60">· {day.training.length}</span>}
        </div>
        {day.training.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {day.training.map(ex => {
              const clickable = !!ex.ref;
              return (
                <button key={ex.id} type="button" disabled={!clickable} onClick={() => openExercise(ex)} className={cardCls(clickable)}>
                  <AgendaCardInner
                    item={{
                      id: ex.id, itemId: ex.id, dayIndex: day.day_index, kind: 'exercise',
                      slug: ex.ref?.slug, title: ex.name || t('health.plans.exercise_fallback'),
                      meta: exerciseSummary(ex),
                      thumb: ex.ref ? (exerciseDetails[ex.ref.slug]?.thumbnail_url ?? null) : null,
                      planId: '', planTitle: '',
                    }}
                    icon={<Icon.fitness size={14} />}
                    accent="var(--accent)"
                  />
                  {clickable && <span className="shrink-0 text-[14px] leading-none text-[var(--accent)]">›</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className={emptyCls}>{tt('health.plans.no_workout', 'No workout — rest day. Use Edit day to add one.')}</div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
          <span aria-hidden><Icon.meal size={14} /></span>{t('health.plans.meals')}
          {day.meals.length > 0 && <span className="opacity-60">· {day.meals.length}</span>}
        </div>
        {day.meals.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {day.meals.map(meal => {
                const clickable = !!meal.ref;
                return (
                  <button key={meal.id} type="button" disabled={!clickable} onClick={() => openMeal(meal)} className={cardCls(clickable)}>
                    <AgendaCardInner
                      item={{
                        id: meal.id, itemId: meal.id, dayIndex: day.day_index, kind: 'recipe',
                        slug: meal.ref?.slug, title: meal.name || t('health.plans.meal_fallback'),
                        meta: mealSummary(meal, recipeDetails), slot: mealSlotLabel(meal.slot),
                        thumb: meal.ref ? (recipeDetails[meal.ref.slug]?.hero_image_url ?? null) : null,
                        planId: '', planTitle: '',
                      }}
                      icon={<Icon.meal size={14} />}
                      accent="#f59e0b"
                    />
                    {clickable && <span className="shrink-0 text-[14px] leading-none text-[var(--accent)]">›</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-amber-300/80">{t('health.plans.day_total')}</span>
              {MACRO_FIELDS.map(f => (
                <span key={f.key} className="text-[11px] text-[var(--text-secondary)]">
                  {t(f.labelKey)} <span className="font-semibold text-[var(--text-primary)]">{totals[f.key] ?? 0}{f.unit}</span>
                </span>
              ))}
              {estimated && <span className="text-[9px] italic text-[var(--text-muted)]">{t('health.plans.estimated')}</span>}
            </div>
          </>
        ) : (
          <div className={emptyCls}>{tt('health.plans.no_meals', 'No meals yet. Use Edit day to add some.')}</div>
        )}
      </div>
      {day.notes && (
        <div className="rounded-md border border-[var(--border)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">{day.notes}</div>
      )}

      {detail && (
        <ItemDetailModal
          detail={detail}
          exercise={detail.kind === 'exercise' ? exerciseDetails[detail.slug] : undefined}
          recipe={detail.kind === 'recipe' ? recipeDetails[detail.slug] : undefined}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

/** Drill-down detail for a plan item — the exercise's technique guide or the
 *  recipe. Renders from the detail cache; shows a loading note until it lands. */
function ItemDetailModal({ detail, exercise, recipe, onClose }: {
  detail: { kind: 'exercise' | 'recipe'; slug: string; name: string };
  exercise: HealthExerciseDetail | undefined;
  recipe: HealthRecipeDetail | undefined;
  onClose: () => void;
}) {
  const loaded = detail.kind === 'exercise' ? !!exercise : !!recipe;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 sm:p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-[var(--accent)]/20 bg-gradient-to-br from-[#0f0f17] to-[#1a1625] shadow-[0_0_60px_color-mix(in_srgb,_var(--accent)_12%,_transparent)]"
        style={{ height: 'min(760px, 86vh)' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('health.plans.cancel')}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/40 text-lg text-white transition hover:bg-black/60"
        >
          ×
        </button>
        {/* The rich, tabbed catalogue detail — the SAME component the library
            uses, so a recipe/exercise reads identically wherever it's opened. */}
        {!loaded ? (
          <div className="flex flex-1 items-center justify-center text-[12px] italic text-[var(--text-muted)]">{t('health.plans.loading')}</div>
        ) : exercise ? (
          <ExerciseDetailBody ex={exercise} />
        ) : recipe ? (
          <RecipeDetailBody r={recipe} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-[12px] italic text-[var(--text-muted)]">{t('health.plans.no_detail')}</div>
        )}
      </div>
    </div>
  );
}

function DaySection({ title, addLabel, empty, emptyHint, onAdd, children }: {
  title: string;
  addLabel: string;
  empty: boolean;
  emptyHint: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{title}</span>
        <button type="button" onClick={onAdd}
          className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer">
          {addLabel}
        </button>
      </div>
      {empty ? <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-3 text-[10px] italic text-[var(--text-muted)]">{emptyHint}</div> : <div className="space-y-2">{children}</div>}
    </div>
  );
}

function routineSets(detail: HealthExerciseDetail | undefined): number | null {
  const s = detail?.routine?.sets;
  if (typeof s === 'number') return s;
  if (typeof s === 'string') { const n = parseInt(s, 10); return Number.isFinite(n) ? n : null; }
  return null;
}


// ── Prescription pickers ─────────────────────────────────────────────────
//
// Sets, reps, weight, rest and servings were free-text boxes. Typing "3x8-12"
// into a reps field, or "60" into weight, is how a plan ends up unreadable to
// everything downstream — and typing on a numeric field is slower than picking
// from a list of what people actually prescribe.
//
// THE SAFETY IS `withCurrent`. A plan already on disk may hold a value no list
// has a home for: "12 per side", "red band", "3.5". A naive picker renders
// those as blank and overwrites them the moment anything else on the row is
// touched — silent data loss. So the current value is always injected as an
// option when it is not already there, and stays selected until somebody
// deliberately changes it.

const SETS_OPTIONS = ['1', '2', '3', '4', '5', '6', '8', '10'].map(v => ({ value: v, label: v }));

const REPS_OPTIONS = [
  '3-5', '5', '6-8', '8-10', '8-12', '10-12', '12-15', '15-20', '20+',
  'AMRAP', '20s', '30s', '45s', '60s', '90s',
].map(v => ({ value: v, label: v }));

/** Deliberately descriptive rather than numeric. A plan is written to be
 *  followed on a day nobody can predict, so "moderate" travels where "12.5kg"
 *  does not — and somebody's own numbers still survive via withCurrent. */
const WEIGHT_OPTIONS = [
  'bodyweight', 'light', 'light to moderate', 'moderate', 'moderate to heavy',
  'heavy', 'band', 'assisted',
].map(v => ({ value: v, label: v }));

const REST_OPTIONS = ['0', '15', '30', '45', '60', '75', '90', '120', '150', '180'].map(v => ({
  value: v, label: v === '0' ? tt('health.plans.rest_none', 'none') : `${v}s`,
}));

const SERVINGS_OPTIONS = ['0.5', '1', '1.5', '2', '2.5', '3', '4', '5', '6', '8'].map(v => ({
  value: v, label: v,
}));

/** The list, plus a blank, plus whatever is already set if the list has no home
 *  for it. This is the whole safety of the change. */
function withCurrent(options: { value: string; label: string }[], current: string) {
  const base = [{ value: '', label: '\u2014' }, ...options];
  if (!current || base.some(o => o.value === current)) return base;
  return [...base, { value: current, label: current }];
}

function ExerciseRow({ ex, detail, onChange, onRemove, onSwap }: {
  ex: HealthPlanExercise;
  detail: HealthExerciseDetail | undefined;
  onChange: (e: HealthPlanExercise) => void;
  onRemove: () => void;
  /** When set, a swap button replaces this exercise with another from the catalogue. */
  onSwap?: () => void;
}) {
  const recSets = routineSets(detail);
  const recRest = detail?.routine?.rest_seconds ?? null;

  const warnings: string[] = [];
  if (recSets != null && ex.sets != null && ex.sets > recSets) {
    warnings.push(t('health.plans.warn_sets', { sets: ex.sets, rec: recSets }));
  }
  if (recRest != null && ex.rest_seconds != null && ex.rest_seconds < recRest) {
    warnings.push(t('health.plans.warn_rest', { rest: ex.rest_seconds, rec: recRest }));
  }

  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg-input)]/40 p-2">
      <div className="flex items-center gap-2">
        <input value={ex.name} onChange={(e) => onChange({ ...ex, name: e.target.value })} placeholder={t('health.plans.exercise_name_placeholder')} className={`${editInput} flex-1`} />
        {onSwap && <button type="button" onClick={onSwap} title={tt('health.plans.swap', 'Swap')} className="border-none bg-transparent px-1 text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer">⇄</button>}
        <button type="button" onClick={onRemove} title={t('health.plans.remove')} className="border-none bg-transparent px-1 text-[var(--text-muted)] hover:text-red-300 cursor-pointer">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label={t('health.plans.field.sets')}>
          <Select size="sm" value={ex.sets != null ? String(ex.sets) : ''}
            onChange={(v) => onChange({ ...ex, sets: v ? Number(v) : null })}
            options={withCurrent(SETS_OPTIONS, ex.sets != null ? String(ex.sets) : '')} />
        </Cell>
        <Cell label={t('health.plans.field.reps')}>
          <Select size="sm" value={ex.reps ?? ''}
            onChange={(v) => onChange({ ...ex, reps: v || null })}
            options={withCurrent(REPS_OPTIONS, ex.reps ?? '')} />
        </Cell>
        <Cell label={t('health.plans.field.weight')}>
          <Select size="sm" value={ex.weight ?? ''}
            onChange={(v) => onChange({ ...ex, weight: v || null })}
            options={withCurrent(WEIGHT_OPTIONS, ex.weight ?? '')} />
        </Cell>
        <Cell label={t('health.plans.field.rest_s')}>
          <Select size="sm" value={ex.rest_seconds != null ? String(ex.rest_seconds) : ''}
            onChange={(v) => onChange({ ...ex, rest_seconds: v ? Number(v) : null })}
            options={withCurrent(REST_OPTIONS, ex.rest_seconds != null ? String(ex.rest_seconds) : '')} />
        </Cell>
      </div>
      <input value={ex.notes ?? ''} onChange={(e) => onChange({ ...ex, notes: e.target.value || null })} placeholder={t('health.plans.exercise_notes_placeholder')} className={`${editInput} w-full`} />
      {warnings.length > 0 && (
        <div className="rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-300">
          ⚠ {warnings.join('; ')}. {t('health.plans.warn_tail')}
        </div>
      )}
    </div>
  );
}

function MealRow({ meal, recipeDetails, onChange, onRemove, onSwap }: {
  meal: HealthPlanMeal;
  recipeDetails: Record<string, HealthRecipeDetail>;
  onChange: (m: HealthPlanMeal) => void;
  onRemove: () => void;
  /** When set, a swap button replaces this meal with another recipe from the catalogue. */
  onSwap?: () => void;
}) {
  const isRecipe = !!meal.ref;
  const { macros, estimated, pending } = mealMacros(meal, recipeDetails);

  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg-input)]/40 p-2">
      <div className="flex items-center gap-2">
        <Select
          value={meal.slot}
          onChange={(v) => onChange({ ...meal, slot: v as HealthPlanMeal['slot'] })}
          size="sm"
          className="min-w-[120px]"
          options={[
            { value: 'breakfast', label: mealSlotLabel('breakfast') },
            { value: 'lunch', label: mealSlotLabel('lunch') },
            { value: 'dinner', label: mealSlotLabel('dinner') },
            { value: 'snack', label: mealSlotLabel('snack') },
          ]}
        />
        <input value={meal.name} onChange={(e) => onChange({ ...meal, name: e.target.value })} placeholder={t('health.plans.meal_name_placeholder')} className={`${editInput} flex-1`} />
        {onSwap && <button type="button" onClick={onSwap} title={tt('health.plans.swap', 'Swap')} className="border-none bg-transparent px-1 text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer">⇄</button>}
        <button type="button" onClick={onRemove} title={t('health.plans.remove')} className="border-none bg-transparent px-1 text-[var(--text-muted)] hover:text-red-300 cursor-pointer">✕</button>
      </div>

      {isRecipe ? (
        <div className="flex items-center gap-2">
          <Cell label={t('health.plans.field.servings')}>
            <Select size="sm" className="min-w-[92px]" value={meal.servings != null ? String(meal.servings) : ''}
              onChange={(v) => onChange({ ...meal, servings: v ? Number(v) : null })}
              options={withCurrent(SERVINGS_OPTIONS, meal.servings != null ? String(meal.servings) : '')} />
          </Cell>
          <div className="flex-1">
            <div className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{estimated ? t('health.plans.per_meal_est') : t('health.plans.per_meal')}</div>
            {pending ? (
              <div className="mt-1 text-[11px] italic text-[var(--text-muted)]">{t('health.plans.loading_nutrition')}</div>
            ) : macros.calories == null ? (
              <div className="mt-1 text-[11px] italic text-[var(--text-muted)]">{t('health.plans.no_nutrition')}</div>
            ) : (
              <div className="mt-1 flex flex-wrap gap-3">
                {MACRO_FIELDS.map(f => (
                  <span key={f.key} className="text-[11px] text-[var(--text-secondary)]">
                    {t(f.labelKey)} <span className="font-semibold text-[var(--text-primary)]">{macros[f.key] ?? 0}{f.unit}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumInput label={t('health.plans.macro.cal')} value={meal.calories} onChange={(v) => onChange({ ...meal, calories: v })} />
          <NumInput label={t('health.plans.field.protein_g')} value={meal.protein_g} onChange={(v) => onChange({ ...meal, protein_g: v })} />
          <NumInput label={t('health.plans.field.carbs_g')} value={meal.carbs_g} onChange={(v) => onChange({ ...meal, carbs_g: v })} />
          <NumInput label={t('health.plans.field.fat_g')} value={meal.fat_g} onChange={(v) => onChange({ ...meal, fat_g: v })} />
        </div>
      )}
      <input value={meal.notes ?? ''} onChange={(e) => onChange({ ...meal, notes: e.target.value || null })} placeholder={t('health.plans.notes_placeholder')} className={`${editInput} w-full`} />
    </div>
  );
}

/** Label above a control — the shape NumInput/TextInput already render, lifted
 *  out so a picker sits flush beside a text field. */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={editInput}
      />
    </label>
  );
}


// ── Overlay phase: catalogue picker ──────────────────────────────────
// Fills the overlay panel — same fixed size as the builder.

function CatalogPickerPanel({ kind, results, total, searching, onSearch, onConfirm, onClose }: {
  kind: 'exercise' | 'recipe';
  results: Array<HealthExerciseSummary | HealthRecipeSummary>;
  total: number;
  searching: boolean;
  onSearch: PlanSearch;
  onConfirm: (items: Array<{ slug: string; name: string } | null>) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Map<string, { slug: string; name: string }>>(new Map());
  const isEx = kind === 'exercise';
  const categories = isEx ? EXERCISE_CATEGORIES : RECIPE_CATEGORIES;

  // Search fires on query / category / page change — typing debounced,
  // category and page changes immediate.
  useEffect(() => {
    const timer = window.setTimeout(
      () => onSearch({ q: query.trim(), offset: page * PICKER_PAGE_SIZE, category }),
      query ? 300 : 0,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, page]);

  // A new query or category always restarts at the first page.
  const changeQuery = (v: string) => { setQuery(v); setPage(0); };
  const changeCategory = (c: string | null) => { setCategory(c); setPage(0); };

  const toggle = (slug: string, name: string) => {
    setPicked(prev => {
      const next = new Map(prev);
      if (next.has(slug)) next.delete(slug);
      else next.set(slug, { slug, name });
      return next;
    });
  };

  const subtitle = (r: HealthExerciseSummary | HealthRecipeSummary): string => {
    if (kind === 'exercise') {
      const e = r as HealthExerciseSummary;
      return [e.workout_type, e.difficulty ? t('health.plans.difficulty', { n: e.difficulty }) : null].filter(Boolean).join(' · ');
    }
    const rec = r as HealthRecipeSummary;
    return [rec.course, rec.cuisine_name].filter(Boolean).join(' · ');
  };

  /** Card thumbnail — exercise workout-type image or recipe hero. */
  const imageUrl = (r: HealthExerciseSummary | HealthRecipeSummary): string | null =>
    kind === 'exercise'
      ? ((r as HealthExerciseSummary).thumbnail_url ?? null)
      : ((r as HealthRecipeSummary).hero_image_url ?? null);

  const chip = (label: string, value: string | null) => {
    const on = category === value;
    return (
      <button
        key={label}
        type="button"
        onClick={() => changeCategory(value)}
        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium capitalize transition cursor-pointer ${
          on ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
             : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40'
        }`}
      >
        {label}
      </button>
    );
  };

  const lastPage = Math.max(0, Math.ceil(total / PICKER_PAGE_SIZE) - 1);
  const fromN = total === 0 ? 0 : page * PICKER_PAGE_SIZE + 1;
  const toN = page * PICKER_PAGE_SIZE + results.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--accent)]/14 px-6 py-4">
        <button type="button" onClick={onClose} className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">{t('health.plans.back_to_plan')}</button>
        <span className="text-[13px] font-medium text-[var(--text-primary)]">{isEx ? t('health.plans.picker.add_exercises_header') : t('health.plans.picker.add_recipes_header')}</span>
        <span className="w-[80px]" aria-hidden />
      </div>

      <div className="space-y-2 border-b border-[var(--accent)]/10 px-6 py-3">
        <input
          autoFocus
          value={query}
          onChange={(e) => changeQuery(e.target.value)}
          placeholder={isEx ? t('health.plans.picker.search_exercises') : t('health.plans.picker.search_recipes')}
          className={`${editInput} w-full`}
        />
        <div className="flex flex-wrap gap-1.5">
          {chip(t('health.plans.all'), null)}
          {categories.map(c => chip(c, c))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
        {searching && results.length === 0 ? (
          <div className="py-10 text-center text-[11px] text-[var(--text-muted)]">{t('health.plans.searching')}</div>
        ) : results.length === 0 ? (
          <div className="py-10 text-center text-[11px] text-[var(--text-muted)]">
            {query
              ? (isEx ? t('health.plans.picker.no_exercise_match', { query }) : t('health.plans.picker.no_recipe_match', { query }))
              : (isEx ? t('health.plans.picker.no_exercises') : t('health.plans.picker.no_recipes'))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {results.map(r => {
              const on = picked.has(r.slug);
              const sub = subtitle(r);
              const img = imageUrl(r);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggle(r.slug, r.name)}
                  className={`relative flex flex-col overflow-hidden rounded-md border text-left transition cursor-pointer ${
                    on ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/40'
                  }`}
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-[var(--accent)]/[0.08]">
                    {img ? (
                      <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[20px] font-semibold text-[var(--accent)]/40">
                        {r.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  {on && (
                    <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[9px] text-white">✓</span>
                  )}
                  <div className="px-2 py-1.5">
                    <span className="block truncate text-[11px] text-[var(--text-primary)]">{r.name}</span>
                    {sub && <span className="block truncate text-[9px] capitalize text-[var(--text-muted)]">{sub}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--accent)]/14 px-6 py-3">
        <button
          type="button"
          onClick={() => onConfirm([null])}
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer border-none bg-transparent"
        >
          {isEx ? t('health.plans.picker.custom_exercise') : t('health.plans.picker.custom_recipe')}
        </button>
        {total > PICKER_PAGE_SIZE && (
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className={`rounded border border-[var(--border)] px-2 py-0.5 transition ${page === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:border-[var(--accent)]/40 cursor-pointer'}`}
            >
              {t('health.plans.prev')}
            </button>
            <span className="tabular-nums">{t('health.plans.range', { from: fromN, to: toN, total })}</span>
            <button
              type="button"
              disabled={page >= lastPage}
              onClick={() => setPage(p => Math.min(lastPage, p + 1))}
              className={`rounded border border-[var(--border)] px-2 py-0.5 transition ${page >= lastPage ? 'opacity-40 cursor-not-allowed' : 'hover:border-[var(--accent)]/40 cursor-pointer'}`}
            >
              {t('health.plans.next')}
            </button>
          </div>
        )}
        <button
          type="button"
          disabled={picked.size === 0}
          onClick={() => onConfirm(Array.from(picked.values()))}
          className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition ${
            picked.size > 0
              ? 'border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 cursor-pointer'
              : 'border border-[var(--border)] text-[var(--text-muted)] cursor-not-allowed opacity-60'
          }`}
        >
          {t('health.plans.add_to_day', { n: picked.size > 0 ? picked.size : '' })}
        </button>
      </div>
    </div>
  );
}
