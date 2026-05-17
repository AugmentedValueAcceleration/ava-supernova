import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type {
  HealthPlan, HealthPlanSummary, HealthPlanType, HealthPlanStatus,
  HealthPlanDay, HealthPlanExercise, HealthPlanMeal,
  HealthExerciseSummary, HealthRecipeSummary,
} from '../types/messages';

/**
 * Health Plans — the multi-week plan feature, mounted as the Planner's
 * "Plans" tab. A plan is a program (fitness / meal / combined); this
 * surface is the library, the new-plan wizard, and the plan editor.
 *
 * The daily slice of an active plan is shown separately on the Command
 * Centre's Health Dashboard; this is where plans are built and managed.
 */

interface Props {
  plans: HealthPlanSummary[];
  planOpen: HealthPlan | null;
  onOpenPlan: (id: string) => void;
  onSavePlan: (plan: HealthPlan) => void;
  onDeletePlan: (id: string) => void;
  onClosePlan: () => void;
  // Catalog picker — exercise / recipe search.
  exerciseResults: HealthExerciseSummary[];
  recipeResults: HealthRecipeSummary[];
  catalogSearching: boolean;
  onSearchExercises: (q: string) => void;
  onSearchRecipes: (q: string) => void;
}

export function HealthPlans({
  plans, planOpen, onOpenPlan, onSavePlan, onDeletePlan, onClosePlan,
  exerciseResults, recipeResults, catalogSearching, onSearchExercises, onSearchRecipes,
}: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);

  if (planOpen) {
    return (
      <PlanEditor
        plan={planOpen}
        onClose={onClosePlan}
        onSave={onSavePlan}
        onDelete={onDeletePlan}
        exerciseResults={exerciseResults}
        recipeResults={recipeResults}
        catalogSearching={catalogSearching}
        onSearchExercises={onSearchExercises}
        onSearchRecipes={onSearchRecipes}
      />
    );
  }
  if (wizardOpen) {
    return (
      <NewPlanWizard
        onCancel={() => setWizardOpen(false)}
        onCreateManual={(p) => { setWizardOpen(false); onSavePlan(p); }}
      />
    );
  }
  return (
    <PlansLibrary
      plans={plans}
      onOpen={onOpenPlan}
      onNew={() => setWizardOpen(true)}
      onDelete={onDeletePlan}
    />
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

// ── Multi-week Plans — library + detail ──────────────────────────────

const PLAN_TYPE_META: Record<HealthPlanType, { label: string; accent: string; tint: string; blurb: string }> = {
  fitness:  { label: 'Fitness',  accent: 'var(--accent)', tint: 'border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]', blurb: 'Training weeks — exercises, sets, progression.' },
  meal:     { label: 'Meal',     accent: '#f59e0b',       tint: 'border-amber-400/30 bg-amber-400/10 text-amber-300',                 blurb: 'Nutrition weeks — meals, macros, shopping list.' },
  combined: { label: 'Combined', accent: '#34d399',       tint: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',           blurb: 'Training and meals woven together.' },
};

const PLAN_STATUS_META: Record<HealthPlanStatus, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-[var(--border)] text-[var(--text-muted)]' },
  active:    { label: 'Active',    cls: 'bg-emerald-400/15 text-emerald-300' },
  completed: { label: 'Completed', cls: 'bg-sky-400/15 text-sky-300' },
  archived:  { label: 'Archived',  cls: 'bg-[var(--border)] text-[var(--text-muted)] opacity-70' },
};

/** Days → preset label. 1 → "1 day", 7 → "1 week", 28 → "4 weeks". */
function durationLabel(days: number): string {
  if (days <= 1) return '1 day';
  const weeks = Math.round(days / 7);
  return weeks === 1 ? '1 week' : `${weeks} weeks`;
}

function newPlanId(): string {
  return crypto?.randomUUID?.() ?? `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A fresh, empty draft plan of the chosen type + duration — the
 *  manual door of the wizard hands this straight to the editor. */
function blankPlan(type: HealthPlanType, durationDays: number): HealthPlan {
  return {
    schema_version: 1,
    id: newPlanId(),
    type,
    title: `New ${PLAN_TYPE_META[type].label.toLowerCase()} plan`,
    goal: null,
    source: 'manual',
    status: 'draft',
    duration_days: durationDays,
    start_date: null,
    profile_snapshot: null,
    days: [],
    created_at: new Date().toISOString(),
    updated_at: null,
  };
}

function PlansLibrary({ plans, onOpen, onNew, onDelete }: {
  plans: HealthPlanSummary[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Your plans</h2>
        <p className="mt-1 text-[11px] text-[var(--text-muted)] leading-relaxed">
          Multi-week fitness, meal, and combined programs. Build one by hand, or ask Ava.
        </p>
      </div>

      <button
        type="button"
        onClick={onNew}
        className="w-full rounded-lg border border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5 px-4 py-3 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition cursor-pointer"
      >
        + New plan
      </button>

      {plans.length === 0 ? (
        <PlansEmptyCard
          title="No plans yet"
          body="Start one with “+ New plan” — pick a type, choose to build it yourself or ask Ava, set the length."
        />
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
      <button
        type="button"
        onClick={onOpen}
        className="block w-full cursor-pointer border-none bg-transparent px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${m.tint}`}>{m.label}</span>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${s.cls}`}>{s.label}</span>
        </div>
        <div className="mt-2 text-[13px] leading-snug text-[var(--text-primary)]">{plan.title}</div>
        <div className="mt-1 text-[10px] text-[var(--text-muted)]">
          {durationLabel(plan.duration_days)} · {plan.source === 'ava' ? 'Ava-generated' : 'Built by you'}
        </div>
      </button>

      {confirming ? (
        <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-md border border-red-500/30 bg-[var(--bg-input)] px-2 py-1">
          <span className="text-[10px] text-[var(--text-secondary)]">Delete?</span>
          <button type="button" onClick={() => { onDelete(); setConfirming(false); }} className="border-none bg-transparent text-[10px] font-semibold text-red-300 hover:text-red-200 cursor-pointer">Yes</button>
          <button type="button" onClick={() => setConfirming(false)} className="border-none bg-transparent text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">No</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          title="Delete plan"
          className="absolute right-2 top-2 cursor-pointer rounded border-none bg-transparent p-1 text-[var(--text-muted)] opacity-0 transition hover:text-red-300 group-hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ── New-plan wizard ──────────────────────────────────────────────────
// Type → Door → Length. The manual door hands a blank plan straight to
// the editor; the Ava door's intake + generate flow lands in C2 — a
// placeholder panel marks the spot for now.

function NewPlanWizard({ onCancel, onCreateManual }: {
  onCancel: () => void;
  onCreateManual: (plan: HealthPlan) => void;
}) {
  const [step, setStep] = useState<'type' | 'door' | 'length' | 'ava'>('type');
  const [type, setType] = useState<HealthPlanType | null>(null);
  const [door, setDoor] = useState<'manual' | 'ava' | null>(null);
  const [duration, setDuration] = useState<number>(28);

  const stepLabels = ['Type', 'How', 'Length'];
  const currentIdx = step === 'type' ? 0 : step === 'door' ? 1 : 2;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-light text-[var(--text-primary)]">New plan</span>
        <button type="button" onClick={onCancel} className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">Cancel</button>
      </div>

      <div className="flex items-center gap-1.5">
        {stepLabels.map((label, i) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`text-[10px] uppercase tracking-wide ${i <= currentIdx ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>{label}</span>
            {i < stepLabels.length - 1 && <span className="text-[10px] text-[var(--text-muted)]">·</span>}
          </span>
        ))}
      </div>

      {step === 'type' && (
        <WizardStep title="What kind of plan?">
          {(['fitness', 'meal', 'combined'] as HealthPlanType[]).map(t => {
            const m = PLAN_TYPE_META[t];
            return (
              <WizardChoice key={t} title={m.label} blurb={m.blurb} accent={m.accent} onClick={() => { setType(t); setStep('door'); }} />
            );
          })}
        </WizardStep>
      )}

      {step === 'door' && (
        <WizardStep title="How do you want to build it?" onBack={() => setStep('type')}>
          <WizardChoice
            title="Build it myself"
            blurb="Start from a blank plan and shape every week and day by hand."
            onClick={() => { setDoor('manual'); setStep('length'); }}
          />
          <WizardChoice
            title="Ask Ava"
            blurb="Ava drafts the plan from your profile — you review and edit everything after."
            onClick={() => { setDoor('ava'); setStep('length'); }}
          />
        </WizardStep>
      )}

      {step === 'length' && type && (
        <WizardStep title="How long should it run?" onBack={() => setStep('door')}>
          {DURATION_PRESETS.map(p => (
            <WizardChoice
              key={p.days}
              title={p.label}
              blurb=""
              onClick={() => {
                setDuration(p.days);
                if (door === 'manual') onCreateManual(blankPlan(type, p.days));
                else setStep('ava');
              }}
            />
          ))}
        </WizardStep>
      )}

      {step === 'ava' && type && (
        <WizardStep title="Ask Ava" onBack={() => setStep('length')} plain>
          <div className="rounded-lg border border-[var(--border)] bg-transparent px-4 py-6 text-center">
            <div className="text-[12px] text-[var(--text-secondary)]">
              Ava will draft your {durationLabel(duration)} {PLAN_TYPE_META[type].label.toLowerCase()} plan here.
            </div>
            <div className="mx-auto mt-1.5 max-w-sm text-[10px] italic leading-relaxed text-[var(--text-muted)]">
              The intake-and-generate flow lands in the next update. For now, build it yourself — you can ask Ava to refine it later.
            </div>
            <button
              type="button"
              onClick={() => onCreateManual(blankPlan(type, duration))}
              className="mt-3 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer"
            >
              Build it myself instead
            </button>
          </div>
        </WizardStep>
      )}
    </div>
  );
}

