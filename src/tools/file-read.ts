import { readFile } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class FileReadTool implements Tool {
  readonly name = 'file_read';
  readonly description = 'Read the contents of a file with line numbers';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'file_read',
    description:
      'Read a file from the filesystem. Returns the file contents with line numbers. ' +
      'Use offset and limit to read specific portions of large files.',
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
          description: 'Maximum number of lines to read. Default: 2000',
        },
      },
      required: ['file_path'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string;
    const offset = (args.offset as number) ?? 1;
    const limit = (args.limit as number) ?? 2000;

    const absolutePath = isAbsolute(filePath) ? filePath : resolve(context.cwd, filePath);

    try {
      const content = await readFile(absolutePath, 'utf-8');
      const lines = content.split('\n');
      const startIdx = Math.max(0, offset - 1);
      const endIdx = Math.min(lines.length, startIdx + limit);
      const selectedLines = lines.slice(startIdx, endIdx);

      const numbered = selectedLines
        .map((line, i) => `${String(startIdx + i + 1).padStart(6, ' ')}  ${line}`)
        .join('\n');

      return {
        success: true,
        output: numbered,
        metadata: {
          totalLines: lines.length,
          shownLines: selectedLines.length,
          path: absolutePath,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Failed to read file "${absolutePath}": ${message}` };
    }
  }
}
