import { writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, basename, relative } from 'node:path';
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
  private static readonly PREVIEW_LINES = 8;

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string;
    if (!filePath) {
      return { success: false, output: 'file_path is required and cannot be null. Provide the absolute or relative path to the file.' };
    }
    const content = (args.content as string) ?? '';

    if (content.length > FileWriteTool.MAX_WRITE_BYTES) {
      return { success: false, output: `Content exceeds maximum write size of ${FileWriteTool.MAX_WRITE_BYTES / (1024 * 1024)} MB.` };
    }

    let absolutePath: string;
    try {
      absolutePath = validatePath(filePath, context.cwd);
    } catch (err) {
      return { success: false, output: (err as Error).message };
    }

    const emit = context.onOutput;
    const relPath = (() => {
      try { return relative(context.cwd, absolutePath) || basename(absolutePath); } catch { return absolutePath; }
    })();

    let isOverwrite = false;
    let prevSize = 0;
    try {
      const existing = await stat(absolutePath);
      if (existing.isFile()) {
        isOverwrite = true;
        prevSize = existing.size;
      }
    } catch { /* file doesn't exist — create */ }

    const lines = content.split('\n');
    const lineCount = lines.length;
    const byteSize = Buffer.byteLength(content, 'utf-8');
    const humanSize = formatBytes(byteSize);

    if (emit) {
      const verb = isOverwrite ? 'Overwriting' : 'Creating';
      emit(`${verb} ${relPath}\n`);
      emit(`${lineCount} ${lineCount === 1 ? 'line' : 'lines'} · ${humanSize}`);
      if (isOverwrite && prevSize > 0) {
        emit(` (was ${formatBytes(prevSize)})`);
      }
      emit('\n\n');
      const previewLines = lines.slice(0, FileWriteTool.PREVIEW_LINES);
      for (const line of previewLines) {
        emit(`  ${line}\n`);
      }
      if (lineCount > FileWriteTool.PREVIEW_LINES) {
        emit(`  … +${lineCount - FileWriteTool.PREVIEW_LINES} more lines\n`);
      }
    }

    try {
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf-8');

      if (emit) {
        emit(`\n✓ ${isOverwrite ? 'Updated' : 'Created'} ${relPath}\n`);
      }

      return {
        success: true,
        output: `File written: ${absolutePath} (${lineCount} lines, ${humanSize})`,
        metadata: { path: absolutePath, lineCount, bytes: byteSize, overwrite: isOverwrite },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (emit) emit(`\n✗ Failed: ${message}\n`);
      return { success: false, output: `Failed to write file "${absolutePath}": ${message}` };
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
