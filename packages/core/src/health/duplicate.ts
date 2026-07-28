// PORTED FROM THE COMPANION, 28 Jul — the duplicate + progression half of
// health-plan-swap.ts. The swap ranker above it stays surface-side; each
// surface already has its own. Lives in core so the extension and the IDE copy
// a day by identical rules — above all, that a copied day is NOT a done day.

import type { HealthPlanDay } from './types.js';

/**
 * The plan shape these operate on.
 *
 * Structural rather than a core HealthPlan, which does not exist by design (see
 * types.ts). The extension, the IDE and the companion each carry their own and
 * all three satisfy this, so the functions return exactly what they were given.
 */
export interface DuplicablePlan {
  duration_days: number;
  days: HealthPlanDay[];
}

// ── 5. Duplicate ────────────────────────────────────────────────────────────

function cloneRowIds<T extends { id: string }>(rows: T[], prefix: string): T[] {
  return rows.map((r, i) => ({
    ...r,
    // Fresh ids: two days holding rows with the same id would make "swap just
    // this one" impossible, which is the whole point of the feature above.
    id: `${prefix}-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
  }));
}

/**
 * Copy one day onto one or more others.
 *
 * Completion is deliberately NOT copied — a copied day has not been done. The
 * title, kind, exercises, meals and notes are.
 */
export function duplicateDay<P extends DuplicablePlan>(plan: P, fromIndex: number, toIndexes: number[]): P {
  const source = plan.days.find(d => d.day_index === fromIndex);
  if (!source) return plan;
  const targets = new Set(toIndexes.filter(i => i !== fromIndex));
  if (targets.size === 0) return plan;

  return {
    ...plan,
    days: plan.days.map(day => {
      if (!targets.has(day.day_index)) return day;
      return {
        ...day,
        kind: source.kind,
        title: source.title,
        notes: source.notes,
        training: cloneRowIds(source.training, 'ex'),
        meals: cloneRowIds(source.meals, 'ml'),
        completion: null,
      } as HealthPlanDay;
    }),
  };
}

/**
 * Copy a whole week onto another, day for day.
 *
 * Weeks are 1-based. A partial target week (the last week of a 10-day plan)
 * copies as far as it goes rather than refusing.
 */
export function duplicateWeek<P extends DuplicablePlan>(plan: P, fromWeek: number, toWeek: number): P {
  if (fromWeek === toWeek) return plan;
  const offset = (toWeek - fromWeek) * 7;
  const sourceStart = (fromWeek - 1) * 7 + 1;

  let next = plan;
  for (let i = 0; i < 7; i++) {
    const from = sourceStart + i;
    const to = from + offset;
    if (!plan.days.some(d => d.day_index === from)) continue;
    if (!plan.days.some(d => d.day_index === to)) continue;
    next = duplicateDay(next, from, [to]);
  }
  return next;
}

/** How many weeks a plan spans, for the week pickers. */
export function weekCount(plan: DuplicablePlan): number {
  return Math.max(1, Math.ceil(plan.duration_days / 7));
}

// ── 6. Progressing a copy ───────────────────────────────────────────────────
//
// "Never repeat week 1 for a month" is already the standing instruction to the
// coach. Copying a week forward unchanged does exactly that, so a copy can be
// nudged as it lands.
//
// Deliberately an EXPLICIT CHOICE rather than a silent rule. Load progression
// cannot be automated honestly here: weight is free text — "60kg", "bodyweight",
// "red band" — and adding 2.5% to "bodyweight" is nonsense. Volume can be
// stepped safely and reversibly, so that is what is offered, and the person
// picks it. Progression driven by what they actually LIFTED is a separate,
// better thing that needs the log.

export type Progression = 'same' | 'one_more_rep' | 'one_more_set';

/**
 * Step a rep prescription up by one.
 *
 * Handles the three shapes the library and users actually write: a plain count
 * ("8"), a range ("8-12", "8–12"), and anything else — time, distance, "AMRAP",
 * "30s" — which is returned untouched because adding a rep to it is meaningless.
 */
export function bumpReps(reps: string | null): string | null {
  if (!reps) return reps;
  const s = reps.trim();

  const range = s.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if (range) {
    const lo = Number(range[1]), hi = Number(range[2]);
    if (Number.isFinite(lo) && Number.isFinite(hi)) return `${lo + 1}-${hi + 1}`;
  }

  if (/^\d+$/.test(s)) return String(Number(s) + 1);

  // Time, distance, AMRAP, per-side notation — not a rep count. Leave it be
  // rather than mangle it into something that reads like a number.
  return reps;
}

/**
 * Apply a progression to every training row in the given days.
 *
 * Only touches training. Meals do not progress — eating one more portion each
 * week is not a nutrition plan.
 */
export function progressDays<P extends DuplicablePlan>(
  plan: P,
  dayIndexes: number[],
  progression: Progression,
): P {
  if (progression === 'same') return plan;
  const targets = new Set(dayIndexes);

  return {
    ...plan,
    days: plan.days.map(day => {
      if (!targets.has(day.day_index)) return day;
      // An active-recovery day exists to be EASY. Adding a set to it is not
      // progression, it is quietly turning the recovery day into a session —
      // which is exactly the mistake the day was scheduled to prevent.
      if (day.kind !== 'training') return day;
      return {
        ...day,
        training: day.training.map(ex => {
          // Warm-ups, cool-downs and mobility are not the place to add volume.
          const role = ex.meta?.session_role ?? null;
          if (role === 'warmup' || role === 'cooldown' || role === 'mobility') return ex;
          return progression === 'one_more_rep'
            ? { ...ex, reps: bumpReps(ex.reps) }
            : { ...ex, sets: ex.sets == null ? ex.sets : ex.sets + 1 };
        }),
      };
    }),
  };
}

/** The day indexes a week covers that actually exist in the plan. */
export function daysInWeek(plan: DuplicablePlan, week: number): number[] {
  const start = (week - 1) * 7 + 1;
  return plan.days
    .filter(d => d.day_index >= start && d.day_index < start + 7)
    .map(d => d.day_index);
}
