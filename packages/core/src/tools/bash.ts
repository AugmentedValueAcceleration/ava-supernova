import { exec, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_LENGTH = 30_000;
const BACKGROUND_WARMUP_MS = 5_000; // collect output for 5s before returning

// ── Windows bash resolution ─────────────────────────────────────────────────
// Git Bash is the standard bash on Windows but its executable isn't always in
// the system PATH (only git.exe is). We check common install locations first.

let resolvedShell: string | undefined;

export function getShell(): string {
  if (resolvedShell) return resolvedShell;

  if (process.platform !== 'win32') {
    resolvedShell = '/bin/bash';
    return resolvedShell;
  }

  // Check common Git Bash locations on Windows
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    `${process.env.LOCALAPPDATA}\\Programs\\Git\\bin\\bash.exe`,
    `${process.env.PROGRAMFILES}\\Git\\bin\\bash.exe`,
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      resolvedShell = candidate;
      return resolvedShell;
    }
  }

  // Fallback — hope it's in PATH
  resolvedShell = 'bash';
  return resolvedShell;
}

// ── Background process tracking ─────────────────────────────────────────────
// Keeps refs so we can kill them on cancel/dispose.

const backgroundProcesses = new Set<ReturnType<typeof spawn>>();

export function killBackgroundProcesses(): void {
  for (const child of backgroundProcesses) {
    try {
      if (process.platform === 'win32') {
        // On Windows, spawn('taskkill') to kill the process tree
        spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { shell: true });
      } else {
        // On Unix, kill the process group
        process.kill(-child.pid!, 'SIGTERM');
      }
    } catch { /* already dead */ }
  }
  backgroundProcesses.clear();
}

// ── Tool ────────────────────────────────────────────────────────────────────

export class BashTool implements Tool {
  readonly name = 'bash';
  readonly description = 'Execute a shell command';
  readonly riskLevel: ToolRiskLevel = 'dangerous';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'bash',
    description:
      'Execute a shell command in the working directory. ' +
      'Commands timeout after 2 minutes by default. ' +
      'Output is truncated at 30,000 characters. ' +
      'Use background: true for long-running processes like dev servers, watchers, ' +
      'or anything that runs indefinitely. Background commands return initial output ' +
      'after a 5-second warmup and keep running.',
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
        background: {
          type: 'boolean',
          description:
            'Run the command in the background. Use for dev servers, file watchers, ' +
            'or any process that runs indefinitely. Returns initial output after 5 seconds ' +
            'while the process keeps running. Default: false.',
        },
      },
      required: ['command'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const command = args.command as string;
    const background = args.background as boolean | undefined;

    if (background) {
      return this.executeBackground(command, context);
    }

    return this.executeForeground(command, args, context);
  }

  private executeForeground(
    command: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const timeout = Math.min((args.timeout as number) ?? DEFAULT_TIMEOUT_MS, 600_000);

    return new Promise((resolvePromise) => {
      const shell = getShell();
      const child = exec(
        command,
        {
          cwd: context.cwd,
          timeout,
          maxBuffer: 1024 * 1024 * 10,
          shell,
        },
        (error, stdout, stderr) => {
          let output = '';
          if (stdout) output += stdout;
          if (stderr) output += (output ? '\n' : '') + stderr;
          if (error && error.killed) {
            output += `\nCommand timed out after ${timeout}ms`;
          }
          // Surface shell-not-found errors clearly
          if (error && !output) {
            const errCode = (error as NodeJS.ErrnoException).code;
            if (errCode === 'ENOENT') {
              output = `Shell not found: "${shell}". Install Git Bash or ensure bash is in your PATH.`;
            } else {
              output = `Command failed (exit code ${errCode ?? 'unknown'})`;
            }
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
        }, { once: true });
      }
    });
  }

  private executeBackground(command: string, context: ToolExecutionContext): Promise<ToolResult> {
    return new Promise((resolvePromise) => {
      const shell = getShell();

      const child = spawn(command, [], {
        cwd: context.cwd,
        shell,
        detached: process.platform !== 'win32', // Unix: new process group
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Track for cleanup
      backgroundProcesses.add(child);

      let output = '';
      let exited = false;

      const collectOutput = (data: Buffer) => {
        output += data.toString();
        // Cap collection to prevent memory issues
        if (output.length > MAX_OUTPUT_LENGTH) {
          output = output.slice(0, MAX_OUTPUT_LENGTH);
        }
      };

      child.stdout?.on('data', collectOutput);
      child.stderr?.on('data', collectOutput);

      // If the process exits quickly (error, bad command), resolve immediately
      child.on('exit', (code) => {
        exited = true;
        backgroundProcesses.delete(child);
        resolvePromise({
          success: code === 0,
          output: output || '(no output)',
          metadata: { exitCode: code, background: false },
        });
      });

      child.on('error', (err) => {
        exited = true;
        backgroundProcesses.delete(child);
        const errCode = (err as NodeJS.ErrnoException).code;
        if (errCode === 'ENOENT') {
          resolvePromise({
            success: false,
            output: `Shell not found: "${shell}". Install Git Bash or ensure bash is in your PATH.`,
          });
        } else {
          resolvePromise({
            success: false,
            output: `Failed to start background process: ${err.message}`,
          });
        }
      });

      // After warmup period, return whatever output we've collected
      setTimeout(() => {
        if (exited) return; // already resolved

        // Detach — let the process run independently
        child.unref();
        child.stdout?.removeAllListeners('data');
        child.stderr?.removeAllListeners('data');

        const header = `[Background process started — PID ${child.pid}]\n`;
        const footer = '\n[Process is still running in the background]';

        resolvePromise({
          success: true,
          output: header + (output || '(no output yet)') + footer,
          metadata: { pid: child.pid, background: true },
        });
      }, BACKGROUND_WARMUP_MS);

      // Kill on abort
      if (context.signal) {
        context.signal.addEventListener('abort', () => {
          backgroundProcesses.delete(child);
          try {
            if (process.platform === 'win32') {
              spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { shell: true });
            } else {
              process.kill(-child.pid!, 'SIGTERM');
            }
          } catch { /* already dead */ }
        }, { once: true });
      }
    });
  }
}
