import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import type { MemoryAgent } from '../memory/memory-agent.js';
import type { MemoryCategory } from '../memory/types.js';
import { MEMORY_CATEGORIES } from '../memory/types.js';

export class MemoryRecallTool implements Tool {
  readonly name = 'memory_recall';
  readonly description = 'Search persistent memory for information from past conversations. Use natural language queries — the memory system uses semantic search. Ask about user preferences, past decisions, project context, patterns, or anything previously saved with memory_save.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'memory_recall',
    description:
      'Ask the memory agent for detailed recall on a specific topic. ' +
      'The memory brief in your context shows what\'s available — use this tool when ' +
      'you need deeper detail on a topic listed there, or to search for something ' +
      'not in the brief. Falls back to direct TF-IDF search if the memory agent is unavailable.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text to search for in memories. TF-IDF ranking finds relevant results even without exact substring matches.',
        },
        scope: {
          type: 'string',
          enum: ['global', 'project', 'all', 'all_projects'],
          description: 'Where to search: "global", "project", "all" (global+current project, default), or "all_projects" (searches every project you\'ve worked in — use when looking for patterns or solutions from other projects).',
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
        include_archived: {
          type: 'boolean',
          description: 'Include archived (stale) entries in results. Default: false.',
        },
      },
      required: ['query'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const query = (args.query as string)?.trim();
    const scope = (args.scope as 'global' | 'project' | 'all' | 'all_projects') ?? 'all';
    const category = args.category as MemoryCategory | undefined;
    const limit = (args.limit as number) ?? 10;
    const includeArchived = (args.include_archived as boolean) ?? false;

    if (!query) {
      return { success: false, output: 'Query is required.' };
    }

    if (category && !MEMORY_CATEGORIES.includes(category)) {
      return { success: false, output: `Invalid category. Must be one of: ${MEMORY_CATEGORIES.join(', ')}` };
    }

    // Try Memory Agent first (curated, intelligent recall)
    const memoryAgent = context.sharedState?.memoryAgent as MemoryAgent | undefined;
    if (memoryAgent) {
      try {
        const result = await memoryAgent.deepRecall(query, query);
        return { success: true, output: result, metadata: { source: 'memory-agent', query, scope } };
      } catch {
        // Fall through to direct TF-IDF recall
      }
    }

    // Direct TF-IDF recall (fallback when Memory Agent unavailable)
    const memoryManager = context.sharedState?.memoryManager as MemoryManager | undefined;
    if (!memoryManager) {
      return { success: false, output: 'Memory system is not available in this context.' };
    }

    try {
      const results = await memoryManager.recall({ query, scope, category, limit, includeArchived });

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
        const score = `${Math.round(r.relevance * 100)}%`;
        const archived = e.archived ? ' 📦 archived' : '';
        const branch = e.branch ? ` [${e.branch}]` : '';
        const matchLabel = r.matchType === 'tfidf' ? 'TF-IDF' : r.matchType;

        return `**${i + 1}. [${e.category}]** (${r.scope}, ${date}${recalls}) — ${score} relevance (${matchLabel})${tags}${branch}${archived}\n${e.content}`;
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
