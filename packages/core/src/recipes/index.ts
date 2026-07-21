// ─── Pantry — recipe types, the store contract, and the shopping-list check ──
//
// The recipe desk's central lie is the recipe that reads perfectly and cannot
// be cooked: a method that names garlic the shopping list never mentioned, so
// the reader only finds out at the hob. As in the newsroom, the guarantee is
// ENFORCED IN CODE, not requested in a prompt — write_recipe refuses a version
// whose method names something its ingredients do not have, the way
// write_article refuses an unevidenced quote.
//
// The split, mirroring news/index.ts:
//   · The deterministic comparison (findPhantomIngredients) lives HERE, pure,
//     with no model or network dependency — the recipe equivalent of
//     verifyQuote.
//   · The model work (reading a method to list what it names) and persistence
//     (writing to the database) are the SURFACE's job, injected as a
//     RecipeStore, because that is where the provider and the schema live.

// ─── Recipe shape ────────────────────────────────────────────────────────────

export type SkillLevel = 'beginner' | 'intermediate' | 'expert';

export interface RecipeIngredientInput {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
  optional?: boolean;
  /** Undefined/null = shared by every version. A level means the item belongs
   *  to THAT skill level only — the beginner's jarred paste, the expert's whole
   *  spices — because those versions genuinely shop for different things. */
  level?: SkillLevel | null;
}

export interface RecipeStepInput {
  action: string;
  notes?: string | null;
  technique_term?: string | null;
  time_estimate_seconds?: number | null;
  tricky_flag?: boolean;
}

export interface RecipeVersionInput {
  level: SkillLevel;
  description?: string;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  total_time_minutes?: number | null;
  default_servings?: number;
  steps: RecipeStepInput[];
  diets?: string[];
  dietary_flags?: string[];
  /** Per-serving, and stored/shown AS an estimate — never a lab figure. */
  nutrition?: Record<string, number | string>;
}

/** A finished recipe on its way to the drafts table. Lands UNPUBLISHED — Ava
 *  drafts, the operator publishes, exactly as write_article does. */
export interface RecipeInput {
  name: string;
  slug?: string;
  /** The catalogue seed this was written from, if any. Set it and the seed is
   *  marked built, so it leaves the "to make" backlog instead of lingering
   *  after the dish exists. */
  seed_id?: string | null;
  cuisine_slug?: string | null;
  origin_country?: string | null;
  course?: string | null;
  overview?: string | null;
  source_attribution?: string | null;
  cost_tier?: 'budget' | 'moderate' | 'special' | null;
  hero_image_prompt?: string | null;
  ingredients: RecipeIngredientInput[];
  versions: RecipeVersionInput[];
}

/** One dish worth adding — a gap she SEES in a region or collection, with her
 *  reason. The selection is the skill, as in the newsroom's story menu. */
export interface SeedSuggestion {
  region_label: string;
  dish_name: string;
  course: string;
  /** Why it belongs — what the catalogue is missing, or why this dish earns a
   *  place. The operator is owed the reason, not just a name. */
  why: string;
  cuisine_slug?: string;
  diet_hints?: string[];
}

// ─── The check result ────────────────────────────────────────────────────────

export interface RecipeCheckFinding {
  level: SkillLevel;
  /** The ingredient the method names but the version's list does not have. */
  term: string;
  message: string;
}

export interface RecipeCheckResult {
  status: 'pass' | 'fail';
  checked_at: string;
  findings: RecipeCheckFinding[];
}

// ─── Surface-injected backend ────────────────────────────────────────────────

/**
 * Everything the recipe desk cannot do in pure code — the model work and the
 * database — injected by the surface (the web supplies it against Supabase and
 * its provider).
 */
/** An existing recipe's current state, for Ava to READ before she repairs it —
 *  the fix for blind repair. Working only from the check findings, she cannot
 *  tell "flour is missing" from "flour is here as harina"; seeing the real list
 *  she reasons across the gap the deterministic check cannot. */
