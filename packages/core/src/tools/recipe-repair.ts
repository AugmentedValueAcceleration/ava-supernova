import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { RecipeStore, SkillLevel } from '../recipes/index.js';

const LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'expert'];

/**
 * read_recipe — see the recipe before repairing it.
 *
 * The fix for blind repair. Working from the check findings alone, Ava cannot
 * tell a genuinely missing ingredient from one that is already there under
 * another name or another language ("flour" missing, when the list says
 * "harina"). The deterministic check cannot bridge that; Ava can, but only if
 * she can SEE the actual list. So: read first, then repair.
 */
export class ReadRecipeTool implements Tool {
  readonly name = 'read_recipe';
  readonly description =
    'Read an existing recipe by id — its full shopping list (shared and per skill level) and its method. Do this BEFORE repairing, so you can tell a truly missing ingredient from one already listed under another name or language. Read-only.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'read_recipe',
    description: 'Read an existing recipe: name, the ingredient list (marking which are shared vs level-specific), each version\'s steps, and its current check verdict. Read this before add_ingredient so you do not add something the recipe already has under a different name.',
    parameters: {
      type: 'object',
      properties: { recipe_id: { type: 'string' } },
      required: ['recipe_id'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.recipeStore as RecipeStore | undefined;
    if (!store) return { success: false, output: 'Recipe storage is not available in this context.' };

    const recipeId = String(args.recipe_id ?? '').trim();
    if (!recipeId) return { success: false, output: 'read_recipe requires recipe_id.' };

    const snap = await store.readRecipe(recipeId);
    if (!snap) return { success: false, output: 'No such recipe, or it could not be read.' };

    const shared = snap.ingredients.filter((i) => !i.level).map((i) => i.name);
    const byLevel = (lvl: SkillLevel) => snap.ingredients.filter((i) => i.level === lvl).map((i) => i.name);

    return {
      success: true,
      output: JSON.stringify({
        id: snap.id,
        name: snap.name,
        ingredients: {
          shared,
          beginner: byLevel('beginner'),
          intermediate: byLevel('intermediate'),
          expert: byLevel('expert'),
        },
        methods: Object.fromEntries(snap.versions.map((v) => [v.level, v.steps])),
        check: snap.validation ? { status: snap.validation.status, missing: snap.validation.findings.map((f) => `${f.level}: ${f.term}`) } : 'not checked',
        note: 'This is the ACTUAL list. Before adding anything the check flagged, confirm it is not already here under another name or language — "flour" may be present as "harina". Add only what is genuinely absent.',
      }),
    };
  }
}

/**
 * find_recipe — does this dish already exist?
 *
 * The check that stops duplication before it starts. Before writing a dish, Ava
 * searches. If it already exists as the same dish, she associates the new
 * cuisine rather than making a second copy; if it is a genuine variant (fava vs
 * chickpea falafel), she writes a distinct one. And when a search turns up two
 * of the same, she can propose a merge. Read-only — it finds, it never changes
 * anything, and it never merges: the merge is the operator's click, not hers.
 */
export class FindRecipeTool implements Tool {
  readonly name = 'find_recipe';
  readonly description =
    'Search existing recipes by dish name BEFORE writing a new one. Returns matches with the cuisines each belongs to. If the dish already exists as the same dish, associate the cuisine instead of duplicating; if it is a genuine regional variant, write a distinct recipe. Read-only.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'find_recipe',
    description: 'Look at the recipe library. CALL IT WITH NO QUERY to browse what we actually have — do that whenever you need a dish and none has been named, before you ever suggest inventing one. Pass a query only to check whether one SPECIFIC dish already exists (the duplicate check before write_recipe). Returns the library total either way, plus id, name and cuisines. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'OPTIONAL. A dish name, only when checking for that one dish. Omit it to browse the library.',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.recipeStore as RecipeStore | undefined;
    if (!store) return { success: false, output: 'Recipe storage is not available in this context.' };

    const query = String(args.query ?? '').trim();

    // No query — BROWSE. This is the case that did not exist, and its absence
    // made Ava tell the operator we had no recipes while sitting on 934 of them:
    // she had no callable way to see the library, so a guessed name that missed
    // looked exactly like an empty shelf.
    if (!query) {
      const { total, sample } = await store.browseRecipes(30);
      return {
        success: true,
        output: JSON.stringify({
          library_total: total,
          showing: sample.length,
          recipes: sample.map((m) => ({ id: m.id, name: m.name, cuisines: m.cuisines, live: m.visible })),
          note: total > sample.length
            ? `A sample of ${sample.length} from ${total} recipes. Pick from these, or query a name for a specific dish. Do NOT invent a dish — we have plenty.`
            : 'The whole library.',
        }),
      };
    }

