import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { validatePath } from './security.js';

export class FileWriteTool implements Tool {
  readonly name = 'file_write';
  readonly description = 'Create or overwrite a file with the given content';
  readonly riskLevel: ToolRiskLevel = 'write';
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

  private static readonly MAX_WRITE_BYTES = 10 * 1024 * 1024; // 10 MB

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string;
    if (!filePath) {
      return { success: false, output: 'file_path is required and cannot be null. Provide the absolute or relative path to the file.' };
    }
    const content = args.content as string;

    // Guard against extremely large writes
    if (content && content.length > FileWriteTool.MAX_WRITE_BYTES) {
      return { success: false, output: `Content exceeds maximum write size of ${FileWriteTool.MAX_WRITE_BYTES / (1024 * 1024)} MB.` };
    }

    let absolutePath: string;
    try {
      absolutePath = validatePath(filePath, context.cwd);
    } catch (err) {
      return { success: false, output: (err as Error).message };
    }

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
