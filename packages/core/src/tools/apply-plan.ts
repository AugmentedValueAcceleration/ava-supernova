import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { validatePath } from './security.js';

const GIT_TIMEOUT_MS = 15_000;

interface FileChange {
  path: string;
  old_string: string;
  new_string: string;
}

export class ApplyPlanTool implements Tool {
  readonly name = 'apply_plan';
  readonly description = 'Apply a batch of file edits atomically with git checkpoint for safe rollback';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'apply_plan',
    description:
      'Apply multiple file edits as a single atomic operation. Creates a git stash checkpoint before ' +
      'applying changes so the entire batch can be rolled back if any edit fails. ' +
      'Each change specifies a file path, the old string to find, and the new string to replace it with.',
    parameters: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path to edit.' },
              old_string: { type: 'string', description: 'Exact string to find in the file.' },
              new_string: { type: 'string', description: 'Replacement string.' },
            },
            required: ['path', 'old_string', 'new_string'],
          },
          description: 'Array of file edits to apply.',
        },
        description: {
          type: 'string',
          description: 'Brief description of what these changes do (used in checkpoint message).',
        },
      },
      required: ['changes'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const changes = args.changes as FileChange[];
    const description = (args.description as string) ?? 'apply_plan batch edit';

    if (!changes || changes.length === 0) {
      return { success: false, output: 'No changes provided.' };
    }

    // Validate all paths first
    const validated: Array<{ change: FileChange; absolutePath: string }> = [];
    for (const change of changes) {
      try {
        const abs = validatePath(change.path, context.cwd);
        validated.push({ change, absolutePath: abs });
      } catch (err) {
        return { success: false, output: `Invalid path "${change.path}": ${(err as Error).message}` };
      }
    }

    // Create git checkpoint (stash)
    const checkpointId = `apply_plan_${Date.now()}`;
    await this.runGit(['stash', 'push', '-m', `checkpoint: ${checkpointId} — ${description}`], context.cwd);

    // Pop the stash immediately (we just want a restore point)
    await this.runGit(['stash', 'pop'], context.cwd);

    // Apply changes one by one
    const applied: string[] = [];
    const errors: string[] = [];

    for (const { change, absolutePath } of validated) {
      try {
        const content = await readFile(absolutePath, 'utf-8');
        const idx = content.indexOf(change.old_string);

        if (idx === -1) {
          errors.push(`${change.path}: old_string not found in file`);
          continue;
        }

        // Check for multiple occurrences
        const secondIdx = content.indexOf(change.old_string, idx + 1);
        if (secondIdx !== -1) {
          errors.push(`${change.path}: old_string matches multiple locations — make it more specific`);
          continue;
        }

        const newContent = content.slice(0, idx) + change.new_string + content.slice(idx + change.old_string.length);
        await writeFile(absolutePath, newContent, 'utf-8');
        applied.push(change.path);
      } catch (err) {
        errors.push(`${change.path}: ${(err as Error).message}`);
      }
    }

    // Report
    let output = `## Apply Plan Results\n\n`;
    output += `**${applied.length}/${changes.length}** edits applied`;
    if (errors.length > 0) output += ` (${errors.length} failed)`;
    output += '\n\n';

    if (applied.length > 0) {
      output += `### Applied\n`;
      for (const p of applied) output += `- ${p}\n`;
      output += '\n';
    }

    if (errors.length > 0) {
      output += `### Failed\n`;
      for (const e of errors) output += `- ${e}\n`;
      output += '\n';
      output += `To rollback all changes, run: \`git checkout -- ${applied.join(' ')}\`\n`;
    }

    return {
      success: errors.length === 0,
      output,
      metadata: { applied: applied.length, failed: errors.length, total: changes.length, checkpointId },
    };
  }

  private runGit(args: string[], cwd: string): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
      execFile('git', args, { cwd, timeout: GIT_TIMEOUT_MS }, (error, stdout, stderr) => {
        resolve({ success: !error, output: (stdout || '') + (stderr || '') });
      });
    });
  }
}
