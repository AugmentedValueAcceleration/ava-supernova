// ─── Canonical health-plan types (shared across surfaces) ────────────────────
//
// These are the shapes the agent tools and the surface adapters agree on.
// The full surface-local HealthPlan (with a concrete HealthProfile in
// profile_snapshot) lives in each surface's own types — those types
// structurally extend / agree with the shapes here, but core deliberately
// stays opaque on profile_snapshot to avoid pulling HealthProfile into core.
//
// See COMMAND_PALETTE_PLAN.md §10.

export type HealthPlanType = 'fitness' | 'meal' | 'combined';
export type HealthPlanSource = 'manual' | 'ava';
export type HealthPlanStatus = 'draft' | 'active' | 'completed' | 'archived';

/** A planned training exercise within a plan day. Links to a catalogue
 *  exercise by slug, or stands alone as a custom entry (ref null). */
export interface HealthPlanExercise {
  id: string;
  ref?: { kind: 'exercise'; slug: string } | null;
  name: string;
  sets: number | null;
  reps: string | null;            // "8-12", "AMRAP", "30s" — free-form target
  weight: string | null;          // "bodyweight", "60kg", "RPE 7" — guidance
  rest_seconds: number | null;
  tempo: string | null;           // "3-1-1-0" or null
  notes: string | null;
}

/** A planned meal within a plan day. A catalogue recipe (ref set) derives
 *  its nutrition from the recipe × `servings`; a custom meal (ref null)
 *  carries hand-entered macros. */
export interface HealthPlanMeal {
  id: string;
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  ref?: { kind: 'recipe'; slug: string } | null;
  name: string;
  servings: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  notes: string | null;
}

/** One day of a plan. `day_index` is 1-based and absolute within the plan
 *  (the UI groups into weeks by ceil(day_index / 7)). */
export interface HealthPlanDay {
  day_index: number;
  kind: 'training' | 'rest' | 'active_recovery';
  title: string | null;           // "Upper body", "Long run", "Rest day"
  training: HealthPlanExercise[]; // empty on rest days / meal-only plans
  meals: HealthPlanMeal[];        // empty on fitness-only plans
  notes: string | null;
}

/** Library-grid summary — what `HealthPlanStore.list()` returns. */
export interface HealthPlanSummary {
  id: string;
  type: HealthPlanType;
  title: string;
  status: HealthPlanStatus;
  duration_days: number;
  source: HealthPlanSource;
  updated_at: string | null;
}

/** Input to `HealthPlanStore.create` — the tool's argument shape. The
 *  surface adapter is responsible for generating the id, snapshotting the
 *  user's current health profile, and stamping created_at / updated_at;
 *  the tool only carries the user-facing fields. */
export interface HealthPlanCreateInput {
  type: HealthPlanType;
  title: string;
  goal?: string | null;
  /** Supported presets: 1 / 7 / 28 / 56 / 84. */
  duration_days: number;
  /** Operator's chosen status — required (no default), per the locked spec. */
  status: HealthPlanStatus;
  /** Optional initial day fill. Omit for a blank skeleton: the adapter
   *  generates empty rest-day entries for day_index 1..duration_days. */
  days?: HealthPlanDay[];
}
