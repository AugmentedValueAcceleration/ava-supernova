import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import type { MemoryCategory } from '../memory/types.js';
import { MEMORY_CATEGORIES } from '../memory/types.js';

export class MemoryRecallTool implements Tool {
  readonly name = 'memory_recall';
  readonly description = 'Search persistent memory for specific information';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'memory_recall',
    description:
      'Search your saved memories by keyword, with optional category filtering. ' +
      'Use this when you need to find specific stored knowledge — user preferences, ' +
      'past decisions, project patterns, bug fixes. ' +
      'Results show category, relevance, and when the memory was last updated. ' +
      'Memory is also shown in your system prompt, but this tool lets you search ' +
      'for specific entries when memory grows large.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text to search for in memories (case-insensitive). Searches content and tags.',
        },
        scope: {
          type: 'string',
          enum: ['global', 'project', 'all'],
          description: 'Where to search: "global", "project", or "all" (default).',
        },
        category: {
          type: 'string',
          enum: MEMORY_CATEGORIES,
          description: 'Filter results to a specific category (optional).',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10).',
        },
      },
      required: ['query'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const query = (args.query as string)?.trim();
    const scope = (args.scope as 'global' | 'project' | 'all') ?? 'all';
    const category = args.category as MemoryCategory | undefined;
    const limit = (args.limit as number) ?? 10;

    if (!query) {
      return { success: false, output: 'Query is required.' };
    }

    if (category && !MEMORY_CATEGORIES.includes(category)) {
      return { success: false, output: `Invalid category. Must be one of: ${MEMORY_CATEGORIES.join(', ')}` };
    }

    const memoryManager = context.sharedState?.memoryManager as MemoryManager | undefined;
    if (!memoryManager) {
      return { success: false, output: 'Memory system is not available in this context.' };
    }

    try {
      const results = await memoryManager.recall({ query, scope, category, limit });

      if (results.length === 0) {
        return {
          success: true,
          output: `No memories matching "${query}"${category ? ` in category "${category}"` : ''} found.`,
        };
      }

      const formatted = results.map((r, i) => {
        const e = r.entry;
        const date = e.updatedAt ? e.updatedAt.split('T')[0] : 'unknown';
        const recalls = e.recallCount > 0 ? `, recalled ${e.recallCount}x` : '';
        const tags = e.tags?.length ? ` [${e.tags.join(', ')}]` : '';
        const matchInfo = r.matchType === 'semantic' ? ` (${Math.round(r.relevance * 100)}% match)` : '';

        return `**${i + 1}. [${e.category}]** (${r.scope}, ${date}${recalls})${matchInfo}${tags}\n${e.content}`;
      }).join('\n\n---\n\n');

      return {
        success: true,
        output: `Found ${results.length} memor${results.length === 1 ? 'y' : 'ies'}:\n\n${formatted}`,
        metadata: { count: results.length, query, scope, category },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Failed to search memory: ${message}` };
    }
  }
}
