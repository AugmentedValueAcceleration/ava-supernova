import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { MemoryManager } from '../memory/memory-manager.js';

export class MemoryDeleteTool implements Tool {
  readonly name = 'memory_delete';
  readonly description = 'Delete a specific memory entry by ID';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'memory_delete',
    description:
      'Delete a specific memory entry that is no longer relevant or is incorrect. ' +
      'Use memory_recall first to find the entry ID, then delete it here. ' +
      'This permanently removes the entry from memory.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['global', 'project'],
          description: 'Which memory store the entry is in.',
        },
        id: {
          type: 'string',
          description: 'The ID of the memory entry to delete (from memory_recall results).',
        },
      },
      required: ['scope', 'id'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const scope = args.scope as 'global' | 'project';
    const id = args.id as string;

    if (!scope || !id) {
      return { success: false, output: 'Both scope and id are required.' };
    }

    const memoryManager = context.sharedState?.memoryManager as MemoryManager | undefined;
    if (!memoryManager) {
      return { success: false, output: 'Memory system is not available in this context.' };
    }

    try {
      const deleted = await memoryManager.deleteEntry(scope, id);

      if (!deleted) {
        return { success: false, output: `No memory entry found with ID "${id}" in ${scope} scope.` };
      }

      return {
        success: true,
        output: `Memory deleted (${scope}). ID: ${id.slice(0, 8)}`,
        metadata: { scope, id },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Failed to delete memory: ${message}` };
    }
  }
}
