// ─── How heavy, and in what steps ────────────────────────────────────────────
//
// "Progressive overload" is the whole point of a training plan, and until now
// nothing knew whether the next step was POSSIBLE. A profile said "dumbbells".
// A pair of fixed 5kg dumbbells and an adjustable set that runs 2.5–24kg are
// the same word, and they are not the same plan: the first can only progress
// by adding reps, the second can run a linear programme for months. Telling
// somebody to "add 2.5kg next week" when their kit cannot make that jump is
// advice they cannot follow, which is worse than no advice.
//
// So load-bearing kit carries a RANGE and a STEP. Not every plate — the range
// and the increment are the whole of what a plan needs to know, and asking for
// an inventory is how you get a form nobody fills in.
//
// This sits BESIDE constraints.equipment_available rather than replacing it.
// The list of slugs stays the canonical "what I have", so every filter built in
// phase 2 keeps working untouched, and a profile with no detail behaves exactly
// as it does today.

import { EQUIPMENT_BY_SLUG, equipmentName, normaliseEquipment as normaliseOwned, ownedEquipmentSlugs as expandGym } from './equipment.js';

/**
 * What a piece of load-bearing kit can actually do.
 *
 * Two shapes, because there are genuinely two kinds of kit:
 *   fixed      — a rack of set weights. You can use 12 or 16, nothing between.
 *   adjustable — a range with an increment. Plates, adjustable dumbbells, a bar.
 *
 * A barbell is 'adjustable': `minKg` is the bare bar, `stepKg` the smallest
 * jump the plates allow (usually twice the lightest pair).
 */
export type EquipmentLoad =
  | { mode: 'fixed'; weightsKg: number[] }
  | { mode: 'adjustable'; minKg: number; maxKg: number; stepKg: number };

/** Per-slug load detail, keyed by equipment slug. */
export type EquipmentLoads = Record<string, EquipmentLoad | undefined>;

