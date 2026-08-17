// PORTED FROM THE COMPANION, 28 Jul. Lives in core so the extension dashboard
// and the IDE read the SAME logic — the two surfaces are meant to be identical,
// and a third copy of a 400-line classifier is how that stops being true.
//
// Core holds no HealthProfile by design (see types.ts), so where the companion
// passed a profile these take the kitchen numbers they actually used.
//
/**
 * Turn a stretch of a meal plan into one shopping list.
 *
 * A meal plan that cannot be shopped is not a plan, it is a suggestion. This is
 * the step that makes the week executable: every meal in the range, every
 * ingredient line scaled to the servings actually planned, the same ingredient
 * collapsed into one row, and the rows walked in the order of a shop.
 *
 * Three rules it holds to, all of them learned the hard way elsewhere in this
 * feature:
 *
 *  - DERIVE, DON'T COPY. Ingredient quantities are stored exactly as the
 *    recipe wrote them, for the recipe's own default servings. Scaling happens
 *    here, at read time, so changing a meal's servings needs no rewrite of the
 *    stored plan and cannot leave a stale number behind.
 *
 *  - NEVER INVENT A CONVERSION. Grams and millilitres are summed separately,
 *    and a count ("2 cloves") is never silently turned into a weight. When an
 *    item arrives in two incompatible shapes the list says "400 g + 2 cloves"
 *    rather than guessing. A wrong quantity in a shop is worse than two.
 *
 *  - ABSENCE IS NOT ZERO. A meal whose ingredients were never captured is
 *    reported in `missing`, not quietly skipped. A short list that looks
 *    complete would send someone home without dinner.
 */
import { aisleFor, normaliseIngredientName, isNotShopped, AISLE_ORDER, type Aisle } from './aisles.js';
import type { HealthPlanDay, HealthPlanMeal, PlanIngredient } from './types.js';

/** Only the fields the list actually reads. Structural on purpose: the
 *  extension, the IDE and the companion each carry their own fuller
 *  ShoppablePlan, and all three satisfy this. */
export interface ShoppablePlan {
  id: string;
  title: string;
  status?: string;
  start_date: string | null;
  days: HealthPlanDay[];
}

/** A quantity in one unit family. An item may carry more than one. */
export interface ShoppingAmount {
  qty: number;
  /** Display-ready and already chosen for readability — g/kg, ml/l/tsp/tbsp,
   *  or the count noun the recipe used. */
  unit: string;
}

export interface ShoppingItem {
  /** Normalised identity — stable across "yellow onion" and "onion, chopped". */
  key: string;
  /** What to show. The most common raw spelling among the lines that fed it,
   *  so the list reads like a recipe rather than like a database. */
  name: string;
  aisle: Aisle;
  amounts: ShoppingAmount[];
  /** Lines that carried no usable quantity ("salt to taste"). Counted, not
   *  dropped, so an item never disappears just because nobody measured it. */
  looseLines: number;
  /** True only when EVERY line that fed this item was optional. */
  optional: boolean;
  /** Which planned meals need it — the answer to "why is this on my list?" */
  meals: string[];
  /**
   * Which plans contributed it, when the list spans more than one.
   *
   * Empty for a single-plan list, where naming the plan on every row would be
   * noise. More than one entry is the interesting case: two plans both
   * wanting onions is exactly the situation a per-plan list hid.
   */
  plans: string[];
}

export interface ShoppingGroup {
  aisle: Aisle;
  items: ShoppingItem[];
}

/**
 * A meal the list could not shop for, and WHY.
 *
 * The two reasons need different words and different fixes, and collapsing
 * them into one "could not be found" tells nobody anything — including me,
 * when the first report came back and the cause could not be read off it.
 *
 *  - `not_in_library`: the meal has no library ref. Ava named a dish rather
 *    than choosing a recipe, so there is no ingredient list in existence.
 *    Nothing to retry; the meal has to be swapped for a real recipe.
 *  - `lookup_failed`: it has a ref, but the ingredients are not here. That is
 *    a network or library problem, and it is worth trying again.
 */
