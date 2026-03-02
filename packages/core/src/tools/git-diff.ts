import { execFile } from 'node:child_process';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const SHELL_METACHARACTERS = /[;&|`$(){}!<>\\]/;
const MAX_OUTPUT_LENGTH = 30_000;
const GIT_TIMEOUT_MS = 30_000;
const ALLOWED_MODES = new Set(['staged', 'unstaged', 'all', 'branch']);

export class GitDiffTool implements Tool {
  readonly name = 'git_diff';
  readonly description = 'Show formatted git diffs with structured modes (staged, unstaged, all, branch)';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'git_diff',
    description:
      'Show formatted diffs of git changes. Safer and more structured than raw bash git commands. ' +
      'Modes: staged (changes ready to commit), unstaged (working directory changes), ' +
      'all (everything vs HEAD), branch (compare current branch to another). ' +
      'Includes a status summary header for context.',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['staged', 'unstaged', 'all', 'branch'],
          description:
            'What to diff: staged (--cached), unstaged (working dir), all (HEAD), branch (compare branches)',
        },
        target: {
          type: 'string',
          description: 'For branch mode: the branch to compare against (e.g. "main"). Required for branch mode.',
        },
        stat_only: {
          type: 'boolean',
          description: 'Show summary (--stat) instead of full diff. Default: false.',
        },
        path_filter: {
          type: 'string',
          description: 'Filter diff to a specific file or directory path.',
        },
      },
      required: ['mode'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const mode = args.mode as string;
    const target = (args.target as string | undefined) ?? '';
    const statOnly = (args.stat_only as boolean | undefined) ?? false;
    const pathFilter = (args.path_filter as string | undefined) ?? '';

    if (!ALLOWED_MODES.has(mode)) {
      return {
        success: false,
        output: `Invalid mode "${mode}". Use one of: ${[...ALLOWED_MODES].join(', ')}`,
      };
    }

    if (mode === 'branch' && !target) {
      return {
        success: false,
        output: 'Branch mode requires a "target" parameter (e.g. "main").',
      };
    }

    // Validate target and path_filter against shell injection
    if (target && SHELL_METACHARACTERS.test(target)) {
      return { success: false, output: 'Target branch contains disallowed characters.' };
    }
    if (target && /\s/.test(target)) {
      return { success: false, output: 'Target branch must not contain whitespace.' };
    }
    if (pathFilter && SHELL_METACHARACTERS.test(pathFilter)) {
      return { success: false, output: 'Path filter contains disallowed characters.' };
    }

    // Build git diff args
    const diffArgs: string[] = ['diff'];
    switch (mode) {
      case 'staged':   diffArgs.push('--cached'); break;
      case 'unstaged':  break; // plain git diff
      case 'all':      diffArgs.push('HEAD'); break;
      case 'branch':   diffArgs.push(`${target}...HEAD`); break;
    }
    if (statOnly) diffArgs.push('--stat');
    if (pathFilter) { diffArgs.push('--'); diffArgs.push(pathFilter); }

    // Get status summary first for context
    const statusOutput = await this.runGit(['status', '--porcelain', '--short'], context.cwd);
    const diffOutput = await this.runGit(diffArgs, context.cwd);

    if (!statusOutput.success && !diffOutput.success) {
      return diffOutput; // Return the diff error (likely not a git repo)
    }

    let output = '';
    if (statusOutput.success && statusOutput.output.trim()) {
      output += `--- Status ---\n${statusOutput.output.trim()}\n\n`;
    }
    output += `--- Diff (${mode}${mode === 'branch' ? ` vs ${target}` : ''}) ---\n`;
    output += diffOutput.output.trim() || '(no changes)';

    if (output.length > MAX_OUTPUT_LENGTH) {
      output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
    }

    return {
      success: diffOutput.success,
      output,
      metadata: { mode, target: target || undefined, stat_only: statOnly },
    };
  }

  private runGit(args: string[], cwd: string): Promise<ToolResult> {
    return new Promise((resolve) => {
      execFile(
        'git',
        args,
        { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 10 },
        (error, stdout, stderr) => {
          let output = '';
          if (stdout) output += stdout;
          if (stderr) output += (output ? '\n' : '') + stderr;

          if (error && error.killed) {
            output += `\nCommand timed out after ${GIT_TIMEOUT_MS}ms`;
          }
          if (error && !output) {
            const errCode = (error as NodeJS.ErrnoException).code;
            if (errCode === 'ENOENT') {
              output = 'Git not found. Ensure git is installed and in your PATH.';
            } else {
              output = `git ${args[0]} failed (exit code ${errCode ?? 'unknown'})`;
            }
          }

          resolve({ success: !error, output: output || '(no output)' });
        },
      );
    });
  }
}
