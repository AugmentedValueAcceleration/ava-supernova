/**
 * "The library fits you" (Health & Nutrition, Part 3, 14 Nov 2026).
 *
 * The Recipes and Exercises tabs open showing only what fits the person's
 * HARD rules (allergens, diet, injuries marked "avoid", kit they don't have),
 * with one switch to see everything. The ready-made plans say "fits you" or
 * "needs a swap". Preferences (likes, dislikes, favourite cuisines) only
 * change the ORDER — they never hide anything.
 *
 * His decision (14 Nov): the person's computer does the filtering. The
 * verdicts come from the same safety check the plan wizard uses
 * (health_safety_check → core health/safety.ts), which reads the profile on
 * their machine and sends only slugs to the server. The website never sees
 * their rules.
 *
 * Pure, no Node imports: the extension webview and the IDE both import this
 * file, so the two apps cannot drift apart.
 */

export interface FitVerdict {
  verdict: 'ok' | 'warn' | 'blocked';
  reasons: string[];
  unverified?: string[];
}

export interface FitState {
  /** Verdicts by slug, from health_safety_result. */
  results: Record<string, FitVerdict>;
  /** False when the last check could not reach the library. */
  checked: boolean;
}

/** The hard-rule fields of a stored profile, any shape tolerated. */
interface ProfileLike {
  constraints?: { allergens?: string[]; dietary?: string[]; injuries?: string[]; equipment_available?: string[] } | null;
  food?: { likes?: string[]; dislikes?: string[]; cuisines?: string[] } | null;
}

const filled = (v: unknown): boolean => Array.isArray(v) && v.some((x) => typeof x === 'string' && x.trim().length > 0);

/** True when the profile holds at least one hard rule. Same fields as safety.ts's safetyProfileFrom. */
export function profileHasHardRules(profile: ProfileLike | null | undefined): boolean {
  const c = profile?.constraints;
  return !!c && (filled(c.allergens) || filled(c.dietary) || filled(c.injuries) || filled(c.equipment_available));
}

export interface FitView<T> {
  /** What to draw, in order. */
  shown: T[];
  /** Left out because they break a hard rule (fitsOnly on). */
  hidden: number;
  /** Not answered yet — held back while fitsOnly is on, so nothing unchecked
   *  is presented as fitting. */
  pending: number;
  /** The check could not run. Everything is shown and the screen must say so. */
  failed: boolean;
}

/**
 * Which items of one page to show.
 *
 * - No hard rules: everything, nothing to say.
 * - Check failed: everything, with `failed` so the screen says it is unchecked.
 *   Hiding the whole library because the network blinked helps nobody, and
 *   calling it "fits you" would be a lie — so it is shown and labelled.
 * - fitsOnly: blocked and not-yet-answered are held back; cautions stay
 *   (things to do differently, not never).
 * - Show all: everything; the cards carry their verdicts.
 */
export function libraryFit<T extends { slug: string }>(
  items: T[],
  state: FitState,
  opts: { rules: boolean; fitsOnly: boolean },
): FitView<T> {
  if (!opts.rules) return { shown: items, hidden: 0, pending: 0, failed: false };
  const unanswered = items.filter((i) => !state.results[i.slug]);
  if (!state.checked && unanswered.length) return { shown: items, hidden: 0, pending: 0, failed: true };
  if (!opts.fitsOnly) return { shown: items, hidden: 0, pending: unanswered.length, failed: false };
  let hidden = 0, pending = 0;
  const shown: T[] = [];
  for (const i of items) {
    const v = state.results[i.slug];
    if (!v) { pending++; continue; }
    if (v.verdict === 'blocked') { hidden++; continue; }
    shown.push(i);
  }
  return { shown, hidden, pending, failed: false };
}

/** Slugs on this page with no verdict yet — what to ask the check about. */
export function slugsToCheck<T extends { slug: string }>(items: T[], state: FitState): string[] {
  return items.map((i) => i.slug).filter((s) => !state.results[s]);
}

const lc = (s: string) => s.trim().toLowerCase().replace(/[_-]+/g, ' ');

/**
 * Preferences steer, never hide: favourite cuisines and liked foods first,
 * disliked foods last, everything else in the library's own order.
 * Matched on the recipe's name and cuisine — the list carries no ingredients,
 * so "mushrooms" moves "Mushroom risotto" down, not every dish with a
 * mushroom in it. Stable: equal scores keep their order.
 */
export function orderByPreference<T extends { name: string; cuisine_name?: string | null }>(
  items: T[],
  profile: ProfileLike | null | undefined,
): T[] {
  const likes = (profile?.food?.likes ?? []).map(lc).filter(Boolean);
  const dislikes = (profile?.food?.dislikes ?? []).map(lc).filter(Boolean);
  const cuisines = (profile?.food?.cuisines ?? []).map(lc).filter(Boolean);
  if (!likes.length && !dislikes.length && !cuisines.length) return items;
  // "mushrooms" should find "Mushroom risotto": compare on the word stem.
  const stem = (w: string) => w.replace(/(es|s)$/, '');
  const mentions = (name: string, word: string) => {
    const n = lc(name);
    return n.includes(word) || n.includes(stem(word));
  };
  const score = (i: T) => {
    let s = 0;
    if (i.cuisine_name && cuisines.includes(lc(i.cuisine_name))) s += 2;
    if (likes.some((w) => mentions(i.name, w))) s += 1;
    if (dislikes.some((w) => mentions(i.name, w))) s -= 3;
    return s;
  };
  return items
    .map((item, index) => ({ item, index, s: score(item) }))
    .sort((a, b) => b.s - a.s || a.index - b.index)
    .map((x) => x.item);
}

/** The recipe and exercise slugs a plan's days refer to. */
export function planRefs(days: Array<{
  meals?: Array<{ ref?: { slug: string } | null }> | null;
  training?: Array<{ ref?: { slug: string } | null }> | null;
}>): { recipes: string[]; exercises: string[] } {
  const recipes = new Set<string>(), exercises = new Set<string>();
  for (const d of days) {
    for (const m of d.meals ?? []) if (m.ref?.slug) recipes.add(m.ref.slug);
    for (const e of d.training ?? []) if (e.ref?.slug) exercises.add(e.ref.slug);
  }
  return { recipes: [...recipes], exercises: [...exercises] };
}

export interface StarterFit {
  state: 'fits' | 'swap' | 'pending' | 'unchecked';
  /** Items that break a hard rule (by slug). */
  blocked: string[];
  /** Items to take care with (by slug). */
  cautions: string[];
}

/**
 * One ready-made plan against their rules: "fits you" or "needs a swap".
 * A plan is only said to fit once every item in it has been answered.
 */
export function starterFit(refs: { recipes: string[]; exercises: string[] }, state: FitState): StarterFit {
  const slugs = [...refs.recipes, ...refs.exercises];
  const blocked: string[] = [], cautions: string[] = [];
  let unanswered = 0;
  for (const s of slugs) {
    const v = state.results[s];
    if (!v) { unanswered++; continue; }
    if (v.verdict === 'blocked') blocked.push(s);
    else if (v.verdict === 'warn') cautions.push(s);
  }
  if (blocked.length) return { state: 'swap', blocked, cautions };
  if (unanswered) return { state: state.checked ? 'pending' : 'unchecked', blocked, cautions };
  return { state: 'fits', blocked, cautions };
}