export interface MissingMeal {
  name: string;
  reason: 'not_in_library' | 'lookup_failed';
}

/** A meal the list deliberately left out because it has already happened. */
export interface SettledMeal {
  name: string;
  state: 'ate' | 'skipped' | 'other';
}

export interface ShoppingList {
  groups: ShoppingGroup[];
  itemCount: number;
  mealCount: number;
  /** Meals in range the list could not cover. It is short by exactly these,
   *  and the UI must say so rather than looking complete. */
  missing: MissingMeal[];
  /**
   * Meals left off because they were already logged — eaten, skipped, or
   * swapped for something else.
   *
   * Reported for the same reason `missing` is: the list is shorter than the
   * plan, and a shorter list that does not say why reads as a bug. The
   * difference is that this one is short ON PURPOSE.
   */
  settled: SettledMeal[];
}

/* ------------------------------------------------------------------ units - */

const G_PER_UNIT: Record<string, number> = {
  g: 1, gram: 1, grams: 1, gm: 1, gr: 1,
  kg: 1000, kilo: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6,
};

const ML_PER_UNIT: Record<string, number> = {
  ml: 1, milliliter: 1, millilitre: 1, milliliters: 1, millilitres: 1, cc: 1,
  l: 1000, liter: 1000, litre: 1000, liters: 1000, litres: 1000,
  tsp: 5, teaspoon: 5, teaspoons: 5,
  tbsp: 15, tablespoon: 15, tablespoons: 15,
  cup: 240, cups: 240,
  'fl oz': 30, floz: 30,
  pint: 568, pints: 568,
  quart: 946, gallon: 3785,
};

/** Count nouns that mean the same thing singular or plural. Collapsed so
 *  "2 cloves" and "1 clove" make three cloves and not two separate rows. */
function singularCount(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (!u) return 'x';
  const map: Record<string, string> = {
    pieces: 'piece', pcs: 'piece', pc: 'piece', units: 'piece', unit: 'piece',
    cloves: 'clove', slices: 'slice', sprigs: 'sprig', sticks: 'stick',
    stalks: 'stalk', heads: 'head', bunches: 'bunch', leaves: 'leaf',
    sheets: 'sheet', fillets: 'fillet', strips: 'strip', cans: 'can',
    tins: 'tin', jars: 'jar', packets: 'packet', eggs: 'egg', pods: 'pod',
    whole: 'piece', large: 'piece', medium: 'piece', small: 'piece',
    handfuls: 'handful', pinches: 'pinch', knobs: 'knob', bulbs: 'bulb',
  };
  return map[u] ?? u;
}

// Three separate members rather than one with a two-literal kind: a union
// whose first member could be either weight OR volume never narrows away, so
// the count branch would not see its own label.
type Family =
  | { kind: 'weight'; base: number }
  | { kind: 'volume'; base: number }
  | { kind: 'count'; label: string };

function familyOf(unit: string | null): Family {
  const u = (unit ?? '').trim().toLowerCase();
  if (G_PER_UNIT[u] != null) return { kind: 'weight', base: G_PER_UNIT[u] };
  if (ML_PER_UNIT[u] != null) return { kind: 'volume', base: ML_PER_UNIT[u] };
  return { kind: 'count', label: singularCount(u) };
}

/** Trim a number to something a person would write on a list. */
function tidy(n: number): number {
  if (n >= 100) return Math.round(n);
  if (n >= 10) return Math.round(n * 2) / 2;
  return Math.round(n * 4) / 4;
}

// Kilos and litres round to a tenth, not to a quarter like everything else:
// quarter-steps are 250g apart, which turned an honest 1.2 kg into 1.25 kg.
// A quarter of a clove is sensible; a quarter of a kilo is not.
const tenth = (n: number) => Math.round(n * 10) / 10;

function renderWeight(grams: number): ShoppingAmount {
  return grams >= 1000
    ? { qty: tenth(grams / 1000), unit: 'kg' }
    : { qty: tidy(grams), unit: 'g' };
}

