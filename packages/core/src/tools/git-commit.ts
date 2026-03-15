import { execFile } from 'node:child_process';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const GIT_TIMEOUT_MS = 30_000;
const MAX_DIFF_LENGTH = 20_000;

export class GitCommitTool implements Tool {
  readonly name = 'git_commit';
  readonly description = 'Stage and commit changes with an auto-generated or custom commit message';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'git_commit',
    description:
      'Stage and commit git changes. If no message is provided, generates one from the staged diff. ' +
      'Use stage_all to stage all modified/deleted files before committing. ' +
      'The generated message summarizes the changes concisely.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Custom commit message. If omitted, one is generated from the diff.',
        },
        stage_all: {
          type: 'boolean',
          description: 'Run "git add -A" before committing. Default: false.',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific files to stage before committing. Ignored if stage_all is true.',
        },
        amend: {
          type: 'boolean',
          description: 'Amend the previous commit instead of creating a new one. Default: false.',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const message = args.message as string | undefined;
    const stageAll = (args.stage_all as boolean) ?? false;
    const files = (args.files as string[]) ?? [];
    const amend = (args.amend as boolean) ?? false;

    // Stage files if requested
    if (stageAll) {
      const stageResult = await this.runGit(['add', '-A'], context.cwd);
      if (!stageResult.success) {
        return { success: false, output: `Failed to stage files: ${stageResult.output}` };
      }
    } else if (files.length > 0) {
      const stageResult = await this.runGit(['add', ...files], context.cwd);
      if (!stageResult.success) {
        return { success: false, output: `Failed to stage files: ${stageResult.output}` };
      }
    }

    // Check if there's anything to commit
    const statusResult = await this.runGit(['diff', '--cached', '--stat'], context.cwd);
    if (statusResult.success && !statusResult.output.trim()) {
      return { success: false, output: 'Nothing staged to commit. Use stage_all or files to stage changes first.' };
    }

    // Get diff for message generation
    let commitMessage = message;
    if (!commitMessage) {
      const diffResult = await this.runGit(['diff', '--cached'], context.cwd);
      const diff = diffResult.output.length > MAX_DIFF_LENGTH
        ? diffResult.output.slice(0, MAX_DIFF_LENGTH) + '\n... (truncated)'
        : diffResult.output;

      // Generate message from diff summary
      const statResult = await this.runGit(['diff', '--cached', '--stat'], context.cwd);
      commitMessage = this.generateMessage(statResult.output, diff);
    }

    // Commit
    const commitArgs = ['commit', '-m', commitMessage];
    if (amend) commitArgs.push('--amend');

    const commitResult = await this.runGit(commitArgs, context.cwd);
    if (!commitResult.success) {
      return { success: false, output: `Commit failed: ${commitResult.output}` };
    }

    // Get the commit hash
    const hashResult = await this.runGit(['rev-parse', '--short', 'HEAD'], context.cwd);
    const hash = hashResult.output.trim();

    return {
      success: true,
      output: `Committed ${hash}: ${commitMessage}\n\n${commitResult.output}`,
      metadata: { hash, message: commitMessage, amend },
    };
  }

  private generateMessage(stat: string, _diff: string): string {
    // Parse stat for a summary
    const lines = stat.trim().split('\n');
    const summary = lines[lines.length - 1]?.trim() || '';
    const fileChanges = lines.slice(0, -1).map(l => {
      const match = l.trim().match(/^(.+?)\s+\|/);
      return match?.[1]?.trim();
    }).filter(Boolean);

    if (fileChanges.length === 0) return 'Update files';
    if (fileChanges.length === 1) return `Update ${fileChanges[0]}`;
    if (fileChanges.length <= 3) return `Update ${fileChanges.join(', ')}`;
    return `Update ${fileChanges.length} files (${summary})`;
  }

  private runGit(args: string[], cwd: string): Promise<ToolResult> {
    return new Promise((resolve) => {
      execFile(
        'git', args,
        { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 10 },
        (error, stdout, stderr) => {
          let output = '';
          if (stdout) output += stdout;
          if (stderr) output += (output ? '\n' : '') + stderr;
          if (error && !output) {
            const errCode = (error as NodeJS.ErrnoException).code;
            output = errCode === 'ENOENT'
              ? 'Git not found. Ensure git is installed and in your PATH.'
              : `git ${args[0]} failed (exit code ${errCode ?? 'unknown'})`;
          }
          resolve({ success: !error, output: output || '(no output)' });
        },
      );
    });
  }
}
