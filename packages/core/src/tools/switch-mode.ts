import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class SwitchModeTool implements Tool {
  readonly name = 'switch_mode';
  readonly description = 'Offer to transition to a different mode when the current mode\'s work is complete. Always check with the user first.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'switch_mode',
    description:
      'Offer to switch to a different mode when a natural transition point is reached. ' +
      'Examples: Plan mode after plan approved → Work mode. Brainstorm after idea refined → Plan or Work. ' +
      'Security after findings → Work to fix. Chat when a task is mentioned → Work or Plan. ' +
      'The user will see this as a transition card and can confirm, add more context, or decline. ' +
      'Always ask if there is anything to add before switching.',
    parameters: {
      type: 'object',
      properties: {
        target_mode: {
          type: 'string',
          enum: ['work', 'plan', 'chat', 'teach', 'security', 'brainstorm'],
          description: 'The mode to transition to',
        },
        reason: {
          type: 'string',
          description: 'Brief explanation of why this transition makes sense (e.g. "Plan approved — ready to build")',
        },
        context_summary: {
          type: 'string',
          description: 'Summary of what was decided/agreed in the current mode — carried into the next mode as context',
        },
      },
      required: ['target_mode', 'reason', 'context_summary'],
    },
  };

  async execute(_args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    // Normally bypassed — the confirmation handler in the extension/IDE handles this.
    // This fallback runs only if the handler returns true instead of a string.
    return {
      success: true,
      output: 'Mode transition confirmed.',
    };
  }
}
