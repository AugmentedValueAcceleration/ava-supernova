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
 * add_ingredient — the targeted repair.
 *
 * This is the tool the whole "repair, don't re-roll" doctrine rests on. When a
 * recipe's method uses garlic and the list has none, the fix is to add garlic —
 * one line — not to regenerate the entire dish and gamble on the next roll being
 * clean. A full regeneration is a fresh recipe with fresh gaps; this is a needle
 * and thread.
 */
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
