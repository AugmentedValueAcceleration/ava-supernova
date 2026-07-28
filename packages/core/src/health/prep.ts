// PORTED FROM THE COMPANION, 28 Jul. Lives in core so the extension dashboard
// and the IDE read the SAME logic — the two surfaces are meant to be identical,
// and a third copy of a 400-line classifier is how that stops being true.
//
// Core holds no HealthProfile by design (see types.ts), so where the companion
// passed a profile these take the kitchen numbers they actually used.
//
/**
 * Where the cooking actually lands in a week.
 *
 * A meal plan tells you what to eat. It does not tell you that Tuesday needs
 * ninety minutes at the hob after work, that Thursday's dish had to be
 * marinating since Wednesday, or that you are about to cook the same chilli
 * three times when once would do. That is the difference between a plan that
 * survives a work week and one that gets abandoned on day three.
 *
 * ── Two columns this deliberately does NOT trust ──────────────────────────
 *
 * `batch_portions` looks like the obvious basis for batch cooking, and §2.6
 * specifies it. It cannot be used: 78% of versions in the library say exactly
 * 12, and 1,407 of them are exactly 3× their own default servings. A rolled
 * omelette, a toasted injera snack and a steak and ale pie all read
 * servings=4 / batch=12 / keeps=4 — identical. That is a seeded default, not a
 * judgement about the dish, and building on it would confidently tell someone
 * to make twelve portions of tamagoyaki.
 *
 * So batching is derived from THE PLAN instead: if the same recipe is on three
 * days inside its own fridge life, cooking it once is a fact provable from
 * what is already written down, and needs no such column.
 *
 * `total_time_minutes` is ELAPSED time, not effort — its maximum in the
 * library is 43,245 minutes (thirty days) on a recipe whose prep is 45
 * minutes. Summed as a day's workload it would claim a Tuesday needs seven
 * hundred hours. The gap between it and prep+cook is unattended waiting, which
 * is not a burden — it is a reason to start early, and is reported as one.
 */
import type { HealthPlanDay, HealthPlanMeal } from './types.js';
import { dayTypeFor, budgetFor, type DayType, type KitchenBudget } from './cooking.js';

/**
 * Minutes of actual work in a dish.
 *
 * Prep is always work. Cooking is work up to a point and then it is a pot on a
 * stove — nobody stands over a four-hour braise — so it is counted up to an
 * hour and no further. Under-counting a long braise is the safe direction: it
 * makes a day look lighter than the clock says, which is true of the effort.
 */
const ATTENDED_COOK_CAP = 60;

export function activeMinutes(meal: HealthPlanMeal): number {
  const m = meal.meta;
  if (!m) return 0;
  const prep = m.prep_time_minutes ?? 0;
  const cook = Math.min(m.cook_time_minutes ?? 0, ATTENDED_COOK_CAP);
  if (prep || cook) return prep + cook;
  // Nothing broken out. Total is the only figure, and only trustworthy when it
  // is small enough to be a single sitting.
  const total = m.total_time_minutes ?? 0;
  return total > 0 && total <= 180 ? total : 0;
}

/** Unattended time that has to happen BEFORE the meal — proving, marinating,
 *  chilling. The gap between the clock and the work. */
export function waitingMinutes(meal: HealthPlanMeal): number {
  const m = meal.meta;
  if (!m) return 0;
  const total = m.total_time_minutes;
  const prep = m.prep_time_minutes;
  const cook = m.cook_time_minutes;
  if (total == null || prep == null || cook == null) return 0;
  const gap = total - (prep + cook);
  return gap > 0 ? gap : 0;
}

/** Long enough that it changes what you do the day before. Below this it is
 *  resting a dough or chilling a mousse, and saying so would be nagging. */
const START_AHEAD_THRESHOLD = 240;

export interface StartAhead {
  mealId: string;
  name: string;
  /** Unattended minutes needed before it can be eaten. */
  waiting: number;
  /** Whole days ahead it has to begin, at least one. */
  daysAhead: number;
}

export interface PrepDay {
  day_index: number;
  dayType: DayType;
  /** Hands-on minutes across every meal on the day. */
  minutes: number;
  mealCount: number;
  /** From the profile, when it says. Null is NOT zero — it means unknown, and
   *  nothing is called heavy against a budget nobody has given. */
  budget: number | null;
  overBy: number | null;
  startAhead: StartAhead[];
}

export interface CookOnce {
  slug: string;
  name: string;
  /** The day to actually cook on — the first time it appears. */
  cookOn: number;
  /** Later days the same dish is planned for, inside its fridge life. */
  covers: number[];
  /** Portions to make in total, so the leftovers really do stretch. */
  servings: number;
  keepsDays: number;
  /** Hands-on minutes not spent, by not cooking it again. */
  minutesSaved: number;
}

