import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type {
  RecipeStore, RecipeInput, RecipeIngredientInput, RecipeVersionInput, SkillLevel,
} from '../recipes/index.js';

const LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'expert'];

/**
 * Emit a finished recipe to the Pantry drafts — one call per dish.
 *
 * This does the deterministic work the model cannot be trusted with, in the
 * same spirit as write_article's quote check: it does not ASK for a cookable
 * recipe, it makes an uncookable one FAIL.
 *
 *   - The shopping-list check runs before anything is saved. A version whose
 *     method names an ingredient its list does not have is REFUSED, and the
 *     missing items come back as fix-instructions. The reader finding out at the
 *     hob is the one failure this desk exists to prevent.
 *
 *   - Every recipe lands UNPUBLISHED. Ava drafts, the operator publishes —
 *     exactly as the newsroom works.
 *
 * Refusals are instructions, not scolding: she adds the line or fixes the step
 * and re-calls in the same turn.
 */
export class WriteRecipeTool implements Tool {
  readonly name = 'write_recipe';
  readonly description =
    'Emit a finished recipe as a draft. ONE call per dish, with all three skill-level versions. Every ingredient a version\'s method names must be in that version\'s ingredients (shared or level-specific) — this is CHECKED, and a version that fails is refused with the missing items. Recipes land unpublished; the operator publishes.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'write_recipe',
    description:
      'Emit the finished recipe as a draft card. Call ONCE per dish, with beginner, intermediate and expert versions. Ingredients are shared across versions except where a level genuinely needs a different item (the beginner\'s jarred paste, the expert\'s whole spices) — mark those with a level. Every ingredient named in any version\'s steps is CHECKED against that version\'s list; a version that names something unlisted is rejected and you fix it. A level-specific item is a different FORM of something the dish needs, never a new flavour it does not carry.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The canonical dish name.' },
        cuisine_slug: { type: 'string', description: 'Cuisine slug, if known.' },
        origin_country: { type: 'string' },
        course: { type: 'string', enum: ['main', 'starter', 'dessert', 'breakfast', 'side', 'snack'] },
        overview: { type: 'string', description: 'What the dish is and why it matters. No breathless food-blog throat-clearing.' },
        source_attribution: { type: 'string', description: 'Where the recipe is adapted from, if anywhere specific.' },
        cost_tier: { type: 'string', enum: ['budget', 'moderate', 'special'], description: 'Rough cost to make.' },
        hero_image_prompt: { type: 'string', description: 'The subject of the hero photograph — the finished dish, plated honestly.' },
        ingredients: {
          type: 'array',
          description: 'The shopping list. Most items are shared; give an item a "level" ONLY when it belongs to that skill level alone.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Singular, no quantity in the name.' },
              quantity: { type: 'number' },
              unit: { type: 'string' },
              notes: { type: 'string', description: 'Prep notes that do not vary by level, e.g. "fresh, not dried".' },
              optional: { type: 'boolean' },
              level: { type: 'string', enum: ['beginner', 'intermediate', 'expert'], description: 'OMIT for shared items. Set only when the item belongs to that level alone.' },
            },
            required: ['name'],
          },
        },
        versions: {
          type: 'object',
          description: 'The three skill levels. Same dish, technique differs.',
          properties: Object.fromEntries(LEVELS.map((l) => [l, {
            type: 'object',
            properties: {
              description: { type: 'string', description: `What's different about the ${l} version.` },
              prep_time_minutes: { type: 'number' },
              cook_time_minutes: { type: 'number' },
              total_time_minutes: { type: 'number' },
              default_servings: { type: 'number' },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    action: { type: 'string', description: 'One imperative sentence.' },
                    notes: { type: 'string' },
                    technique_term: { type: 'string' },
                    time_estimate_seconds: { type: 'number' },
                    tricky_flag: { type: 'boolean' },
                  },
                  required: ['action'],
                },
              },
              diets: { type: 'array', items: { type: 'string' } },
              dietary_flags: { type: 'array', items: { type: 'string' } },
              nutrition: { type: 'object', description: 'Per-serving ESTIMATE. Total the version, divide by servings. Stored as an estimate, never a lab figure.' },
            },
            required: ['steps'],
          }])),
        },
      },
      required: ['name', 'ingredients', 'versions'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.recipeStore as RecipeStore | undefined;
    if (!store) {
      return { success: false, output: 'Recipe storage is not available in this context. The host must inject `recipeStore` into shared state.' };
    }

    const name = String(args.name ?? '').trim();
    if (!name) return { success: false, output: 'write_recipe requires a dish name.' };

    // Ingredients
    const rawIngredients = Array.isArray(args.ingredients) ? args.ingredients : [];
    const ingredients: RecipeIngredientInput[] = rawIngredients
      .map((i) => {
        const o = (i && typeof i === 'object') ? i as Record<string, unknown> : {};
        const lvl = typeof o.level === 'string' ? o.level.toLowerCase().trim() : '';
        return {
          name: String(o.name ?? '').trim(),
          quantity: typeof o.quantity === 'number' ? o.quantity : null,
          unit: o.unit ? String(o.unit) : null,
          notes: o.notes ? String(o.notes) : null,
          optional: o.optional === true,
          level: (LEVELS as string[]).includes(lvl) ? lvl as SkillLevel : null,
        };
      })
      .filter((i) => i.name);

    if (ingredients.length === 0) {
      return { success: false, output: 'REFUSED: a recipe with no ingredients cannot be cooked. List what the cook buys.' };
    }

    // Versions
    const rawVersions = (args.versions && typeof args.versions === 'object') ? args.versions as Record<string, unknown> : {};
    const versions: RecipeVersionInput[] = [];
    for (const level of LEVELS) {
      const v = (rawVersions[level] && typeof rawVersions[level] === 'object') ? rawVersions[level] as Record<string, unknown> : null;
      if (!v) continue;
      const steps = (Array.isArray(v.steps) ? v.steps : [])
        .map((s) => {
          const o = (s && typeof s === 'object') ? s as Record<string, unknown> : {};
          return {
            action: String(o.action ?? '').trim(),
            notes: o.notes ? String(o.notes) : null,
            technique_term: o.technique_term ? String(o.technique_term) : null,
            time_estimate_seconds: typeof o.time_estimate_seconds === 'number' ? o.time_estimate_seconds : null,
            tricky_flag: o.tricky_flag === true,
          };
        })
        .filter((s) => s.action);
      if (!steps.length) continue;
      versions.push({
        level,
        description: v.description ? String(v.description) : undefined,
        prep_time_minutes: typeof v.prep_time_minutes === 'number' ? v.prep_time_minutes : null,
        cook_time_minutes: typeof v.cook_time_minutes === 'number' ? v.cook_time_minutes : null,
        total_time_minutes: typeof v.total_time_minutes === 'number' ? v.total_time_minutes : null,
        default_servings: typeof v.default_servings === 'number' ? v.default_servings : 4,
        steps,
        diets: Array.isArray(v.diets) ? v.diets.map(String) : [],
        dietary_flags: Array.isArray(v.dietary_flags) ? v.dietary_flags.map(String) : [],
        nutrition: (v.nutrition && typeof v.nutrition === 'object') ? v.nutrition as Record<string, number | string> : undefined,
      });
    }

    if (versions.length === 0) {
      return { success: false, output: 'REFUSED: a recipe needs at least one skill-level version with steps.' };
    }

    const recipe: RecipeInput = {
      name,
      cuisine_slug: args.cuisine_slug ? String(args.cuisine_slug) : null,
      origin_country: args.origin_country ? String(args.origin_country) : null,
      course: args.course ? String(args.course) : null,
      overview: args.overview ? String(args.overview) : null,
      source_attribution: args.source_attribution ? String(args.source_attribution) : null,
      cost_tier: (['budget', 'moderate', 'special'].includes(String(args.cost_tier)) ? args.cost_tier : null) as RecipeInput['cost_tier'],
      hero_image_prompt: args.hero_image_prompt ? String(args.hero_image_prompt) : null,
      ingredients,
      versions,
    };

    // ── The shopping-list law: cookable-from-its-own-list, or it does not land ──
    const check = await store.check(recipe);
    if (check.status === 'fail') {
      const byLevel = new Map<string, string[]>();
      for (const f of check.findings) {
        const arr = byLevel.get(f.level) ?? [];
        arr.push(f.term);
        byLevel.set(f.level, arr);
      }
      const detail = [...byLevel.entries()]
        .map(([lvl, terms]) => `  · ${lvl}: ${terms.join(', ')}`)
        .join('\n');
      return {
        success: false,
        output:
          `REFUSED: the method names ingredients the shopping list does not have:\n${detail}\n\n` +
          'Someone shops from this list and then cooks from these steps — anything named but unlisted is something they do not have, standing at the hob. ' +
          'Fix it one of two ways and call write_recipe again: add the missing item to the ingredients (shared, or that level\'s own if only that version uses it), or change the step so it uses what is listed. ' +
          'Do not remove the check by rewording around it — the cook still needs the thing.',
      };
    }

    const { id } = await store.save(recipe);

    // A save that returns no id did NOT happen. Reporting success here is how a
    // recipe that was never written got announced as "written and checked
    // clean" — the tool lied to her, and she passed the lie on in good faith.
    // If the store could not persist it, say so and let her raise it.
    if (!id) {
      return {
        success: false,
        output:
          'The recipe passed its checks but COULD NOT BE SAVED — the store returned no id, so nothing was written. ' +
          'Do not report this recipe as created. Tell the operator it failed to save so they can look at the logs; ' +
          'retrying the same call is unlikely to help if the cause is server-side.',
      };
    }

    return {
      success: true,
      output: JSON.stringify({
        ok: true,
        id,
        name,
        versions: versions.map((v) => v.level),
        ingredients: ingredients.length,
        level_specific: ingredients.filter((i) => i.level).length,
        check: 'passed',
        note: 'Recipe drafted (unpublished). Every version\'s method was checked against its own shopping list.',
      }),
    };
  }
}
