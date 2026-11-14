// Progression from what they actually did (Health Part 6, mockup approved
// 14 Nov 2026). The "better thing that needs the log" duplicate.ts promised.
//
// The rules that bind it are the coach's rules, enforced in code:
//
//   - THE PERSON CHOOSES. Nothing here changes a plan by itself; it offers
//     "Keep it / One more rep / One more set / Heavier" and applies the one
//     they pick. Ava never steps anyone up on her own judgement.
//   - ONLY AFTER A COMPLETE SESSION. A step is offered when every planned set
//     was done last time. Short, skipped or unrecorded → nothing offered, and
//     an unrecorded exercise is never read as a failure.
//   - HEAVIER ONLY FROM A REAL NUMBER. Weight is free text ("bodyweight",
//     "red band"); a heavier option exists only when a kilogram figure was
//     recorded or planned, and it goes up by the usual jump for the kit.
//   - WARM-UPS, COOL-DOWNS AND MOBILITY DO NOT PROGRESS (same guard as
//     progressDays).
//   - DAYS ALREADY DONE ARE NOT TOUCHED. A step applies from a day onward.
//
// Pure, shared by the extension host and the IDE sidecar.

import { bumpReps } from './duplicate.js';
import type { GymSession, GymExercise } from './session-types.js';
import type { HealthPlanExercise, HealthPlanRecord } from './types.js';

export type ProgressionStep = 'keep' | 'one_more_rep' | 'one_more_set' | 'heavier';

/** What happened to one exercise the last time it was logged. */
export interface LastTime {
  date: string;
  /** Sets recorded, and the planned count at the time. */
  done: number;
  target: number | null;
  reps: number[];
  topKg: number | null;
  /** as_planned / above = every set done; short = fewer; ticked = done, no numbers. */
  verdict: 'as_planned' | 'above' | 'short' | 'ticked';
  /** The plan at the time, to tell whether it has been stepped up since. */
  targetReps: string | null;
  targetWeight: string | null;
}

export interface StepOption {
  step: ProgressionStep;
  /** What the row would read after the step: sets, reps, weight. */
  sets: number | null;
  reps: string | null;
  weight: string | null;
}

/** A kilogram figure from plan text — ONLY when it says kg or lb. "RPE 7",
 *  "bodyweight", "red band" are not weights to add to. */
export function plannedKg(text: string | null | undefined): number | null {
  const m = (text ?? '').match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|lb|lbs|pound)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return /^(lb|lbs|pound)/i.test(m[2]) ? Math.round(n * 0.453592 * 10) / 10 : n;
}

const ROLE_NO_PROGRESS = new Set(['warmup', 'cooldown', 'mobility']);
const num = (s: string | null | undefined): number | null => {
  const m = (s ?? '').match(/^\s*(\d+)\s*$/);
  return m ? Number(m[1]) : null;
};

/** Read one logged exercise as a LastTime, or null when there is nothing to go on. */
export function lastTimeOf(ex: GymExercise, date: string): LastTime | null {
  if (ex.state === 'skipped' || ex.notes === 'skipped') return null;
  const sets = ex.sets ?? [];
  if (!sets.length && ex.state !== 'done') return null; // unrecorded: unknown, not a failure
  const reps = sets.map((s) => s.reps).filter((r): r is number => typeof r === 'number');
  const kgs = sets.map((s) => s.weight).filter((w): w is number => typeof w === 'number');
  const topKg = kgs.length ? Math.max(...kgs) : null;
  const base = { date, target: ex.target_sets, reps, topKg, targetReps: ex.target_reps, targetWeight: ex.target_weight };
  if (!sets.length) return { ...base, done: 0, verdict: 'ticked' };
  if (ex.target_sets != null && sets.length < ex.target_sets) return { ...base, done: sets.length, verdict: 'short' };
  const tr = num(ex.target_reps);
  const askedKg = plannedKg(ex.target_weight);
  const above = (tr != null && reps.some((r) => r > tr)) || (askedKg != null && topKg != null && topKg > askedKg);
  return { ...base, done: sets.length, verdict: above ? 'above' : 'as_planned' };
}

/** The most recent logged performance of an exercise (by library slug), on or before `onOrBefore`. */
export function lastTimeFor(sessions: GymSession[], slug: string, onOrBefore?: string): LastTime | null {
  const sorted = [...(sessions ?? [])]
    .filter((s) => !onOrBefore || s.date <= onOrBefore)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.updated_at).localeCompare(String(a.updated_at)));
  for (const s of sorted) {
    for (const ex of s.exercises ?? []) {
      if (ex.ref?.slug !== slug) continue;
      const lt = lastTimeOf(ex, s.date);
      if (lt) return lt;
    }
  }
  return null;
}

/** The usual smallest jump for the kit: kettlebells 4 kg, dumbbells 2 kg, else 2.5 kg. */
export function weightJump(ex: Pick<HealthPlanExercise, 'name' | 'meta'>): number {
  const kit = [...(ex.meta?.equipment ?? []), ex.name].join(' ').toLowerCase();
  if (/kettlebell/.test(kit)) return 4;
  if (/dumbbell/.test(kit)) return 2;
  return 2.5;
}

const fmtKg = (n: number): string => `${Math.round(n * 10) / 10} kg`;

/**
 * The choices for one plan row, given how it went last time. Empty when
 * nothing should be offered (short, ticked-only with nothing to step, a
 * warm-up, no last time at all).
 */
