import { glob } from 'glob';
import { resolve, isAbsolute } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class GlobTool implements Tool {
  readonly name = 'glob';
  readonly description = 'Find files matching a glob pattern';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'glob',
    description:
      'Find files matching a glob pattern. Supports patterns like "**/*.ts", "src/**/*.js", etc. ' +
      'Returns a list of matching file paths.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The glob pattern to match files against (e.g. "**/*.ts")',
        },
        path: {
          type: 'string',
          description: 'The directory to search in. Defaults to the current working directory.',
        },
      },
      required: ['pattern'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const pattern = args.pattern as string;
    const searchPath = args.path as string | undefined;

    const cwd = searchPath
      ? isAbsolute(searchPath)
        ? searchPath
        : resolve(context.cwd, searchPath)
      : context.cwd;

    try {
      const matches = await glob(pattern, {
        cwd,
        nodir: true,
        dot: false,
        absolute: true,
      });

      if (matches.length === 0) {
        return {
          success: true,
          output: `No files matched pattern "${pattern}" in ${cwd}`,
          metadata: { count: 0 },
        };
      }

      const sorted = matches.sort();
      return {
        success: true,
        output: sorted.join('\n'),
        metadata: { count: sorted.length },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Glob failed: ${message}` };
    }
  }
}
