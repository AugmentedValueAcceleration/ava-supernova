import { writeFile, mkdir, stat, readFile } from 'node:fs/promises';
import { dirname, basename, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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

    // Blind-clobber guard. If we're about to overwrite an existing file
    // that Ava has not read this session (file_read or file_edit), refuse
    // and tell the agent to read first. Common failure mode otherwise:
    // model "remembers" file contents from training data or an earlier
    // turn, decides to rewrite, silently discards content it never saw.
    // Especially bad for config files, lock files, .env files, migrations.
    //
    // The model self-corrects from this error — next turn calls file_read
    // and then comes back with a properly-informed write. No user friction
    // for the common case (new files, files the agent legitimately read);
    // hard stop only on the actual foot-gun pattern.
    if (isOverwrite) {
      const ss = context.sharedState as { readFiles?: Set<string> } | undefined;
      const hasRead = ss?.readFiles?.has(absolutePath) ?? false;
      if (!hasRead) {
        return {
          success: false,
          output: `file_write refused: "${relPath}" exists (${formatBytes(prevSize)}) but you have not read it this session. Call file_read on this path first to see the current contents, then file_write with the version you actually mean. This guard prevents blind-clobber regressions where remembered contents diverge from what's on disk.`,
        };
      }
    }

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

    // Compute pre-state for the audit log so a future incident can verify
    // exactly what changed. Cheap (sha256 over a small file is sub-ms);
    // only runs on overwrites since new-file writes have no "before" state.
    let sha256Before: string | undefined;
    if (isOverwrite) {
      try {
        const prev = await readFile(absolutePath);
        sha256Before = createHash('sha256').update(prev).digest('hex');
      } catch { /* unreadable — leave undefined */ }
    }
    let gitSha: string | undefined;
    try {
      gitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: context.cwd, timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'],
      }).toString().trim() || undefined;
    } catch { /* not a git repo or git unavailable */ }

    try {
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf-8');

      const sha256After = createHash('sha256').update(content, 'utf-8').digest('hex');

      if (emit) {
        emit(`\n✓ ${isOverwrite ? 'Updated' : 'Created'} ${relPath}\n`);
      }

      return {
        success: true,
        output: `File written: ${absolutePath} (${lineCount} lines, ${humanSize})`,
        metadata: {
          path: absolutePath, lineCount, bytes: byteSize, overwrite: isOverwrite,
          fileMutation: {
            path: absolutePath, gitSha,
            bytesBefore: isOverwrite ? prevSize : 0,
            bytesAfter: byteSize,
            sha256Before,
            sha256After,
          },
        },
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
