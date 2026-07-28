import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type {
  HealthPlanStore,
  HealthPlanCreateInput,
  HealthPlanType,
  HealthPlanStatus,
  HealthPlanDay,
  HealthPlanExercise,
  HealthPlanMeal,
} from '../health/index.js';

/**
 * Create a new health plan (meal / fitness / combined) and save it through
 * the surface-injected `healthPlanStore`. The palette-triggered path pre-
 * classifies `type` via the directive; if invoked from chat without a
 * palette click, Ava must ask the user for type, duration and status
 * before calling this tool — there's no default status per the locked spec
 * (see COMMAND_PALETTE_PLAN.md §10).
 */
export class HealthPlanCreateTool implements Tool {
  readonly name = 'health_plan_create';
  readonly description = 'Create a multi-week health plan — meal, fitness, or combined. Saves locally to the user\'s plan library.';
  readonly riskLevel: ToolRiskLevel = 'write';
  // Plan creation writes to the operator's library and (when status=active)
  // archives existing actives — confirm before running.
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'health_plan_create',
    description:
      'Create a new health plan and save it to the user\'s local plan library. Three types: ' +
      '`fitness` (training only), `meal` (nutrition only), `combined` (both woven together). ' +
      'The palette-triggered flow pre-classifies `type`; if invoked from chat without a palette ' +
      'click, ask the user which type they want before calling. Always ask the user for a clear ' +
      'title and an explicit status (`draft` vs `active`) before creating — never pick on their ' +
      'behalf. For short plans (1 or 7 days) you can populate `days` in the same call; for ' +
      'longer plans (28 / 56 / 84 days) create the skeleton here and fill the days iteratively ' +
      'with `health_plan_update_day`. Activating archives any existing active plan — name that ' +
      'plan in your confirmation question when it applies.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['fitness', 'meal', 'combined'],
          description: 'Plan type. fitness = training only; meal = nutrition only; combined = both.',
        },
        title: {
          type: 'string',
          description: 'Short user-facing title for the plan (e.g. "4-week cut", "First 5k").',
        },
        duration_days: {
          type: 'number',
          enum: [1, 7, 28, 56, 84],
          description: 'Length of the plan in days. One of the supported presets.',
        },
        start_date: {
          type: 'string',
          description:
            'YYYY-MM-DD — the day the plan begins. An active plan with no date given '
            + 'starts TODAY, so pass one whenever the user names a day. Call get_datetime '
            + 'and compute it rather than guessing what tomorrow is.',
        },
        goal: {
          type: 'string',
          description: 'Optional free-text goal — what the user wants to achieve (e.g. "lose 4kg", "first 5k").',
        },
        status: {
          type: 'string',
          enum: ['draft', 'active'],
          description:
            'Initial status. `draft` saves without starting; `active` begins today and archives ' +
            'any existing active plan. ASK the user which they want — never default.',
        },
        days: {
          type: 'array',
          description:
            'Optional initial day fill. Omit for a blank skeleton. Each entry contains the ' +
            'training and/or meals for one day, indexed 1..duration_days. Fill in this call ' +
            'only for short plans (1 or 7 days); use health_plan_update_day for longer plans ' +
            'to keep each call bounded.',
          items: {
            type: 'object',
            properties: {
              day_index: { type: 'number', description: '1-based day index within the plan.' },
              kind: { type: 'string', enum: ['training', 'rest', 'active_recovery'] },
              title: { type: 'string', description: 'e.g. "Upper body", "Long run", "Rest day".' },
              training: {
                type: 'array',
                description: 'Training exercises for the day. Empty on rest or meal-only plans.',
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
                    reps: { type: 'string', description: '"8-12", "AMRAP", "30s" — free-form.' },
                    weight: { type: 'string', description: '"bodyweight", "60kg", "RPE 7".' },
                    rest_seconds: { type: 'number' },
                    tempo: { type: 'string' },
                    notes: { type: 'string' },
                  },
                  required: ['name'],
                },
              },
              meals: {
                type: 'array',
                description: 'Meals for the day. Empty on fitness-only plans.',
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
                    cook_time_minutes: { type: 'number', description: "The recipe's real cook/prep time in minutes. Set it to show the meal fits the user's cooking-time ceiling for that slot." },
                    notes: { type: 'string' },
                  },
                  required: ['slot', 'name'],
                },
              },
              notes: { type: 'string' },
            },
            required: ['day_index', 'kind'],
          },
        },
      },
      required: ['type', 'title', 'duration_days', 'status'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.healthPlanStore as HealthPlanStore | undefined;
    if (!store) {
      return {
        success: false,
        output: 'Health plan storage is not available in this context. The host must inject `healthPlanStore` into shared state.',
      };
    }

    const type = args.type as HealthPlanType | undefined;
    const title = (args.title as string | undefined)?.trim();
    const duration_days = args.duration_days as number | undefined;
    const status = args.status as HealthPlanStatus | undefined;
    const goal = ((args.goal as string | undefined)?.trim()) || null;

    if (!type || !['fitness', 'meal', 'combined'].includes(type)) {
      return { success: false, output: 'Missing or invalid `type` (must be fitness | meal | combined).' };
    }
    if (!title) return { success: false, output: 'Missing required field: `title`.' };
    if (!duration_days || ![1, 7, 28, 56, 84].includes(duration_days)) {
      return { success: false, output: 'Invalid `duration_days` — must be one of 1, 7, 28, 56, or 84.' };
    }
    if (!status || !['draft', 'active'].includes(status)) {
      return { success: false, output: 'Missing or invalid `status` (must be `draft` or `active`). Ask the user explicitly — there is no default.' };
    }

    // Optional initial fill — normalise loose tool output into typed days.
    let days: HealthPlanDay[] | undefined;
    if (Array.isArray(args.days)) {
      days = (args.days as unknown[])
        .map((d) => normaliseDay(d))
        .filter((d): d is HealthPlanDay => d !== null);
      if (days.length === 0) days = undefined;
    }

    // No inline days → generate the whole plan server-side via the injected
    // generator (the surface calls POST /api/health/generate/plan, which
    // charges the flat per-plan fee — single 5 credits/week, combined 10/week
    // — and returns the days). This replaces the old turn-by-turn fill. Falls
    // back to a blank skeleton (agent fills with health_plan_update_day) if no
    // generator is wired into shared state.
    let creditsCharged = 0;
    if (!days) {
      const gen = context.sharedState?.generateHealthPlanDays as
        | ((i: { type: HealthPlanType; duration_days: number; goal: string | null; title: string })
            => Promise<{ days: HealthPlanDay[]; credits_charged?: number } | null>)
        | undefined;
      if (typeof gen === 'function') {
        try {
          const result = await gen({ type, duration_days, goal, title });
          if (result?.days?.length) {
            days = result.days;
            creditsCharged = result.credits_charged ?? 0;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { success: false, output: `Couldn't build the plan: ${msg}` };
        }
      }
    }

    // A date the store cannot read becomes null, which silently unschedules the
    // plan — worse than refusing, because it looks like it worked.
    let start_date: string | undefined;
    if (args.start_date !== undefined && args.start_date !== null) {
      const d = String(args.start_date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
        return { success: false, output: `Invalid \`start_date\` "${d}" — must be YYYY-MM-DD. Call get_datetime and compute the date rather than guessing.` };
      }
      start_date = d;
    }

    const input: HealthPlanCreateInput = { type, title, goal, duration_days, status, days, start_date };

    try {
      const created = await store.create(input);
      const parts = [
        `Plan created: "${created.title}" (${created.type}, ${created.duration_days} days, ${created.status}).`,
      ];
      if (creditsCharged > 0) parts.push(`${creditsCharged} credits.`);
      if (created.filled_days > 0) {
        parts.push(`${created.filled_days} day${created.filled_days === 1 ? '' : 's'} filled.`);
      }
      const remaining = created.duration_days - created.filled_days;
      if (remaining > 0) {
        parts.push(
          `${remaining} day${remaining === 1 ? '' : 's'} blank — use \`health_plan_update_day\` ` +
          `with plan_id=${created.id} to fill them.`,
        );
      }
      return {
        success: true,
        output: parts.join(' '),
        metadata: {
          plan_id: created.id,
          type: created.type,
          status: created.status,
          duration_days: created.duration_days,
          filled_days: created.filled_days,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: `Failed to create plan: ${msg}` };
    }
  }
}

// ─── Day-shape normalisers ───────────────────────────────────────────────────
// The model's tool output is `Record<string, unknown>`. Coerce it into the
// canonical core types — drop entries we can't validate; mint ids the adapter
// would otherwise have to back-fill.

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `hp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normaliseExercise(raw: unknown): HealthPlanExercise | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) return null;
  let ref: HealthPlanExercise['ref'] = null;
  if (r.ref && typeof r.ref === 'object') {
    const rr = r.ref as Record<string, unknown>;
    const slug = typeof rr.slug === 'string' ? rr.slug.trim() : '';
    if (slug) ref = { kind: 'exercise', slug };
  }
  return {
    id: newId(),
    ref,
    name,
    sets: typeof r.sets === 'number' ? r.sets : null,
    reps: typeof r.reps === 'string' ? r.reps : null,
    weight: typeof r.weight === 'string' ? r.weight : null,
    rest_seconds: typeof r.rest_seconds === 'number' ? r.rest_seconds : null,
    tempo: typeof r.tempo === 'string' ? r.tempo : null,
    notes: typeof r.notes === 'string' ? r.notes : null,
  };
}

function normaliseMeal(raw: unknown): HealthPlanMeal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const slot = typeof r.slot === 'string' && ['breakfast', 'lunch', 'dinner', 'snack'].includes(r.slot)
    ? (r.slot as HealthPlanMeal['slot'])
    : null;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!slot || !name) return null;
  let ref: HealthPlanMeal['ref'] = null;
  if (r.ref && typeof r.ref === 'object') {
    const rr = r.ref as Record<string, unknown>;
    const slug = typeof rr.slug === 'string' ? rr.slug.trim() : '';
    if (slug) ref = { kind: 'recipe', slug };
  }
  return {
    id: newId(),
    ref,
    slot,
    name,
    servings: typeof r.servings === 'number' ? r.servings : null,
    calories: typeof r.calories === 'number' ? r.calories : null,
    protein_g: typeof r.protein_g === 'number' ? r.protein_g : null,
    carbs_g: typeof r.carbs_g === 'number' ? r.carbs_g : null,
    fat_g: typeof r.fat_g === 'number' ? r.fat_g : null,
    cook_time_minutes: typeof r.cook_time_minutes === 'number' ? r.cook_time_minutes : null,
    notes: typeof r.notes === 'string' ? r.notes : null,
  };
}

function normaliseDay(raw: unknown): HealthPlanDay | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const day_index = typeof r.day_index === 'number' && r.day_index >= 1 ? r.day_index : null;
  const kind = typeof r.kind === 'string' && ['training', 'rest', 'active_recovery'].includes(r.kind)
    ? (r.kind as HealthPlanDay['kind'])
    : null;
  if (day_index === null || kind === null) return null;
  return {
    day_index,
    kind,
    title: typeof r.title === 'string' ? r.title.trim() || null : null,
    training: Array.isArray(r.training)
      ? (r.training as unknown[]).map(normaliseExercise).filter((x): x is HealthPlanExercise => x !== null)
      : [],
    meals: Array.isArray(r.meals)
      ? (r.meals as unknown[]).map(normaliseMeal).filter((m): m is HealthPlanMeal => m !== null)
      : [],
    notes: typeof r.notes === 'string' ? r.notes.trim() || null : null,
  };
}

// Re-export the normalisers so health_plan_update_day can share them.
export { normaliseDay, normaliseExercise, normaliseMeal };
