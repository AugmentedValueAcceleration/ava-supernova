import { execFile } from 'node:child_process';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const GIT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_LENGTH = 30_000;

export class GitCreatePrTool implements Tool {
  readonly name = 'git_create_pr';
  readonly description = 'Create a GitHub pull request from the current branch with auto-generated title and description';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'git_create_pr',
    description:
      'Create a GitHub pull request using the GitHub CLI (gh). Automatically generates a title and ' +
      'description from the commit log if not provided. Pushes the current branch if needed. ' +
      'Requires the GitHub CLI (gh) to be installed and authenticated.',
    parameters: {
      type: 'object',
      properties: {
        base: {
          type: 'string',
          description: 'Base branch to merge into. Default: "main".',
        },
        title: {
          type: 'string',
          description: 'PR title. If omitted, generated from commits.',
        },
        body: {
          type: 'string',
          description: 'PR description. If omitted, generated from commit log.',
        },
        draft: {
          type: 'boolean',
          description: 'Create as draft PR. Default: false.',
        },
        push: {
          type: 'boolean',
          description: 'Push current branch to remote before creating PR. Default: true.',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const base = (args.base as string) ?? 'main';
    let title = args.title as string | undefined;
    let body = args.body as string | undefined;
    const draft = (args.draft as boolean) ?? false;
    const push = (args.push as boolean) ?? true;

    // Check gh CLI is available
    const ghCheck = await this.run('gh', ['--version'], context.cwd);
    if (!ghCheck.success) {
      return { success: false, output: 'GitHub CLI (gh) not found. Install it from https://cli.github.com/' };
    }

    // Get current branch
    const branchResult = await this.runGit(['branch', '--show-current'], context.cwd);
    if (!branchResult.success) {
      return { success: false, output: `Not a git repository or no branch: ${branchResult.output}` };
    }
    const branch = branchResult.output.trim();

    if (branch === base) {
      return { success: false, output: `Already on ${base}. Create a feature branch first.` };
    }

    // Push if requested
    if (push) {
      const pushResult = await this.runGit(['push', '-u', 'origin', branch], context.cwd);
      if (!pushResult.success) {
        return { success: false, output: `Failed to push: ${pushResult.output}` };
      }
    }

    // Generate title/body from commits if not provided
    if (!title || !body) {
      const logResult = await this.runGit(
        ['log', `${base}..HEAD`, '--pretty=format:%s', '--reverse'],
        context.cwd,
      );
      const commits = logResult.output.trim().split('\n').filter(Boolean);

      if (!title) {
        title = commits.length === 1
          ? commits[0]
          : `${commits[0]} (+${commits.length - 1} more)`;
        // Cap at 72 chars
        if (title.length > 72) title = title.slice(0, 69) + '...';
      }

      if (!body) {
        const diffStat = await this.runGit(['diff', '--stat', `${base}...HEAD`], context.cwd);
        body = '## Changes\n\n';
        body += commits.map(c => `- ${c}`).join('\n');
        if (diffStat.success && diffStat.output.trim()) {
          body += `\n\n## Stats\n\n\`\`\`\n${diffStat.output.trim()}\n\`\`\``;
        }
      }
    }

    // Create PR
    const prArgs = ['pr', 'create', '--base', base, '--title', title, '--body', body];
    if (draft) prArgs.push('--draft');

    const prResult = await this.run('gh', prArgs, context.cwd);
    if (!prResult.success) {
      return { success: false, output: `Failed to create PR: ${prResult.output}` };
    }

    const prUrl = prResult.output.trim();

    let output = `Pull request created: ${prUrl}\n\n`;
    output += `Branch: ${branch} → ${base}\n`;
    output += `Title: ${title}\n`;
    if (draft) output += 'Status: Draft\n';

    if (output.length > MAX_OUTPUT_LENGTH) {
      output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (truncated)';
    }

    return {
      success: true,
      output,
      metadata: { url: prUrl, branch, base, title, draft },
    };
  }

  private runGit(args: string[], cwd: string): Promise<ToolResult> {
    return this.run('git', args, cwd);
  }

  private run(cmd: string, args: string[], cwd: string): Promise<ToolResult> {
    return new Promise((resolve) => {
      execFile(
        cmd, args,
        { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 10 },
        (error, stdout, stderr) => {
          let output = '';
          if (stdout) output += stdout;
          if (stderr) output += (output ? '\n' : '') + stderr;
          if (error && !output) {
            const errCode = (error as NodeJS.ErrnoException).code;
            output = errCode === 'ENOENT'
              ? `${cmd} not found. Ensure it is installed and in your PATH.`
              : `${cmd} ${args[0]} failed (exit code ${errCode ?? 'unknown'})`;
          }
          resolve({ success: !error, output: output || '(no output)' });
        },
      );
    });
  }
}
