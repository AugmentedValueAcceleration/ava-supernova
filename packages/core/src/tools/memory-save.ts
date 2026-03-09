import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { MemoryManager } from '../memory/memory-manager.js';

export class MemorySaveTool implements Tool {
  readonly name = 'memory_save';
  readonly description = 'Save information to persistent memory that survives across conversations';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'memory_save',
    description:
      'Save information to persistent memory. Memories survive across conversations and are ' +
      'injected into your system prompt at the start of each session. ' +
      'Use this to remember user preferences, project patterns, key decisions, and solutions. ' +
      'Two scopes: "global" (applies to all projects) and "project" (applies to current project only). ' +
      'Default mode is "append" — adds to existing memory. Use "replace" to overwrite entirely.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['global', 'project'],
          description:
            'Where to save: "global" saves to ~/.ava/memory.md (all projects), ' +
            '"project" saves to <projectRoot>/.ava/memory.md (this project only).',
        },
        content: {
          type: 'string',
          description:
            'Markdown content to save. For append mode, this is added to the end. ' +
            'For replace mode, this overwrites the entire memory file. ' +
            'Use clear, structured markdown — bullet points, headers, etc.',
        },
        mode: {
          type: 'string',
          enum: ['append', 'replace'],
          description: 'How to save: "append" adds to existing memory (default), "replace" overwrites entirely.',
        },
      },
      required: ['scope', 'content'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const scope = args.scope as 'global' | 'project';
    const content = args.content as string;
    const mode = (args.mode as string) ?? 'append';

    if (!scope || !content?.trim()) {
      return { success: false, output: 'Both scope and content are required.' };
    }

    if (scope !== 'global' && scope !== 'project') {
      return { success: false, output: 'Scope must be "global" or "project".' };
    }

    const memoryManager = context.sharedState?.memoryManager as MemoryManager | undefined;
    if (!memoryManager) {
      return { success: false, output: 'Memory system is not available in this context.' };
    }

    try {
      if (mode === 'replace') {
        if (scope === 'global') {
          await memoryManager.saveGlobalMemory(content);
        } else {
          await memoryManager.saveProjectMemory(content);
        }
      } else {
        // Append with timestamp
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const entry = `#### ${timestamp}\n${content}`;
        if (scope === 'global') {
          await memoryManager.appendGlobal(entry);
        } else {
          await memoryManager.appendProject(entry);
        }
      }

      const path = memoryManager.getPath(scope);
      return {
        success: true,
        output: `Memory saved (${scope}, ${mode}). File: ${path}`,
        metadata: { scope, mode, path },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Failed to save memory: ${message}` };
    }
  }
}
