import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Select } from '../components/Select';
import type {
  HealthPlan, HealthPlanSummary, HealthPlanType, HealthPlanStatus,
  HealthPlanDay, HealthPlanExercise, HealthPlanMeal,
  HealthExerciseSummary, HealthRecipeSummary,
  HealthExerciseDetail, HealthRecipeDetail, HealthRecipeNutrition,
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

interface Props {
  plans: HealthPlanSummary[];
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
}

export function HealthPlans({
  plans, planOpen, onOpenPlan, onSavePlan, onDeletePlan, onClosePlan,
  exerciseResults, recipeResults, catalogSearching, exerciseTotal, recipeTotal, onSearchExercises, onSearchRecipes,
  exerciseDetails, recipeDetails, onLoadExerciseDetail, onLoadRecipeDetail,
}: Props) {
  const [setupOpen, setSetupOpen] = useState(false);

  return (
    <>
      <BasePlansTab plans={plans} onNew={() => setSetupOpen(true)} onOpen={onOpenPlan} onDelete={onDeletePlan} />
      {(setupOpen || planOpen) && (
        <PlanOverlay
          planOpen={planOpen}
          onCancelSetup={() => setSetupOpen(false)}
          onCreate={onSavePlan}
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
  planOpen, onCancelSetup, onCreate, onClose, onSave, onDelete,
  exerciseResults, recipeResults, catalogSearching, exerciseTotal, recipeTotal, onSearchExercises, onSearchRecipes,
  exerciseDetails, recipeDetails, onLoadExerciseDetail, onLoadRecipeDetail,
}: {
  planOpen: HealthPlan | null;
  onCancelSetup: () => void;
  onCreate: (plan: HealthPlan) => void;
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
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-6">
      <div className="flex h-full w-full max-w-[1180px] flex-col overflow-hidden rounded-xl border border-[rgba(168,85,247,0.25)] bg-gradient-to-br from-[#100d1a] to-[#181327] shadow-[0_0_80px_rgba(168,85,247,0.15)]">
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
          />
        ) : (
          <PlanSetup onCancel={onCancelSetup} onCreate={onCreate} />
        )}
      </div>
    </div>
  );
}

// ── Shared meta + helpers ────────────────────────────────────────────

const PLAN_TYPE_META: Record<HealthPlanType, { label: string; accent: string; tint: string; blurb: string }> = {
  fitness:  { label: 'Fitness',  accent: 'var(--accent)', tint: 'border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]', blurb: 'Training weeks — exercises, sets, progression.' },
  meal:     { label: 'Meal',     accent: '#f59e0b',       tint: 'border-amber-400/30 bg-amber-400/10 text-amber-300',                 blurb: 'Nutrition weeks — meals, servings, day totals.' },
  combined: { label: 'Combined', accent: '#34d399',       tint: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',           blurb: 'Training and meals woven together.' },
};

const PLAN_STATUS_META: Record<HealthPlanStatus, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-[var(--border)] text-[var(--text-muted)]' },
  active:    { label: 'Active',    cls: 'bg-emerald-400/15 text-emerald-300' },
  completed: { label: 'Completed', cls: 'bg-sky-400/15 text-sky-300' },
  archived:  { label: 'Archived',  cls: 'bg-[var(--border)] text-[var(--text-muted)] opacity-70' },
};

const DURATION_PRESETS: Array<{ days: number; label: string }> = [
  { days: 1,  label: '1 day' },
  { days: 7,  label: '1 week' },
  { days: 28, label: '4 weeks' },
  { days: 56, label: '8 weeks' },
  { days: 84, label: '12 weeks' },
];

const editInput =
  'rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-[12px] ' +
  'text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/50';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function durationLabel(days: number): string {
  if (days <= 1) return '1 day';
  const weeks = Math.round(days / 7);
  return weeks === 1 ? '1 week' : `${weeks} weeks`;
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
  return { id: newId('ml'), slot, ref: null, name: '', servings: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, notes: null };
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
    title: `New ${PLAN_TYPE_META[type].label.toLowerCase()} plan`,
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

const MACRO_FIELDS: Array<{ key: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'; label: string; unit: string }> = [
  { key: 'calories',  label: 'Cal',     unit: '' },
  { key: 'protein_g', label: 'Protein', unit: 'g' },
  { key: 'carbs_g',   label: 'Carbs',   unit: 'g' },
  { key: 'fat_g',     label: 'Fat',     unit: 'g' },
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
  return { totals, estimated };
}

// ── Base Plans tab — Calendar / Programs inner tabs ──────────────────

/** The Plans tab itself. Never an overlay. Two inner tabs: Calendar (a
 *  month grid sized to one page) and Programs (the plan list) — so the
 *  list is never stacked under the calendar forcing a scroll. */
function BasePlansTab({ plans, onNew, onOpen, onDelete }: {
  plans: HealthPlanSummary[];
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [tab, setTab] = useState<'calendar' | 'programs'>('calendar');
  // Default the calendar to the month of a dated plan so a created plan is
  // visible the moment the tab opens — not a blank current month.
  const [month, setMonth] = useState<Date>(() => {
    const dated = plans.find(p => p.start_date);
    return dated?.start_date ? new Date(`${dated.start_date}T00:00:00`) : new Date();
  });

  // Mark every day each plan spans: a training dot for fitness/combined, a
  // meal dot for meal/combined. This is what makes created plans actually
  // show up on the calendar (it used to be hardcoded empty).
  const planMarks = useMemo(() => {
    const map = new Map<string, { training: boolean; meals: boolean }>();
    for (const p of plans) {
      if (!p.start_date) continue;
      const start = new Date(`${p.start_date}T00:00:00`);
      if (isNaN(start.getTime())) continue;
      const training = p.type === 'fitness' || p.type === 'combined';
      const meals = p.type === 'meal' || p.type === 'combined';
      for (let i = 0; i < p.duration_days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const key = ymd(d);
        const prev = map.get(key) ?? { training: false, meals: false };
        map.set(key, { training: prev.training || training, meals: prev.meals || meals });
      }
    }
    return map;
  }, [plans]);

  // Which plan covers a date? Prefer an active plan, then most recently
  // updated — so clicking a day opens the plan you'd expect, not creation.
  const planForDate = useCallback((key: string): HealthPlanSummary | null => {
    const sel = new Date(`${key}T00:00:00`).getTime();
    const covering = plans.filter(p => {
      if (!p.start_date) return false;
      const start = new Date(`${p.start_date}T00:00:00`).getTime();
      if (isNaN(start)) return false;
      return sel >= start && sel <= start + (p.duration_days - 1) * 86400000;
    });
    if (covering.length === 0) return null;
    covering.sort((a, b) => {
      if ((a.status === 'active') !== (b.status === 'active')) return a.status === 'active' ? -1 : 1;
      return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
    });
    return covering[0];
  }, [plans]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Your plans</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
            Multi-week fitness, meal, and combined programs — built day by day from the recipe and exercise library.
          </p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="shrink-0 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer"
        >
          + New plan
        </button>
      </div>

      {/* Inner tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        {([['calendar', 'Calendar'], ['programs', `Programs${plans.length ? ` · ${plans.length}` : ''}`]] as const).map(([key, label]) => (
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
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          marks={planMarks}
          selected={null}
          onSelectDate={(key) => { const p = planForDate(key); if (p) onOpen(p.id); else onNew(); }}
        />
      ) : plans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-10 text-center">
          <div className="text-[12px] text-[var(--text-secondary)]">No programs yet</div>
          <div className="mx-auto mt-1.5 max-w-sm text-[10px] italic leading-relaxed text-[var(--text-muted)]">
            Start one with “+ New plan” — pick a type and a length, then fill the days.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {plans.map(p => (
            <PlanCard key={p.id} plan={p} onOpen={() => onOpen(p.id)} onDelete={() => onDelete(p.id)} />
          ))}
        </div>
      )}
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
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${m.tint}`}>{m.label}</span>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${s.cls}`}>{s.label}</span>
        </div>
        <div className="mt-2 text-[13px] leading-snug text-[var(--text-primary)]">{plan.title}</div>
        <div className="mt-1 text-[10px] text-[var(--text-muted)]">{durationLabel(plan.duration_days)} · built by you</div>
      </button>

      {confirming ? (
        <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-md border border-red-500/30 bg-[var(--bg-input)] px-2 py-1">
          <span className="text-[10px] text-[var(--text-secondary)]">Delete?</span>
          <button type="button" onClick={() => { onDelete(); setConfirming(false); }} className="border-none bg-transparent text-[10px] font-semibold text-red-300 hover:text-red-200 cursor-pointer">Yes</button>
          <button type="button" onClick={() => setConfirming(false)} className="border-none bg-transparent text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">No</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} title="Delete plan"
          className="absolute right-2 top-2 cursor-pointer rounded border-none bg-transparent p-1 text-[var(--text-muted)] opacity-0 transition hover:text-red-300 group-hover:opacity-100">
          ✕
        </button>
      )}
    </div>
  );
}

// ── Overlay phase: Setup ─────────────────────────────────────────────
// Fills the overlay panel — header / scrolling body / footer.

function PlanSetup({ onCancel, onCreate }: {
  onCancel: () => void;
  onCreate: (plan: HealthPlan) => void;
}) {
  const [type, setType] = useState<HealthPlanType | null>(null);
  const [duration, setDuration] = useState<number>(28);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(168,85,247,0.14)] px-6 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">New plan</h2>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Pick a type and a length — then build it day by day.</p>
        </div>
        <button type="button" onClick={onCancel}
          className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
          Cancel
        </button>
      </div>

      <div className="flex-1 min-h-0 space-y-6 overflow-y-auto px-6 py-6">
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Type</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(['fitness', 'meal', 'combined'] as HealthPlanType[]).map(t => {
              const m = PLAN_TYPE_META[t];
              const on = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-lg border px-4 py-4 text-left transition cursor-pointer ${
                    on ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/40'
                  }`}
                >
                  <div className="mb-2 h-[3px] w-10 rounded" style={{ background: m.accent }} aria-hidden />
                  <div className="text-[13px] font-medium text-[var(--text-primary)]">{m.label}</div>
                  <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">{m.blurb}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Length</div>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map(p => (
              <button
                key={p.days}
                type="button"
                onClick={() => setDuration(p.days)}
                className={`rounded-md border px-3 py-1.5 text-[11px] font-medium transition cursor-pointer ${
                  duration === p.days
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-[rgba(168,85,247,0.14)] px-6 py-4">
        <button
          type="button"
          disabled={!type}
          onClick={() => { if (type) onCreate(blankPlan(type, duration)); }}
          className={`rounded-md px-4 py-2 text-[12px] font-medium transition ${
            type
              ? 'border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 cursor-pointer'
              : 'border border-[var(--border)] text-[var(--text-muted)] cursor-not-allowed opacity-60'
          }`}
        >
          Start building →
        </button>
        {!type && <span className="text-[10px] italic text-[var(--text-muted)]">Pick a type first.</span>}
      </div>
    </div>
  );
}

// ── Overlay phase: Builder ───────────────────────────────────────────

function PlanBuilder({
  plan, onClose, onSave, onDelete,
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
}) {
  const [draft, setDraft] = useState<HealthPlan>(plan);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [month, setMonth] = useState<Date>(() => new Date(`${plan.start_date ?? todayISO()}T00:00:00`));
  const [confirming, setConfirming] = useState(false);
  const [picker, setPicker] = useState<'exercise' | 'recipe' | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const prefilled = useRef<Set<string>>(new Set());

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDraft(plan);
    setSelectedDay(1);
    setMonth(new Date(`${plan.start_date ?? todayISO()}T00:00:00`));
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

  const startISO = draft.start_date ?? todayISO();
  const dateForDay = useCallback((dayIndex: number): string => {
    const d = new Date(`${startISO}T00:00:00`);
    d.setDate(d.getDate() + dayIndex - 1);
    return ymd(d);
  }, [startISO]);
  const dayForDate = useCallback((key: string): number | null => {
    const start = new Date(`${startISO}T00:00:00`);
    const sel = new Date(`${key}T00:00:00`);
    const idx = Math.round((sel.getTime() - start.getTime()) / 86400000) + 1;
    return idx >= 1 && idx <= draft.duration_days ? idx : null;
  }, [startISO, draft.duration_days]);
  const calendarMarks = useMemo(() => {
    const map = new Map<string, { training: boolean; meals: boolean }>();
    for (const d of draft.days) {
      map.set(dateForDay(d.day_index), {
        training: showTraining && d.training.length > 0,
        meals: showMeals && d.meals.length > 0,
      });
    }
    return map;
  }, [draft.days, dateForDay, showTraining, showMeals]);

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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-2 border-b border-[rgba(168,85,247,0.14)] px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={closeWithFlush}
            className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
            ← All plans
          </button>
          <span className="text-[10px] text-[var(--text-muted)]">Changes save automatically</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${m.tint}`}>{m.label}</span>
          <input
            value={draft.title}
            onChange={(e) => commit({ ...draft, title: e.target.value })}
            placeholder="Plan title"
            className={`${editInput} min-w-[180px] flex-1 text-[14px]`}
          />
          <Select
            value={draft.status}
            onChange={(v) => commit({ ...draft, status: v as HealthPlanStatus })}
            size="sm"
            title="Activating a plan archives any other active plan of the same type"
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'active', label: 'Active' },
              { value: 'completed', label: 'Completed' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          <Select
            value={String(draft.duration_days)}
            onChange={(v) => setDuration(Number(v))}
            size="sm"
            options={DURATION_PRESETS.map(p => ({ value: String(p.days), label: p.label }))}
          />
        </div>
        <input
          value={draft.goal ?? ''}
          onChange={(e) => commit({ ...draft, goal: e.target.value || null })}
          placeholder="Goal — e.g. lose 4 kg, first 5 k, build pressing strength"
          className={`${editInput} w-full`}
        />
      </div>

      {/* Body — calendar and the day editor side by side, each scrolls
          on its own; the overlay itself never grows past the screen. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-6 lg:grid-cols-[340px_1fr]">
        <div className="min-h-0 overflow-y-auto">
          <MonthCalendar
            month={month}
            onMonthChange={setMonth}
            marks={calendarMarks}
            selected={dateForDay(selectedDay)}
            onSelectDate={(key) => {
              const idx = dayForDate(key);
              if (idx != null) setSelectedDay(idx);
            }}
          />
        </div>
        <div className="min-h-0 overflow-y-auto">
          <DayPanel
            day={selDay}
            startDate={draft.start_date}
            showTraining={showTraining}
            showMeals={showMeals}
            recipeDetails={recipeDetails}
            exerciseDetails={exerciseDetails}
            onChange={upsertDay}
            onAddExercises={() => setPicker('exercise')}
            onAddMeals={() => setPicker('recipe')}
            onLoadExerciseDetail={onLoadExerciseDetail}
            onLoadRecipeDetail={onLoadRecipeDetail}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center border-t border-[rgba(168,85,247,0.14)] px-6 py-3">
        {confirming ? (
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[var(--text-secondary)]">Delete this plan permanently?</span>
            <button type="button" onClick={() => { onDelete(draft.id); onClose(); }} className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-300 hover:bg-red-500/20 transition cursor-pointer">Delete</button>
            <button type="button" onClick={() => setConfirming(false)} className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-red-300 transition cursor-pointer">Delete plan</button>
        )}
      </div>
    </div>
  );
}

/** A real month calendar. Weekday columns, the month's dates, training /
 *  meal pills per day. Clicking an in-plan date selects that day. */
function MonthCalendar({ month, onMonthChange, marks, selected, onSelectDate }: {
  month: Date;
  onMonthChange: (d: Date) => void;
  marks: Map<string, { training: boolean; meals: boolean }>;
  selected: string | null;
  onSelectDate: (key: string) => void;
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
    <div className="overflow-hidden rounded-xl border border-[rgba(168,85,247,0.18)] bg-gradient-to-br from-[#100d1a] to-[#181327] shadow-[0_4px_28px_rgba(0,0,0,0.28)]">
      <div className="flex items-center justify-between border-b border-[rgba(168,85,247,0.12)] bg-[var(--accent)]/5 px-4 py-2.5">
        <button type="button" onClick={() => onMonthChange(new Date(year, mon - 1, 1))} aria-label="Previous month"
          className="flex h-7 w-7 items-center justify-center rounded-md border-none bg-[var(--accent)]/10 text-[14px] text-[var(--text-secondary)] transition hover:bg-[var(--accent)]/25 hover:text-white cursor-pointer">‹</button>
        <span className="text-[13px] font-semibold tracking-wide text-[var(--text-primary)]">{monthLabel}</span>
        <button type="button" onClick={() => onMonthChange(new Date(year, mon + 1, 1))} aria-label="Next month"
          className="flex h-7 w-7 items-center justify-center rounded-md border-none bg-[var(--accent)]/10 text-[14px] text-[var(--text-secondary)] transition hover:bg-[var(--accent)]/25 hover:text-white cursor-pointer">›</button>
      </div>

      <div className="p-3">
        <div className="mb-1.5 grid grid-cols-7 gap-1.5">
          {WEEKDAY_INITIAL.map((w, i) => (
            <div key={i} className="text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const key = ymd(date);
            const mk = marks.get(key);
            const isToday = key === today;
            const isSelected = key === selected;
            const hasContent = !!mk && (mk.training || mk.meals);
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelectDate(key)}
                className={`flex min-h-[54px] flex-col gap-1 rounded-lg border p-1.5 text-left transition cursor-pointer ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15'
                    : hasContent
                      ? 'border-[rgba(168,85,247,0.22)] bg-[var(--accent)]/5 hover:border-[var(--accent)]/50'
                      : 'border-[rgba(168,85,247,0.08)] hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5'
                }`}
              >
                <span className={`flex h-[17px] w-[17px] items-center justify-center rounded-full text-[10px] ${
                  isToday ? 'bg-[var(--accent)] font-bold text-white'
                    : isSelected ? 'font-semibold text-[var(--accent)]'
                    : 'font-medium text-[var(--text-secondary)]'
                }`}>
                  {date.getDate()}
                </span>
                <span className="mt-auto flex flex-wrap gap-1">
                  {mk?.training && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />}
                  {mk?.meals && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />}
                </span>
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

  const dateLabel = date ? `${WEEKDAY[date.getDay()]} ${date.getDate()} — Day ${day.day_index}` : `Day ${day.day_index}`;
  const kindLabel = day.kind === 'training' ? 'Training' : day.kind === 'active_recovery' ? 'Active recovery' : 'Rest';
  const pillBtn = 'rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer';

  if (!editing) {
    return (
      <div className="space-y-4 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{dateLabel}</span>
          <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{kindLabel}</span>
          {day.title && <span className="text-[12px] text-[var(--text-secondary)]">{day.title}</span>}
          <button type="button" onClick={() => setEditing(true)} className={`ml-auto ${pillBtn}`}>Edit day</button>
        </div>
        <DayReadView day={day} showTraining={showTraining} showMeals={showMeals} exerciseDetails={exerciseDetails} recipeDetails={recipeDetails} totals={totals} estimated={estimated} onLoadExerciseDetail={onLoadExerciseDetail} onLoadRecipeDetail={onLoadRecipeDetail} />
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
            { value: 'training', label: 'Training' },
            { value: 'rest', label: 'Rest' },
            { value: 'active_recovery', label: 'Active recovery' },
          ]}
        />
        <input
          value={day.title ?? ''}
          onChange={(e) => onChange({ ...day, title: e.target.value || null })}
          placeholder="Day title — e.g. Upper body, Long run"
          className={`${editInput} min-w-[160px] flex-1`}
        />
        <button type="button" onClick={() => setEditing(false)} className={pillBtn}>Done</button>
      </div>

      {showTraining && (
        <DaySection title="Training" addLabel="+ Add exercises" empty={day.training.length === 0} onAdd={onAddExercises}
          emptyHint="Pick exercises from the library — sets and reps fill in from each one's routine.">
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
        <DaySection title="Meals" addLabel="+ Add recipes" empty={day.meals.length === 0} onAdd={onAddMeals}
          emptyHint="Pick recipes from the library — nutrition is worked out from servings.">
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
              <span className="text-[10px] uppercase tracking-[0.14em] text-amber-300/80">Day total</span>
              {MACRO_FIELDS.map(f => (
                <span key={f.key} className="text-[11px] text-[var(--text-secondary)]">
                  {f.label} <span className="font-semibold text-[var(--text-primary)]">{totals[f.key] ?? 0}{f.unit}</span>
                </span>
              ))}
              {estimated && <span className="text-[9px] italic text-[var(--text-muted)]">estimated</span>}
            </div>
          )}
        </DaySection>
      )}

      <textarea
        value={day.notes ?? ''}
        onChange={(e) => onChange({ ...day, notes: e.target.value || null })}
        placeholder="Day notes (optional)"
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
  else if (ex.sets != null) parts.push(`${ex.sets} sets`);
  else if (ex.reps) parts.push(ex.reps);
  if (ex.weight) parts.push(ex.weight);
  if (ex.rest_seconds != null) parts.push(`${ex.rest_seconds}s rest`);
  return parts.join('  ·  ') || '—';
}

/** One-line readable summary of a meal — "1 serving · 350 cal · 30g protein". */
function mealSummary(meal: HealthPlanMeal, recipeDetails: Record<string, HealthRecipeDetail>): string {
  const parts: string[] = [];
  if (meal.servings != null) parts.push(`${meal.servings} serving${meal.servings === 1 ? '' : 's'}`);
  const { macros } = mealMacros(meal, recipeDetails);
  if (macros.calories != null) parts.push(`${macros.calories} cal`);
  if (macros.protein_g != null) parts.push(`${macros.protein_g}g protein`);
  return parts.join('  ·  ') || '—';
}

/** The calm, scannable view of a day — small cards, each clickable to open
 *  the exercise's technique guide or the recipe. Free-text items (no library
 *  ref) render as plain, non-clickable cards. */
function DayReadView({ day, showTraining, showMeals, exerciseDetails, recipeDetails, totals, estimated, onLoadExerciseDetail, onLoadRecipeDetail }: {
  day: HealthPlanDay;
  showTraining: boolean;
  showMeals: boolean;
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
    setDetail({ kind: 'exercise', slug: ex.ref.slug, name: ex.name || 'Exercise' });
  };
  const openMeal = (meal: HealthPlanMeal) => {
    if (!meal.ref) return;
    onLoadRecipeDetail(meal.ref.slug);
    setDetail({ kind: 'recipe', slug: meal.ref.slug, name: meal.name || 'Meal' });
  };

  if (day.training.length === 0 && day.meals.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-[11px] italic text-[var(--text-muted)]">
        Nothing scheduled — hit “Edit day” to add {showTraining ? 'exercises' : ''}{showTraining && showMeals ? ' or ' : ''}{showMeals ? 'meals' : ''}.
      </div>
    );
  }

  const cardCls = (clickable: boolean) =>
    `flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-input)]/30 px-3 py-2 text-left transition ${
      clickable ? 'cursor-pointer hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5' : 'cursor-default'
    }`;

  return (
    <div className="space-y-4">
      {showTraining && day.training.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Training</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {day.training.map(ex => {
              const clickable = !!ex.ref;
              return (
                <button key={ex.id} type="button" disabled={!clickable} onClick={() => openExercise(ex)} className={cardCls(clickable)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-medium text-[var(--text-primary)]">{ex.name || 'Exercise'}</span>
                    {clickable && <span className="shrink-0 text-[14px] leading-none text-[var(--accent)]">›</span>}
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)]">{exerciseSummary(ex)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {showMeals && day.meals.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Meals</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {day.meals.map(meal => {
              const clickable = !!meal.ref;
              return (
                <button key={meal.id} type="button" disabled={!clickable} onClick={() => openMeal(meal)} className={cardCls(clickable)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-medium text-[var(--text-primary)]">
                      <span className="mr-1.5 text-[10px] uppercase text-[var(--text-muted)]">{meal.slot}</span>{meal.name || 'Meal'}
                    </span>
                    {clickable && <span className="shrink-0 text-[14px] leading-none text-[var(--accent)]">›</span>}
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)]">{mealSummary(meal, recipeDetails)}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-amber-300/80">Day total</span>
            {MACRO_FIELDS.map(f => (
              <span key={f.key} className="text-[11px] text-[var(--text-secondary)]">
                {f.label} <span className="font-semibold text-[var(--text-primary)]">{totals[f.key] ?? 0}{f.unit}</span>
              </span>
            ))}
            {estimated && <span className="text-[9px] italic text-[var(--text-muted)]">estimated</span>}
          </div>
        </div>
      )}
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-[rgba(168,85,247,0.25)] bg-gradient-to-br from-[#100d1a] to-[#181327] shadow-[0_0_60px_rgba(168,85,247,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[rgba(168,85,247,0.14)] px-5 py-3">
          <span className="text-[14px] font-semibold text-[var(--text-primary)]">{detail.name}</span>
          <button type="button" onClick={onClose} className="border-none bg-transparent text-[14px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">✕</button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!loaded ? (
            <div className="py-8 text-center text-[12px] italic text-[var(--text-muted)]">Loading…</div>
          ) : exercise ? (
            <ExerciseDetailBody ex={exercise} />
          ) : recipe ? (
            <RecipeDetailBody rec={recipe} />
          ) : (
            <div className="py-8 text-center text-[12px] italic text-[var(--text-muted)]">No detail available for this item.</div>
          )}
        </div>
      </div>
    </div>
  );
}

const detailChip = 'rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] capitalize text-[var(--text-muted)]';
const detailHd = 'text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]';

function ExerciseDetailBody({ ex }: { ex: HealthExerciseDetail }) {
  const r = ex.routine;
  const routineParts = [
    r.sets != null ? `${r.sets} sets` : null,
    r.reps_target ? `${r.reps_target} reps` : null,
    r.rest_seconds != null ? `${r.rest_seconds}s rest` : null,
    r.tempo ? `tempo ${r.tempo}` : null,
    r.frequency_per_week ? `${r.frequency_per_week}/wk` : null,
  ].filter(Boolean);
  return (
    <div className="space-y-4 text-[12px] leading-relaxed text-[var(--text-secondary)]">
      <div className="flex flex-wrap gap-1.5">
        <span className={detailChip}>{ex.exercise_type}</span>
        <span className={detailChip}>{ex.workout_type}</span>
        {typeof ex.difficulty === 'number' && <span className={detailChip}>difficulty {ex.difficulty}</span>}
      </div>
      {ex.thumbnail_url && <img src={ex.thumbnail_url} alt="" className="w-full rounded-lg object-cover" />}
      {ex.description && <p>{ex.description}</p>}
      {routineParts.length > 0 && (
        <div><div className={detailHd}>Routine</div><p className="mt-1">{routineParts.join('  ·  ')}{r.progression ? ` — ${r.progression}` : ''}</p></div>
      )}
      {ex.steps.length > 0 && (
        <div>
          <div className={detailHd}>How to do it</div>
          <ol className="mt-1 list-decimal space-y-1 pl-5">{ex.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
      )}
      {ex.common_mistakes && <div><div className={detailHd}>Common mistakes</div><p className="mt-1">{ex.common_mistakes}</p></div>}
      {ex.muscles.length > 0 && (
        <div><div className={detailHd}>Muscles</div><div className="mt-1 flex flex-wrap gap-1.5">{ex.muscles.map(mu => <span key={mu.slug} className={detailChip}>{mu.name}{mu.role === 'secondary' ? ' (secondary)' : ''}</span>)}</div></div>
      )}
      {ex.equipment.length > 0 && (
        <div><div className={detailHd}>Equipment</div><div className="mt-1 flex flex-wrap gap-1.5">{ex.equipment.map(eq => <span key={eq.slug} className={detailChip}>{eq.name}</span>)}</div></div>
      )}
      {ex.demo_video_url && <a href={ex.demo_video_url} target="_blank" rel="noreferrer" className="inline-block text-[12px] text-[var(--accent)] hover:underline">Watch demo →</a>}
    </div>
  );
}

function RecipeDetailBody({ rec }: { rec: HealthRecipeDetail }) {
  const version = rec.versions.find(v => v.level === 'intermediate') ?? rec.versions[0];
  const n = version?.nutrition;
  const timeParts = version ? [
    version.prep_time_minutes != null ? `${version.prep_time_minutes}m prep` : null,
    version.cook_time_minutes != null ? `${version.cook_time_minutes}m cook` : null,
  ].filter(Boolean) : [];
  return (
    <div className="space-y-4 text-[12px] leading-relaxed text-[var(--text-secondary)]">
      <div className="flex flex-wrap gap-1.5">
        {rec.course && <span className={detailChip}>{rec.course}</span>}
        {rec.cuisine_name && <span className={detailChip}>{rec.cuisine_name}</span>}
        {version?.default_servings != null && <span className={detailChip}>{version.default_servings} servings</span>}
      </div>
      {rec.hero_image_url && <img src={rec.hero_image_url} alt="" className="w-full rounded-lg object-cover" />}
      {(rec.overview || version?.description) && <p>{rec.overview ?? version?.description}</p>}
      {timeParts.length > 0 && <p className="text-[var(--text-muted)]">{timeParts.join('  ·  ')}</p>}
      {n && typeof n.calories === 'number' && (
        <div>
          <div className={detailHd}>Nutrition (per serving{n.source === 'verified' ? '' : ', estimated'})</div>
          <div className="mt-1 flex flex-wrap gap-3">
            {n.calories != null && <span>Cal <span className="font-semibold text-[var(--text-primary)]">{n.calories}</span></span>}
            {n.protein_g != null && <span>Protein <span className="font-semibold text-[var(--text-primary)]">{n.protein_g}g</span></span>}
            {n.carbs_g != null && <span>Carbs <span className="font-semibold text-[var(--text-primary)]">{n.carbs_g}g</span></span>}
            {n.fat_g != null && <span>Fat <span className="font-semibold text-[var(--text-primary)]">{n.fat_g}g</span></span>}
          </div>
        </div>
      )}
      {rec.ingredients.length > 0 && (
        <div>
          <div className={detailHd}>Ingredients</div>
          <ul className="mt-1 space-y-0.5">
            {[...rec.ingredients].sort((a, b) => a.sort_order - b.sort_order).map((ing, i) => (
              <li key={i}>{[ing.quantity != null ? ing.quantity : null, ing.unit, ing.name].filter(v => v != null && v !== '').join(' ')}{ing.optional ? ' (optional)' : ''}</li>
            ))}
          </ul>
        </div>
      )}
      {version && version.steps.length > 0 && (
        <div>
          <div className={detailHd}>Method</div>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {[...version.steps].sort((a, b) => a.sort_order - b.sort_order).map((s, i) => <li key={i}>{s.action}</li>)}
          </ol>
        </div>
      )}
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

function ExerciseRow({ ex, detail, onChange, onRemove }: {
  ex: HealthPlanExercise;
  detail: HealthExerciseDetail | undefined;
  onChange: (e: HealthPlanExercise) => void;
  onRemove: () => void;
}) {
  const recSets = routineSets(detail);
  const recRest = detail?.routine?.rest_seconds ?? null;

  const warnings: string[] = [];
  if (recSets != null && ex.sets != null && ex.sets > recSets) {
    warnings.push(`${ex.sets} sets is above the recommended ${recSets}`);
  }
  if (recRest != null && ex.rest_seconds != null && ex.rest_seconds < recRest) {
    warnings.push(`${ex.rest_seconds}s rest is shorter than the recommended ${recRest}s`);
  }

  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg-input)]/40 p-2">
      <div className="flex items-center gap-2">
        <input value={ex.name} onChange={(e) => onChange({ ...ex, name: e.target.value })} placeholder="Exercise name" className={`${editInput} flex-1`} />
        <button type="button" onClick={onRemove} title="Remove" className="border-none bg-transparent px-1 text-[var(--text-muted)] hover:text-red-300 cursor-pointer">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumInput label="Sets" value={ex.sets} onChange={(v) => onChange({ ...ex, sets: v })} />
        <TextInput label="Reps" value={ex.reps} placeholder="8-12" onChange={(v) => onChange({ ...ex, reps: v })} />
        <TextInput label="Weight" value={ex.weight} placeholder="60 kg / RPE 7" onChange={(v) => onChange({ ...ex, weight: v })} />
        <NumInput label="Rest (s)" value={ex.rest_seconds} onChange={(v) => onChange({ ...ex, rest_seconds: v })} />
      </div>
      <input value={ex.notes ?? ''} onChange={(e) => onChange({ ...ex, notes: e.target.value || null })} placeholder="Notes — tempo, cues (optional)" className={`${editInput} w-full`} />
      {warnings.length > 0 && (
        <div className="rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-300">
          ⚠ {warnings.join('; ')}. More isn't always better — give your body room to recover.
        </div>
      )}
    </div>
  );
}

function MealRow({ meal, recipeDetails, onChange, onRemove }: {
  meal: HealthPlanMeal;
  recipeDetails: Record<string, HealthRecipeDetail>;
  onChange: (m: HealthPlanMeal) => void;
  onRemove: () => void;
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
            { value: 'breakfast', label: 'Breakfast' },
            { value: 'lunch', label: 'Lunch' },
            { value: 'dinner', label: 'Dinner' },
            { value: 'snack', label: 'Snack' },
          ]}
        />
        <input value={meal.name} onChange={(e) => onChange({ ...meal, name: e.target.value })} placeholder="Meal name" className={`${editInput} flex-1`} />
        <button type="button" onClick={onRemove} title="Remove" className="border-none bg-transparent px-1 text-[var(--text-muted)] hover:text-red-300 cursor-pointer">✕</button>
      </div>

      {isRecipe ? (
        <div className="flex items-center gap-2">
          <NumInput label="Servings" value={meal.servings} onChange={(v) => onChange({ ...meal, servings: v })} />
          <div className="flex-1">
            <div className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Per this meal{estimated ? ' · estimated' : ''}</div>
            {pending ? (
              <div className="mt-1 text-[11px] italic text-[var(--text-muted)]">Loading nutrition…</div>
            ) : macros.calories == null ? (
              <div className="mt-1 text-[11px] italic text-[var(--text-muted)]">No nutrition for this recipe yet.</div>
            ) : (
              <div className="mt-1 flex flex-wrap gap-3">
                {MACRO_FIELDS.map(f => (
                  <span key={f.key} className="text-[11px] text-[var(--text-secondary)]">
                    {f.label} <span className="font-semibold text-[var(--text-primary)]">{macros[f.key] ?? 0}{f.unit}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumInput label="Cal" value={meal.calories} onChange={(v) => onChange({ ...meal, calories: v })} />
          <NumInput label="Protein g" value={meal.protein_g} onChange={(v) => onChange({ ...meal, protein_g: v })} />
          <NumInput label="Carbs g" value={meal.carbs_g} onChange={(v) => onChange({ ...meal, carbs_g: v })} />
          <NumInput label="Fat g" value={meal.fat_g} onChange={(v) => onChange({ ...meal, fat_g: v })} />
        </div>
      )}
      <input value={meal.notes ?? ''} onChange={(e) => onChange({ ...meal, notes: e.target.value || null })} placeholder="Notes (optional)" className={`${editInput} w-full`} />
    </div>
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

function TextInput({ label, value, placeholder, onChange }: {
  label: string;
  value: string | null;
  placeholder?: string;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      <input value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value || null)} className={editInput} />
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
  const noun = kind === 'exercise' ? 'exercise' : 'recipe';
  const categories = kind === 'exercise' ? EXERCISE_CATEGORIES : RECIPE_CATEGORIES;

  // Search fires on query / category / page change — typing debounced,
  // category and page changes immediate.
  useEffect(() => {
    const t = window.setTimeout(
      () => onSearch({ q: query.trim(), offset: page * PICKER_PAGE_SIZE, category }),
      query ? 300 : 0,
    );
    return () => clearTimeout(t);
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
      return [e.workout_type, e.difficulty ? `difficulty ${e.difficulty}` : null].filter(Boolean).join(' · ');
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
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(168,85,247,0.14)] px-6 py-4">
        <button type="button" onClick={onClose} className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">← Back to plan</button>
        <span className="text-[13px] font-medium text-[var(--text-primary)]">Add {noun}s — tick as many as you need</span>
        <span className="w-[80px]" aria-hidden />
      </div>

      <div className="space-y-2 border-b border-[rgba(168,85,247,0.1)] px-6 py-3">
        <input
          autoFocus
          value={query}
          onChange={(e) => changeQuery(e.target.value)}
          placeholder={`Search the ${noun} library…`}
          className={`${editInput} w-full`}
        />
        <div className="flex flex-wrap gap-1.5">
          {chip('All', null)}
          {categories.map(c => chip(c, c))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
        {searching && results.length === 0 ? (
          <div className="py-10 text-center text-[11px] text-[var(--text-muted)]">Searching…</div>
        ) : results.length === 0 ? (
          <div className="py-10 text-center text-[11px] text-[var(--text-muted)]">
            {query ? `No ${noun}s match “${query}”.` : `No ${noun}s found.`}
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

      <div className="flex items-center justify-between gap-3 border-t border-[rgba(168,85,247,0.14)] px-6 py-3">
        <button
          type="button"
          onClick={() => onConfirm([null])}
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer border-none bg-transparent"
        >
          + Add a custom {noun} instead
        </button>
        {total > PICKER_PAGE_SIZE && (
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className={`rounded border border-[var(--border)] px-2 py-0.5 transition ${page === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:border-[var(--accent)]/40 cursor-pointer'}`}
            >
              ‹ Prev
            </button>
            <span className="tabular-nums">{fromN}–{toN} of {total}</span>
            <button
              type="button"
              disabled={page >= lastPage}
              onClick={() => setPage(p => Math.min(lastPage, p + 1))}
              className={`rounded border border-[var(--border)] px-2 py-0.5 transition ${page >= lastPage ? 'opacity-40 cursor-not-allowed' : 'hover:border-[var(--accent)]/40 cursor-pointer'}`}
            >
              Next ›
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
          Add {picked.size > 0 ? picked.size : ''} to this day
        </button>
      </div>
    </div>
  );
}
