import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import type { MemoryCategory } from '../memory/types.js';
import { MEMORY_CATEGORIES } from '../memory/types.js';
import { containsCredentials } from './security.js';

export class MemorySaveTool implements Tool {
  readonly name = 'memory_save';
  readonly description = 'Save information to persistent memory that survives across conversations. Use for: user preferences, project decisions, code patterns, architecture notes, bug-fix context. Categories: preference, pattern, architecture, bug-fix, convention, decision, general. Different from journal (daily reflection) and task_manage (action items).';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'memory_save',
    description:
      'Save information to persistent, categorized memory. Memories survive across conversations and are ' +
      'injected into your system prompt at the start of each session. ' +
      'Use this to remember user preferences, project patterns, key decisions, bug fixes, and solutions. ' +
      'Two scopes: "global" (applies to all projects) and "project" (applies to current project only). ' +
      'Memories are automatically categorized and deduplicated — if you save something similar to an existing memory, ' +
      'it will be updated instead of duplicated. ' +
      'NEVER save API keys, passwords, tokens, or any credentials to memory.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['global', 'project'],
          description:
            'Where to save: "global" saves to ~/.ava/ (all projects), ' +
            '"project" saves to <projectRoot>/.ava/ (this project only).',
        },
        content: {
          type: 'string',
          description:
            'The memory content to save (markdown). Be clear and structured. ' +
            'If this is similar to an existing memory, it will be merged/updated automatically.',
        },
        category: {
          type: 'string',
          enum: MEMORY_CATEGORIES,
          description:
            'Category for this memory. Helps with organization and retrieval. ' +
            'Options: pattern (coding patterns), preference (user preferences), ' +
            'architecture (project structure), bug-fix (issues/fixes), ' +
            'convention (naming/style rules), tool-config (environment setup), ' +
            'decision (key decisions), person (people/roles), general (catch-all). ' +
            'If omitted, category is inferred from content.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for additional filtering (e.g. ["auth", "api", "react"]).',
        },
        branch: {
          type: 'string',
          description: 'Scope this memory to a specific git branch. Useful for experimental work that should not pollute other branches. Omit for all-branch memories.',
        },
      },
      required: ['scope', 'content'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const scope = args.scope as 'global' | 'project';
    const content = args.content as string;
    const category = args.category as MemoryCategory | undefined;
    const tags = args.tags as string[] | undefined;
    const branch = args.branch as string | undefined;

    if (!scope || !content?.trim()) {
      return { success: false, output: 'Both scope and content are required.' };
    }

    if (scope !== 'global' && scope !== 'project') {
      return { success: false, output: 'Scope must be "global" or "project".' };
    }

    if (category && !MEMORY_CATEGORIES.includes(category)) {
      return { success: false, output: `Invalid category. Must be one of: ${MEMORY_CATEGORIES.join(', ')}` };
    }

    // Block saving of credentials/secrets
    if (containsCredentials(content)) {
      return {
        success: false,
        output: 'Blocked: content appears to contain API keys, tokens, or credentials. ' +
          'Store credentials in environment variables or a secure vault instead.',
      };
    }

    const memoryManager = context.sharedState?.memoryManager as MemoryManager | undefined;
    if (!memoryManager) {
      return { success: false, output: 'Memory system is not available in this context.' };
    }

    try {
      const entry = await memoryManager.saveEntry({
        scope,
        content: content.trim(),
        category,
        tags,
        branch: branch ?? null,
        sourceConversationId: context.conversationId,
      });

      const path = memoryManager.getPath(scope);
      const wasUpdated = entry.createdAt !== entry.updatedAt;

      return {
        success: true,
        output: wasUpdated
          ? `Memory updated (${scope}, ${entry.category}). Merged with existing similar entry. File: ${path}`
          : `Memory saved (${scope}, ${entry.category}). ID: ${entry.id.slice(0, 8)}. File: ${path}`,
        metadata: { scope, category: entry.category, id: entry.id, wasUpdated, path },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Failed to save memory: ${message}` };
    }
  }
}
