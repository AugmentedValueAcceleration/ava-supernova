/**
 * Health safety — the ONE set of rules every route into a plan uses
 * (Health & Nutrition, Part 1, 11 Nov 2026).
 *
 * Until now these rules lived only in the web generate route
 * (web/src/lib/health/plan-pools.ts). A nut allergy was a guarantee when the
 * server generated a plan, and a polite request everywhere else: when Ava
 * built a plan in the health room, when someone built one by hand, when a
 * ready-made plan was started, and in the recipe search. Same person, same
 * allergy, four different levels of safety depending on which button they
 * pressed. That is the bug this file exists to end.
 *
 * Behaviour is carried over EXACTLY from plan-pools.ts (and, before it, the
 * companion's health-safety service), because every rule below was learned
 * the hard way on the live library:
 *
 *   - Allergens match a closed vocabulary EXACTLY, with real synonyms.
 *     "Shellfish" contains "fish" and they are different allergens.
 *   - A recipe is blocked if its ingredient-derived allergen tags name one of
 *     theirs (what the dish CONTAINS).
 *   - It must ALSO positively assert it is free from each allergen a flag can
 *     prove ("nut_free" …). No flag is UNKNOWN, and unknown is unsafe: it is
 *     blocked, with that reason, not waved through.
 *   - Allergens the library has no flag for (fish, sesame, mustard …) are
 *     checked on the ingredient tags only and NAMED as unverified — a plan is
 *     never called clear when it is only unchecked.
 *   - Diets must all be satisfied (a vegan plan with chicken is useless).
 *   - Injuries: an 'avoid' contraindication blocks; 'caution' / 'modify'
 *     WARN — they are things to do differently, not never, and removing them
 *     would quietly shrink a programme for a manageable condition.
 *     Injury matching over-matches on purpose: a warning costs a tap, a miss
 *     costs an injury.
 *   - Kit: exact equipment slugs (canPerformWithEquipment). An empty profile
 *     list means "not stated", never "owns nothing".
 *
 * Likes and dislikes are NOT here. They are preferences: they steer, they
 * never block.
 *
 * PRIVACY: this runs on the person's computer against their local profile.
 * Facts about recipes and exercises are fetched by slug; the profile is never
 * sent anywhere to be checked.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canPerformWithEquipment } from './equipment.js';
import { AVA_HOME } from '../core/constants.js';
import type { HealthPlanDay } from './types.js';

// ── The profile fields that are HARD RULES ───────────────────────────────────

export interface SafetyProfile {
  allergens?: string[];
  dietary?: string[];
  injuries?: string[];
  equipment_available?: string[];
}

/** Pull the hard-rule fields out of a stored health profile (any shape tolerated). */
export function safetyProfileFrom(raw: unknown): SafetyProfile {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const c = (p.constraints && typeof p.constraints === 'object' ? p.constraints : {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []);
  return {
    allergens: arr(c.allergens),
    dietary: arr(c.dietary),
    injuries: arr(c.injuries),
    equipment_available: arr(c.equipment_available),
  };
}

export const hasHardRules = (p: SafetyProfile): boolean =>
  !!(p.allergens?.length || p.dietary?.length || p.injuries?.length || p.equipment_available?.length);

// ── Matching ─────────────────────────────────────────────────────────────────

/** Allergen names with their real synonyms, matched EXACTLY. */
const ALLERGEN_SYNONYMS: Array<{ names: string[]; flag: string | null }> = [
  { names: ['peanut', 'peanuts', 'groundnut', 'groundnuts', 'arachis'], flag: 'nut_free' },
  { names: ['tree nut', 'tree nuts', 'treenut', 'treenuts', 'tree_nuts', 'tree_nut', 'nuts', 'nut'], flag: 'nut_free' },
  { names: ['gluten', 'wheat'], flag: 'gluten_free' },
  { names: ['dairy', 'milk', 'lactose'], flag: 'dairy_free' },
  { names: ['egg', 'eggs'], flag: 'egg_free' },
  { names: ['soy', 'soya', 'soybean', 'soybeans'], flag: 'soy_free' },
  { names: ['shellfish', 'crustacean', 'crustaceans', 'prawn', 'prawns', 'shrimp', 'crab'], flag: 'shellfish_free' },
  // No free-from flag exists for these: checked on the ingredient tags only.
  { names: ['fish'], flag: null },
  { names: ['sesame'], flag: null },
  { names: ['sulphite', 'sulphites', 'sulfite', 'sulfites'], flag: null },
  { names: ['celery', 'celeriac'], flag: null },
  { names: ['mustard'], flag: null },
  { names: ['lupin', 'lupins', 'lupine'], flag: null },
  { names: ['mollusc', 'molluscs', 'mollusk', 'mollusks'], flag: null },
];

const norm = (s: string) => s.trim().toLowerCase().replace(/_/g, ' ');

/** True when two allergen names mean the same allergen. Exact, not fuzzy. */
export function sameAllergen(a0: string, b0: string): boolean {
  const a = norm(a0), b = norm(b0);
  if (!a || !b) return false;
  if (a === b) return true;
  return ALLERGEN_SYNONYMS.some((g) => g.names.map(norm).includes(a) && g.names.map(norm).includes(b));
}

/** The flag that positively proves this allergen absent, or null when the library has none. */
export function freeFromFlagFor(allergen: string): string | null {
  const a = norm(allergen);
  return ALLERGEN_SYNONYMS.find((g) => g.names.map(norm).includes(a))?.flag ?? null;
}

const NOISE = new Set([
  'left', 'right', 'both', 'my', 'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on',
  'acute', 'chronic', 'old', 'bad', 'dodgy', 'sore', 'weak', 'injury', 'injured',
  'pain', 'painful', 'problem', 'problems', 'issue', 'issues', 'condition',
  'history', 'post', 'op', 'surgery', 'recovering', 'from', 'mild', 'slight',
]);

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length > 2 && !NOISE.has(w)),
  );
}

