// ─── Capture at add time, read at use time ─────────────────────────────────
//
// A shopping list has to work standing in a shop with no signal, and a prep
// plan has to work on a train. So what the library knows about a dish travels
// WITH the plan rather than being fetched when needed — the same reason sets
// and macros are already captured rather than looked up.
//
// The logic that consumes this lives in @ava/core (health/shopping-list,
// health/prep) so the extension and the IDE read the same rules. Only the
// mapping from THIS surface's recipe-detail shape belongs here.

import type {
  HealthPlanMeal, HealthPlanDay, HealthRecipeDetail, HealthRecipeIngredient,
  HealthRecipeVersionDetail, PlanIngredient, PlanMealMeta,
  HealthPlanExercise, HealthExerciseDetail, PlanExerciseMeta,
} from '../types/messages';

const LEVEL_ORDER = ['beginner', 'intermediate', 'expert'] as const;

/**
 * The version a given cook would actually follow.
 *
 * Falls back to the SIMPLEST version rather than the first in the array —
 * array order is whatever the API returned, and quietly handing somebody the
 * expert method because it sorted first is the kind of wrongness nobody would
 * catch until they were stood at the hob.
 */
export function versionFor(
  detail: HealthRecipeDetail,
  level: string | null | undefined,
): HealthRecipeVersionDetail | null {
  const versions = detail.versions ?? [];
  if (!versions.length) return null;
  const exact = level ? versions.find(v => v.level === level) : null;
  if (exact) return exact;
  return [...versions].sort(
    (a, b) => LEVEL_ORDER.indexOf(a.level as never) - LEVEL_ORDER.indexOf(b.level as never),
  )[0] ?? null;
}

/**
 * The lines this version needs: its own, plus the shared ones.
 *
 * A line with `level: null` is shared across all three methods; a line naming a
 * level belongs to that one alone. Taking every line regardless would put the
 * expert's confit duck fat on a beginner's shopping list.
 */
export function ingredientsForLevel(
  ingredients: HealthRecipeIngredient[],
  level: string | null | undefined,
): PlanIngredient[] {
  return (ingredients ?? [])
    .filter(i => i.level == null || i.level === level)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(i => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      ...(i.optional ? { optional: true } : {}),
    }));
}

/** Everything the plan needs to know about a dish, off one loaded detail. */
export function metaFromRecipe(
  detail: HealthRecipeDetail,
  level?: string | null,
): PlanMealMeta {
  const v = versionFor(detail, level);
  return {
    course: detail.course ?? null,
    total_time_minutes: v?.total_time_minutes ?? null,
    prep_time_minutes: v?.prep_time_minutes ?? null,
    cook_time_minutes: v?.cook_time_minutes ?? null,
    level: v?.level ?? null,
    default_servings: v?.default_servings ?? null,
    keeps_fridge_days: detail.storage?.keeps_fridge_days ?? null,
    dietary_flags: v?.dietary_flags ?? null,
    diets: v?.diets ?? null,
    // Deliberately NOT set. This surface's recipe detail carries no allergen
    // list, and `[]` would read as "contains no allergens" — a safety claim
    // made from the absence of a field. Null means unknown, which is true.
    // (The companion's detail does carry them, so its meta fills this in.)
    allergens: null,
    // Narrowed to this version HERE rather than at read time: once the meal is
    // in the plan the level is settled, and a shopping list should never have
    // to reason about which of three methods the cook picked.
    ingredients: ingredientsForLevel(detail.ingredients ?? [], v?.level ?? null),
  };
}

/**
 * What the library knows about a movement.
 *
 * `session_role` is the load-bearing one: it is what stops "add a set to every
 * exercise" adding a set to a warm-up, or turning an active-recovery day into a
 * session. Without it that guard in @ava/core's progressDays is decorative.
 */
export function metaFromExercise(detail: HealthExerciseDetail): PlanExerciseMeta {
  return {
    movement_pattern: detail.movement_pattern ?? null,
    force_type: detail.force_type ?? null,
    session_role: detail.session_role ?? null,
    laterality: detail.laterality ?? null,
    exercise_type: detail.exercise_type ?? null,
    difficulty: detail.difficulty ?? null,
    equipment: (detail.equipment ?? []).map(e => e.slug),
  };
}

/**
 * Fill in what a day's meals AND training rows are missing, and say whether anything changed.
 *
 * This BACKFILLS as well as captures. Every plan written before capture existed
 * carries no meta at all, so without this the feature would only ever work on
 * plans made after today — and the person most likely to want a shopping list
 * is the one who already has a plan.
 *
 * Only ever adds. A meal that already has meta is left exactly as it is, so a
 * plan is still a record of what was chosen at the time rather than a live view
 * of a library that may have been edited since.
 */
export function fillDayMeta(
  day: HealthPlanDay,
  details: Record<string, HealthRecipeDetail | undefined>,
  exerciseDetails: Record<string, HealthExerciseDetail | undefined> = {},
): { day: HealthPlanDay; changed: boolean } {
  let changed = false;
  const training = day.training.map((ex: HealthPlanExercise) => {
    if (ex.meta || !ex.ref?.slug) return ex;
    const detail = exerciseDetails[ex.ref.slug];
    if (!detail) return ex;
    changed = true;
    return { ...ex, meta: metaFromExercise(detail) };
  });
  const meals = day.meals.map((meal: HealthPlanMeal) => {
    if (meal.meta || !meal.ref?.slug) return meal;
    const detail = details[meal.ref.slug];
    if (!detail) return meal;
    changed = true;
    // No level to honour: the early return above means this meal has no meta
    // at all, so metaFromRecipe picks the simplest version.
    const meta = metaFromRecipe(detail, null);
    return {
      ...meal,
      meta,
      // The cook time was already a column on the meal and is often unset on
      // older rows; if the library says, fill it. Never overwrite a stated one.
      cook_time_minutes: meal.cook_time_minutes ?? meta.cook_time_minutes ?? null,
    };
  });
  return changed ? { day: { ...day, meals, training }, changed } : { day, changed };
}

/** Meals that still cannot be shopped for, and which recipe would fix each.
 *  Drives the "fetch what's missing" action rather than a silent short list. */
export function mealsMissingMeta(days: HealthPlanDay[]): string[] {
  const slugs = new Set<string>();
  for (const day of days) {
    for (const meal of day.meals) {
      if (!meal.meta?.ingredients?.length && meal.ref?.slug) slugs.add(meal.ref.slug);
    }
  }
  return [...slugs];
}
