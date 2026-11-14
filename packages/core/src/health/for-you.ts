/**
 * "For you" on the command centre's Health tab (Health & Nutrition, Part 4,
 * 14 Nov 2026; mockup approved the same night).
 *
 * Three situations, from the plan of 11 Nov:
 *   - No profile yet: a few good-looking recipes and an exercise, and an
 *     invitation to tell Ava about themselves. This is the advert.
 *   - Profile, no plan: picks that pass their hard rules, each with a short
 *     "why this", new each day. Nobody has to make a plan to try something.
 *   - Plan running: today's session and tonight's dinner first, then a few
 *     things that go with today (an exercise of the same kind, a quick lunch
 *     where there is none, a fitting swap for tonight).
 *
 * Runs where the person's profile lives (the extension host, the IDE engine).
 * Library pages, details and safety facts are fetched by slug; the profile is
 * never sent anywhere. The rules are core's own (health/safety.ts), the same
 * check the wizard and the library tabs use.
 */

import { checkExercise, checkRecipe, fetchSafetyFacts, safetyProfileFrom, hasHardRules, type SafetyProfile } from './safety.js';
import { orderByPreference } from './library-fit.js';
import type { HealthPlanRecord, HealthPlanMeal } from './types.js';
import type { ForYouAction } from './for-you-plan.js';
export { applyForYouAction, type ForYouAction, type ForYouTodayItems } from './for-you-plan.js';
import type { ForYouTodayItems } from './for-you-plan.js';

type HealthPlan = HealthPlanRecord;

// ── What the screen draws ────────────────────────────────────────────────────

export interface ForYouPick {
  kind: 'recipe' | 'exercise';
  slug: string;
  name: string;
  /** Small caps line: cuisine (and meal) for a recipe, the kind of training for an exercise. */
  kicker: string | null;
  /** "High protein · 40 min · no nuts" — facts only, nothing invented. */
  why: string;
  image: string | null;
  course?: string | null;
}

export interface ForYouSession {
  planId: string;
  dayIndex: number;
  title: string | null;
  count: number;
  first: string | null;
  firstSlug: string | null;
  /** The first exercise's picture. */
  image?: string | null;
}

export interface ForYouDinner {
  planId: string;
  dayIndex: number;
  mealId: string;
  slug: string | null;
  name: string;
  why: string;
  image?: string | null;
}

export interface ForYouExtra extends ForYouPick {
  action: ForYouAction;
}

export interface ForYouResult {
  state: 'no_profile' | 'profile' | 'running';
  picks: ForYouPick[];
  session: ForYouSession | null;
  dinner: ForYouDinner | null;
  /** "Goes with today" — only while a plan is running. */
  extras: ForYouExtra[];
  /** The plan the running state is drawn from. */
  planTitle: string | null;
  /** Today's whole session and meals, for the preview before a change. */
  todayItems?: ForYouTodayItems;
  /** False when their rules could not be checked: nothing is offered as fitting then. */
  checked: boolean;
  /** YYYY-MM-DD the picks were chosen for — they change each day. */
  day: string;
}

// ── The profile ─────────────────────────────────────────────────────────────

interface ProfileLike {
  constraints?: { allergens?: string[]; dietary?: string[]; injuries?: string[]; equipment_available?: string[] } | null;
  food?: { likes?: string[]; dislikes?: string[]; cuisines?: string[] } | null;
  goals?: { primary?: string | null } | null;
  training?: { experience?: string | null } | null;
  kitchen?: { level?: string | null } | null;
}

const some = (v: unknown) => Array.isArray(v) && v.some((x) => typeof x === 'string' && x.trim());

/** Has the person told Ava anything about themselves? */
export function profileIsSet(p: ProfileLike | null | undefined): boolean {
  if (!p) return false;
  const c = p.constraints ?? {};
  const f = p.food ?? {};
  return some(c.allergens) || some(c.dietary) || some(c.injuries) || some(c.equipment_available)
    || some(f.likes) || some(f.dislikes) || some(f.cuisines)
    || !!p.goals?.primary || !!p.training?.experience || !!p.kitchen?.level;
}

// ── Small pure helpers (tested) ──────────────────────────────────────────────

