import { readFile, writeFile, stat } from 'node:fs/promises';
import { basename, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { validatePath } from './security.js';

const MAX_EDIT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_PREVIEW_LINES = 10;

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

    const emit = context.onOutput;
    const relPath = (() => {
      try { return relative(context.cwd, absolutePath) || basename(absolutePath); } catch { return absolutePath; }
    })();

    try {
      const fileStat = await stat(absolutePath);
      if (fileStat.size > MAX_EDIT_FILE_BYTES) {
        return { success: false, output: `File is ${Math.round(fileStat.size / (1024 * 1024))} MB — exceeds the ${MAX_EDIT_FILE_BYTES / (1024 * 1024)} MB edit limit.` };
      }

      const content = await readFile(absolutePath, 'utf-8');
      // Editing presumes reading — populate the same read-set file_read does
      // so a follow-up file_write on this path doesn't trip the blind-
      // clobber guard. Match exact-string requirement already prevents
      // blind edits, but tracking is for downstream tools.
      try {
        const ss = context.sharedState as { readFiles?: Set<string> } | undefined;
        if (ss) {
          if (!ss.readFiles) ss.readFiles = new Set<string>();
          ss.readFiles.add(absolutePath);
        }
      } catch { /* sharedState not available — non-fatal */ }
      const occurrences = content.split(oldString).length - 1;

      if (occurrences === 0) {
        if (emit) emit(`✗ old_string not found in ${relPath}\n`);
        return {
          success: false,
          output: `old_string not found in "${absolutePath}". Make sure the string matches exactly, including whitespace and indentation.`,
        };
      }

      if (!replaceAll && occurrences > 1) {
        if (emit) emit(`✗ old_string matched ${occurrences} times in ${relPath} — need more context or replace_all\n`);
        return {
          success: false,
          output: `old_string found ${occurrences} times in "${absolutePath}". Provide more context to make it unique, or set replace_all to true.`,
        };
      }

      if (emit) {
        const label = replaceAll && occurrences > 1
          ? `Editing ${relPath} · ${occurrences} occurrences`
          : `Editing ${relPath}`;
        emit(`${label}\n\n`);
        emitDiff(emit, oldString, newString);
      }

      const updated = replaceAll
        ? content.split(oldString).join(newString)
        : content.replace(oldString, newString);

      // Audit metadata: capture pre/post hashes + git SHA so a future
      // incident can verify what changed without parsing the truncated
      // result. content was just read above; the post-state is `updated`.
      const sha256Before = createHash('sha256').update(content, 'utf-8').digest('hex');
      const sha256After = createHash('sha256').update(updated, 'utf-8').digest('hex');
      let gitSha: string | undefined;
      try {
        gitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
          cwd: context.cwd, timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'],
        }).toString().trim() || undefined;
      } catch { /* not a git repo */ }

      await writeFile(absolutePath, updated, 'utf-8');

      if (emit) {
        emit(`\n✓ Replaced ${replaceAll ? `${occurrences} occurrences` : '1 occurrence'} in ${relPath}\n`);
      }

      return {
        success: true,
        output: `Edited ${absolutePath}: replaced ${replaceAll ? `all ${occurrences} occurrences` : '1 occurrence'}`,
        metadata: {
          path: absolutePath, occurrences, oldString, newString,
          fileMutation: {
            path: absolutePath, gitSha,
            bytesBefore: Buffer.byteLength(content, 'utf-8'),
            bytesAfter: Buffer.byteLength(updated, 'utf-8'),
            sha256Before, sha256After,
          },
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (emit) emit(`\n✗ Failed: ${message}\n`);
      return { success: false, output: `Failed to edit file "${absolutePath}": ${message}` };
    }
  }
}

function emitDiff(emit: (data: string) => void, oldString: string, newString: string): void {
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');

  const oldPreview = oldLines.slice(0, MAX_PREVIEW_LINES);
  for (const line of oldPreview) {
    emit(`- ${line}\n`);
  }
  if (oldLines.length > MAX_PREVIEW_LINES) {
    emit(`- … +${oldLines.length - MAX_PREVIEW_LINES} more lines\n`);
  }

  const newPreview = newLines.slice(0, MAX_PREVIEW_LINES);
  for (const line of newPreview) {
    emit(`+ ${line}\n`);
  }
  if (newLines.length > MAX_PREVIEW_LINES) {
    emit(`+ … +${newLines.length - MAX_PREVIEW_LINES} more lines\n`);
  }
}