    const matches = await store.findRecipe(query);
    // The total goes on EVERY response, including misses. Without it "no
    // matches" reads as "no recipes", which is precisely the misreading that
    // sent her off to generate a stranger's plate.
    const { total } = await store.browseRecipes(0);
    return {
      success: true,
      output: JSON.stringify({
        query,
        library_total: total,
        matches: matches.map((m) => ({ id: m.id, name: m.name, cuisines: m.cuisines, live: m.visible })),
        note: matches.length
          ? 'If one of these IS the same dish, do not write another — associate the cuisine to it. If two of these are the same dish, propose a merge (the operator confirms). Only write a new recipe if this is a genuine variant.'
          : `No recipe is NAMED "${query}". That is not an empty library — we have ${total}. `
            + 'Call find_recipe with no query to see what we do have. Only write this as a new recipe if you are authoring, never as a way to get a dish for a post.',
      }),
    };
  }
}

/**
 * add_ingredient — the targeted repair.
 *
 * This is the tool the whole "repair, don't re-roll" doctrine rests on. When a
 * recipe's method uses garlic and the list has none, the fix is to add garlic —
 * one line — not to regenerate the entire dish and gamble on the next roll being
 * clean. A full regeneration is a fresh recipe with fresh gaps; this is a needle
 * and thread.
 */
/** Re-shoot a hero that came from a superseded engine. Part of a repair, not a
 *  question to put to the operator — a recipe carrying a visibly older picture
 *  is half-fixed. */
