import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import type { MemoryCategory } from '../memory/types.js';
import { MEMORY_CATEGORIES } from '../memory/types.js';

export class MemoryUpdateTool implements Tool {
  readonly name = 'memory_update';
  readonly description = 'Update an existing memory entry by ID';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'memory_update',
    description:
      'Update an existing memory entry. Use this when information has changed and you need to correct ' +
      'or expand a specific memory. Use memory_recall first to find the entry ID, then update it here. ' +
      'You can change the content, category, or tags.',
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
          description: 'The ID of the memory entry to update (from memory_recall results).',
        },
        content: {
          type: 'string',
          description: 'New content to replace the existing content (optional).',
        },
        category: {
          type: 'string',
          enum: MEMORY_CATEGORIES,
          description: 'New category for this entry (optional).',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'New tags for this entry (optional, replaces existing tags).',
        },
      },
      required: ['scope', 'id'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const scope = args.scope as 'global' | 'project';
    const id = args.id as string;
    const content = args.content as string | undefined;
    const category = args.category as MemoryCategory | undefined;
    const tags = args.tags as string[] | undefined;

    if (!scope || !id) {
      return { success: false, output: 'Both scope and id are required.' };
    }

    if (category && !MEMORY_CATEGORIES.includes(category)) {
      return { success: false, output: `Invalid category. Must be one of: ${MEMORY_CATEGORIES.join(', ')}` };
    }

    if (!content && !category && !tags) {
      return { success: false, output: 'At least one of content, category, or tags must be provided.' };
    }

    const memoryManager = context.sharedState?.memoryManager as MemoryManager | undefined;
    if (!memoryManager) {
      return { success: false, output: 'Memory system is not available in this context.' };
    }

    try {
      const updated = await memoryManager.updateEntry(scope, id, {
        ...(content !== undefined ? { content } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(tags !== undefined ? { tags } : {}),
      });

      if (!updated) {
        return { success: false, output: `No memory entry found with ID "${id}" in ${scope} scope.` };
      }

      return {
        success: true,
        output: `Memory updated (${scope}, ${updated.category}). ID: ${updated.id.slice(0, 8)}`,
        metadata: { scope, id: updated.id, category: updated.category },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Failed to update memory: ${message}` };
    }
  }
}
