import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import { resolve, isAbsolute } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const MAX_RESULTS = 200;

export class GrepTool implements Tool {
  readonly name = 'grep';
  readonly description = 'Search file contents using regex patterns';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'grep',
    description:
      'Search for a regex pattern in file contents. Returns matching lines with file paths ' +
      'and line numbers. Optionally filter by file glob pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The regex pattern to search for',
        },
        path: {
          type: 'string',
          description: 'Directory to search in. Defaults to the current working directory.',
        },
        file_pattern: {
          type: 'string',
          description: 'Glob pattern to filter which files to search (e.g. "*.ts", "**/*.js")',
        },
        case_insensitive: {
          type: 'boolean',
          description: 'Case insensitive search. Default: false',
        },
      },
      required: ['pattern'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const pattern = args.pattern as string;
    const searchPath = args.path as string | undefined;
    const filePattern = (args.file_pattern as string) ?? '**/*';
    const caseInsensitive = (args.case_insensitive as boolean) ?? false;

    const cwd = searchPath
      ? isAbsolute(searchPath)
        ? searchPath
        : resolve(context.cwd, searchPath)
      : context.cwd;

    try {
      const regex = new RegExp(pattern, caseInsensitive ? 'i' : '');

      const files = await glob(filePattern, {
        cwd,
        nodir: true,
        dot: false,
        absolute: true,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
      });

      const results: string[] = [];
      let truncated = false;

      for (const filePath of files) {
        if (results.length >= MAX_RESULTS) {
          truncated = true;
          break;
        }

        try {
          const content = await readFile(filePath, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push(`${filePath}:${i + 1}: ${lines[i]}`);
              if (results.length >= MAX_RESULTS) {
                truncated = true;
                break;
              }
            }
          }
        } catch {
          // Skip binary or unreadable files
        }
      }

      if (results.length === 0) {
        return {
          success: true,
          output: `No matches found for pattern "${pattern}"`,
          metadata: { count: 0 },
        };
      }

      let output = results.join('\n');
      if (truncated) {
        output += `\n... (truncated at ${MAX_RESULTS} results)`;
      }

      return {
        success: true,
        output,
        metadata: { count: results.length, truncated },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Grep failed: ${message}` };
    }
  }
}
