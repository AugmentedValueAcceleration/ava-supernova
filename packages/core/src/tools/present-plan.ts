import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/** What the user decided when the plan card was approved. */
export interface PlanDecision {
  /** The `label` of the alternative they picked, if the plan offered any. */
  selection?: string;
  /** Anything they typed alongside the choice. */
  note?: string;
}

/**
 * The sentence Ava receives when a plan is approved.
 *
 * Lives in core because both surfaces have to say the same thing, and until
 * now they did not: the extension built its own string, the IDE passed the
 * user's free text through verbatim, and the IDE had no way to send a choice
 * at all. One fact, two hand-written copies — the shape that has caused most
 * of the faults in this area.
 *
 * The wording matters more than it looks. When an approach was chosen, Ava is
 * told to build THAT ONE. Seen live 2026-08-19: a plan offering "all eleven
 * tasks" against "minimal four-task core loop first" was approved without a
 * choice ever being asked for, and eleven tasks were dispatched — the operator
 * read it as her picking for him, or splicing the two together.
 */
export function formatPlanDecision(decision: PlanDecision = {}): string {
  const selection = decision.selection?.trim();
  const note = decision.note?.trim();

  const parts = ['Plan approved.'];
  if (selection) {
    parts.push(
      `The user chose the "${selection}" approach. Build THAT approach only — ` +
      'do not carry over steps from the alternatives they did not pick, and do ' +
      'not combine them.',
    );
  }
  if (note) parts.push(`They added: "${note}"`);
  parts.push(selection ? 'Execute its steps.' : 'Execute the steps.');
  return parts.join(' ');
}

export class PresentPlanTool implements Tool {
  readonly name = 'present_plan';
  readonly description = 'Present a structured plan for the user to review and approve before execution. Use in Plan mode for proposals, in Work mode before complex multi-step tasks, and in Brainstorm mode for refined action plans. Shows steps, effort estimates, and trade-offs.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'present_plan',
    description:
      'Present a structured plan to the user for review and approval before making changes. ' +
      'The user will see the plan as a card with Approve/Reject buttons. ' +
      'Always use this when you have a multi-step plan ready. ' +
      'If there are multiple valid approaches, include them as alternatives so the user can choose.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Brief plan title (e.g. "Add dark mode toggle")',
        },
        goal: {
          type: 'string',
          description: 'One-sentence description of what this plan achieves',
        },
        steps: {
          type: 'array',
          description: 'Ordered list of implementation steps',
          items: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'What this step does',
              },
              files: {
                type: 'array',
                items: { type: 'string' },
                description: 'File paths this step touches (optional)',
              },
            },
            required: ['description'],
          },
        },
        verification: {
          type: 'string',
          description: 'How to verify the plan worked (e.g. "Run npm test and npm run build")',
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Your overall confidence in this plan succeeding. Be honest — high means you\'ve verified the approach, low means you\'re unsure.',
        },
        alternatives: {
          type: 'array',
          description: 'Optional alternative approaches for the user to choose from',
          items: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                description: 'Short name for this approach (e.g. "Redis caching")',
              },
              description: {
                type: 'string',
                description: 'Brief explanation of this approach and its trade-offs',
              },
            },
            required: ['label', 'description'],
          },
        },
      },
      required: ['title', 'goal', 'steps', 'verification'],
    },
  };

  async execute(_args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    // Normally bypassed — the confirmation handler returns a string result directly.
    // This is a fallback in case the handler returns true instead of a string.
    //
    // In Auto Mode the host's TaskExecutor will pick up the approved task list
    // and dispatch a fresh Builder agent per step. The conductor model should
    // call todo_write to materialise the task list and then stop — the Builder
    // hand-off is automatic.
    return {
      success: true,
      output:
        'Plan approved by user. Call todo_write to materialise the task list, ' +
        'then stop — the Builder will execute each task automatically.',
    };
  }
}
