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

/**
 * The equipment section of a profile summary, as lines a model reads.
 *
 * Replaces `Equipment available: dumbbells, bench, gym_full` — a flat list of
 * slugs that says nothing about whether the next weight up exists, or whether
 * the squat rack is reachable today. It reads as:
 *
 *   Equipment — Home: Dumbbells, Bench, Pull-up bar
 *   Equipment — Gym (Tue, Thu): full gym floor
 *   Loads: Dumbbells: adjustable 2.5–24 kg in 2.5 kg steps
 *
 * Grouped by place because that is the axis a WEEK is planned on, and the load
 * lines separate because they are the ones that decide what "add weight" may
 * say. Slugs are kept out: the summary is for reading, and the tool call that
 * needs slugs is told to take them from the profile directly.
 */
export function summariseEquipment(
  owned: readonly string[] | null | undefined,
  loads?: EquipmentLoads,
  gymDays?: readonly string[] | null,
): string[] {
  const slugs = normaliseOwned(owned);
  if (slugs.length === 0) return [];

  const lines: string[] = [];
  const hasGym = slugs.includes('gym_full');
  const own = slugs.filter((s) => s !== 'gym_full');

  // Only kit they ticked in its own right is grouped by place; gym_full is a
  // statement about access and gets its own line with the days on it.
  const byPlace = new Map<string, string[]>();
  for (const slug of own) {
    const place = EQUIPMENT_BY_SLUG.get(slug)?.place ?? 'home';
    const list = byPlace.get(place) ?? [];
    list.push(equipmentName(slug));
    byPlace.set(place, list);
  }
  for (const place of ['home', 'gym', 'outdoors'] as const) {
    const list = byPlace.get(place);
    if (!list?.length) continue;
    const label = place === 'home' ? 'Home' : place === 'gym' ? 'Gym floor' : 'Outdoors';
    lines.push(`Equipment — ${label}: ${list.join(', ')}`);
  }

  if (hasGym) {
    const days = toWeekDays(gymDays);
    // No days recorded is stated as such rather than guessed at, so nobody
    // reads an empty list as "never" — and Ava knows there is a question worth
    // asking before she writes a week.
    const when = days.length ? ` (${days.join(', ')})` : ' (days not stated)';
    lines.push(`Equipment — Gym${when}: full gym floor`);
  }

  const loadLines = describeLoads(own, loads);
  if (loadLines.length) lines.push(`Loads: ${loadLines.join(' · ')}`);

  // Named explicitly: the gap is what a plan silently guesses at otherwise.
  const gaps = loadDetailGaps(own, loads);
  if (gaps.length) {
    lines.push(`Load range not stated for: ${gaps.map(equipmentName).join(', ')} — ask before promising a weight jump.`);
  }
  return lines;
}

/**
 * Whatever a card or a model sends → a clean EquipmentLoad, or null.
 *
 * Shared so the two ProfileFieldCards and the tool that saves the answer
 * cannot disagree about what a valid answer is. Null rather than a repaired
 * guess, for the same reason toEquipmentSlug returns null: a load that is
 * quietly "fixed up" is how somebody ends up with a plan built on weights they
 * do not have, and that is the fault this whole area exists to remove.
 *
 * Numbers arrive as strings from every number input there is, so they are
 * coerced here rather than in three places.
 */
export function coerceLoad(raw: unknown): EquipmentLoad | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
    return Number.isFinite(n) ? n : null;
  };

  if (r.mode === 'fixed') {
    const list = Array.isArray(r.weightsKg) ? r.weightsKg : [];
    const weightsKg = list.map(num).filter((n): n is number => n !== null && n > 0);
    const load: EquipmentLoad = { mode: 'fixed', weightsKg: [...new Set(weightsKg)].sort((a, b) => a - b) };
    return isValidLoad(load) ? load : null;
  }

  if (r.mode === 'adjustable') {
    const minKg = num(r.minKg);
    const maxKg = num(r.maxKg);
    const stepKg = num(r.stepKg);
    if (minKg === null || maxKg === null || stepKg === null) return null;
    const load: EquipmentLoad = { mode: 'adjustable', minKg, maxKg, stepKg };
    return isValidLoad(load) ? load : null;
  }

  return null;
}

/**
 * Sensible starting values for the card, so nobody faces three empty boxes.
 * A guess in a form the person is about to correct is help; a guess written
 * into a plan is not — which is why this is only ever a default.
 */
export function defaultLoadFor(slug: string): EquipmentLoad {
  switch (slug) {
    case 'kettlebell':   return { mode: 'fixed', weightsKg: [12, 16] };
    case 'barbell':      return { mode: 'adjustable', minKg: 20, maxKg: 100, stepKg: 2.5 };
    case 'weight_plate': return { mode: 'fixed', weightsKg: [1.25, 2.5, 5, 10, 20] };
    case 'sandbag':      return { mode: 'adjustable', minKg: 10, maxKg: 40, stepKg: 5 };
    default:             return { mode: 'adjustable', minKg: 2.5, maxKg: 24, stepKg: 2.5 };
  }
}
