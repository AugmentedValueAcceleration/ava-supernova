/**
 * "Add to today" and "Swap it in" from For you (Health Part 4) — the change to
 * one day of one plan. Pure and free of Node imports, so the IDE's screen can
 * use it directly; for-you.ts (which needs the safety check, and so Node)
 * re-exports it for everyone else.
 */

import type { HealthPlanRecord, HealthPlanExercise, HealthPlanMeal } from './types.js';

type HealthPlan = HealthPlanRecord;

export type ForYouAction =
  | { type: 'add_exercise'; planId: string; dayIndex: number; slug: string; name: string }
  | { type: 'add_meal'; planId: string; dayIndex: number; slot: HealthPlanMeal['slot']; slug: string; name: string }
  | { type: 'swap_meal'; planId: string; dayIndex: number; mealId: string; slug: string; name: string }
  /** "Replace one" in the preview (14 Nov 2026): the new exercise takes the old
   *  one's place AND its programming (sets, reps, rest) — the session keeps its
   *  shape; only the movement changes. The weight is cleared: a load for one
   *  exercise means nothing for another. */
  | { type: 'replace_exercise'; planId: string; dayIndex: number; exerciseId: string; slug: string; name: string };

/** What the preview shows of today: the whole session and every meal. */
export interface ForYouTodayItems {
  training: Array<{ id: string; name: string; sets: number | null; reps: string | null }>;
  meals: Array<{ id: string; slot: string; name: string }>;
}


const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Apply "Add to today" / "Swap it in" to a plan. Pure: returns a new plan. */
export function applyForYouAction<P extends HealthPlan>(plan: P, action: ForYouAction): P {
  if (plan.id !== action.planId) return plan;
  return {
    ...plan,
    updated_at: new Date().toISOString(),
    days: plan.days.map((d) => {
      if (d.day_index !== action.dayIndex) return d;
      if (action.type === 'add_exercise') {
        const ex: HealthPlanExercise = { id: newId('ex'), ref: { kind: 'exercise', slug: action.slug }, name: action.name, sets: 3, reps: '10', weight: null, rest_seconds: 60, tempo: null, notes: null };
        return { ...d, kind: 'training' as const, training: [...d.training, ex] };
      }
      if (action.type === 'replace_exercise') {
        return {
          ...d,
          training: d.training.map((e) => (e.id === action.exerciseId
            ? { ...e, ref: { kind: 'exercise' as const, slug: action.slug }, name: action.name, weight: null, notes: null, meta: undefined }
            : e)),
        };
      }
      if (action.type === 'add_meal') {
        const meal: HealthPlanMeal = { id: newId('ml'), slot: action.slot, ref: { kind: 'recipe', slug: action.slug }, name: action.name, servings: 1, calories: null, protein_g: null, carbs_g: null, fat_g: null, cook_time_minutes: null, notes: null };
        return { ...d, meals: [...d.meals, meal] };
      }
      return {
        ...d,
        meals: d.meals.map((m) => (m.id === action.mealId
          ? { ...m, ref: { kind: 'recipe' as const, slug: action.slug }, name: action.name, calories: null, protein_g: null, carbs_g: null, fat_g: null, cook_time_minutes: null }
          : m)),
      };
    }),
  };
}