export function stepOptions(ex: HealthPlanExercise, last: LastTime | null): StepOption[] {
  if (!last || last.verdict === 'short') return [];
  if (ROLE_NO_PROGRESS.has(ex.meta?.session_role ?? '')) return [];
  const out: StepOption[] = [{ step: 'keep', sets: ex.sets, reps: ex.reps, weight: ex.weight }];
  const bumped = bumpReps(ex.reps);
  if (bumped && bumped !== ex.reps) out.push({ step: 'one_more_rep', sets: ex.sets, reps: bumped, weight: ex.weight });
  if (ex.sets != null) out.push({ step: 'one_more_set', sets: ex.sets + 1, reps: ex.reps, weight: ex.weight });
  // From the heavier of what they lifted and what the row already asks.
  const kgs = [last.topKg, plannedKg(ex.weight ?? '')].filter((n): n is number => n != null);
  const base = kgs.length ? Math.max(...kgs) : null;
  if (base != null && base > 0 && !/bodyweight/i.test(ex.weight ?? '')) {
    out.push({ step: 'heavier', sets: ex.sets, reps: ex.reps, weight: fmtKg(base + weightJump(ex)) });
  }
  return out.length > 1 ? out : [];
}

/** Apply one step to one row (each row steps from its OWN values). */
function stepRow(ex: HealthPlanExercise, step: ProgressionStep, heavierWeight: string | null): HealthPlanExercise {
  if (step === 'one_more_rep') return { ...ex, reps: bumpReps(ex.reps) };
  if (step === 'one_more_set') return ex.sets == null ? ex : { ...ex, sets: ex.sets + 1 };
  if (step === 'heavier' && heavierWeight) return { ...ex, weight: heavierWeight };
  return ex;
}

export interface ProgressionChoice {
  slug: string;
  step: ProgressionStep;
  /** For 'heavier': the weight that was offered. */
  weight?: string | null;
}

/**
 * Apply the chosen steps to every row of those exercises on days
 * `fromDayIndex` onward. Days before it — already done — are left alone.
 */
export function applyProgression<P extends HealthPlanRecord>(plan: P, fromDayIndex: number, choices: ProgressionChoice[]): P {
  const bySlug = new Map(choices.filter((c) => c.step !== 'keep').map((c) => [c.slug, c]));
  if (!bySlug.size) return plan;
  return {
    ...plan,
    days: plan.days.map((day) => {
      if (day.day_index < fromDayIndex || day.kind !== 'training') return day;
      return {
        ...day,
        training: day.training.map((ex) => {
          const c = ex.ref?.slug ? bySlug.get(ex.ref.slug) : undefined;
          if (!c || ROLE_NO_PROGRESS.has(ex.meta?.session_role ?? '')) return ex;
          return stepRow(ex, c.step, c.weight ?? null);
        }),
      };
    }),
  };
}

/** One row of "Saved. Next time?" or of the plan day's "Last time" line. */
export interface ProgressionRow {
  slug: string;
  name: string;
  last: LastTime;
  options: StepOption[];
  /** The plan row has changed since then (they already stepped it up). */
  stepped: boolean;
}

/** The row asks for MORE than last time's plan did — they already stepped it up. */
function steppedSince(ex: HealthPlanExercise, last: LastTime): boolean {
  const up = (now: number | null, then: number | null) => now != null && then != null && now > then;
  return up(ex.sets, last.target) || up(num(ex.reps), num(last.targetReps))
    || up(plannedKg(ex.weight ?? ''), plannedKg(last.targetWeight ?? ''));
}

function rowFor(ex: HealthPlanExercise, last: LastTime | null): ProgressionRow | null {
  if (!ex.ref?.slug || !last) return null;
  const stepped = steppedSince(ex, last);
  return { slug: ex.ref.slug, name: ex.name, last, options: stepped ? [] : stepOptions(ex, last), stepped };
}

/** The next plan day (after `dayIndex`) that has this exercise, or the row itself. */
function nextRow(plan: HealthPlanRecord, dayIndex: number, slug: string): HealthPlanExercise | null {
  for (const d of [...plan.days].sort((a, b) => a.day_index - b.day_index)) {
    if (d.day_index <= dayIndex) continue;
    const ex = d.training.find((e) => e.ref?.slug === slug);
    if (ex) return ex;
  }
  return null;
}

/**
 * "Saved. Next time?" — for a session just saved against a plan day. Rows are
 * the exercises that come up AGAIN later in the plan; options are worked out
 * on that next appearance. Returns [] when nothing would be offered.
 */
export function progressionAfterSession(plan: HealthPlanRecord, session: GymSession): ProgressionRow[] {
  if (session.day_index == null) return [];
  const rows: ProgressionRow[] = [];
  const seen = new Set<string>();
  for (const ex of session.exercises ?? []) {
    const slug = ex.ref?.slug;
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const last = lastTimeOf(ex, session.date);
    const next = nextRow(plan, session.day_index, slug);
    if (!last || !next) continue;
    const opts = stepOptions(next, last);
    if (!opts.length && last.verdict !== 'short') continue;
    rows.push({ slug, name: ex.name, last, options: opts, stepped: false });
  }
  return rows.some((r) => r.options.length) ? rows : [];
}

/** The plan day's "Last time" line for each exercise, from the log. */
export function lastTimesForDay(plan: HealthPlanRecord, dayIndex: number, sessions: GymSession[], dayDate: string): Record<string, ProgressionRow> {
  const day = plan.days.find((d) => d.day_index === dayIndex);
  const out: Record<string, ProgressionRow> = {};
  // The log BEFORE this day: on the day itself, "last time" means the time before.
  const before = (sessions ?? []).filter((s) => s.date < dayDate);
  for (const ex of day?.training ?? []) {
    const slug = ex.ref?.slug;
    if (!slug || out[slug]) continue;
    const row = rowFor(ex, lastTimeFor(before, slug));
    if (row) out[slug] = row;
  }
  return out;
}
