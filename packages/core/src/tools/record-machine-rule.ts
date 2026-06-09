import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { appendMachineRule } from '../config/project.js';

/**
 * record_machine_rule — let Ava persist a STANDING RULE the user wants honored
 * on this machine across all future desktop tasks (e.g. "never auto-send",
 * "save reports to D:\\Work"). Stored append-only in the machine-global
 * Decisions folder (<AVA_HOME>/Decisions/machine-rules.md) and injected at the
 * top of every desktop turn so Ava obeys it.
 *
 * Safety: a recorded rule is obeyed forever, so Ava is instructed to call this
 * ONLY for explicit, persistent rules and to confirm with the user first if
 * there's any doubt. Recording is deduped + the file is human-readable, so the
 * user can review/prune at any time. Desktop-mode only (needs AVA_HOME from the
 * IDE host's sharedState).
 */
export class RecordMachineRuleTool implements Tool {
  readonly name = 'record_machine_rule';
  readonly description =
    'Record a standing rule the user wants you to ALWAYS follow on this machine. Stored in the machine-global Decisions folder and shown to you before every desktop turn.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'record_machine_rule',
    description:
      'Persist a standing rule/constraint the user wants honored on this machine across ALL future desktop tasks. ' +
      'Only call this when the user has clearly stated or agreed to a PERSISTENT rule (e.g. "from now on always X", "never Y", "always save to Z"). ' +
      'Confirm with the user first if there is any doubt — a recorded rule is obeyed forever. ' +
      'Do NOT use it for one-off task instructions; those are not standing rules. Rules are read back to you before every desktop turn.',
    parameters: {
      type: 'object',
      properties: {
        rule: {
          type: 'string',
          description:
            'The standing rule, phrased as a clear imperative the future you can obey — e.g. "Never auto-send emails; stop at the draft for the user to review."',
        },
      },
      required: ['rule'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const rule = (args.rule as string | undefined)?.trim();
    if (!rule) return { success: false, output: 'rule is required.' };

    const state = (context.sharedState || {}) as Record<string, unknown>;
    const globalDir = state.globalDir as string | undefined;
    if (!globalDir) {
      return {
        success: false,
        output: 'Machine-rule storage is not available in this host. record_machine_rule requires the Ava IDE.',
      };
    }

    try {
      const recorded = await appendMachineRule(globalDir, rule, ['desktop']);
      return recorded
        ? { success: true, output: `Recorded standing rule for this machine: "${rule}". I'll follow it from now on.` }
        : { success: true, output: `That rule is already recorded — I'm already following it.` };
    } catch (err) {
      return { success: false, output: `Failed to record rule: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