/**
 * Volume back into a unit worth reading.
 *
 * "45 ml cumin seed" is a true statement and a useless one — nobody measures a
 * spice in millilitres. Small volumes go back to the spoon they came from,
 * which is also how the recipe wrote them.
 */
function renderVolume(ml: number): ShoppingAmount {
  if (ml >= 1000) return { qty: tenth(ml / 1000), unit: 'l' };
  if (ml >= 60) return { qty: tidy(ml), unit: 'ml' };
  // Spoons all the way to 60ml, and teaspoons well past one tablespoon: a
  // total of 20ml is four teaspoons, which is a thing you can measure, where
  // "1.25 tbsp" is a thing you have to do arithmetic on.
  if (ml >= 30) return { qty: tidy(ml / 15), unit: 'tbsp' };
  return { qty: tidy(ml / 5), unit: 'tsp' };
}

/* --------------------------------------------------------------- building - */

interface Bucket {
  key: string;
  names: Map<string, number>;
  grams: number;
  ml: number;
  counts: Map<string, number>;
  looseLines: number;
  optionalLines: number;
  totalLines: number;
  meals: Set<string>;
  plans: Set<string>;
}

/**
 * A day to shop for, and which plan it came from.
 *
 * The plan title travels with the day rather than being looked up later,
 * because once days from several plans are in one pile there is nothing left
 * on a day to say where it came from.
 */
export interface PlanDaySource {
  day: HealthPlanDay;
  planTitle?: string | null;
}

/**
 * Nouns that say how a thing is MEASURED, not what it is. A garlic clove is
 * garlic; a lemongrass stalk is lemongrass.
 *
 * Found by running a real week through the list, which produced "garlic" and
 * "garlic clove" as two separate rows in the same aisle — the sort of thing
 * that makes a list look machine-made.
 */
const MEASURE_NOUNS = new Set([
  'clove', 'stalk', 'stick', 'sprig', 'stem', 'bulb', 'head', 'piece',
  'fillet', 'slice', 'bunch', 'pod', 'leaf', 'root', 'wedge', 'ear',
]);

/**
 * Fold "X <measure noun>" into "X", but ONLY when X is already on this list.
 *
 * That condition is what makes it safe. "bay leaf" has no "bay" to fall back
 * on, so it is never stripped into something nobody sells; "garlic clove"
 * merges precisely because the same list already calls for garlic.
 */
function mergeMeasureNouns(buckets: Map<string, Bucket>): void {
  for (const [key, b] of [...buckets]) {
    const parts = key.split(' ');
    if (parts.length < 2 || !MEASURE_NOUNS.has(parts[parts.length - 1])) continue;
    const head = buckets.get(parts.slice(0, -1).join(' '));
    if (!head) continue;

    head.grams += b.grams;
    head.ml += b.ml;
    for (const [label, n] of b.counts) head.counts.set(label, (head.counts.get(label) ?? 0) + n);
    head.looseLines += b.looseLines;
    head.optionalLines += b.optionalLines;
    head.totalLines += b.totalLines;
    for (const m of b.meals) head.meals.add(m);
    for (const p of b.plans) head.plans.add(p);
    // Names are deliberately NOT merged: the plain form is the better label by
    // construction. "garlic — 8 cloves" beats "garlic clove — 8 cloves".
    buckets.delete(key);
  }
}

export interface ShoppingListOptions {
  /** Leave out lines the recipe marked optional. Off by default: the cook
   *  decides what to skip, not the list. */
  excludeOptional?: boolean;
  /**
   * How many people are eating, from the profile.
   *
   * This is the ONLY place household size is applied, and it took a wrong turn
   * to establish that. The obvious move is to default a meal's `servings` to
   * the household — but `servings` is what YOU eat, and the macros stored on
   * the row are scaled by it. A household of four would have multiplied every
   * day's calories by four against a target meant for one person, and every
   * "under your target" check would have been wrong.
   *
   * So the plan stays per-person and the shopping list — the one surface that
   * genuinely means "how much food to buy" — multiplies at the end. Null or 1
   * changes nothing, which is exactly what an unset profile should do.
   */
  household?: number | null;
}

