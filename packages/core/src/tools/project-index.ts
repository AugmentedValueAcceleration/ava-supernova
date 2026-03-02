import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { ProjectIndexer } from '../indexer/project-indexer.js';

const ALLOWED_ACTIONS = new Set(['scan', 'refresh', 'show']);

export class ProjectIndexTool implements Tool {
  readonly name = 'project_index';
  readonly description = 'Scan, refresh, or display the project structure index';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'project_index',
    description:
      'Scan, refresh, or display the project structure index. ' +
      'The index provides a bird\'s-eye view of the codebase: frameworks, ' +
      'languages, entry points, test setup, and directory structure. ' +
      'Run "scan" the first time to build the index. Use "show" to view it. ' +
      'Use "refresh" to re-scan if the project has changed.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['scan', 'refresh', 'show'],
          description:
            '"scan" builds the index from scratch (first time or full rescan). ' +
            '"refresh" re-scans only if the index is stale (>1 hour old). ' +
            '"show" displays the current cached index summary.',
        },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const action = args.action as string;

    if (!ALLOWED_ACTIONS.has(action)) {
      return {
        success: false,
        output: `Invalid action "${action}". Use one of: ${[...ALLOWED_ACTIONS].join(', ')}`,
      };
    }

    const indexer = context.sharedState?.projectIndexer as ProjectIndexer | undefined;
    if (!indexer) {
      return { success: false, output: 'Project indexer is not available in this context.' };
    }

    try {
      switch (action) {
        case 'scan': {
          const index = await indexer.scan();
          const summary = indexer.summarize();
          return {
            success: true,
            output: `Project indexed successfully (${index.languages.reduce((n, l) => n + l.files, 0)} source files).\n\n${summary}`,
            metadata: {
              fileCount: index.languages.reduce((n, l) => n + l.files, 0),
              framework: index.framework.name,
              packageManager: index.packageManager,
            },
          };
        }

        case 'refresh': {
          if (!indexer.isStale()) {
            const summary = indexer.summarize();
            return {
              success: true,
              output: `Index is fresh (less than 1 hour old). No rescan needed.\n\n${summary}`,
            };
          }
          const index = await indexer.scan();
          const summary = indexer.summarize();
          return {
            success: true,
            output: `Index refreshed (${index.languages.reduce((n, l) => n + l.files, 0)} source files).\n\n${summary}`,
          };
        }

        case 'show': {
          // Try to load from disk if not in memory
          if (!indexer.getIndex()) {
            await indexer.load();
          }
          const summary = indexer.summarize();
          return { success: true, output: summary };
        }

        default:
          return { success: false, output: `Unknown action: ${action}` };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Project index failed: ${message}` };
    }
  }
}
