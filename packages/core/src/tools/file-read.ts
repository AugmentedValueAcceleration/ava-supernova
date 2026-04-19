import { readFile } from 'node:fs/promises';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { validatePath } from './security.js';

export class FileReadTool implements Tool {
  readonly name = 'file_read';
  readonly description = 'Read the contents of a file with line numbers';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'file_read',
    description:
      'Read a file from the filesystem. Returns the file contents with line numbers. ' +
      'Default limit is 500 lines — raise it explicitly with `limit` if you genuinely need more, ' +
      'or use `offset` to page through large files.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute or relative path to the file to read',
        },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (1-based). Default: 1',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read. Default: 500. Set higher only when you need more.',
        },
      },
      required: ['file_path'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string;
    const offset = (args.offset as number) ?? 1;
    // Default dropped from 2000 → 500 lines. Most reads want a specific
    // region; the old default was wide enough to routinely pull 8K+ tokens
    // of file content the model didn't end up needing. Callers can still
    // pass limit:2000 explicitly when the whole file is warranted.
    const limit = (args.limit as number) ?? 500;

    let absolutePath: string;
    try {
      absolutePath = validatePath(filePath, context.cwd);
    } catch (err) {
      return { success: false, output: (err as Error).message };
    }

    try {
      const content = await readFile(absolutePath, 'utf-8');
      const lines = content.split('\n');
      const startIdx = Math.max(0, offset - 1);
      const endIdx = Math.min(lines.length, startIdx + limit);
      const selectedLines = lines.slice(startIdx, endIdx);

      const numbered = selectedLines
        .map((line, i) => `${String(startIdx + i + 1).padStart(6, ' ')}  ${line}`)
        .join('\n');

      // When the returned slice isn't the whole file, tell the model
      // explicitly so it knows to re-call with an offset if it needs more.
      // Quieter than leaving the caller to compare metadata counts.
      const shownEnd = startIdx + selectedLines.length;
      const hasMore = shownEnd < lines.length;
      const output = hasMore
        ? `${numbered}\n\n[file_read: showing lines ${startIdx + 1}–${shownEnd} of ${lines.length}. Call again with offset:${shownEnd + 1} for more.]`
        : numbered;

      return {
        success: true,
        output,
        metadata: {
          totalLines: lines.length,
          shownLines: selectedLines.length,
          path: absolutePath,
          truncated: hasMore,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Failed to read file "${absolutePath}": ${message}` };
    }
  }
}