/**
 * How much of a recipe is being made. Ingredients are written for the recipe's
 * own default servings, so a meal planned at 4 servings of a 2-serving recipe
 * needs everything doubled. A missing or nonsense default means 1:1 rather
 * than a guess that could double a shopping list.
 */
export function servingScale(meal: HealthPlanMeal): number {
  const want = meal.servings && meal.servings > 0 ? meal.servings : 1;
  const base = meal.meta?.default_servings;
  if (!base || base <= 0) return 1;
  return want / base;
}

/** One plan's days. What you get when you open a plan and tap Shopping list. */
export function buildShoppingList(
  days: HealthPlanDay[],
  opts: ShoppingListOptions = {},
): ShoppingList {
  return buildFrom(days.map((day) => ({ day })), opts);
}

/**
 * Days from several plans at once — a week, not a plan.
 *
 * You do one shop, not one shop per plan, and activation only archives other
 * active plans of the SAME type, so a meal plan and a combined plan can both
 * be live in the same week with meals on both.
 */
export function buildShoppingListAcross(
  sources: PlanDaySource[],
  opts: ShoppingListOptions = {},
): ShoppingList {
  return buildFrom(sources, opts);
}

function buildFrom(
  sources: PlanDaySource[],
  opts: ShoppingListOptions = {},
): ShoppingList {
  const buckets = new Map<string, Bucket>();
  const missing: MissingMeal[] = [];
  const settled: SettledMeal[] = [];
  let mealCount = 0;

  for (const { day, planTitle } of sources) {
    for (const meal of day.meals ?? []) {
      mealCount += 1;

      // Already settled at the table — do not shop for it.
      //
      // A logged meal is one that has happened: eaten, skipped, or swapped for
      // something else. Buying for any of the three is wrong, and the skipped
      // case is the one that stings — the shop kept including a dinner the
      // person had already decided against, week after week, because the list
      // read the plan as written and never looked at what actually occurred.
      //
      // `logged` absent means UNRECORDED, which is not the same as skipped
      // (see MealLogged), so an unrecorded meal still gets shopped for. That
      // asymmetry is deliberate: the cost of shopping for a meal that quietly
      // did not happen is a spare ingredient, and the cost of NOT shopping for
      // one that did is no dinner.
      if (meal.logged?.state) {
        if (!settled.some((s) => s.name === meal.name)) {
          settled.push({ name: meal.name, state: meal.logged.state });
        }
        continue;
      }

      const lines = meal.meta?.ingredients;
      if (!lines || lines.length === 0) {
        // Ingredients are captured at add time. A meal without them is either
        // one the generator never linked to a real recipe — in which case no
        // ingredient list exists anywhere — or one whose lookup has not landed.
        const reason = meal.ref?.slug ? 'lookup_failed' : 'not_in_library';
        if (!missing.some((m) => m.name === meal.name)) missing.push({ name: meal.name, reason });
        continue;
      }

      // Per-person scaling from the plan, then the household on top. Kept as
      // one multiplication so no rounding happens between them.
      const scale = servingScale(meal) * Math.max(1, opts.household ?? 1);
      for (const line of lines) {
        if (opts.excludeOptional && line.optional) continue;
        const key = normaliseIngredientName(line.name);
        if (!key || isNotShopped(key)) continue;

        let b = buckets.get(key);
        if (!b) {
          b = {
            key, names: new Map(), grams: 0, ml: 0, counts: new Map(),
            looseLines: 0, optionalLines: 0, totalLines: 0,
            meals: new Set(), plans: new Set(),
          };
          buckets.set(key, b);
        }

        b.totalLines += 1;
        if (line.optional) b.optionalLines += 1;
        b.meals.add(meal.name);
        if (planTitle) b.plans.add(planTitle);
        b.names.set(line.name, (b.names.get(line.name) ?? 0) + 1);

        const qty = line.quantity;
        if (qty == null || !Number.isFinite(qty) || qty <= 0) {
          b.looseLines += 1;
          continue;
        }

        const fam = familyOf(line.unit);
        const amount = qty * scale;
        if (fam.kind === 'weight') b.grams += amount * fam.base;
        else if (fam.kind === 'volume') b.ml += amount * fam.base;
        else b.counts.set(fam.label, (b.counts.get(fam.label) ?? 0) + amount);
      }
    }
  }

  mergeMeasureNouns(buckets);

  const items: ShoppingItem[] = [];
  for (const b of buckets.values()) {
    const amounts: ShoppingAmount[] = [];
    if (b.grams > 0) amounts.push(renderWeight(b.grams));
    if (b.ml > 0) amounts.push(renderVolume(b.ml));
    for (const [label, n] of [...b.counts.entries()].sort((x, y) => y[1] - x[1])) {
      amounts.push({ qty: tidy(n), unit: label === 'x' ? '' : label });
    }

    // Most common spelling wins; ties break on the shorter name, which is
    // almost always the plainer one — "onion" over "onion, thinly sliced".
    const name = [...b.names.entries()]
      .sort((x, y) => (y[1] - x[1]) || (x[0].length - y[0].length))[0][0];

    items.push({
      key: b.key,
      name,
      aisle: aisleFor(b.key),
      amounts,
      looseLines: b.looseLines,
      optional: b.optionalLines === b.totalLines,
      meals: [...b.meals],
      plans: [...b.plans],
    });
  }

  const groups: ShoppingGroup[] = [];
  for (const aisle of AISLE_ORDER) {
    const inAisle = items
      .filter((i) => i.aisle === aisle)
      // Needed-by-most first, then alphabetical: the things that anchor the
      // week sit at the top of each aisle rather than wherever they landed.
      .sort((a, b) => (b.meals.length - a.meals.length) || a.name.localeCompare(b.name));
    if (inAisle.length) groups.push({ aisle, items: inAisle });
  }

  return { groups, itemCount: items.length, mealCount, missing, settled };
}

