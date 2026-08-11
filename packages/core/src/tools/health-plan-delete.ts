// ─── health_plan_delete ─────────────────────────────────────────────────────
//
// Removing a plan for good, which is a different act from archiving one and is
// treated as such.
//
// Archiving is what the surfaces already do, it is reversible, and it is what
// somebody almost always means: the plan leaves the way, the record stays. This
// tool is for the other case — the plan that was a false start, built wrong, or
// created twice — where leaving it under Past is just clutter with their name
// on it.
//
// The guardrail is not about protecting the plan. It is about protecting the
// things kept INSIDE the plan that nothing else holds a copy of: every meal the
// user marked as eaten, skipped, or swapped for something else. Gym sessions
// survive independently, but they carry plan_id, so deleting a trained-against
// plan leaves those references dangling.
//
// So: if anything has been logged, this refuses and points at archiving. Not a
// warning that can be talked past — a refusal. Ava can be argued with; a rule
// cannot, and that asymmetry is the entire point of putting it here rather than
// in the prompt.

import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { HealthPlanStore } from '../health/index.js';

export class HealthPlanDeleteTool implements Tool {
  readonly name = 'health_plan_delete';
  readonly description =
    'Permanently delete a health plan. Only when the user has asked for it — never offer this '
    + 'as a suggestion. Prefer health_plan_update with status "archived", which keeps the plan '
    + 'and its history and can be undone. This refuses outright once anything has been logged '
    + 'against the plan.';

  // Destroys user data that nothing else holds a copy of.
  readonly riskLevel: ToolRiskLevel = 'dangerous';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'health_plan_delete',
    description:
      'Permanently delete a health plan the user has explicitly asked to be rid of. Refuses if '
      + 'any meal or session has been logged against it — archive those instead.',
    parameters: {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: 'Id of the plan to delete. Get it from health_plan_list.' },
      },
      required: ['plan_id'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.healthPlanStore as HealthPlanStore | undefined;
    if (!store) {
      return { success: false, output: 'Health plan storage is not available in this context.' };
    }
    if (!store.remove || !store.get) {
      return { success: false, output: 'Deleting plans is not supported on this surface. Archive it instead with health_plan_update (status: "archived").' };
    }

    const planId = (args.plan_id as string | undefined)?.trim();
    if (!planId) return { success: false, output: 'Missing required field: `plan_id`.' };

    try {
      const plan = await store.get(planId);
      if (!plan) return { success: false, output: `Plan not found: ${planId}` };

      // ── What would be lost ────────────────────────────────────────────────
      const loggedMeals = (plan.days ?? []).reduce(
        (n: number, d) => n + (d.meals ?? []).filter(m => m.logged).length,
        0,
      );

      // Unimplemented means "cannot tell", and cannot-tell is not zero. A
      // surface that does not know its own training history has not earned a
      // deletion here.
      if (!store.loggedSessionCount) {
        return {
          success: false,
          output: `Cannot confirm whether anything has been logged against "${plan.title}" on this surface, so it will not be deleted. Archive it instead with health_plan_update (status: "archived").`,
        };
      }
      const loggedSessions = await store.loggedSessionCount(planId);

      if (loggedMeals > 0 || loggedSessions > 0) {
        const parts: string[] = [];
        if (loggedSessions > 0) parts.push(`${loggedSessions} logged session${loggedSessions === 1 ? '' : 's'}`);
        if (loggedMeals > 0) parts.push(`${loggedMeals} logged meal${loggedMeals === 1 ? '' : 's'}`);
        return {
          success: false,
          output:
            `Not deleted — "${plan.title}" has ${parts.join(' and ')} against it. That is a record of what they actually did, `
            + 'and deleting the plan destroys it. Archive it instead with health_plan_update (status: "archived"): it leaves '
            + 'their Programs list, keeps the history, and can be set active again later. Tell them that is what you have done and why.',
        };
      }

      const gone = await store.remove(planId);
      if (!gone) return { success: false, output: `Plan not found: ${planId}` };

      return {
        success: true,
        output: `Deleted "${plan.title}" — nothing had been logged against it, so no history was lost.`,
        metadata: { plan_id: planId, title: plan.title },
      };
    } catch (err) {
      return { success: false, output: `Could not delete plan: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
