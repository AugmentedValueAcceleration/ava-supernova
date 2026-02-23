import { exec } from 'node:child_process';
import { getShell } from './bash.js';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const MAX_OUTPUT_LENGTH = 30_000;
const GIT_TIMEOUT_MS = 30_000;

/** Whitelist of read-only git subcommands. */
const ALLOWED_COMMANDS = new Set(['status', 'diff', 'log', 'branch', 'show']);

export class GitStatusTool implements Tool {
  readonly name = 'git_status';
  readonly description = 'Run read-only git commands (status, diff, log, branch, show)';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'git_status',
    description:
      'Run read-only git commands. Supports: status, diff, log, branch, show. ' +
      'Auto-approved and faster than bash for checking repo state. ' +
      'Write operations (commit, push, checkout, etc.) are not allowed — use bash for those.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['status', 'diff', 'log', 'branch', 'show'],
          description: 'The git subcommand to run',
        },
        args: {
          type: 'string',
          description:
            'Additional arguments (e.g. "--oneline -10" for log, "HEAD~1" for diff, ' +
            '"--all" for branch). Optional.',
        },
      },
      required: ['command'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const command = args.command as string;
    const extraArgs = (args.args as string | undefined) ?? '';

    if (!ALLOWED_COMMANDS.has(command)) {
      return {
        success: false,
        output: `Command "${command}" is not allowed. Use one of: ${[...ALLOWED_COMMANDS].join(', ')}`,
      };
    }

    const fullCommand = `git ${command}${extraArgs ? ' ' + extraArgs : ''}`;

    return new Promise((resolve) => {
      const shell = getShell();
      exec(
        fullCommand,
        {
          cwd: context.cwd,
          timeout: GIT_TIMEOUT_MS,
          maxBuffer: 1024 * 1024 * 10,
          shell,
        },
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
              output = `git ${command} failed (exit code ${errCode ?? 'unknown'})`;
            }
          }

          if (output.length > MAX_OUTPUT_LENGTH) {
            output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
          }

          resolve({
            success: !error,
            output: output || '(no output)',
            metadata: { command: fullCommand },
          });
        },
      );

      if (context.signal) {
        // exec doesn't return ChildProcess in this callback pattern,
        // but the timeout will handle cleanup
      }
    });
  }
}
