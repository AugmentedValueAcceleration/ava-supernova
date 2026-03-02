import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class PresentPlanTool implements Tool {
  readonly name = 'present_plan';
  readonly description = 'Present a structured plan for the user to review and approve';
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
    return {
      success: true,
      output: 'Plan approved. Proceed with execution.',
    };
  }
}
