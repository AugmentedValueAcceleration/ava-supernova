import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { MemoryManager } from '../memory/memory-manager.js';

export class MemoryRecallTool implements Tool {
  readonly name = 'memory_recall';
  readonly description = 'Search persistent memory for specific information';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'memory_recall',
    description:
      'Search your saved memories by keyword. Use this when you need to find specific ' +
      'stored knowledge — user preferences, past decisions, project patterns. ' +
      'Memory is also shown in your system prompt, but this tool lets you search ' +
      'for specific entries when memory grows large.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text to search for in memories (case-insensitive substring match).',
        },
        scope: {
          type: 'string',
          enum: ['global', 'project', 'all'],
          description: 'Where to search: "global", "project", or "all" (default).',
        },
      },
      required: ['query'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const query = (args.query as string)?.trim();
    const scope = (args.scope as string) ?? 'all';

    if (!query) {
      return { success: false, output: 'Query is required.' };
    }

    const memoryManager = context.sharedState?.memoryManager as MemoryManager | undefined;
    if (!memoryManager) {
      return { success: false, output: 'Memory system is not available in this context.' };
    }

    const results: string[] = [];
    const lowerQuery = query.toLowerCase();

    if (scope === 'global' || scope === 'all') {
      const global = await memoryManager.loadGlobalMemory();
      if (global) {
        const matches = this.searchSections(global, lowerQuery);
        if (matches.length > 0) {
          results.push(`### Global Memory Matches\n${matches.join('\n\n')}`);
        }
      }
    }

    if (scope === 'project' || scope === 'all') {
      const project = await memoryManager.loadProjectMemory();
      if (project) {
        const matches = this.searchSections(project, lowerQuery);
        if (matches.length > 0) {
          results.push(`### Project Memory Matches\n${matches.join('\n\n')}`);
        }
      }
    }

    // If keyword search found nothing, try semantic search via platform
    if (results.length === 0) {
      const semanticResults = await memoryManager.loadRelevantMemories(query, 5);
      if (semanticResults.length > 0) {
        const items = semanticResults
          .map((m) => `- **${m.key}** (${m.scope}, ${Math.round(m.similarity * 100)}% match): ${m.content}`)
          .join('\n');
        return { success: true, output: `### Semantic Matches\n${items}` };
      }
      return { success: true, output: `No memories matching "${query}" found.` };
    }

    return { success: true, output: results.join('\n\n') };
  }

  /** Split memory by #### headers and return sections matching the query. */
  private searchSections(content: string, lowerQuery: string): string[] {
    // Split on #### headers (the timestamp entries memory_save creates)
    const sections = content.split(/(?=^####\s)/m);
    const matches: string[] = [];

    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) continue;
      if (trimmed.toLowerCase().includes(lowerQuery)) {
        matches.push(trimmed);
      }
    }

    // If no sections matched but the whole content matches (unstructured memory), return it
    if (matches.length === 0 && content.toLowerCase().includes(lowerQuery)) {
      return [content.trim()];
    }

    return matches;
  }
}