/** Only kit whose load is chosen can carry this. Asking about a pull-up bar's range is noise. */
export function acceptsLoadDetail(slug: string): boolean {
  return EQUIPMENT_BY_SLUG.get(slug)?.loadBearing === true;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Is this spec usable? Guards the arithmetic below against nonsense from a form. */
export function isValidLoad(load: EquipmentLoad | undefined): load is EquipmentLoad {
  if (!load) return false;
  if (load.mode === 'fixed') {
    return Array.isArray(load.weightsKg) && load.weightsKg.some((w) => Number.isFinite(w) && w > 0);
  }
  return [load.minKg, load.maxKg, load.stepKg].every((n) => Number.isFinite(n))
    && load.stepKg > 0 && load.maxKg >= load.minKg && load.minKg >= 0;
}

/** Every weight this kit can actually make, ascending. Capped so a 0.5kg step over a long range cannot run away. */
export function availableLoadsKg(load: EquipmentLoad | undefined, cap = 200): number[] {
  if (!isValidLoad(load)) return [];
  if (load.mode === 'fixed') {
    return [...new Set(load.weightsKg.filter((w) => Number.isFinite(w) && w > 0))].sort((a, b) => a - b);
  }
  const out: number[] = [];
  for (let w = load.minKg; w <= load.maxKg + 1e-9 && out.length < cap; w = round2(w + load.stepKg)) {
    out.push(round2(w));
  }
  return out;
}

/**
 * The next weight this kit can make above `currentKg`, or null when there is
 * none — the person is at the top of what they own.
 *
 * Null is the useful answer, not a failure: it is the moment a plan should stop
 * saying "add weight" and start saying "add reps", or "this is the ceiling of
 * your kit". That is the judgement the whole file exists to enable.
 */
export function nextLoadKg(load: EquipmentLoad | undefined, currentKg: number): number | null {
  if (!isValidLoad(load) || !Number.isFinite(currentKg)) return null;
  const next = availableLoadsKg(load).find((w) => w > currentKg + 1e-9);
  return next ?? null;
}

/** The heaviest this kit goes — what a plan is ultimately bounded by. */
export function maxLoadKg(load: EquipmentLoad | undefined): number | null {
  const all = availableLoadsKg(load);
  return all.length ? all[all.length - 1] : null;
}

/**
 * Can this kit make exactly this weight? Asked before writing a number into a
 * plan: 17.5kg is not a thing on a set of fixed 5s, and a plan that says so
 * reads as though nobody checked.
 */
export function canMakeLoadKg(load: EquipmentLoad | undefined, kg: number): boolean {
  if (!isValidLoad(load) || !Number.isFinite(kg)) return false;
  return availableLoadsKg(load).some((w) => Math.abs(w - kg) < 1e-9);
}

/**
 * One line a person (or a model) can read: "Dumbbells: adjustable 2.5–24 kg in
 * 2.5 kg steps". Written out rather than left as JSON because it goes into the
 * profile summary, and a model follows a sentence more reliably than a shape.
 */
export function describeLoad(slug: string, load: EquipmentLoad | undefined): string | null {
  if (!isValidLoad(load)) return null;
  const name = equipmentName(slug);
  if (load.mode === 'fixed') {
    const ws = availableLoadsKg(load);
    return `${name}: fixed ${ws.join(', ')} kg`;
  }
  return `${name}: adjustable ${round2(load.minKg)}–${round2(load.maxKg)} kg in ${round2(load.stepKg)} kg steps`;
}

/** Every load line for a profile, in the order the kit is listed. */
export function describeLoads(ownedSlugs: readonly string[], loads: EquipmentLoads | undefined): string[] {
  if (!loads) return [];
  return ownedSlugs
    .map((slug) => describeLoad(slug, loads[slug]))
    .filter((line): line is string => line !== null);
}

/**
 * Which of a person's kit still needs its range, so the question is asked ONCE
 * and only where it changes a plan. Anything not load-bearing is never asked
 * about; anything already answered is never asked again.
 */
export function loadDetailGaps(ownedSlugs: readonly string[], loads: EquipmentLoads | undefined): string[] {
  return ownedSlugs.filter((slug) => acceptsLoadDetail(slug) && !isValidLoad(loads?.[slug]));
}

// ─── Where the kit is, and therefore which day it is available ───────────────
//
// Someone with dumbbells at home and a gym membership on Tuesday and Thursday
// does not have the same kit every day, and a week-long plan that pretends
// otherwise puts a squat rack on a Sunday. The vocabulary already knows where
// each kind of kit LIVES (`place`); what was missing is which days the gym is
// actually reachable.
//
// Deliberately NOT a place override per item. Whether your treadmill is in the
// spare room or at the gym does not change a plan — what changes it is whether
// today is a gym day. Everything owned outright is available every day; only
// kit that came from a gym membership waits for a gym day.

/** Days, as the profile stores them. Lowercase three-letter, the shape a model produces unprompted. */
export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const DAYS: readonly WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Loose day input → canonical, or null. Accepts "Tuesday", "TUE", "tues". */
export function toWeekDay(value: string): WeekDay | null {
  const v = value.trim().toLowerCase().slice(0, 3);
  return (DAYS as readonly string[]).includes(v) ? (v as WeekDay) : null;
}

export function toWeekDays(values: readonly string[] | null | undefined): WeekDay[] {
  if (!values?.length) return [];
  const out: WeekDay[] = [];
  for (const v of values) {
    const d = toWeekDay(v);
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

/**
 * The kit available on one day.
 *
 * `owned` is what they ticked (may include `gym_full`); `gymDays` is when they
 * can get to the gym. With no gym days recorded the gym is treated as available
 * every day — not stated is not "never", the same rule the equipment filter
 * follows for an empty profile.
 *
 * Kit ticked in its own right is ALWAYS available, even if a gym also has one:
 * owning a treadmill does not make it disappear on a non-gym day.
 */
export function equipmentAvailableOn(
  owned: readonly string[] | null | undefined,
  day: WeekDay | null,
  gymDays: readonly string[] | null | undefined,
): string[] {
  // Imported lazily through the module's own exports to keep this file's
  // dependency direction one-way (equipment.ts knows nothing about loads).
  const ownedSlugs = normaliseOwned(owned);
  const hasGym = ownedSlugs.includes('gym_full');
  if (!hasGym) return ownedSlugs;

  const days = toWeekDays(gymDays);
  const gymOpenToday = !day || days.length === 0 || days.includes(day);
  if (gymOpenToday) return expandGym(ownedSlugs);

  // Not a gym day: only what they own outright, gym_full itself dropped so
  // nothing downstream re-expands it.
  return ownedSlugs.filter((s) => s !== 'gym_full');
}
