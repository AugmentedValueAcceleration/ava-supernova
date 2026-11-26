import { execFile } from 'node:child_process';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/** Characters that could be used for shell injection. */
const SHELL_METACHARACTERS = /[;&|`$(){}!<>\\]/;

const MAX_OUTPUT_LENGTH = 30_000;
const GIT_TIMEOUT_MS = 30_000;

/** Whitelist of read-only git subcommands. */
const ALLOWED_COMMANDS = new Set(['status', 'diff', 'log', 'branch', 'show']);

/** `branch` only LISTS here: these are its listing options. A bare name
 *  creates a branch, so names are only accepted after a filter that takes one. */
const BRANCH_LIST_FLAGS = /^(-a|-r|-v|-vv|-l|--all|--remotes|--verbose|--list|--show-current|--column|--no-column|--color|--no-color|--ignore-case|--omit-empty|--abbrev=\d+|--no-abbrev|--sort=\S+|--format=\S+|--merged|--no-merged|--contains|--no-contains|--points-at)$/;
const BRANCH_TAKES_NAME = /^(-l|--list|--merged|--no-merged|--contains|--no-contains|--points-at)$/;

/** Git takes any unambiguous start of a long option (`--ext` = `--ext-diff`). */
const isAbbrevOf = (arg: string, full: string, minLen: number): boolean =>
  arg.length >= minLen && full.startsWith(arg.split('=')[0]);

function refusedGitArg(command: string, args: string[]): string | null {
  for (const a of args) {
    if (/^--output(=|$)/.test(a)) return a;
    // "--ext" and "--textc" are the shortest unambiguous forms.
    if (isAbbrevOf(a, '--ext-diff', 5) || isAbbrevOf(a, '--textconv', 7)) return a;
  }
  if (command === 'branch') {
    let nameAllowed = false;
    for (const a of args) {
      if (a.startsWith('-')) {
        if (!BRANCH_LIST_FLAGS.test(a)) return a;
        if (BRANCH_TAKES_NAME.test(a)) nameAllowed = true;
      } else if (!nameAllowed) {
        return a;
      }
    }
  }
  return null;
}

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

    // Reject args containing shell metacharacters to prevent injection
    if (SHELL_METACHARACTERS.test(extraArgs)) {
      return {
        success: false,
        output: `Arguments contain disallowed characters. Shell metacharacters (;, &, |, \`, $, etc.) are not permitted.`,
      };
    }

    // Split args into array for execFile (no shell interpretation)
    const userArgs = extraArgs ? extraArgs.split(/\s+/).filter(Boolean) : [];

    // "Read-only" has to hold for the ARGUMENTS too (security review, 25 Nov
    // 2026): `diff --output=<path>` wrote a file anywhere on the disk,
    // `branch <name>` / `branch -D <name>` created and deleted branches, and
    // --ext-diff / --textconv run programs a repo's own config names.
    const refused = refusedGitArg(command, userArgs);
    if (refused) {
      return { success: false, output: `Argument "${refused}" is not allowed: git_status is read-only.` };
    }

    // diff/log/show never run an external diff or textconv program, even when
    // the repo's config asks for one.
    const noExternal = ['diff', 'log', 'show'].includes(command) ? ['--no-ext-diff', '--no-textconv'] : [];
    const gitArgs = [command, ...noExternal, ...userArgs];
    const fullCommand = `git ${gitArgs.join(' ')}`;

    return new Promise((resolve) => {
      execFile(
        'git',
        gitArgs,
        {
          cwd: context.cwd,
          timeout: GIT_TIMEOUT_MS,
          maxBuffer: 1024 * 1024 * 10,
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
    });
  }
}