/** A number from a date, so the picks change each day and stay put within it. */
export function daySeed(day: string): number {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The same list in a day-stable shuffled order. */
export function shuffleForDay<T>(items: T[], day: string): T[] {
  let s = daySeed(day) || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** YYYY-MM-DD of a plan day, local time. */
export function planDayDate(startDate: string, dayIndex: number): string {
  const d = new Date(`${startDate}T12:00:00`);
  d.setDate(d.getDate() + dayIndex - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const pretty = (s: string) => s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export interface RecipeFactsForWhy {
  minutes: number | null;
  protein: number | null;
  diets: string[];
  cuisine: string | null;
}

/** "High protein · 40 min · no nuts". Up to three facts, in the order that matters most to them. */
export function recipeWhy(f: RecipeFactsForWhy, profile: ProfileLike | null): string {
  const bits: string[] = [];
  const wantDiet = (profile?.constraints?.dietary ?? []).map((d) => pretty(d).toLowerCase());
  const diet = f.diets.find((d) => wantDiet.includes(pretty(d).toLowerCase()));
  if (diet) bits.push(cap(pretty(diet)));
  else if (f.protein != null && f.protein >= 30) bits.push('High protein');
  if (f.minutes != null) bits.push(`${f.minutes} min`);
  if (f.protein != null && !bits.includes('High protein')) bits.push(`${Math.round(f.protein)} g protein`);
  const cuisines = (profile?.food?.cuisines ?? []).map((c) => pretty(c).toLowerCase());
  if (f.cuisine && cuisines.includes(pretty(f.cuisine).toLowerCase())) bits.push('a cuisine you like');
  const allergen = (profile?.constraints?.allergens ?? [])[0];
  if (allergen) bits.push(`no ${pretty(allergen).toLowerCase()}`);
  return bits.slice(0, 3).join(' · ');
}

export interface ExerciseFactsForWhy {
  equipment: Array<{ slug: string; name: string }>;
  difficulty: number | null;
}

const LEVEL_MAX: Record<string, number> = { beginner: 2, intermediate: 4, advanced: 5 };

/** "No kit needed · your level". */
export function exerciseWhy(f: ExerciseFactsForWhy, profile: ProfileLike | null, lead?: string): string {
  const bits: string[] = [];
  if (lead) bits.push(lead);
  const kit = f.equipment.filter((e) => e.slug !== 'bodyweight');
  if (!kit.length) bits.push('No kit needed');
  else if (some(profile?.constraints?.equipment_available)) bits.push('Uses kit you have');
  else bits.push(kit.slice(0, 2).map((e) => e.name).join(' or '));
  const exp = profile?.training?.experience ?? null;
  if (exp && f.difficulty != null && f.difficulty <= (LEVEL_MAX[exp] ?? 5) && f.difficulty >= (exp === 'advanced' ? 3 : 1)) bits.push('your level');
  else if (!exp && f.difficulty != null && f.difficulty <= 2) bits.push('beginner friendly');
  return bits.slice(0, 3).join(' · ');
}

/** Today's session and dinner across their running plans. */
export interface TodayInPlans {
  /** The plan that trains today, and that day. */
  sessionPlan: HealthPlan | null;
  sessionDay: number | null;
  session: ForYouSession | null;
  /** The plan that feeds today, and that day. */
  mealPlan: HealthPlan | null;
  mealDay: number | null;
  dinner: HealthPlanMeal | null;
  meals: HealthPlanMeal[];
}

/**
 * Today across ALL their running plans. A meal plan and a training plan side
 * by side is the normal way people run them, so the session comes from the
 * plan that trains today and the meals from the plan that feeds today.
 */
export function todayInPlans(plans: HealthPlan[], today: string): TodayInPlans {
  const out: TodayInPlans = { sessionPlan: null, sessionDay: null, session: null, mealPlan: null, mealDay: null, dinner: null, meals: [] };
  for (const plan of plans) {
    if (!plan.start_date || plan.status === 'archived') continue;
    const day = plan.days.find((d) => planDayDate(plan.start_date!, d.day_index) === today);
    if (!day) continue;
    if (!out.session && day.training.length) {
      out.sessionPlan = plan;
      out.sessionDay = day.day_index;
      out.session = { planId: plan.id, dayIndex: day.day_index, title: day.title, count: day.training.length, first: day.training[0]?.name ?? null, firstSlug: day.training[0]?.ref?.slug ?? null };
    }
    if (!out.mealPlan && day.meals.length) {
      out.mealPlan = plan;
      out.mealDay = day.day_index;
      out.meals = day.meals;
      out.dinner = day.meals.find((m) => m.slot === 'dinner') ?? null;
    }
  }
  return out;
}

// ── Fetching (library data only) ─────────────────────────────────────────────

const BASE = () => process.env.AVA_PLATFORM_URL || 'https://avasupernova.com';

interface RecipeRow { slug: string; name: string; cuisine_name: string | null; course: string | null; hero_image_url: string | null; average_rating?: number | null }
interface ExerciseRow { slug: string; name: string; workout_type: string; difficulty: number; thumbnail_url?: string | null }

async function getJson<T>(path: string, f: typeof fetch): Promise<T> {
  const res = await f(`${BASE()}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return res.json() as Promise<T>;
}

/** One page of the library, at a day-stable place in it. */
async function libraryPage<T>(kind: 'recipes' | 'exercises', params: Record<string, string>, day: string, f: typeof fetch, size = 48): Promise<T[]> {
  const q = new URLSearchParams(params);
  const head = await getJson<{ total?: number }>(`/api/health/${kind}?${new URLSearchParams({ ...params, limit: '1', offset: '0' })}`, f);
  const total = head.total ?? 0;
  const offset = total > size ? daySeed(`${day}:${kind}:${q}`) % (total - size) : 0;
  // The library hands out at most 100 a request: a bigger window is read in parts.
  const out: T[] = [];
  for (let at = offset; at < offset + size && at < Math.max(total, 1); at += 100) {
    q.set('limit', String(Math.min(100, offset + size - at)));
    q.set('offset', String(at));
    const page = await getJson<Record<string, T[]>>(`/api/health/${kind}?${q}`, f);
    const rows = page[kind] ?? [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

interface RecipeDetail { slug: string; cuisine_name: string | null; hero_image_url?: string | null; versions?: Array<{ level: string; total_time_minutes: number | null; nutrition?: { protein_g?: number } | null; diets?: string[] }> }
interface ExerciseDetail { slug: string; workout_type: string; difficulty: number | null; equipment?: Array<{ slug: string; name: string }>; thumbnail_url?: string | null }

async function recipeFacts(slug: string, level: string | null, f: typeof fetch): Promise<RecipeFactsForWhy & { image: string | null }> {
  const d = await getJson<RecipeDetail & { recipe?: RecipeDetail }>(`/api/health/recipes/${encodeURIComponent(slug)}`, f);
  const r = d.recipe ?? d;
  const v = r.versions?.find((x) => x.level === level) ?? r.versions?.[0];
  return { minutes: v?.total_time_minutes ?? null, protein: v?.nutrition?.protein_g ?? null, diets: v?.diets ?? [], cuisine: r.cuisine_name ?? null, image: r.hero_image_url ?? null };
}

async function exerciseDetail(slug: string, f: typeof fetch): Promise<ExerciseDetail> {
  const d = await getJson<ExerciseDetail & { exercise?: ExerciseDetail }>(`/api/health/exercises/${encodeURIComponent(slug)}`, f);
  return d.exercise ?? d;
}

const WORKOUT_LABEL: Record<string, string> = {
  strength: 'Strength', hypertrophy: 'Muscle', conditioning: 'Conditioning', hiit: 'HIIT', mobility: 'Mobility', flexibility: 'Flexibility', yoga: 'Yoga', pilates: 'Pilates', calisthenics: 'Bodyweight',
};

// ── The whole card ──────────────────────────────────────────────────────────

export async function buildForYou(opts: {
  profile: ProfileLike | null;
  activePlans: HealthPlan[];
  today: string;
  fetchImpl?: typeof fetch;
}): Promise<ForYouResult> {
  const f = opts.fetchImpl ?? fetch;
  const { profile, today } = opts;
  const set = profileIsSet(profile);
  const rules: SafetyProfile = safetyProfileFrom(profile);
  const strict = hasHardRules(rules);
  const level = profile?.kitchen?.level ?? null;
  const base: ForYouResult = { state: set ? 'profile' : 'no_profile', picks: [], session: null, dinner: null, extras: [], planTitle: null, checked: true, day: today };

  // Candidates: dinners (mains) and exercises, one day-stable page of each.
  // Snacks too, for a running plan whose lunch is already covered.
  const [recipes, exercises, snacks] = await Promise.all([
    libraryPage<RecipeRow>('recipes', { course: 'main' }, today, f).catch(() => [] as RecipeRow[]),
    libraryPage<ExerciseRow>('exercises', {}, today, f, 250).catch(() => [] as ExerciseRow[]),
    libraryPage<RecipeRow>('recipes', { course: 'snack' }, today, f, 24).catch(() => [] as RecipeRow[]),
  ]);

  // Their rules, checked here: blocked never offered; with rules, a caution
  // exercise is not offered as a pick either (it is fine in a plan, with a
  // note, but a "for you" suggestion should not need a warning).
  let okRecipe = (_: string) => true;
  let okExercise = (_: string) => true;
  if (strict) {
    try {
      const facts = await fetchSafetyFacts({ recipes: [...recipes, ...snacks].map((r) => r.slug), exercises: exercises.map((e) => e.slug), level }, f);
      okRecipe = (s) => !!facts.recipes[s] && checkRecipe(facts.recipes[s], rules).verdict === 'ok';
      okExercise = (s) => !!facts.exercises[s] && checkExercise(facts.exercises[s], rules).verdict === 'ok';
    } catch {
      return { ...base, checked: false };
    }
  }

  const fitRecipes = orderByPreference(shuffleForDay(recipes.filter((r) => okRecipe(r.slug) && (set || r.hero_image_url)), today), profile);
  const exp = profile?.training?.experience ?? null;
  const fitExercises = shuffleForDay(exercises.filter((e) => okExercise(e.slug) && e.difficulty <= (exp ? (LEVEL_MAX[exp] ?? 5) : 3)), today);

  const recipePick = async (r: RecipeRow, kicker?: string): Promise<ForYouPick> => {
    const facts = await recipeFacts(r.slug, level, f).catch(() => ({ minutes: null, protein: null, diets: [] as string[], cuisine: r.cuisine_name, image: null }));
    return { kind: 'recipe', slug: r.slug, name: r.name, kicker: kicker ?? r.cuisine_name, why: recipeWhy(facts, set ? profile : null), image: r.hero_image_url, course: r.course };
  };
  const exercisePick = async (e: ExerciseRow, lead?: string): Promise<ForYouPick> => {
    const d = await exerciseDetail(e.slug, f).catch(() => ({ slug: e.slug, workout_type: e.workout_type, difficulty: e.difficulty, equipment: [] }));
    return { kind: 'exercise', slug: e.slug, name: e.name, kicker: WORKOUT_LABEL[e.workout_type] ?? cap(pretty(e.workout_type)), why: exerciseWhy({ equipment: d.equipment ?? [], difficulty: d.difficulty ?? e.difficulty }, set ? profile : null, lead), image: e.thumbnail_url ?? ('thumbnail_url' in d ? d.thumbnail_url ?? null : null) };
  };

  // ── Plans running today ──
  const t = todayInPlans(opts.activePlans, today);
  if (t.session || t.meals.length) {
    const extras: ForYouExtra[] = [];
    let session = t.session;
    if (t.session && t.sessionPlan && t.sessionDay != null) {
      const inSession = new Set(t.sessionPlan.days.find((d) => d.day_index === t.sessionDay)?.training.map((x) => x.ref?.slug).filter(Boolean) as string[]);
      const first = t.session.firstSlug ? await exerciseDetail(t.session.firstSlug, f).catch(() => null) : null;
      session = { ...t.session, image: first?.thumbnail_url ?? null };
      // More of the same kind of training as today's first exercise.
      const match = fitExercises.find((e) => !inSession.has(e.slug) && (!first?.workout_type || e.workout_type === first.workout_type));
      if (match) {
        const p = await exercisePick(match, 'Same kind of training as today');
        extras.push({ ...p, action: { type: 'add_exercise', planId: t.sessionPlan.id, dayIndex: t.sessionDay, slug: p.slug, name: p.name } });
      }
    }
    const usedRecipes = new Set(t.meals.map((m) => m.ref?.slug).filter(Boolean) as string[]);
    if (t.mealPlan && t.mealDay != null && !t.meals.some((m) => m.slot === 'lunch')) {
      for (const r of fitRecipes.slice(0, 8)) {
        if (usedRecipes.has(r.slug)) continue;
        const p = await recipePick(r, 'Lunch');
        usedRecipes.add(r.slug);
        extras.push({ ...p, why: `A lunch for today · ${p.why}`, action: { type: 'add_meal', planId: t.mealPlan.id, dayIndex: t.mealDay, slot: 'lunch', slug: p.slug, name: p.name } });
        break;
      }
    }
    // Lunch already covered: a snack for today instead.
    if (t.mealPlan && t.mealDay != null && t.meals.some((m) => m.slot === 'lunch') && !t.meals.some((m) => m.slot === 'snack')) {
      const snack = orderByPreference(shuffleForDay(snacks.filter((r) => okRecipe(r.slug) && !usedRecipes.has(r.slug)), today), profile)[0];
      if (snack) {
        const p = await recipePick(snack, 'Snack');
        usedRecipes.add(snack.slug);
        extras.push({ ...p, why: `A snack for today · ${p.why}`, action: { type: 'add_meal', planId: t.mealPlan.id, dayIndex: t.mealDay, slot: 'snack', slug: p.slug, name: p.name } });
      }
    }
    let dinner: ForYouDinner | null = null;
    if (t.dinner && t.mealPlan && t.mealDay != null) {
      const dn = t.dinner;
      const facts = dn.ref?.slug ? await recipeFacts(dn.ref.slug, level, f).catch(() => null) : null;
      const why = facts
        ? recipeWhy(facts, profile)
        : [dn.cook_time_minutes ? `${dn.cook_time_minutes} min` : null, dn.protein_g ? `${Math.round(dn.protein_g)} g protein` : null].filter(Boolean).join(' · ');
      dinner = { planId: t.mealPlan.id, dayIndex: t.mealDay, mealId: dn.id, slug: dn.ref?.slug ?? null, name: dn.name, why, image: facts?.image ?? null };
      const swap = fitRecipes.find((r) => !usedRecipes.has(r.slug));
      if (swap) {
        const p = await recipePick(swap, 'Swap for tonight');
        extras.push({ ...p, why: `If you swap tonight · ${p.why}`, action: { type: 'swap_meal', planId: t.mealPlan.id, dayIndex: t.mealDay, mealId: dn.id, slug: p.slug, name: p.name } });
      }
    }
    // Three suggestions fill the row: top up with more of today's kind of training.
    if (t.session && t.sessionPlan && t.sessionDay != null) {
      const taken = new Set([
        ...(t.sessionPlan.days.find((d) => d.day_index === t.sessionDay)?.training.map((x) => x.ref?.slug).filter(Boolean) as string[]),
        ...extras.map((x) => x.slug),
      ]);
      const kind = extras.find((x) => x.action.type === 'add_exercise') ? exercises.find((e) => e.slug === extras.find((x) => x.action.type === 'add_exercise')!.slug)?.workout_type : null;
      for (const e of fitExercises) {
        if (extras.length >= 3) break;
        if (taken.has(e.slug) || (kind && e.workout_type !== kind)) continue;
        taken.add(e.slug);
        const p = await exercisePick(e, 'Same kind of training as today');
        extras.splice(1, 0, { ...p, action: { type: 'add_exercise', planId: t.sessionPlan.id, dayIndex: t.sessionDay, slug: p.slug, name: p.name } });
      }
    }
    const titles = [...new Set([t.sessionPlan?.title, t.mealPlan?.title].filter(Boolean) as string[])];
    const sessionDay = t.sessionPlan?.days.find((d) => d.day_index === t.sessionDay);
    const todayItems: ForYouTodayItems = {
      training: (sessionDay?.training ?? []).map((e) => ({ id: e.id, name: e.name, sets: e.sets, reps: e.reps })),
      meals: t.meals.map((m) => ({ id: m.id, slot: m.slot, name: m.name })),
    };
    return { ...base, state: 'running', session, dinner, extras, planTitle: titles.join(' · ') || null, todayItems };
  }

  // ── No plan today: two dinners and an exercise ──
  const picks = await Promise.all([
    ...fitRecipes.slice(0, 2).map((r) => recipePick(r, r.cuisine_name ? `${r.cuisine_name} · Dinner` : 'Dinner')),
    ...fitExercises.slice(0, 1).map((e) => exercisePick(e)),
  ]);
  return { ...base, picks };
}
