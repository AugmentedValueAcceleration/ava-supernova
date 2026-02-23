import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class AskUserTool implements Tool {
  readonly name = 'ask_user';
  readonly description = 'Ask the user a question and wait for their response';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'ask_user',
    description:
      'Ask the user a question and wait for their response. ' +
      'Use this when you need clarification, a decision, or input that you cannot determine from the code alone. ' +
      'The user will see the question and can type a free-text response. ' +
      'Do not overuse this — only ask when genuinely uncertain.',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to ask the user',
        },
      },
      required: ['question'],
    },
  };

  async execute(_args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    // Normally bypassed — the confirmation handler returns the user's response as a string.
    // This fallback runs only if the handler returns true instead of a string.
    return {
      success: true,
      output: 'User response received.',
    };
  }
}
