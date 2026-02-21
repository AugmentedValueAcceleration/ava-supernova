import { exec } from 'node:child_process';
import type { Tool, ToolResult, ToolExecutionContext } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_LENGTH = 30_000;

export class BashTool implements Tool {
  readonly name = 'bash';
  readonly description = 'Execute a shell command';

  readonly schema: FunctionSchema = {
    name: 'bash',
    description:
      'Execute a shell command in the working directory. ' +
      'Commands timeout after 2 minutes by default. ' +
      'Output is truncated at 30,000 characters.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds. Default: 120000 (2 min). Max: 600000 (10 min).',
        },
      },
      required: ['command'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const command = args.command as string;
    const timeout = Math.min((args.timeout as number) ?? DEFAULT_TIMEOUT_MS, 600_000);

    return new Promise((resolvePromise) => {
      const child = exec(
        command,
        {
          cwd: context.cwd,
          timeout,
          maxBuffer: 1024 * 1024 * 10,
          shell: process.platform === 'win32' ? 'bash' : '/bin/bash',
        },
        (error, stdout, stderr) => {
          let output = '';
          if (stdout) output += stdout;
          if (stderr) output += (output ? '\n' : '') + stderr;
          if (error && error.killed) {
            output += `\nCommand timed out after ${timeout}ms`;
          }

          if (output.length > MAX_OUTPUT_LENGTH) {
            output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
          }

          resolvePromise({
            success: !error,
            output: output || '(no output)',
            metadata: {
              exitCode: error ? (error as NodeJS.ErrnoException).code : 0,
              killed: error?.killed ?? false,
            },
          });
        },
      );

      if (context.signal) {
        context.signal.addEventListener('abort', () => {
          child.kill('SIGTERM');
        });
      }
    });
  }
}
