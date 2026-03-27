import { readFile, writeFile } from 'node:fs/promises';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { validatePath } from './security.js';

export class FileEditTool implements Tool {
  readonly name = 'file_edit';
  readonly description = 'Replace an exact string in a file with new content';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'file_edit',
    description:
      'Perform an exact string replacement in a file. The old_string must appear exactly once ' +
      'in the file (unless replace_all is true). Use this for precise edits to existing files.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute or relative path to the file to edit',
        },
        old_string: {
          type: 'string',
          description: 'The exact text to find and replace',
        },
        new_string: {
          type: 'string',
          description: 'The text to replace it with',
        },
        replace_all: {
          type: 'boolean',
          description: 'Replace all occurrences instead of requiring exactly one. Default: false',
        },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string;
    if (!filePath) {
      return { success: false, output: 'file_path is required and cannot be null. Provide the absolute or relative path to the file.' };
    }
    const oldString = args.old_string as string;
    const newString = args.new_string as string;
    const replaceAll = (args.replace_all as boolean) ?? false;

    let absolutePath: string;
    try {
      absolutePath = validatePath(filePath, context.cwd);
    } catch (err) {
      return { success: false, output: (err as Error).message };
    }

    try {
      const content = await readFile(absolutePath, 'utf-8');

      const occurrences = content.split(oldString).length - 1;

      if (occurrences === 0) {
        return {
          success: false,
          output: `old_string not found in "${absolutePath}". Make sure the string matches exactly, including whitespace and indentation.`,
        };
      }

      if (!replaceAll && occurrences > 1) {
        return {
          success: false,
          output: `old_string found ${occurrences} times in "${absolutePath}". Provide more context to make it unique, or set replace_all to true.`,
        };
      }

      const updated = replaceAll
        ? content.split(oldString).join(newString)
        : content.replace(oldString, newString);

      await writeFile(absolutePath, updated, 'utf-8');

      return {
        success: true,
        output: `Edited ${absolutePath}: replaced ${replaceAll ? `all ${occurrences} occurrences` : '1 occurrence'}`,
        metadata: { path: absolutePath, occurrences, oldString, newString },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Failed to edit file "${absolutePath}": ${message}` };
    }
  }
}