/** Injuries and diets. Over-matches on purpose: a warning costs a tap, a miss costs an injury. */
export function refersToSame(a0: string, b0: string): boolean {
  const a = a0.trim().toLowerCase().replace(/_/g, ' ');
  const b = b0.trim().toLowerCase().replace(/_/g, ' ');
  if (!a || !b) return false;
  if (a === b || b.includes(a) || a.includes(b)) return true;
  const ta = tokens(a), tb = tokens(b);
  for (const w of ta) if (tb.has(w)) return true;
  // Same word, different ending ("pregnant" / "pregnancy"); short body-part
  // words still need an exact match, so this cannot collapse everything.
  for (const w of ta) {
    if (w.length < 5) continue;
    for (const v of tb) if (v.length >= 5 && w.slice(0, 5) === v.slice(0, 5)) return true;
  }
  return false;
}

// ── Facts (what the library says about one item) ─────────────────────────────

export interface RecipeFacts {
  slug: string;
  name?: string;
  /** Ingredient-derived allergen tags: what the dish CONTAINS. */
  allergens: string[];
  /** Free-from flags on the version being checked: positive assertions of absence. */
  flags: string[];
  /** Diets the version satisfies. */
  diets: string[];
}

export interface ExerciseFacts {
  slug: string;
  name?: string;
  contraindications: Array<{ name: string; severity: string; note?: string | null }>;
  equipment: string[];
  /** Easier versions, for "try this instead". */
  regressions?: Array<{ slug: string; name: string }>;
}

export type SafetyVerdict = 'ok' | 'warn' | 'blocked';

export interface SafetyResult {
  slug: string;
  name?: string;
  verdict: SafetyVerdict;
  /** Plain-English reasons, one per rule broken or caution raised. */
  reasons: string[];
  /** Allergens the library cannot speak to for this item — never reported as clear. */
  unverified: string[];
  /** For an exercise warning: easier versions to offer. */
  alternatives?: Array<{ slug: string; name: string }>;
}

/**
 * Profile choices the library records as free-from FLAGS, not diets
 * (read from the live `dietary_flags` table, 11 Nov 2026). The diets table
 * holds only Omnivore, Vegetarian, Vegan, Pescatarian, Keto, Paleo,
 * Mediterranean, Low Carb and Whole30.
 */
export const DIET_FLAGS: ReadonlySet<string> = new Set([
  'gluten_free', 'dairy_free', 'halal', 'kosher', 'low_fodmap', 'low_sodium', 'no_added_sugar',
  'hindu_vegetarian', 'jain_friendly', 'no_pork', 'no_beef', 'no_alcohol', 'lenten_friendly',
]);

// ── The checks ───────────────────────────────────────────────────────────────

export function checkRecipe(facts: RecipeFacts, profile: SafetyProfile): SafetyResult {
  const reasons: string[] = [];
  const unverified: string[] = [];
  const allergens = profile.allergens ?? [];

  for (const a of allergens) {
    if (facts.allergens.some((h) => sameAllergen(a, h))) { reasons.push(`contains ${a}`); continue; }
    const flag = freeFromFlagFor(a);
    if (flag) {
      if (!facts.flags.includes(flag)) reasons.push(`not confirmed free from ${a}`);
    } else {
      unverified.push(a);
    }
  }
  for (const d of profile.dietary ?? []) {
    // Some choices on the profile are DIETS in the library (vegan, keto…), and
    // some are free-from FLAGS (gluten_free, dairy_free, halal, kosher,
    // low_fodmap…). Checking a flag against the diet list found nothing, so
    // until 11 Nov 2026 the generator threw out EVERY recipe for anyone who
    // ticked gluten-free or halal. A flag is a positive assertion: missing
    // means not confirmed, and not confirmed does not go in a plan.
    const asFlag = d.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (DIET_FLAGS.has(asFlag)) {
      if (!facts.flags.includes(asFlag)) reasons.push(`not confirmed ${d.replace(/_/g, ' ')}`);
    } else if (!facts.diets.some((rd) => refersToSame(d, rd))) {
      reasons.push(`not ${d.replace(/_/g, ' ')}`);
    }
  }
  return { slug: facts.slug, name: facts.name, verdict: reasons.length ? 'blocked' : 'ok', reasons, unverified };
}