/* --------------------------------------------------------------- surplus - */

/**
 * What was shopped for and never cooked.
 *
 * The other half of logging a skip. If somebody shopped for the week and then
 * did not make Thursday's dinner, those ingredients are in their kitchen right
 * now — and until this existed, nothing in the system knew that. Ava would
 * cheerfully propose a shop for entirely different food while a bag of
 * spinach quietly went off in the fridge.
 *
 * Deliberately DERIVED rather than stored. The skip is already recorded on the
 * meal row, so surplus is a reading of the plan rather than a second source of
 * truth that could disagree with it. No new store, nothing to migrate, and
 * nothing to keep in sync on four surfaces — the same reasoning that put
 * `logged` on the plan row in the first place.
 *
 * Only 'skipped' and 'other' count. A meal that was EATEN consumed its
 * ingredients, and a meal with no log at all has not happened yet.
 *
 * It returns a ShoppingList because the shape is exactly right — the same
 * aisles, the same merging, the same honest handling of "400 g + 2 cloves" —
 * and because a surplus is best read as a list of what you have.
 */
export function buildSurplus(
  days: HealthPlanDay[],
  opts: ShoppingListOptions = {},
): ShoppingList {
  return buildSurplusAcross(days.map((day) => ({ day })), opts);
}

/** Surplus across several plans, matching buildShoppingListAcross. */
export function buildSurplusAcross(
  sources: PlanDaySource[],
  opts: ShoppingListOptions = {},
): ShoppingList {
  const uneaten = sources.map(({ day, planTitle }) => ({
    planTitle,
    day: {
      ...day,
      meals: (day.meals ?? []).filter(
        (m) => m.logged?.state === 'skipped' || m.logged?.state === 'other',
      ),
    },
  }));
  // Feed them back through with the logs stripped, or buildFrom would
  // recognise them as settled and leave every one of them out — the very
  // filter that makes this list possible would empty it.
  const asPlanned = uneaten.map(({ day, planTitle }) => ({
    planTitle,
    day: { ...day, meals: day.meals.map((m) => ({ ...m, logged: null })) },
  }));
  return buildFrom(asPlanned, opts);
}

