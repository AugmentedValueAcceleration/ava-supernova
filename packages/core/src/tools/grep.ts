import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { validateSearchPath } from './security.js';

const MAX_RESULTS = 200;
// Byte ceiling prevents pathological output from a handful of giant matching
// lines (e.g. minified bundles, embedded JSON). A hit on 200 normal lines is
// fine; a hit on 5 lines each 50KB long would blow context without it.
const MAX_OUTPUT_BYTES = 20_000;
// Per-line cap so a single huge match can't consume the whole budget.
const MAX_LINE_BYTES = 400;

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

    let cwd: string;
    try {
      cwd = validateSearchPath(searchPath, context.cwd);
    } catch (err) {
      return { success: false, output: (err as Error).message };
    }

    try {
      // Guard against ReDoS — reject overly complex patterns
      if (pattern.length > 500) {
        return { success: false, output: 'Regex pattern is too long (max 500 characters).' };
      }

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
      let truncReason = '';
      let runningBytes = 0;

      outer: for (const filePath of files) {
        if (results.length >= MAX_RESULTS) {
          truncated = true;
          truncReason = `${MAX_RESULTS} results`;
          break;
        }

        try {
          const content = await readFile(filePath, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (!regex.test(lines[i])) continue;
            // Trim each matching line so one monster line (minified bundle,
            // embedded JSON) can't drown everything else.
            const snippet = lines[i].length > MAX_LINE_BYTES
              ? lines[i].slice(0, MAX_LINE_BYTES) + '…[line truncated]'
              : lines[i];
            const entry = `${filePath}:${i + 1}: ${snippet}`;
            if (runningBytes + entry.length > MAX_OUTPUT_BYTES) {
              truncated = true;
              truncReason = `${Math.round(MAX_OUTPUT_BYTES / 1000)}KB output cap`;
              break outer;
            }
            results.push(entry);
            runningBytes += entry.length + 1; // +1 for the newline join
            if (results.length >= MAX_RESULTS) {
              truncated = true;
              truncReason = `${MAX_RESULTS} results`;
              break outer;
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
        output += `\n... (truncated at ${truncReason} — narrow the pattern or file_pattern for more precision)`;
      }

      return {
        success: true,
        output,
        metadata: { count: results.length, truncated, truncReason: truncated ? truncReason : undefined },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Grep failed: ${message}` };
    }
  }
}