export interface RecipeSnapshot {
  id: string;
  name: string;
  ingredients: Array<{ name: string; level: SkillLevel | null }>;
  /** has_nutrition matters: a version without it is a hole a meal plan falls
   *  through, and the absence is invisible unless we say so here. */
  versions: Array<{ level: SkillLevel; steps: string[]; has_nutrition: boolean }>;
  validation?: RecipeCheckResult;
}

/** A recipe found by search — enough for Ava to judge "already exists / genuine
 *  variant / duplicate to merge" without reading the whole thing. */
export interface RecipeMatch {
  id: string;
  name: string;
  /** Every cuisine it currently belongs to (primary first). */
  cuisines: string[];
  visible: boolean;
}

export interface RecipeStore {
  /** Persist a drafted recipe (UNPUBLISHED) and return its id. */
  save(recipe: RecipeInput): Promise<{ id: string | null }>;

  /** Read an existing recipe's full current state — the shopping list (shared
   *  and per level) and the method — so a repair is done with eyes open. */
  readRecipe(recipeId: string): Promise<RecipeSnapshot | null>;

  /** Fill in a version's per-serving nutrition. Stored as an ESTIMATE — the
   *  host stamps the source, so this can never masquerade as a lab figure. */
  setNutrition(
    recipeId: string,
    level: SkillLevel,
    nutrition: Record<string, number>,
  ): Promise<{ ok: boolean; error?: string }>;

  /** Search existing recipes by dish name — so Ava checks BEFORE she writes.
   *  If a dish already exists she associates the cuisine rather than making a
   *  duplicate; if she spots two of the same, she proposes a merge. Read-only:
   *  it finds, it never changes anything. */
  findRecipe(query: string): Promise<RecipeMatch[]>;

  /**
   * The shopping-list check. The host reads each version's method with the
   * model to list what it NAMES, then compares to what the cook was told to buy
   * using findPhantomIngredients below. Returns the verdict; write_recipe acts
   * on it. Host-side because the model provider lives there.
   */
  check(recipe: RecipeInput): Promise<RecipeCheckResult>;

  /** The targeted repair — add one ingredient (shared or level-specific) to an
   *  existing recipe. This is the fix for a missing line; regeneration is not. */
  addIngredient(
    recipeId: string,
    ingredient: RecipeIngredientInput,
  ): Promise<{ ok: boolean; error?: string }>;

  /** Regenerate ONE part of an existing recipe without touching the rest. */
  reviseSection(
    recipeId: string,
    section: 'overview' | 'ingredients' | SkillLevel,
  ): Promise<{ ok: boolean; error?: string }>;

  /** Re-run the check on an EXISTING recipe (by id) and return what's missing. */
  recheck(recipeId: string): Promise<RecipeCheckResult | null>;

  /** Find gaps in the catalogue for a region/collection — the honest additions. */
  proposeSeeds(brief: { region?: string; collection?: string; count?: number }): Promise<SeedSuggestion[]>;
}

// ─── The shopping-list check (pure) ──────────────────────────────────────────
//
// Given the ingredients a method NAMES (extracted by the host's model) and the
// ingredients the cook was told to BUY, which named items are missing? This is
// the deterministic heart, kept free of model or network so it is testable and
// identical wherever it runs.

/** Preparation and form words — they qualify a food, they are not one. */
const MODIFIERS = new Set([
  'fresh', 'dried', 'ground', 'whole', 'large', 'small', 'medium', 'chopped',
  'sliced', 'minced', 'grated', 'finely', 'roughly', 'ripe', 'raw', 'cooked',
  'unsalted', 'salted', 'plain', 'extra', 'virgin', 'light', 'dark', 'hot',
  'cold', 'warm', 'boiling', 'chilled', 'room', 'temperature', 'good', 'quality',
  'free', 'range', 'organic', 'toasted', 'roasted', 'smoked', 'frozen', 'canned',
  'jarred', 'tinned', 'neutral', 'fine', 'coarse', 'thick', 'thin', 'mild',
  'sweet', 'sour', 'bitter', 'strong', 'weak', 'best',
  'leaf', 'leaves', 'clove', 'cloves', 'seed', 'seeds', 'pod', 'pods', 'stick',
  'sticks', 'sprig', 'sprigs', 'piece', 'pieces', 'bunch', 'head', 'stalk',
  'stalks', 'slice', 'slices', 'pinch', 'handful', 'knob', 'strip', 'strips',
]);