export function checkExercise(facts: ExerciseFacts, profile: SafetyProfile): SafetyResult {
  const reasons: string[] = [];
  let worst: SafetyVerdict = 'ok';
  for (const inj of profile.injuries ?? []) {
    for (const c of facts.contraindications) {
      if (!c.name || !refersToSame(inj, c.name)) continue;
      if (c.severity === 'avoid') { worst = 'blocked'; reasons.push(`avoid with ${inj}`); }
      else {
        if (worst === 'ok') worst = 'warn';
        reasons.push(`take care with ${inj}${c.note ? `: ${c.note}` : ''}`);
      }
    }
  }
  if (!canPerformWithEquipment(facts.equipment, profile.equipment_available ?? [])) {
    worst = 'blocked';
    reasons.push(`needs kit you have not listed (${facts.equipment.join(', ')})`);
  }
  return {
    slug: facts.slug, name: facts.name, verdict: worst, reasons: [...new Set(reasons)], unverified: [],
    ...(worst !== 'ok' && facts.regressions?.length ? { alternatives: facts.regressions } : {}),
  };
}

// ── Fetching facts (slugs only — the profile never leaves the machine) ────────

export interface SafetyFacts {
  recipes: Record<string, RecipeFacts>;
  exercises: Record<string, ExerciseFacts>;
}

const FACTS_URL = () => (process.env.AVA_PLATFORM_URL || 'https://avasupernova.com') + '/api/health/safety-facts';

/**
 * Facts for the given slugs. `level` picks which recipe version's flags and
 * diets to read (their cooking level), as the generate route does.
 * Throws when the facts cannot be fetched: callers must treat that as
 * "could not check", never as "safe".
 */
export async function fetchSafetyFacts(
  slugs: { recipes?: string[]; exercises?: string[]; level?: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<SafetyFacts> {
  const recipes = [...new Set(slugs.recipes ?? [])].filter(Boolean);
  const exercises = [...new Set(slugs.exercises ?? [])].filter(Boolean);
  if (!recipes.length && !exercises.length) return { recipes: {}, exercises: {} };
  const res = await fetchImpl(FACTS_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipes, exercises, level: slugs.level ?? null }),
  });
  if (!res.ok) throw new Error(`safety facts: HTTP ${res.status}`);
  const j = await res.json() as Partial<SafetyFacts>;
  return { recipes: j.recipes ?? {}, exercises: j.exercises ?? {} };
}

export interface PlanSafetyReport {
  blocked: SafetyResult[];
  warnings: SafetyResult[];
  /** Allergens no recipe in the plan could be checked for. */
  unverified: string[];
  /** Slugs the library knew nothing about (not checked, said so). */
  unknown: string[];
}

/** Check every recipe and exercise a set of plan days refers to. */
export function checkPlanItems(
  refs: { recipes: string[]; exercises: string[] },
  facts: SafetyFacts,
  profile: SafetyProfile,
): PlanSafetyReport {
  const report: PlanSafetyReport = { blocked: [], warnings: [], unverified: [], unknown: [] };
  const unv = new Set<string>();
  for (const slug of new Set(refs.recipes)) {
    const f = facts.recipes[slug];
    if (!f) { report.unknown.push(slug); continue; }
    const r = checkRecipe(f, profile);
    r.unverified.forEach((a) => unv.add(a));
    if (r.verdict === 'blocked') report.blocked.push(r);
  }
  for (const slug of new Set(refs.exercises)) {
    const f = facts.exercises[slug];
    if (!f) { report.unknown.push(slug); continue; }
    const r = checkExercise(f, profile);
    if (r.verdict === 'blocked') report.blocked.push(r);
    else if (r.verdict === 'warn') report.warnings.push(r);
  }
  report.unverified = [...unv];
  return report;
}

// ── Screening a plan before it is saved (the room tools) ─────────────────────

const PROFILE_FILE = () => join(process.env.AVA_HEALTH_DIR || join(AVA_HOME, 'health'), 'profile.json');