function WizardStep({ title, onBack, plain, children }: {
  title: string;
  onBack?: () => void;
  plain?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {onBack && (
          <button type="button" onClick={onBack} className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">← Back</button>
        )}
        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{title}</span>
      </div>
      {plain ? <div>{children}</div> : <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{children}</div>}
    </div>
  );
}

function WizardChoice({ title, blurb, accent, onClick }: {
  title: string;
  blurb: string;
  accent?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-[var(--border)] bg-transparent px-3 py-3 text-left hover:border-[var(--accent)]/40 transition cursor-pointer"
    >
      {accent && <div className="mb-2 h-[3px] w-8 rounded" style={{ background: accent }} aria-hidden />}
      <div className="text-[12px] font-medium text-[var(--text-primary)]">{title}</div>
      {blurb && <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">{blurb}</div>}
    </button>
  );
}

// ── Plan editor ──────────────────────────────────────────────────────
// Opening a plan loads the full HealthPlan into a local working copy.
// Edits autosave (debounced 700ms); the host's save echo never clobbers
// the open draft — re-seed fires only when a different plan id opens.

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

function newItemId(): string {
  return crypto?.randomUUID?.() ?? `i-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyExercise(): HealthPlanExercise {
  return { id: newItemId(), ref: null, name: '', sets: null, reps: null, weight: null, rest_seconds: null, tempo: null, notes: null };
}
function emptyMeal(slot: HealthPlanMeal['slot']): HealthPlanMeal {
  return { id: newItemId(), slot, ref: null, name: '', calories: null, protein_g: null, carbs_g: null, fat_g: null, notes: null };
}
function defaultDay(dayIndex: number): HealthPlanDay {
  return { day_index: dayIndex, kind: 'rest', title: null, training: [], meals: [], notes: null };
}

/** True when a day carries nothing — used to keep `days[]` sparse so an
 *  untouched day isn't persisted as an explicit empty rest entry. */
function isEmptyDay(d: HealthPlanDay): boolean {
  return d.kind === 'rest' && d.training.length === 0 && d.meals.length === 0 && !d.title && !d.notes;
}

function daySummary(day: HealthPlanDay, showTraining: boolean, showMeals: boolean): string {
  const bits: string[] = [];
  if (showTraining && day.training.length > 0) bits.push(`${day.training.length} exercise${day.training.length === 1 ? '' : 's'}`);
  if (showMeals && day.meals.length > 0) bits.push(`${day.meals.length} meal${day.meals.length === 1 ? '' : 's'}`);
  if (bits.length === 0) return day.kind === 'active_recovery' ? 'Active recovery' : 'Rest';
  if (day.kind === 'active_recovery') bits.unshift('Active recovery');
  return bits.join(' · ');
}

function PlanEditor({ plan, onClose, onSave, onDelete, exerciseResults, recipeResults, catalogSearching, onSearchExercises, onSearchRecipes }: {
  plan: HealthPlan;
  onClose: () => void;
  onSave: (plan: HealthPlan) => void;
  onDelete: (id: string) => void;
  exerciseResults: HealthExerciseSummary[];
  recipeResults: HealthRecipeSummary[];
  catalogSearching: boolean;
  onSearchExercises: (q: string) => void;
  onSearchRecipes: (q: string) => void;
}) {
  const [draft, setDraft] = useState<HealthPlan>(plan);
  // The day open in the panel below the calendar — null = none selected.
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The catalog picker — which day + which kind of item it's adding.
  const [picker, setPicker] = useState<{ dayIndex: number; kind: 'exercise' | 'recipe' } | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  // Re-seed only when a *different* plan opens — the host's save echo
  // (same id) must never clobber the draft mid-edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(plan); }, [plan.id]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const commit = useCallback((next: HealthPlan) => {
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => onSave(next), 700);
  }, [onSave]);

  // Flush any pending debounced save before leaving — closing within
  // 700ms of an edit must not lose it.
  const closeWithFlush = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); onSave(draft); }
    onClose();
  };

  const m = PLAN_TYPE_META[draft.type];
  const showTraining = draft.type === 'fitness' || draft.type === 'combined';
  const showMeals = draft.type === 'meal' || draft.type === 'combined';

  // days[] is sparse — absent days render as an implicit rest day.
  const dayByIndex = useMemo(() => {
    const map = new Map<number, HealthPlanDay>();
    for (const d of draft.days) map.set(d.day_index, d);
    return map;
  }, [draft.days]);

  const upsertDay = (day: HealthPlanDay) => {
    const days = draft.days.filter(d => d.day_index !== day.day_index);
    if (!isEmptyDay(day)) days.push(day);
    days.sort((a, b) => a.day_index - b.day_index);
    commit({ ...draft, days });
  };

  const setDuration = (days: number) => {
    commit({ ...draft, duration_days: days, days: draft.days.filter(d => d.day_index <= days) });
  };

  // Add an exercise / meal to a day, then close the picker. Adding the
  // first exercise to a rest day flips it to a training day.
  const addExerciseToDay = (dayIndex: number, ex: HealthPlanExercise) => {
    const day = dayByIndex.get(dayIndex) ?? defaultDay(dayIndex);
    upsertDay({ ...day, kind: day.kind === 'rest' ? 'training' : day.kind, training: [...day.training, ex] });
    setPicker(null);
  };
  const addMealToDay = (dayIndex: number, meal: HealthPlanMeal) => {
    const day = dayByIndex.get(dayIndex) ?? defaultDay(dayIndex);
    upsertDay({ ...day, meals: [...day.meals, meal] });
    setPicker(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={closeWithFlush}
          className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          ← All plans
        </button>
        <span className="text-[10px] text-[var(--text-muted)]">Changes save automatically</span>
      </div>

      {/* Header — type, status, title, goal, duration */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${m.tint}`}>{m.label}</span>
          <select
            value={draft.status}
            onChange={(e) => commit({ ...draft, status: e.target.value as HealthPlanStatus })}
            className={editInput}
            title="Activating a plan archives any other active plan of the same type"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <input
          value={draft.title}
          onChange={(e) => commit({ ...draft, title: e.target.value })}
          placeholder="Plan title"
          className={`${editInput} w-full text-[15px]`}
        />
        <input
          value={draft.goal ?? ''}
          onChange={(e) => commit({ ...draft, goal: e.target.value || null })}
          placeholder="Goal — e.g. lose 4 kg, first 5 k, build pressing strength"
          className={`${editInput} w-full`}
        />
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-muted)]">Length</span>
          <select value={draft.duration_days} onChange={(e) => setDuration(Number(e.target.value))} className={editInput}>
            {DURATION_PRESETS.map(p => <option key={p.days} value={p.days}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* Calendar — the plan at a glance. Click a day to open it. */}
      <PlanCalendar
        duration={draft.duration_days}
        startDate={draft.start_date}
        dayByIndex={dayByIndex}
        selectedDay={selectedDay}
        showTraining={showTraining}
        showMeals={showMeals}
        onSelectDay={(idx) => setSelectedDay(prev => (prev === idx ? null : idx))}
      />

      {/* Day panel — the selected day's editor, below the calendar. */}
      {selectedDay != null && (
        <DayBlock
          day={dayByIndex.get(selectedDay) ?? defaultDay(selectedDay)}
          startDate={draft.start_date}
          onClose={() => setSelectedDay(null)}
          showTraining={showTraining}
          showMeals={showMeals}
          onChange={upsertDay}
          onOpenPicker={(dayIndex, kind) => setPicker({ dayIndex, kind })}
        />
      )}

      {picker && (
        <CatalogPicker
          kind={picker.kind}
          results={picker.kind === 'exercise' ? exerciseResults : recipeResults}
          searching={catalogSearching}
          onSearch={picker.kind === 'exercise' ? onSearchExercises : onSearchRecipes}
          onPick={(item) => {
            if (picker.kind === 'exercise') {
              addExerciseToDay(picker.dayIndex, { ...emptyExercise(), ref: { kind: 'exercise', slug: item.slug }, name: item.name });
            } else {
              addMealToDay(picker.dayIndex, { ...emptyMeal('breakfast'), ref: { kind: 'recipe', slug: item.slug }, name: item.name });
            }
          }}
          onAddCustom={() => {
            if (picker.kind === 'exercise') addExerciseToDay(picker.dayIndex, emptyExercise());
            else addMealToDay(picker.dayIndex, emptyMeal('breakfast'));
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {/* Delete */}
      <div className="border-t border-[var(--border)] pt-4">
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

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Real calendar date for a plan day — startDate + (dayIndex - 1).
 *  Null when the plan has no start date yet (still a relative grid). */
function planDate(startDate: string | null, dayIndex: number): Date | null {
  if (!startDate) return null;
  const d = new Date(`${startDate}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + dayIndex - 1);
  return d;
}

/** The plan calendar — week rows of 7 day-cells. A cell shows the day
 *  number (or real date once the plan has a start date) and dots for
 *  training / meals. Clicking a cell opens that day's panel. */
function PlanCalendar({ duration, startDate, dayByIndex, selectedDay, showTraining, showMeals, onSelectDay }: {
  duration: number;
  startDate: string | null;
  dayByIndex: Map<number, HealthPlanDay>;
  selectedDay: number | null;
  showTraining: boolean;
  showMeals: boolean;
  onSelectDay: (idx: number) => void;
}) {
  const weeks = Math.max(1, Math.ceil(duration / 7));
  return (
    <div className="space-y-3">
      {Array.from({ length: weeks }, (_, w) => {
        const first = w * 7 + 1;
        const indices: number[] = [];
        for (let i = first; i < first + 7 && i <= duration; i++) indices.push(i);
        return (
          <div key={w}>
            {weeks > 1 && (
              <div className="mb-1.5 text-[9px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Week {w + 1}</div>
            )}
            <div className="grid grid-cols-7 gap-1.5">
              {indices.map(idx => (
                <CalendarCell
                  key={idx}
                  dayIndex={idx}
                  day={dayByIndex.get(idx) ?? null}
                  date={planDate(startDate, idx)}
                  selected={selectedDay === idx}
                  showTraining={showTraining}
                  showMeals={showMeals}
                  onClick={() => onSelectDay(idx)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarCell({ dayIndex, day, date, selected, showTraining, showMeals, onClick }: {
  dayIndex: number;
  day: HealthPlanDay | null;
  date: Date | null;
  selected: boolean;
  showTraining: boolean;
  showMeals: boolean;
  onClick: () => void;
}) {
  const hasTraining = showTraining && !!day && day.training.length > 0;
  const hasMeals = showMeals && !!day && day.meals.length > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      title={day?.title ?? `Day ${dayIndex}`}
      className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-md border p-1 transition cursor-pointer ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent)]/10'
          : 'border-[var(--border)] bg-transparent hover:border-[var(--accent)]/40'
      }`}
    >
      <span className="text-[12px] font-medium text-[var(--text-primary)]">{date ? date.getDate() : dayIndex}</span>
      <span className="text-[8px] uppercase tracking-wide text-[var(--text-muted)]">{date ? WEEKDAY[date.getDay()] : 'Day'}</span>
      <span className="flex h-1.5 items-center gap-0.5">
        {hasTraining && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />}
        {hasMeals && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />}
        {!hasTraining && !hasMeals && <span className="text-[8px] text-[var(--text-muted)]">·</span>}
      </span>
    </button>
  );
}

function DayBlock({ day, startDate, onClose, showTraining, showMeals, onChange, onOpenPicker }: {
  day: HealthPlanDay;
  startDate: string | null;
  onClose: () => void;
  showTraining: boolean;
  showMeals: boolean;
  onChange: (day: HealthPlanDay) => void;
  onOpenPicker: (dayIndex: number, kind: 'exercise' | 'recipe') => void;
}) {
  const date = planDate(startDate, day.day_index);
  return (
    <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2.5">
        <span className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-[var(--text-primary)]">
            {date ? `${WEEKDAY[date.getDay()]} ${date.getDate()}` : `Day ${day.day_index}`}
          </span>
          {day.title && <span className="text-[11px] text-[var(--text-secondary)]">— {day.title}</span>}
          <span className="text-[10px] text-[var(--text-muted)]">{daySummary(day, showTraining, showMeals)}</span>
        </span>
        <button type="button" onClick={onClose} title="Close day" className="border-none bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">✕</button>
      </div>

      <div className="space-y-3 px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={day.kind} onChange={(e) => onChange({ ...day, kind: e.target.value as HealthPlanDay['kind'] })} className={editInput}>
              <option value="training">Training</option>
              <option value="rest">Rest</option>
              <option value="active_recovery">Active recovery</option>
            </select>
            <input
              value={day.title ?? ''}
              onChange={(e) => onChange({ ...day, title: e.target.value || null })}
              placeholder="Day title — e.g. Upper body, Long run"
              className={`${editInput} min-w-[140px] flex-1`}
            />
          </div>

          {showTraining && (
            <DaySection
              title="Training"
              addLabel="+ Add exercise"
              empty={day.training.length === 0}
              onAdd={() => onOpenPicker(day.day_index, 'exercise')}
            >
              {day.training.map(ex => (
                <ExerciseEditor
                  key={ex.id}
                  ex={ex}
                  onChange={(next) => onChange({ ...day, training: day.training.map(e => (e.id === ex.id ? next : e)) })}
                  onRemove={() => onChange({ ...day, training: day.training.filter(e => e.id !== ex.id) })}
                />
              ))}
            </DaySection>
          )}

          {showMeals && (
            <DaySection
              title="Meals"
              addLabel="+ Add meal"
              empty={day.meals.length === 0}
              onAdd={() => onOpenPicker(day.day_index, 'recipe')}
            >
              {day.meals.map(meal => (
                <PlanMealEditor
                  key={meal.id}
                  meal={meal}
                  onChange={(next) => onChange({ ...day, meals: day.meals.map(mm => (mm.id === meal.id ? next : mm)) })}
                  onRemove={() => onChange({ ...day, meals: day.meals.filter(mm => mm.id !== meal.id) })}
                />
              ))}
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
    </div>
  );
}

function DaySection({ title, addLabel, empty, onAdd, children }: {
  title: string;
  addLabel: string;
  empty: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{title}</span>
        <button type="button" onClick={onAdd} className="border-none bg-transparent text-[11px] text-[var(--accent)] hover:opacity-80 cursor-pointer">{addLabel}</button>
      </div>
      {empty ? <div className="text-[10px] italic text-[var(--text-muted)]">Nothing added yet.</div> : children}
    </div>
  );
}

function ExerciseEditor({ ex, onChange, onRemove }: {
  ex: HealthPlanExercise;
  onChange: (e: HealthPlanExercise) => void;
  onRemove: () => void;
}) {
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
    </div>
  );
}

function PlanMealEditor({ meal, onChange, onRemove }: {
  meal: HealthPlanMeal;
  onChange: (m: HealthPlanMeal) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg-input)]/40 p-2">
      <div className="flex items-center gap-2">
        <select value={meal.slot} onChange={(e) => onChange({ ...meal, slot: e.target.value as HealthPlanMeal['slot'] })} className={editInput}>
          <option value="breakfast">Breakfast</option>
          <option value="lunch">Lunch</option>
          <option value="dinner">Dinner</option>
          <option value="snack">Snack</option>
        </select>
        <input value={meal.name} onChange={(e) => onChange({ ...meal, name: e.target.value })} placeholder="Meal name" className={`${editInput} flex-1`} />
        <button type="button" onClick={onRemove} title="Remove" className="border-none bg-transparent px-1 text-[var(--text-muted)] hover:text-red-300 cursor-pointer">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumInput label="Cal" value={meal.calories} onChange={(v) => onChange({ ...meal, calories: v })} />
        <NumInput label="Protein g" value={meal.protein_g} onChange={(v) => onChange({ ...meal, protein_g: v })} />
        <NumInput label="Carbs g" value={meal.carbs_g} onChange={(v) => onChange({ ...meal, carbs_g: v })} />
        <NumInput label="Fat g" value={meal.fat_g} onChange={(v) => onChange({ ...meal, fat_g: v })} />
      </div>
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

// ── Catalog picker ───────────────────────────────────────────────────
// A modal over the editor: search the exercise / recipe library and
// drop the chosen item into a plan day (catalog ref + name), or add a
// blank custom entry. Debounced self-search; results arrive via the
// parent's plan-catalog message state.

function CatalogPicker({ kind, results, searching, onSearch, onPick, onAddCustom, onClose }: {
  kind: 'exercise' | 'recipe';
  results: Array<{ id: string; slug: string; name: string }>;
  searching: boolean;
  onSearch: (q: string) => void;
  onPick: (item: { slug: string; name: string }) => void;
  onAddCustom: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const noun = kind === 'exercise' ? 'exercise' : 'recipe';

  // Fires immediately on open (empty query → first slice of the
  // catalog), then 300ms after each keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => onSearch(query.trim()), query ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="mt-10 w-full max-w-md rounded-xl border border-[rgba(168,85,247,0.2)] bg-gradient-to-br from-[#0f0f17] to-[#1a1625] p-4 shadow-[0_0_60px_rgba(168,85,247,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] font-medium text-[var(--text-primary)]">Add {noun}</span>
          <button type="button" onClick={onClose} className="border-none bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">✕</button>
        </div>

        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search the ${noun} library…`}
          className={`${editInput} w-full`}
        />

        <div className="mt-3 max-h-[300px] space-y-1 overflow-y-auto">
          {searching && results.length === 0 ? (
            <div className="py-6 text-center text-[11px] text-[var(--text-muted)]">Searching…</div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center text-[11px] text-[var(--text-muted)]">
              {query ? `No ${noun}s match “${query}”.` : `No ${noun}s found.`}
            </div>
          ) : (
            results.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => onPick({ slug: r.slug, name: r.name })}
                className="block w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-left text-[12px] text-[var(--text-primary)] hover:border-[var(--accent)]/40 transition cursor-pointer"
              >
                {r.name}
              </button>
            ))
          )}
        </div>

        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            onClick={onAddCustom}
            className="w-full rounded-md border border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5 px-3 py-2 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition cursor-pointer"
          >
            + Add a custom {noun}
          </button>
        </div>
      </div>
    </div>
  );
}