/** So common that naming one proves nothing — every kitchen has them. */
const PANTRY_STAPLES = new Set([
  'water', 'ice', 'salt', 'pepper', 'oil', 'sugar', 'flour', 'stock', 'broth',
  'sauce', 'paste', 'juice', 'zest', 'powder', 'spice', 'herb', 'seasoning',
  'garnish', 'dressing', 'batter', 'dough', 'mixture', 'liquid',
]);

/** Collective nouns — "toast the whole spices" refers to what's already listed. */
const COLLECTIVE_NOUNS = new Set([
  'spice', 'spices', 'herb', 'herbs', 'vegetable', 'vegetables', 'aromatic',
  'aromatics', 'seasoning', 'seasonings', 'ingredient', 'ingredients',
  'topping', 'toppings', 'filling', 'garnish', 'garnishes', 'marinade',
  'mixture', 'remainder', 'rest', 'solids', 'liquids', 'greens', 'produce',
]);

/** Composed sub-preparations — made in-recipe from listed components, not bought.
 *  A béchamel is butter, flour and milk; a ragù is the meat and tomato already
 *  listed. Accepts a small false-negative risk (a genuinely missing base sauce
 *  won't flag) which is obvious to a cook anyway. */
const COMPOSED_PREPARATIONS = new Set([
  'bechamel', 'béchamel', 'roux', 'ragu', 'ragù', 'ragout', 'caramel', 'custard',
  'ganache', 'praline', 'dough', 'batter', 'slurry', 'brine', 'stock', 'sauce',
  'paste', 'marinade', 'dressing', 'glaze', 'reduction', 'sofrito', 'mirepoix',
  'gremolata',
]);

/** Kit, not food. */
const EQUIPMENT_WORDS = new Set([
  'pan', 'pot', 'skillet', 'wok', 'saucepan', 'stockpot', 'casserole', 'dish',
  'tray', 'sheet', 'rack', 'bowl', 'mortar', 'pestle', 'skewer', 'string',
  'whisk', 'spoon', 'spatula', 'knife', 'board', 'grater', 'strainer', 'sieve',
  'colander', 'ricer', 'blender', 'processor', 'mixer', 'thermometer', 'tin',
  'mould', 'mold', 'paper', 'foil', 'cloth', 'towel', 'jar', 'lid', 'oven',
  'griddle', 'steamer', 'basket', 'ladle', 'tongs', 'peeler', 'roller', 'pin',
]);

const SYNONYMS: string[][] = [
  ['scallion', 'spring onion', 'green onion'],
  ['coriander', 'cilantro'],
  ['aubergine', 'eggplant'],
  ['courgette', 'zucchini'],
  ['chickpea', 'garbanzo'],
  ['prawn', 'shrimp'],
  ['beetroot', 'beet'],
  ['rocket', 'arugula'],
  ['cornflour', 'cornstarch'],
  // Common name vs the formal/DOP name a list often uses (parmesan vs the
  // listed "Parmigiano-Reggiano"). Head token only — phrases split on
  // spaces/hyphens before folding.
  ['parmesan', 'parmigiano'],
];
const synGroup = new Map<string, number>();
SYNONYMS.forEach((grp, i) => grp.forEach((w) => synGroup.set(w, i)));