export class RegenerateHeroTool implements Tool {
  readonly name = 'regenerate_hero';
  readonly description =
    'Re-shoot a recipe\'s hero photograph on the current image engine. Use it when read_recipe reports the hero is outdated, or when the recipe has none.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'regenerate_hero',
    description:
      'Re-shoot the hero photograph for an existing recipe and make it the primary image. The previous one stays in the gallery — nothing is deleted. You author the prompt: the finished dish, plated honestly, as it actually looks when cooked from THIS recipe. No garnish the method never mentions.',
    parameters: {
      type: 'object',
      properties: {
        recipe_id: { type: 'string' },
        image_prompt: { type: 'string', description: 'The subject of the photograph — the finished dish as this recipe actually produces it.' },
      },
      required: ['recipe_id', 'image_prompt'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.recipeStore as RecipeStore | undefined;
    if (!store) return { success: false, output: 'Recipe storage is not available in this context.' };

    const recipeId = String(args.recipe_id ?? '').trim();
    const prompt = String(args.image_prompt ?? '').trim();
    if (!recipeId || !prompt) return { success: false, output: 'regenerate_hero requires recipe_id and image_prompt.' };

    const result = await store.regenerateHero(recipeId, prompt);
    if (!result.ok) return { success: false, output: `Could not regenerate the hero: ${result.error ?? 'unknown error'}` };
    return { success: true, output: JSON.stringify({ ok: true, engine: result.engine, is_primary: true }) };
  }
}

/** The nutrition repair. Separate from add_ingredient because a missing figure
 *  is not a missing ingredient — the dish is cookable, the meal plan just can't
 *  count it. */
export class SetNutritionTool implements Tool {
  readonly name = 'set_nutrition';
  readonly description =
    'Fill in one version\'s per-serving nutrition on an existing recipe. Use it when read_recipe shows a version has none.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'set_nutrition',
    description:
      'Set the per-serving nutrition estimate for ONE skill level of an existing recipe. Total that version from its own ingredient quantities, then divide by its servings. Stored and shown as an estimate, never as a lab figure — so estimate carefully and round conservatively rather than leaving anything out.',
    parameters: {
      type: 'object',
      properties: {
        recipe_id: { type: 'string' },
        level: { type: 'string', enum: ['beginner', 'intermediate', 'expert'] },
        calories: { type: 'number', description: 'kcal per serving.' },
        protein_g: { type: 'number' },
        carbs_g: { type: 'number' },
        fat_g: { type: 'number' },
        fibre_g: { type: 'number' },
        sugar_g: { type: 'number' },
        saturated_fat_g: { type: 'number' },
        sodium_mg: { type: 'number' },
      },
      required: ['recipe_id', 'level', 'calories'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.recipeStore as RecipeStore | undefined;
    if (!store) return { success: false, output: 'Recipe storage is not available in this context.' };

    const recipeId = String(args.recipe_id ?? '').trim();
    const level = String(args.level ?? '').toLowerCase().trim();
    if (!recipeId || !(LEVELS as string[]).includes(level)) {
      return { success: false, output: 'set_nutrition requires recipe_id and a level of beginner, intermediate or expert.' };
    }

    const FIELDS = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'sugar_g', 'saturated_fat_g', 'sodium_mg'];
    const nutrition: Record<string, number> = {};
    for (const f of FIELDS) if (typeof args[f] === 'number') nutrition[f] = args[f] as number;
    if (typeof nutrition.calories !== 'number') {
      return { success: false, output: 'set_nutrition needs at least calories — a version with no calories cannot be counted in a day\'s total.' };
    }

    const result = await store.setNutrition(recipeId, level as SkillLevel, nutrition);
    if (!result.ok) return { success: false, output: `Could not set nutrition: ${result.error ?? 'unknown error'}` };
    return { success: true, output: JSON.stringify({ ok: true, level, nutrition, stored_as: 'estimate' }) };
  }
}

export class AddIngredientTool implements Tool {
  readonly name = 'add_ingredient';
  readonly description =
    'Add ONE missing or level-specific ingredient to an existing recipe — the targeted fix for a shopping-list gap. Use this to repair a check failure; do NOT regenerate the whole recipe to chase away a single missing item.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'add_ingredient',
    description:
      'Add one ingredient to an existing recipe by id. Leave `level` unset for a shared ingredient, or set it when the item belongs to one skill level only. This is the repair for a check failure — reach for it before revise_section, and long before regenerating the whole dish.',
    parameters: {
      type: 'object',
      properties: {
        recipe_id: { type: 'string', description: 'The recipe to add the ingredient to.' },
        name: { type: 'string', description: 'Ingredient name, singular, no quantity in the name.' },
        quantity: { type: 'number' },
        unit: { type: 'string' },
        notes: { type: 'string' },
        optional: { type: 'boolean' },
        level: { type: 'string', enum: ['beginner', 'intermediate', 'expert'], description: 'Omit for a shared ingredient; set when only that version uses it.' },
      },
      required: ['recipe_id', 'name'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.recipeStore as RecipeStore | undefined;
    if (!store) return { success: false, output: 'Recipe storage is not available in this context.' };

    const recipeId = String(args.recipe_id ?? '').trim();
    const name = String(args.name ?? '').trim();
    if (!recipeId || !name) return { success: false, output: 'add_ingredient requires recipe_id and name.' };

    const lvl = typeof args.level === 'string' ? args.level.toLowerCase().trim() : '';
    const result = await store.addIngredient(recipeId, {
      name,
      quantity: typeof args.quantity === 'number' ? args.quantity : null,
      unit: args.unit ? String(args.unit) : null,
      notes: args.notes ? String(args.notes) : null,
      optional: args.optional === true,
      level: (LEVELS as string[]).includes(lvl) ? lvl as SkillLevel : null,
    });
    if (!result.ok) return { success: false, output: `Could not add ingredient: ${result.error ?? 'unknown error'}` };

    // Re-check so she sees whether the gap is actually closed.
    const recheck = await store.recheck(recipeId);
    return {
      success: true,
      output: JSON.stringify({
        ok: true,
        added: name,
        level: (LEVELS as string[]).includes(lvl) ? lvl : 'shared',
        recheck: recheck ? recheck.status : 'not re-checked',
        remaining: recheck?.findings?.map((f) => `${f.level}: ${f.term}`) ?? [],
      }),
    };
  }
}

/**
 * check_recipe — run the shopping-list check on an existing recipe and get back
 * exactly what is missing. The read-only counterpart to write_recipe's built-in
 * check, for auditing or confirming a repair.
 */
export class CheckRecipeTool implements Tool {
  readonly name = 'check_recipe';
  readonly description =
    'Run the shopping-list check on an existing recipe by id. Returns pass, or the ingredients each version\'s method names but its list is missing. Read-only.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'check_recipe',
    description: 'Check whether an existing recipe is cookable from its own list. Returns the missing ingredients per version, or pass. Read-only — changes nothing.',
    parameters: {
      type: 'object',
      properties: { recipe_id: { type: 'string' } },
      required: ['recipe_id'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.recipeStore as RecipeStore | undefined;
    if (!store) return { success: false, output: 'Recipe storage is not available in this context.' };

    const recipeId = String(args.recipe_id ?? '').trim();
    if (!recipeId) return { success: false, output: 'check_recipe requires recipe_id.' };

    const result = await store.recheck(recipeId);
    if (!result) return { success: false, output: 'Could not check this recipe — it may not exist, or the check could not run.' };

    return {
      success: true,
      output: JSON.stringify({
        status: result.status,
        missing: result.findings.map((f) => ({ level: f.level, ingredient: f.term })),
        note: result.status === 'pass'
          ? 'Cookable from its own list.'
          : 'The method names ingredients the list is missing. Fix with add_ingredient, not a full regeneration.',
      }),
    };
  }
}

/**
 * revise_section — regenerate ONE part of an existing recipe without touching
 * the rest. For when a whole part is genuinely wrong, not to chase a single
 * missing ingredient (that is add_ingredient's job).
 */
export class ReviseSectionTool implements Tool {
  readonly name = 'revise_section';
  readonly description =
    'Regenerate ONE part of an existing recipe — the overview, the ingredients, or one skill level\'s steps — leaving everything else untouched. Use when a whole part is wrong. For a single missing ingredient, use add_ingredient instead.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'revise_section',
    description: 'Regenerate one section of a recipe (overview | ingredients | beginner | intermediate | expert) without changing the others. The recipe is re-checked afterwards. For a single missing item prefer add_ingredient — this rewrites the whole section.',
    parameters: {
      type: 'object',
      properties: {
        recipe_id: { type: 'string' },
        section: { type: 'string', enum: ['overview', 'ingredients', 'beginner', 'intermediate', 'expert'] },
      },
      required: ['recipe_id', 'section'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.recipeStore as RecipeStore | undefined;
    if (!store) return { success: false, output: 'Recipe storage is not available in this context.' };

    const recipeId = String(args.recipe_id ?? '').trim();
    const section = String(args.section ?? '').trim();
    const valid = ['overview', 'ingredients', 'beginner', 'intermediate', 'expert'];
    if (!recipeId || !valid.includes(section)) {
      return { success: false, output: `revise_section requires recipe_id and a section (${valid.join(', ')}).` };
    }

    const result = await store.reviseSection(recipeId, section as 'overview' | 'ingredients' | SkillLevel);
    if (!result.ok) return { success: false, output: `Could not revise ${section}: ${result.error ?? 'unknown error'}` };

    const recheck = section === 'overview' ? null : await store.recheck(recipeId);
    return {
      success: true,
      output: JSON.stringify({
        ok: true,
        revised: section,
        recheck: recheck ? recheck.status : 'n/a',
        remaining: recheck?.findings?.map((f) => `${f.level}: ${f.term}`) ?? [],
      }),
    };
  }
}

/**
 * propose_seeds — find the gaps in a region or collection, each with a reason.
 * The recipe desk's equivalent of suggest_stories: the selection is the skill,
 * and the operator is owed the reason, not just a list of names.
 */
export class ProposeSeedsTool implements Tool {
  readonly name = 'propose_seeds';
  readonly description =
    'Propose dishes worth adding to a region or a curated collection — the honest gaps, each with why it belongs. The catalogue-planning tool.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'propose_seeds',
    description: 'Suggest dishes to add to a region or collection, each with a reason it belongs. Read-only — it proposes; the operator decides what gets written.',
    parameters: {
      type: 'object',
      properties: {
        region: { type: 'string', description: 'A region or cuisine to fill out.' },
        collection: { type: 'string', description: 'A curated collection slug (e.g. "unprocessed").' },
        count: { type: 'number', description: 'How many to propose. Default a handful.' },
      },
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.recipeStore as RecipeStore | undefined;
    if (!store) return { success: false, output: 'Recipe storage is not available in this context.' };

    const seeds = await store.proposeSeeds({
      region: args.region ? String(args.region) : undefined,
      collection: args.collection ? String(args.collection) : undefined,
      count: typeof args.count === 'number' ? args.count : undefined,
    });

    return {
      success: true,
      output: JSON.stringify({
        count: seeds.length,
        seeds: seeds.map((s) => ({ region: s.region_label, dish: s.dish_name, course: s.course, why: s.why })),
        note: seeds.length ? 'Proposed. None are written yet — the operator picks which to build.' : 'No gaps proposed for that brief.',
      }),
    };
  }
}