/** Their hard rules and cooking level, from the profile both apps share. */
export async function loadSafetyProfile(): Promise<{ profile: SafetyProfile; level: string | null }> {
  try {
    const raw = JSON.parse(await readFile(PROFILE_FILE(), 'utf-8')) as Record<string, unknown>;
    const kitchen = (raw.kitchen && typeof raw.kitchen === 'object' ? raw.kitchen : {}) as Record<string, unknown>;
    return { profile: safetyProfileFrom(raw), level: typeof kitchen.level === 'string' ? kitchen.level : null };
  } catch {
    return { profile: {}, level: null };
  }
}

export interface PlanScreen {
  /** False: nothing may be saved; `message` says why, item by item. */
  ok: boolean;
  /** For the tool to hand back: refusal reasons, or cautions to tell them about. */
  message: string;
  report?: PlanSafetyReport;
}

/**
 * Check plan days against their hard rules before anything is saved.
 *
 * - Anything breaking a hard rule refuses the WHOLE save, naming each item
 *   and why, so Ava swaps it and tries again. A plan with one unsafe meal is
 *   not "mostly fine".
 * - Cautions save, with a note telling Ava to say so and offer the easier
 *   version.
 * - If they have hard rules and the facts cannot be fetched, nothing is saved:
 *   "could not check" is never treated as "safe".
 * - Free-text items (no library ref) cannot be checked; they are NAMED, so
 *   she can tell the person rather than imply they were.
 */
export async function screenPlanDays(
  days: HealthPlanDay[],
  opts: { fetchImpl?: typeof fetch; profile?: SafetyProfile; level?: string | null } = {},
): Promise<PlanScreen> {
  const loaded = opts.profile ? { profile: opts.profile, level: opts.level ?? null } : await loadSafetyProfile();
  const profile = loaded.profile;
  if (!hasHardRules(profile)) return { ok: true, message: '' };

  const recipes: string[] = [], exercises: string[] = [], freeText: string[] = [];
  for (const d of days) {
    for (const m of d.meals ?? []) {
      if (m.ref?.slug) recipes.push(m.ref.slug);
      else if (profile.allergens?.length || profile.dietary?.length) freeText.push(m.name);
    }
    for (const e of d.training ?? []) {
      if (e.ref?.slug) exercises.push(e.ref.slug);
      else if (profile.injuries?.length || profile.equipment_available?.length) freeText.push(e.name);
    }
  }

  let facts: SafetyFacts;
  try {
    facts = await fetchSafetyFacts({ recipes, exercises, level: loaded.level }, opts.fetchImpl);
  } catch (err) {
    if (!recipes.length && !exercises.length) facts = { recipes: {}, exercises: {} };
    else return {
      ok: false,
      message: `Nothing was saved: I could not check this plan against their allergies, diet, injuries and kit (${err instanceof Error ? err.message : String(err)}). An unchecked plan is not a safe one. Try again in a moment, and tell them if it keeps failing.`,
    };
  }

  const report = checkPlanItems({ recipes, exercises }, facts, profile);
  const label = (r: SafetyResult) => r.name ?? r.slug;
  if (report.blocked.length) {
    return {
      ok: false,
      report,
      message: [
        'Nothing was saved. These break their hard rules:',
        ...report.blocked.map((r) => `- ${label(r)} (${r.slug}): ${r.reasons.join('; ')}${r.alternatives?.length ? `. Easier or swap: ${r.alternatives.map((a) => `${a.name} (${a.slug})`).join(', ')}` : ''}`),
        'Swap each one for something that fits (health_catalogue_search), then save again. Never tell them a plan is safe for an allergy it has not been checked for.',
      ].join('\n'),
    };
  }
  const notes: string[] = [];
  if (report.warnings.length) {
    notes.push('Take care — tell them about these, and offer the easier version:',
      ...report.warnings.map((r) => `- ${label(r)}: ${r.reasons.join('; ')}${r.alternatives?.length ? `. Easier: ${r.alternatives.map((a) => a.name).join(', ')}` : ''}`));
  }
  if (report.unverified.length) notes.push(`Not checkable for ${report.unverified.join(', ')}: the library cannot confirm a dish is free from ${report.unverified.length === 1 ? 'it' : 'them'}. Say so plainly; never call the plan clear for ${report.unverified.length === 1 ? 'it' : 'them'}.`);
  if (report.unknown.length) notes.push(`Not found in the library, so not checked: ${report.unknown.join(', ')}.`);
  if (freeText.length) notes.push(`Written in without a library entry, so not checked against their rules: ${[...new Set(freeText)].join(', ')}. Prefer library items; if you keep these, tell them they were not checked.`);
  return { ok: true, report, message: notes.join('\n') };
}
