import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, isAbsolute, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class FileWriteTool implements Tool {
  readonly name = 'file_write';
  readonly description = 'Create or overwrite a file with the given content';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'file_write',
    description:
      'Write content to a file. Creates parent directories if they do not exist. ' +
      'Overwrites the file if it already exists.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute or relative path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
      },
      required: ['file_path', 'content'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string;
    const content = args.content as string;

    const absolutePath = isAbsolute(filePath) ? filePath : resolve(context.cwd, filePath);

    try {
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf-8');

      const lineCount = content.split('\n').length;
      return {
        success: true,
        output: `File written: ${absolutePath} (${lineCount} lines)`,
        metadata: { path: absolutePath, lineCount },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Failed to write file "${absolutePath}": ${message}` };
    }
  }
}