/* ---------------------------------------------------------------- a week - */

/**
 * The days from every plan that land inside a date range, inclusive.
 *
 * Only DATED plans can be in a week — a draft with no start date has no
 * position in time, and guessing one would put food on a list for a week
 * nobody has committed to. The calendar draws such drafts as dashed proposals
 * precisely because they are not real yet; a shopping list is not the place to
 * pretend otherwise.
 *
 * Archived plans are excluded: they were superseded, and their meals are not
 * what anyone is cooking.
 */
export function daysInRange(
  plans: ShoppablePlan[],
  fromIso: string,
  toIso: string,
): PlanDaySource[] {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return [];

  const out: PlanDaySource[] = [];
  for (const plan of plans) {
    if (!plan.start_date || plan.status === 'archived') continue;
    const start = Date.parse(`${plan.start_date}T00:00:00Z`);
    if (Number.isNaN(start)) continue;

    for (const day of plan.days ?? []) {
      const at = start + (day.day_index - 1) * 86_400_000;
      if (at < from || at > to) continue;
      out.push({ day, planTitle: plan.title });
    }
  }
  return out;
}

/** Monday of the week containing `iso`, and the Sunday six days later. A week
 *  that starts on the day you happen to open the app is not a week anyone
 *  shops for. */
export function weekBounds(iso: string): { from: string; to: string } {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return { from: iso, to: iso };
  // DELIBERATELY UTC, end to end — getUTCDay here, an explicit Z in
  // shiftWeek below, and toISOString on the way out. Left as-is in the
  // 2026-08-17 local-day sweep precisely because it is consistent: swapping
  // only the output to a local day would render a UTC-midnight instant in the
  // user's zone and shift every week window back a day west of Greenwich.
  // Whether a shopping week should follow the user's calendar is a real
  // question, but it is a design change to make whole, not a find-and-replace.
  const dow = new Date(t).getUTCDay();          // 0 = Sunday
  const back = (dow + 6) % 7;                    // days since Monday
  const from = t - back * 86_400_000;
  return {
    from: new Date(from).toISOString().slice(0, 10),
    to: new Date(from + 6 * 86_400_000).toISOString().slice(0, 10),
  };
}

/** Shift a week window by whole weeks. */
export function shiftWeek(bounds: { from: string; to: string }, by: number): { from: string; to: string } {
  const from = Date.parse(`${bounds.from}T00:00:00Z`) + by * 7 * 86_400_000;
  return {
    from: new Date(from).toISOString().slice(0, 10),
    to: new Date(from + 6 * 86_400_000).toISOString().slice(0, 10),
  };
}

/** Every meal in the plan that has no captured ingredients, with the slug
 *  needed to go and fetch them. Drives the one-time backfill for plans made
 *  before ingredients were captured. */
export function mealsNeedingIngredients(days: HealthPlanDay[]): Array<{ slug: string; level: string | null }> {
  const out = new Map<string, { slug: string; level: string | null }>();
  for (const day of days) {
    for (const meal of day.meals ?? []) {
      const slug = meal.ref?.slug;
      if (!slug) continue;
      if (meal.meta?.ingredients && meal.meta.ingredients.length > 0) continue;
      const level = meal.meta?.level ?? null;
      out.set(`${slug}::${level ?? ''}`, { slug, level });
    }
  }
  return [...out.values()];
}

/** Pick the lines that belong to a chosen skill level: the shared ones plus
 *  that level's own. Listing them flat would tell a beginner they need the
 *  expert's extras — the same rule the recipe screen follows. */
export function ingredientsForLevel(
  all: Array<PlanIngredient & { level?: string | null }>,
  level: string | null | undefined,
): PlanIngredient[] {
  return all
    .filter((i) => !i.level || i.level === level)
    .map(({ name, quantity, unit, optional }) => ({ name, quantity, unit, optional }));
}
