import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { HealthPlanStore, HealthPlanDay } from '../health/index.js';
import { normaliseDay } from './health-plan-create.js';

/**
 * Update or fill one day of an existing health plan. Used after
 * `health_plan_create` to iterate day-by-day on longer plans without one
 * mega-call. Not confirmation-gated — the plan itself was confirmed at
 * creation; per-day fills should not spam the operator with approvals.
 * See COMMAND_PALETTE_PLAN.md §10.
 */
export class HealthPlanUpdateDayTool implements Tool {
  readonly name = 'health_plan_update_day';
  readonly description = 'Fill or update one day of an existing health plan.';
  readonly riskLevel: ToolRiskLevel = 'write';
  // Plan creation already passed a confirmation gate. Per-day edits would
  // otherwise prompt the operator dozens of times for a 28-day fill.
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'health_plan_update_day',
    description:
      'Fill or update one day of an existing health plan. Call after `health_plan_create` to ' +
      'iterate day-by-day on longer plans (28 / 56 / 84 days). Pass the `plan_id` returned by ' +
      'create and the 1-based `day_index` you are filling. Replaces the existing entry for ' +
      'that day.',
    parameters: {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: 'The id returned by health_plan_create.' },
        day_index: { type: 'number', description: '1-based day index within the plan.' },
        kind: { type: 'string', enum: ['training', 'rest', 'active_recovery'] },
        title: { type: 'string', description: 'e.g. "Upper body", "Long run", "Rest day".' },
        training: {
          type: 'array',
          description: 'Training exercises for the day. Empty for rest / meal-only days.',
          items: {
            type: 'object',
            properties: {
              ref: {
                type: 'object',
                description: 'Optional catalogue link from health_catalogue_search (kind=exercise). Set this when picking from the library so the UI can render technique guides and demos.',
                properties: { slug: { type: 'string', description: 'Slug from a health_catalogue_search result.' } },
                required: ['slug'],
              },
              name: { type: 'string' },
              sets: { type: 'number' },
              reps: { type: 'string' },
              weight: { type: 'string' },
              rest_seconds: { type: 'number' },
              tempo: { type: 'string' },
              notes: { type: 'string' },
            },
            required: ['name'],
          },
        },
        meals: {
          type: 'array',
          description: 'Meals for the day. Empty for fitness-only plans.',
          items: {
            type: 'object',
            properties: {
              ref: {
                type: 'object',
                description: 'Optional catalogue link from health_catalogue_search (kind=recipe). Set this when picking from the library — the UI derives nutrition live from recipe per-serving × `servings`, so leave calories/protein_g/carbs_g/fat_g null when ref is set.',
                properties: { slug: { type: 'string', description: 'Slug from a health_catalogue_search result.' } },
                required: ['slug'],
              },
              slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
              name: { type: 'string' },
              servings: { type: 'number' },
              calories: { type: 'number' },
              protein_g: { type: 'number' },
              carbs_g: { type: 'number' },
              fat_g: { type: 'number' },
              notes: { type: 'string' },
            },
            required: ['slot', 'name'],
          },
        },
        notes: { type: 'string' },
      },
      required: ['plan_id', 'day_index', 'kind'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.healthPlanStore as HealthPlanStore | undefined;
    if (!store) {
      return { success: false, output: 'Health plan storage is not available in this context.' };
    }

    const plan_id = (args.plan_id as string | undefined)?.trim();
    if (!plan_id) return { success: false, output: 'Missing required field: `plan_id`.' };

    // Reuse the create tool's normaliser so the shape is identical to
    // initial-fill days. Returns null when day_index/kind are missing.
    const day: HealthPlanDay | null = normaliseDay(args);
    if (!day) {
      return { success: false, output: 'Invalid day input — `day_index` (>=1) and `kind` (training | rest | active_recovery) are required.' };
    }

    try {
      const result = await store.updateDay(plan_id, day);
      if (!result) return { success: false, output: `Plan not found: ${plan_id}` };

      const parts = [`Day ${result.day_index} updated (${day.kind})`];
      if (day.title) parts.push(`"${day.title}"`);
      if (day.training.length > 0) parts.push(`${day.training.length} exercise${day.training.length === 1 ? '' : 's'}`);
      if (day.meals.length > 0) parts.push(`${day.meals.length} meal${day.meals.length === 1 ? '' : 's'}`);
      return {
        success: true,
        output: parts.join(' · '),
        metadata: { plan_id: result.plan_id, day_index: result.day_index },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: `Failed to update day: ${msg}` };
    }
  }
}
