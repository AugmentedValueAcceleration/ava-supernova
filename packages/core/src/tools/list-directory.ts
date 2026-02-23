import { readdir, stat } from 'node:fs/promises';
import { resolve, isAbsolute, join } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const MAX_ENTRIES = 200;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class ListDirectoryTool implements Tool {
  readonly name = 'list_directory';
  readonly description = 'List the contents of a directory with file types and sizes';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'list_directory',
    description:
      'List the contents of a directory, showing file names, types (file/directory), and sizes. ' +
      'Returns directories first (marked with /), then files with their sizes. ' +
      'Use this to quickly explore project structure.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The directory path to list. Can be absolute or relative to the working directory.',
        },
      },
      required: ['path'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const rawPath = args.path as string;
    const dirPath = isAbsolute(rawPath) ? rawPath : resolve(context.cwd, rawPath);

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      const dirs: string[] = [];
      const files: Array<{ name: string; size: string }> = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          dirs.push(entry.name);
        } else {
          try {
            const info = await stat(join(dirPath, entry.name));
            files.push({ name: entry.name, size: formatSize(info.size) });
          } catch {
            files.push({ name: entry.name, size: '?' });
          }
        }
      }

      dirs.sort((a, b) => a.localeCompare(b));
      files.sort((a, b) => a.name.localeCompare(b.name));

      const totalCount = dirs.length + files.length;

      if (totalCount === 0) {
        return {
          success: true,
          output: `Directory "${dirPath}" is empty.`,
          metadata: { count: 0 },
        };
      }

      const lines: string[] = [];

      const dirSlice = dirs.slice(0, MAX_ENTRIES);
      for (const d of dirSlice) {
        lines.push(`${d}/`);
      }

      const remaining = MAX_ENTRIES - dirSlice.length;
      const fileSlice = files.slice(0, Math.max(0, remaining));
      for (const f of fileSlice) {
        lines.push(`${f.name}  (${f.size})`);
      }

      if (totalCount > MAX_ENTRIES) {
        lines.push(`\n... and ${totalCount - MAX_ENTRIES} more entries (${totalCount} total)`);
      }

      return {
        success: true,
        output: lines.join('\n'),
        metadata: { count: totalCount, directories: dirs.length, files: files.length },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Failed to list directory: ${message}` };
    }
  }
}