export interface WeekPrep {
  days: PrepDay[];
  totalMinutes: number;
  /** Day index carrying the most work, or null when nothing is cooked. */
  heaviest: number | null;
  cookOnce: CookOnce[];
  minutesSaved: number;
}

export interface PrepSource {
  day: HealthPlanDay;
  /** Real date, when the plan is placed in time. Decides weekday vs weekend,
   *  which is the only thing that makes a time budget meaningful. */
  date?: string | null;
}

export function weekPrep(sources: PrepSource[], kitchen: KitchenBudget | null): WeekPrep {

  const days: PrepDay[] = sources.map(({ day, date }) => {
    const dayType: DayType = date ? dayTypeFor(date) : 'weekday';
    const budget = budgetFor(kitchen, dayType);

    let minutes = 0;
    const startAhead: StartAhead[] = [];
    for (const meal of day.meals ?? []) {
      minutes += activeMinutes(meal);
      const waiting = waitingMinutes(meal);
      if (waiting >= START_AHEAD_THRESHOLD) {
        startAhead.push({
          mealId: meal.id,
          name: meal.name,
          waiting,
          // Rounded, not ceiled. Twenty-five hours before Tuesday dinner is
          // Monday evening — one day ahead, not two. Ceiling would send
          // someone to the kitchen a whole day early.
          daysAhead: Math.max(1, Math.round(waiting / 1440)),
        });
      }
    }

    return {
      day_index: day.day_index,
      dayType,
      minutes,
      mealCount: day.meals?.length ?? 0,
      budget,
      overBy: budget != null && minutes > budget ? minutes - budget : null,
      startAhead,
    };
  });

  const cooked = days.filter((d) => d.minutes > 0);
  const heaviest = cooked.length
    ? cooked.reduce((a, b) => (b.minutes > a.minutes ? b : a)).day_index
    : null;

  const cookOnce = findCookOnce(sources);

  return {
    days,
    totalMinutes: days.reduce((n, d) => n + d.minutes, 0),
    heaviest,
    cookOnce,
    minutesSaved: cookOnce.reduce((n, c) => n + c.minutesSaved, 0),
  };
}

/**
 * The same dish, more than once, inside the days it keeps.
 *
 * Requires a library ref (so there is a real recipe behind it) and a stated
 * `keeps_fridge_days` (so the claim that leftovers survive is the library's,
 * not a guess). A dish with no keeping time is skipped rather than assumed —
 * telling someone to eat four-day-old food on no evidence is exactly the kind
 * of confident wrongness this feature has to avoid.
 */
function findCookOnce(sources: PrepSource[]): CookOnce[] {
  interface Occurrence { day: number; meal: HealthPlanMeal }
  const bySlug = new Map<string, Occurrence[]>();

  for (const { day } of sources) {
    for (const meal of day.meals ?? []) {
      const slug = meal.ref?.slug;
      if (!slug) continue;
      const list = bySlug.get(slug) ?? [];
      list.push({ day: day.day_index, meal });
      bySlug.set(slug, list);
    }
  }

  const out: CookOnce[] = [];
  for (const [slug, occurrences] of bySlug) {
    if (occurrences.length < 2) continue;

    const keeps = occurrences[0].meal.meta?.keeps_fridge_days ?? null;
    if (keeps == null || keeps < 1) continue;

    const sorted = [...occurrences].sort((a, b) => a.day - b.day);
    const cookOn = sorted[0].day;
    // Distinct later days only: two meals on the same day are one cook either
    // way, and counting the day twice would inflate what is saved.
    const covers: number[] = [];
    let minutesSaved = 0;
    for (const o of sorted.slice(1)) {
      if (o.day === cookOn || o.day - cookOn > keeps) continue;
      if (!covers.includes(o.day)) covers.push(o.day);
      minutesSaved += activeMinutes(o.meal);
    }
    if (!covers.length) continue;

    const servings = sorted
      .filter((o) => o.day === cookOn || covers.includes(o.day))
      .reduce((n, o) => n + (o.meal.servings || 1), 0);

    out.push({
      slug,
      name: sorted[0].meal.name,
      cookOn,
      covers,
      servings,
      keepsDays: keeps,
      minutesSaved,
    });
  }

  // Biggest saving first — that is the one worth acting on.
  return out.sort((a, b) => b.minutesSaved - a.minutesSaved);
}

/** "1 h 20" / "45 min" — short enough to sit inside a bar. */
export function shortDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}
