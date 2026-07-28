// ─── The training log ───────────────────────────────────────────────────────
//
// What actually happened at the rack, as opposed to what the plan asked for.
// The distinction is the whole point: a plan is an intention, and progression
// that reads intentions is progression that reads nothing.
//
// PORTED INTO CORE 28 Jul from the companion, where it already worked. It lives
// here — not copied per surface — because "same Ava, same memory" is the
// promise the observing loop makes, and a phone that knows you trained Tuesday
// beside an editor that does not is exactly that promise broken.
//
// Everything is captured, nothing is judged. Reading it (what got completed,
// what got skipped, what to say about it) belongs elsewhere; this is only the
// record.

// A session populates from any source — an active plan's day, a freestyle
// drop-in, an Ava suggestion, or active recovery. Progress reads every session
// regardless, so the value of logging is never gated on having a plan.

import type { HealthPlanExercise } from './types.js';

/** One actually-performed set — what the user logged, not the target. */
export interface GymSet {
  id: string;
  weight: number | null;     // kg (canonical; UI converts to/from lbs/st like Profile)
  reps: number | null;
  rpe: number | null;        // 1-10, optional Rate of Perceived Exertion
  notes: string | null;
  completed_at: string;      // ISO timestamp
}

/** An exercise within a session — its targets + the sets actually performed. */
export interface GymExercise {
  id: string;
  /** Catalogue link when applicable, so progress charts can group by slug across sessions. */
  ref?: { kind: 'exercise'; slug: string } | null;
  name: string;
  /** Targets (what the plan/suggestion calls for) — guidance, not hard rules. */
  target_sets: number | null;
  target_reps: string | null;        // "8-12", "AMRAP", "30s" — free-form like the plan
  target_weight: string | null;      // "bodyweight", "60kg", "RPE 7" — guidance
  target_rest_seconds: number | null;
  tempo: string | null;
  notes: string | null;
  /** Sets actually performed this session. Grows as the user logs each one. */
  sets: GymSet[];
}

export type GymSessionSource = 'plan' | 'freestyle' | 'recovery' | 'ava';
export type GymSessionStatus = 'pending' | 'in-progress' | 'completed' | 'skipped';

export interface GymSession {
  schema_version: 1;
  id: string;
  date: string;                   // YYYY-MM-DD the session is for
  source: GymSessionSource;
  /** When source='plan', which plan day populated this. */
  plan_id?: string | null;
  day_index?: number | null;
  status: GymSessionStatus;
  title: string | null;           // "Push day", "Long run", or null for freestyle
  exercises: GymExercise[];
  notes: string | null;
  started_at: string | null;      // null until the user hits Start
  completed_at: string | null;
  updated_at: string;
}

/** Drop a plan-day exercise into the session queue — rename of the same shape. */
export function gymExerciseFromPlan(p: HealthPlanExercise): GymExercise {
  return {
    id: newGymItemId('ex'),
    ref: p.ref ?? null,
    name: p.name,
    target_sets: p.sets,
    target_reps: p.reps,
    target_weight: p.weight,
    target_rest_seconds: p.rest_seconds,
    tempo: p.tempo,
    notes: p.notes,
    sets: [],
  };
}

/** Build a blank session for a date — used by every source (plan/freestyle/etc). */
export function freshGymSession(opts: {
  date: string;
  source: GymSessionSource;
  title?: string | null;
  plan_id?: string | null;
  day_index?: number | null;
}): GymSession {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    id: newGymItemId('gs'),
    date: opts.date,
    source: opts.source,
    plan_id: opts.plan_id ?? null,
    day_index: opts.day_index ?? null,
    status: 'pending',
    title: opts.title ?? null,
    exercises: [],
    notes: null,
    started_at: null,
    completed_at: null,
    updated_at: now,
  };
}

export function newGymItemId(prefix: string): string {
  const c: { randomUUID?: () => string } | undefined = typeof crypto !== 'undefined' ? crypto : undefined;
  return c?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
