import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Search the exercise or recipe catalogue by query. Returns the canonical
 * slugs Ava passes as `ref.slug` when creating or updating plan days.
 *
 * Wraps the same endpoints the UI Plans picker already calls —
 * `/api/health/exercises` and `/api/health/recipes` — so Ava-driven and
 * UI-driven catalogue access share one path. Endpoints are anon-read
 * (RLS-gated public); using the platform key when available unlocks the
 * caller's own pending/rejected submission rows alongside the public set.
 *
 * See COMMAND_PALETTE_PLAN.md §10 (Corrective addendum).
 */

const DEFAULT_API_BASE = 'https://ava-supernova.com';
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

interface ExerciseSummary {
  slug: string;
  name: string;
  workout_type?: string;
  exercise_type?: string;
  difficulty?: number;
}

interface RecipeSummary {
  slug: string;
  name: string;
  course?: string | null;
  cuisine_name?: string | null;
  origin_country?: string | null;
}

export class HealthCatalogueSearchTool implements Tool {
  readonly name = 'health_catalogue_search';
  readonly description = 'Search the exercise or recipe catalogue for slugs to pass as `ref` when creating health plan days.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'health_catalogue_search',
    description:
      'Search the user\'s exercise or recipe library for items to put in a health plan. ' +
      'Returns summary rows with canonical `slug` values — pass those slugs as `ref.slug` on the ' +
      'matching `training[]` or `meals[]` entry when calling `health_plan_create` or ' +
      '`health_plan_update_day`, so the UI can render technique guides / demos (exercises) and ' +
      'derive live per-serving nutrition (recipes). Always search the catalogue first when ' +
      'building a plan; only fall back to a free-text entry (no ref) when no catalogue row fits.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['exercise', 'recipe'],
          description: 'Which catalogue to search.',
        },
        query: {
          type: 'string',
          description: 'Free-text search query — exercise name, recipe name, ingredient, equipment, etc.',
        },
        category: {
          type: 'string',
          description:
            'Optional category filter. For kind=exercise this maps to workout_type (e.g. strength, ' +
            'hypertrophy, conditioning, mobility, hybrid, yoga, pilates, running, cycling, recovery, ' +
            'hiit). For kind=recipe this maps to course (e.g. breakfast, starter, main, side, ' +
            'dessert, snack, beverage, sauce, bread).',
        },
        limit: {
          type: 'number',
          description: `Max results to return (default ${DEFAULT_LIMIT}, hard cap ${MAX_LIMIT}).`,
        },
      },
      required: ['kind', 'query'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const kind = args.kind as 'exercise' | 'recipe' | undefined;
    const query = (args.query as string | undefined)?.trim();
    const category = (args.category as string | undefined)?.trim();
    const rawLimit = args.limit as number | undefined;
    const limit = Math.max(1, Math.min(MAX_LIMIT, typeof rawLimit === 'number' ? rawLimit : DEFAULT_LIMIT));

    if (kind !== 'exercise' && kind !== 'recipe') {
      return { success: false, output: 'Missing or invalid `kind` — must be "exercise" or "recipe".' };
    }
    if (!query) {
      return { success: false, output: 'Missing required field: `query`.' };
    }

    const apiBase = (context.sharedState?.platformApiBase as string) || DEFAULT_API_BASE;
    const path = kind === 'exercise' ? '/api/health/exercises' : '/api/health/recipes';
    const url = new URL(`${apiBase}${path}`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));
    if (category) {
      // Endpoint param names differ — exercises filter by workout_type,
      // recipes by course.
      url.searchParams.set(kind === 'exercise' ? 'workout_type' : 'course', category);
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    const platformKey = context.sharedState?.platformKey as string | undefined;
    if (platformKey) headers.Authorization = `Bearer ${platformKey}`;

    try {
      const response = await fetch(url.toString(), { headers });
      if (!response.ok) {
        return { success: false, output: `Catalogue search failed: HTTP ${response.status}.` };
      }
      const data = (await response.json()) as {
        exercises?: ExerciseSummary[];
        recipes?: RecipeSummary[];
        total?: number;
      };
      const results = kind === 'exercise' ? (data.exercises ?? []) : (data.recipes ?? []);

      if (results.length === 0) {
        return {
          success: true,
          output: `No ${kind === 'exercise' ? 'exercises' : 'recipes'} found for "${query}"${category ? ` (${category})` : ''}. You can fall back to a free-text entry (no ref) if nothing in the library fits, but try a different query first.`,
          metadata: { kind, count: 0, slugs: [] },
        };
      }

      const lines = results.map((row, i) => {
        if (kind === 'exercise') {
          const e = row as ExerciseSummary;
          const tags: string[] = [];
          if (e.workout_type) tags.push(e.workout_type);
          if (e.exercise_type) tags.push(e.exercise_type);
          if (typeof e.difficulty === 'number') tags.push(`difficulty ${e.difficulty}`);
          return `${i + 1}. ${e.name}  ·  slug: \`${e.slug}\`${tags.length ? `  ·  ${tags.join(' · ')}` : ''}`;
        }
        const m = row as RecipeSummary;
        const tags: string[] = [];
        if (m.course) tags.push(m.course);
        if (m.cuisine_name) tags.push(m.cuisine_name);
        return `${i + 1}. ${m.name}  ·  slug: \`${m.slug}\`${tags.length ? `  ·  ${tags.join(' · ')}` : ''}`;
      });

      const total = typeof data.total === 'number' ? data.total : results.length;
      const more = total > results.length ? ` (${total} total — narrow the query or raise \`limit\` to see more)` : '';

      return {
        success: true,
        output:
          `Found ${results.length} ${kind === 'exercise' ? 'exercise' : 'recipe'}${results.length === 1 ? '' : 's'} for "${query}"${category ? ` (${category})` : ''}${more}:\n` +
          lines.join('\n') +
          `\n\nPass the slug as \`ref.slug\` on the relevant ${kind === 'exercise' ? '`training[]`' : '`meals[]`'} entry when calling health_plan_create or health_plan_update_day.`,
        metadata: {
          kind,
          count: results.length,
          total,
          slugs: results.map((r) => r.slug),
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: `Catalogue search failed: ${msg}` };
    }
  }
}