function stem(w: string): string {
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ves') && w.length > 4) return `${w.slice(0, -3)}f`;
  if (w.endsWith('oes') && w.length > 4) return w.slice(0, -2);
  // Only after a sibilant, where English actually adds "es" (dishes→dish);
  // elsewhere only the "s" is plural (chives→chive, NOT chiv).
  if (w.endsWith('es') && w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

/** Fold accents to ASCII so "ragù"→"ragu", "béchamel"→"bechamel",
 *  "jalapeño"→"jalapeno" — otherwise the [^a-z] strip below shreds an accented
 *  letter into a word break and the term stops matching its own set entry. */
const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Content words of a phrase IN ORDER: stemmed, synonym-folded, modifiers out. */
function contentWords(phrase: string): string[] {
  return fold(phrase ?? '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !MODIFIERS.has(w))
    .map((w) => {
      const s = stem(w);
      const g = synGroup.get(s);
      return g === undefined ? s : `syn${g}`;
    });
}

const headNoun = (item: string): string => {
  const words = fold(item).toLowerCase().replace(/[^a-z\s]/g, ' ').trim().split(/\s+/);
  return words[words.length - 1] ?? '';
};

/** True when a named item is not really a bought ingredient — kit, a collective,
 *  a composed preparation, or nothing distinctive once staples are stripped. */
function isNonIngredient(item: string): boolean {
  const head = headNoun(item);
  if (EQUIPMENT_WORDS.has(head) || COLLECTIVE_NOUNS.has(head) || COMPOSED_PREPARATIONS.has(head)) return true;
  const words = contentWords(item);
  return words.length > 0 && words.every((w) => PANTRY_STAPLES.has(w));
}

/**
 * The shopping-list check, pure.
 *
 * @param named       ingredients the method NAMES (the host's model extracted these)
 * @param available   ingredients the cook was told to buy for this version
 *                    (shared + this level's own)
 * @param dishName    the dish's own name — a method refers to what it makes
 *                    ("the salsa", "the bread"), which is not a missing ingredient
 * @returns the named items that appear nowhere in `available`
 */
export function findPhantomIngredients(
  named: string[],
  available: string[],
  dishName = '',
): string[] {
  const covered = new Set<string>();
  for (const ing of available) for (const w of contentWords(ing)) covered.add(w);
  for (const w of contentWords(dishName)) covered.add(w);

  const phantoms: string[] = [];
  const seen = new Set<string>();
  for (const item of named) {
    if (isNonIngredient(item)) continue;
    const words = contentWords(item);
    if (!words.length) continue;
    // Covered if ANY content word matches something bought — "lemon" is
    // satisfied by "lemon juice", "cumin" by "ground cumin".
    if (words.some((w) => covered.has(w))) continue;
    const sig = words.slice().sort().join('+');
    if (seen.has(sig)) continue;
    seen.add(sig);
    phantoms.push(item);
  }
  return phantoms;
}

/**
 * Run the shopping-list check across every version and assemble the verdict.
 * The host has already extracted what each version's method names; this does
 * the pure comparison and shapes the result.
 */
export function checkRecipeShoppingList(
  recipe: { name: string; ingredients: RecipeIngredientInput[] },
  namedByLevel: Partial<Record<SkillLevel, string[]>>,
  now: string,
): RecipeCheckResult {
  const shared = recipe.ingredients.filter((i) => !i.level);
  const findings: RecipeCheckFinding[] = [];

  for (const level of Object.keys(namedByLevel) as SkillLevel[]) {
    const named = namedByLevel[level] ?? [];
    const available = [...shared, ...recipe.ingredients.filter((i) => i.level === level)].map((i) => i.name);
    for (const term of findPhantomIngredients(named, available, recipe.name)) {
      findings.push({
        level,
        term,
        message: `The ${level} method uses "${term}" but it is not in the ingredients for that version.`,
      });
    }
  }

  return { status: findings.length ? 'fail' : 'pass', checked_at: now, findings };
}
