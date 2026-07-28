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
/** Who wrote this plan. 'Ava wrote this for you' and 'this is a
 *  professionally built starter' are different claims, and a plan card must
 *  not show them identically. */
export type HealthPlanSource = 'manual' | 'ava' | 'curated';
export type HealthPlanStatus = 'draft' | 'active' | 'completed' | 'archived';

/** A planned training exercise within a plan day. Links to a catalogue
 *  exercise by slug, or stands alone as a custom entry (ref null). */
/**
 * What the library knew about this movement when it was added.
 *
 * Captured at add time like PlanMealMeta, and for a sharper reason than
 * convenience: `session_role` is what stops a progression adding a set to a
 * warm-up. Without it that guard is decorative.
 */
export interface PlanExerciseMeta {
  movement_pattern?: string | null;
  force_type?: string | null;
  /** warmup / main / accessory / finisher / cooldown / mobility */
  session_role?: string | null;
  laterality?: string | null;
  /** compound / isolation / bodyweight / plyometric / mobility / … */
  exercise_type?: string | null;
  difficulty?: number | null;
  equipment?: string[] | null;
}

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
  /** Absent on rows added before capture existed. */
  meta?: PlanExerciseMeta | null;
}

/** A planned meal within a plan day. A catalogue recipe (ref set) derives
 *  its nutrition from the recipe × `servings`; a custom meal (ref null)
 *  carries hand-entered macros. */
/** One line on a recipe, as the plan captured it. */
export interface PlanIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  optional?: boolean;
}

/**
 * What the library knew about this dish when it was added to the plan.
 *
 * Captured at ADD time, read at USE time. A shopping list has to work standing
 * in a shop with no signal, and a prep plan has to work on a train — so the
 * facts travel with the plan rather than being fetched when needed, for the
 * same reason sets and macros already do.
 *
 * Every field optional: a custom meal somebody typed has none of this, and that
 * is a legitimate meal, not a broken one.
 */
export interface PlanMealMeta {
  /** main / side / breakfast / dessert — what the dish IS, so a swap can offer
   *  a dinner in place of a dinner even when the meal carries no macros. */
  course?: string | null;
  total_time_minutes?: number | null;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  level?: string | null;
  default_servings?: number | null;
  /** Present for round-trip fidelity only. NOT to be reasoned over: 78% of the
   *  library says exactly 12 and 1,407 versions are exactly 3x their own
   *  default servings, which is a seeded default rather than a judgement about
   *  the dish. Batch cooking is derived from the PLAN instead — see prep.ts. */
  batch_portions?: number | null;
  keeps_fridge_days?: number | null;
  /** Free-from flags as slugs — what proves an allergen absent. */
  dietary_flags?: string[] | null;
  diets?: string[] | null;
  allergens?: string[] | null;
  /** The lines this meal needs, already narrowed to its skill level. */
  ingredients?: PlanIngredient[] | null;
}

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
  /** The recipe's real cook/prep time in minutes — shown so the user can see the
   *  meal fits the cooking-time ceiling they set for that slot. null = unstated. */
  cook_time_minutes: number | null;
  notes: string | null;
  /** Absent on meals added before capture existed. Absent is not empty: a plan
   *  with no meta cannot be shopped for, and the surface says so rather than
   *  producing a short list that looks complete. */
  meta?: PlanMealMeta | null;
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
  /** Plan start date (YYYY-MM-DD) so the Plans calendar can place it. */
  start_date: string | null;
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
  /**
   * The day the plan begins, YYYY-MM-DD.
   *
   * Without this, an activated plan was always stamped with TODAY, so "start
   * it tomorrow" was not expressible — Ava would agree, activate, and the plan
   * would begin today while she described a week that never existed.
   *
   * Omit to keep the old behaviour: today for an active plan, null for a draft.
   */
  start_date?: string | null;
}

/** Fields of an existing plan that can be changed after creation. Every one
 *  optional; only what is present is written. */
export interface HealthPlanUpdateInput {
  title?: string;
  goal?: string | null;
  status?: HealthPlanStatus;
  /** YYYY-MM-DD, or null to unschedule. */
  start_date?: string | null;
}
