// ─── health_plan_list ───────────────────────────────────────────────────────
//
// What the user already has. Ava could create plans, change them, and rewrite
// a single day of one — but she could not SEE one, and that gap had a cost she
// could never detect from where she stood.
//
// Activating a plan auto-archives any other active plan of the same type. So
// "make me a meal plan" would quietly retire the plan the user was four days
// into: it vanished from Programs, reappeared under Past, and nobody said a
// word — least of all Ava, who had no way of knowing it existed. She would
// then describe the new week with complete confidence, which is exactly what
// makes the failure convincing.
//
// The store has carried the answer the whole time. list() returns the title,
// type, status, start date and length of every plan. Nothing handed it to her.
//
// This tool is deliberately read-only and cheap, so that "check before you
// displace something" is a habit she can afford on every plan she writes.

import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { HealthPlanStore, HealthPlanSummary } from '../health/index.js';

/** start_date + duration_days − 1, as a plain YYYY-MM-DD. Built by hand rather
 *  than via toISOString(), which renders local midnight in UTC and lands on the
 *  wrong day for anyone east of Greenwich. */
function endDate(start: string, durationDays: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || durationDays < 1) return null;
  const d = new Date(`${start}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + durationDays - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** One line per plan. The dates are spelled out because the whole point is that
 *  she can say "runs to the 18th" instead of asking the user what they have. */
function describe(p: HealthPlanSummary): string {
  const bits = [`${p.id} · ${p.title} · ${p.type} · ${p.status}`];
  if (p.start_date) {
    const end = endDate(p.start_date, p.duration_days);
    bits.push(end && end !== p.start_date
      ? `${p.start_date} → ${end} (${p.duration_days} days)`
      : `${p.start_date} (${p.duration_days} day${p.duration_days === 1 ? '' : 's'})`);
  } else {
    bits.push(`${p.duration_days} day${p.duration_days === 1 ? '' : 's'}, no start date set`);
  }
  return bits.join(' · ');
}

export class HealthPlanListTool implements Tool {
  readonly name = 'health_plan_list';
  readonly description =
    'List the user\'s existing health plans with their dates, so you know what is already '
    + 'running before you build or activate anything. Activating a plan archives any other '
    + 'active plan OF THE SAME TYPE — check here first so you never displace something the '
    + 'user is midway through without telling them.';

  // Reads the plan library and changes nothing.
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'health_plan_list',
    description:
      'List existing health plans with title, type, status, start date and length. Call this '
      + 'BEFORE creating or activating a plan, so you can see what would be displaced.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['meal', 'fitness', 'combined'],
          description:
            'Only plans of this type. A meal plan and a fitness plan never conflict with each '
            + 'other, so filter to the type you are about to create.',
        },
        include_past: {
          type: 'boolean',
          description:
            'Include completed and archived plans. Default false — normally you want what is '
            + 'live. Set true when the user asks what they have done before.',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.healthPlanStore as HealthPlanStore | undefined;
    if (!store) {
      return { success: false, output: 'Health plan storage is not available in this context.' };
    }

    const wantType = typeof args.type === 'string' ? args.type : null;
    const includePast = args.include_past === true;

    try {
      let plans = await store.list();
      if (wantType) plans = plans.filter(p => p.type === wantType);
      if (!includePast) {
        plans = plans.filter(p => p.status !== 'archived' && p.status !== 'completed');
      }

      if (plans.length === 0) {
        // Said plainly, because "nothing is running" is the answer that lets
        // her get on with it WITHOUT raising a conflict the user does not have.
        return {
          success: true,
          output: wantType
            ? `No ${includePast ? '' : 'active or draft '}${wantType} plans.`
            : `No ${includePast ? '' : 'active or draft '}plans.`,
          metadata: { count: 0, active_count: 0 },
        };
      }

      // Active first — it is the one that can be displaced.
      const rank: Record<string, number> = { active: 0, draft: 1, completed: 2, archived: 3 };
      plans.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
        || (a.start_date ?? '').localeCompare(b.start_date ?? ''));

      const active = plans.filter(p => p.status === 'active');
      return {
        success: true,
        output: plans.map(describe).join('\n'),
        metadata: {
          count: plans.length,
          active_count: active.length,
          active_ids: active.map(p => p.id),
        },
      };
    } catch (err) {
      return { success: false, output: `Could not read plans: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
