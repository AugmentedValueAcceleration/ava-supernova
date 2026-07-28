// ─── health_plan_update ─────────────────────────────────────────────────────
//
// Change an existing plan: its title, its goal, whether it is active, and WHEN
// IT STARTS.
//
// This did not exist, and its absence produced a specific, believable failure.
// Asked to "make that draft active starting tomorrow", Ava had no tool that
// could set a status or a date on a plan she had already built. The only thing
// available was `health_plan_create`, so she created a SECOND plan with
// status:'active' — which the adapter stamped with today. The result was two
// identical plans, one draft and one active, beginning on the wrong day, while
// she described a week that had never been written anywhere.
//
// Nothing was hallucinated; she reported what she had asked for. The tools
// simply could not express it, and there was no way for her to discover that.

import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { HealthPlanStore, HealthPlanUpdateInput, HealthPlanStatus } from '../health/index.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class HealthPlanUpdateTool implements Tool {
  readonly name = 'health_plan_update';
  readonly description =
    'Change an existing health plan: title, goal, status (draft/active/completed/archived), '
    + 'or start date. Use this to ACTIVATE a plan you already built — never create a second '
    + 'plan to change its status. Pass start_date (YYYY-MM-DD) to say which day it begins; '
    + 'call get_datetime first rather than guessing what tomorrow is.';

  // Changes an existing plan's status and dates — activating archives another
  // plan of the same type, so it is confirmed like create.
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'health_plan_update',
    description:
      'Change an existing health plan: title, goal, status, or start date. Use this to '
      + 'ACTIVATE a plan you already built — never create a second plan to change its status.',
    parameters: {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: 'Id of the plan to change.' },
        title: { type: 'string' },
        goal: { type: 'string', description: 'Pass an empty string to clear it.' },
        status: {
          type: 'string',
          enum: ['draft', 'active', 'completed', 'archived'],
          description: 'Activating archives any other active plan of the same type.',
        },
        start_date: {
          type: 'string',
          description:
            'YYYY-MM-DD — the day the plan begins. Activating with no date starts it TODAY, '
            + 'so pass one explicitly whenever the user names a day.',
        },
      },
      required: ['plan_id'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.healthPlanStore as HealthPlanStore | undefined;
    if (!store) {
      return { success: false, output: 'Health plan storage is not available in this context.' };
    }

    const planId = (args.plan_id as string | undefined)?.trim();
    if (!planId) return { success: false, output: 'Missing required field: `plan_id`.' };

    const input: HealthPlanUpdateInput = {};
    if (typeof args.title === 'string' && args.title.trim()) input.title = args.title.trim();
    if (typeof args.goal === 'string') input.goal = args.goal.trim() || null;

    if (args.status !== undefined) {
      const s = args.status as HealthPlanStatus;
      if (!['draft', 'active', 'completed', 'archived'].includes(s)) {
        return { success: false, output: 'Invalid `status` — must be draft, active, completed or archived.' };
      }
      input.status = s;
    }

    if (args.start_date !== undefined) {
      const d = args.start_date as string | null;
      if (d !== null) {
        // Rejected rather than coerced. A date the store cannot read becomes
        // null downstream, which silently unschedules the plan — the failure
        // this tool exists to stop, wearing a different hat.
        if (typeof d !== 'string' || !ISO_DATE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
          return { success: false, output: `Invalid \`start_date\` "${String(d)}" — must be YYYY-MM-DD. Call get_datetime and compute the date rather than guessing.` };
        }
      }
      input.start_date = d;
    }

    if (Object.keys(input).length === 0) {
      return { success: false, output: 'Nothing to change — pass at least one of title, goal, status or start_date.' };
    }

    try {
      const updated = await store.update(planId, input);
      if (!updated) return { success: false, output: `No plan found with id "${planId}".` };

      // Report the STORED values, not the requested ones. If the store resolved
      // the date differently (activating without one stamps today), the answer
      // has to be what actually happened — that gap is what let a plan be
      // described as starting tomorrow while it began today.
      const bits = [`"${updated.title}" is now ${updated.status}`];
      bits.push(updated.start_date ? `starting ${updated.start_date}` : 'with no start date');
      return { success: true, output: `${bits.join(', ')}.` };
    } catch (err) {
      return { success: false, output: `Couldn't update the plan: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
