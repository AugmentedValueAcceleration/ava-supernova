import { exec, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { enrichErrorOutput } from './error-guidance.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_LENGTH = 30_000;
const BACKGROUND_WARMUP_MS = 5_000; // collect output for 5s before returning

// ── Sandboxing ──────────────────────────────────────────────────────────────

/**
 * Patterns that indicate potentially destructive or dangerous operations.
 * These are flagged — not blocked — via the confirmation handler so the user
 * can see an explicit warning before approving.
 */
// Tiered risk classifier. Each pattern declares which tier it falls into:
//
//   irreversible — destroys history, signed identity, or external state that
//                  can't be undone by reverting a file. ALWAYS prompts the
//                  user regardless of permission mode (autonomous, balanced,
//                  custom — all of them). Mirrors the desktop-safety-gate
//                  model: "irreversible never graduates."
//
//   destructive  — wide deletes, formatting, fork-bombs, disk overwrites.
//                  Prompts under any mode that doesn't auto-approve shell
//                  (i.e. anything other than autonomous + 'auto' shell).
//
//   risky        — privilege escalation, force-flag package installs, scripts
//                  piped from the network. User-visible warning, prompts in
//                  strict / balanced; allowed in autonomous.
//
// Tier choice is loud rather than quiet — the user's confirmation card
// shows the tier so they know whether the operation is undoable or not.
type DangerTier = 'irreversible' | 'destructive' | 'risky';
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string; tier: DangerTier }> = [
  // ─── Irreversible — git history rewrite / share / signed identity ──────
  { pattern: /\bgit\s+push\s+(?:[^\n]+\s)?(?:--force|--force-with-lease|-f\b)/, reason: 'Force-push rewrites remote history', tier: 'irreversible' },
  { pattern: /\bgit\s+reset\s+(?:[^\n]+\s)?--hard\b/, reason: 'Hard reset discards uncommitted work', tier: 'irreversible' },
  { pattern: /\bgit\s+(?:branch\s+-D|branch\s+--delete\s+--force)\b/, reason: 'Force branch delete (loses unmerged commits)', tier: 'irreversible' },
  { pattern: /\bgit\s+rebase\b(?!.*--abort)/, reason: 'Rebase rewrites local history', tier: 'irreversible' },
  { pattern: /\bgit\s+(?:filter-branch|filter-repo)\b/, reason: 'History filter — rewrites every commit', tier: 'irreversible' },
  { pattern: /\bgit\s+clean\s+(?:[^\n]+\s)?-[a-z]*[fF]/, reason: 'Force-clean discards untracked files', tier: 'irreversible' },

  // ─── Irreversible — DB drops / truncates via shell wrappers ────────────
  { pattern: /\b(?:psql|mysql)\b.*\b(?:-c|-e)\b\s+["'][^"']*\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i, reason: 'SQL drop/truncate/delete via shell wrapper bypasses database_query gate', tier: 'irreversible' },
  { pattern: /\bsqlite3\b.*\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i, reason: 'SQLite destructive statement via shell', tier: 'irreversible' },
  { pattern: /\bpnpm\s+publish|\bnpm\s+publish|\byarn\s+publish\b/, reason: 'Publishing a package is irreversible once registered', tier: 'irreversible' },

  // ─── Destructive — wide / root-adjacent deletes ────────────────────────
  { pattern: /\brm\s+(?:-[a-zA-Z]*[rRf][a-zA-Z]*\s+)+(?:\/(?!\w)|~\/?\s*$|~\/\*|\*\s*$|\.\s*$|\.\/\*|\.\.\/?\*?)/, reason: 'Recursive delete on root, home, cwd, or wildcard', tier: 'destructive' },
  { pattern: /\brm\s+(?:-[a-zA-Z]*[rRf][a-zA-Z]*\s+)\.\.\//, reason: 'Recursive delete escaping cwd', tier: 'destructive' },
  { pattern: /\bmkfs\b/, reason: 'Filesystem format command', tier: 'destructive' },
  { pattern: /\bdd\s+.*\bof=\/dev\//, reason: 'Direct disk write (dd)', tier: 'destructive' },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, reason: 'Fork bomb detected', tier: 'destructive' },
  { pattern: /\bchmod\s+(?:-R\s+)?777\s+\//, reason: 'World-writable on root', tier: 'destructive' },
  { pattern: /\bchown\s+-R\s+[^\s]+\s+\//, reason: 'Recursive ownership change on root', tier: 'destructive' },
  { pattern: /\b(?:shutdown|reboot|poweroff|init\s+[06]|halt\b)\b/, reason: 'System shutdown/reboot', tier: 'destructive' },
  { pattern: />\s*\/dev\/sd[a-z]/, reason: 'Direct write to block device', tier: 'destructive' },

  // ─── Risky — privilege / network-script-execution / force flags ────────
  { pattern: /\bcurl\b.*\|\s*(?:bash|sh|zsh|fish|pwsh|powershell)\b/, reason: 'Piping remote script to shell', tier: 'risky' },
  { pattern: /\bwget\b.*\|\s*(?:bash|sh|zsh|fish|pwsh|powershell)\b/, reason: 'Piping remote script to shell', tier: 'risky' },
  { pattern: /\b(?:sudo|doas|runas|su\s+-)\b/, reason: 'Privilege escalation', tier: 'risky' },
  { pattern: /\b(?:npm|pnpm|yarn)\s+(?:install|add|i)\s+(?:[^\n]*\s)?-g\s+(?:[^\n]*\s)?--force\b/, reason: 'Global package install with --force', tier: 'risky' },
  { pattern: /\b(?:npm|pnpm|yarn)\s+(?:[^\n]*\s)?--legacy-peer-deps\b.*\b-g\b/, reason: 'Global install bypassing peer-dep checks', tier: 'risky' },
];

/**
 * Environment variables that should be stripped from child process env.
 * Prevents the LLM from reading API keys, tokens, or secrets via `env` or `printenv`.
 */
const SENSITIVE_ENV_PREFIXES = [
  'OPENAI_API', 'ANTHROPIC_API', 'DEEPSEEK_API', 'MOONSHOT_API', 'QWEN_API',
  'ZHIPU_API', 'MISTRAL_API', 'HUGGINGFACE', 'GITHUB_TOKEN', 'GH_TOKEN',
  'GITLAB_TOKEN', 'SLACK_TOKEN', 'SLACK_BOT', 'AWS_SECRET', 'AWS_SESSION',
  'AZURE_', 'GOOGLE_API', 'STRIPE_', 'DATABASE_URL', 'SUPABASE_SERVICE',
  'NEXT_PUBLIC_SUPABASE_ANON', 'NPM_TOKEN', 'NODE_AUTH',
  // Database connection envs — extending coverage so a bash subprocess
  // can't psql/mysql/sqlite using the same creds the user only intended
  // for the gated database_query tool. database_query blocks DROP/DELETE/
  // TRUNCATE in SQL; without stripping these, `psql -c "DROP TABLE users"`
  // routes around the gate via bash. The DANGEROUS_PATTERNS list also
  // catches the obvious destructive shell wrappers, but defence-in-depth.
  'POSTGRES_', 'PG', 'MYSQL_', 'MARIADB_', 'SQLITE_', 'MONGODB_', 'MONGO_',
  'REDIS_', 'CASSANDRA_', 'CLICKHOUSE_',
];

const SENSITIVE_ENV_EXACT = [
  'AVA_PLATFORM_KEY', 'SECRET_KEY', 'PRIVATE_KEY', 'API_KEY', 'API_SECRET',
  'JWT_SECRET', 'SESSION_SECRET', 'ADMIN_PASSWORD', 'ENCRYPTION_KEY',
];

/**
 * Create a sanitised copy of process.env for child processes.
 * Strips any environment variable that could leak credentials.
 */
function getSanitisedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;
    const upper = key.toUpperCase();
    if (SENSITIVE_ENV_EXACT.includes(upper)) continue;
    if (SENSITIVE_ENV_PREFIXES.some(prefix => upper.startsWith(prefix))) continue;
    env[key] = value;
  }
  return env;
}

/**
 * Check a command for dangerous patterns. Returns matched tier hits in
 * ascending order of severity so callers can quickly read the worst tier
 * via the last element. Empty array = clean.
 */
export interface DangerHit { reason: string; tier: DangerTier }
const TIER_RANK: Record<DangerTier, number> = { risky: 1, destructive: 2, irreversible: 3 };

function checkDangerousCommand(command: string): DangerHit[] {
  const hits: DangerHit[] = [];
  for (const { pattern, reason, tier } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) hits.push({ reason, tier });
  }
  hits.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
  return hits;
}

/** Top tier present in the command (or null). Used by the registry to
 * decide whether to force-prompt regardless of permission mode. */
export function bashDangerTier(command: string): DangerTier | null {
  const hits = checkDangerousCommand(command);
  return hits.length ? hits[hits.length - 1].tier : null;
}

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
        spawn('taskkill', ['/pid', String(child.pid), '/f', '/t']);
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

    // Check for dangerous patterns — surface warnings in output, tagged
    // with the worst tier so the user (and any audit log reader) can see
    // at a glance whether the command is undoable.
    const hits = checkDangerousCommand(command);
    if (hits.length > 0) {
      const top = hits[hits.length - 1].tier;
      const reasons = hits.map(h => `[${h.tier}] ${h.reason}`).join('; ');
      const prefix = `⚠ Security warning (${top}): ${reasons}\n\n`;
      const result = background
        ? await this.executeBackground(command, context)
        : await this.executeForeground(command, args, context);
      return { ...result, output: prefix + result.output };
    }

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
          env: getSanitisedEnv(),
        },
        (error, stdout, stderr) => {
          // Remove stream listeners — final result is handled here
          child.stdout?.removeAllListeners('data');
          child.stderr?.removeAllListeners('data');
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

          // On failure, wrap the output with plain-English guidance for
          // any known dependency/environment errors. The raw error stays
          // available below the guidance for debugging. Non-coder users
          // see "install Git for Windows" instead of "class not registered".
          const finalOutput = error
            ? enrichErrorOutput(output || '(no output)')
            : (output || '(no output)');

          resolvePromise({
            success: !error,
            output: finalOutput,
            metadata: {
              exitCode: error ? (error as NodeJS.ErrnoException).code : 0,
              killed: error?.killed ?? false,
            },
          });
        },
      );

      // Stream partial output for real-time display
      if (context.onOutput) {
        const onOutput = context.onOutput;
        child.stdout?.on('data', (chunk: Buffer) => onOutput(chunk.toString()));
        child.stderr?.on('data', (chunk: Buffer) => onOutput(chunk.toString()));
      }

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
        env: getSanitisedEnv(),
      });

      // Track for cleanup
      backgroundProcesses.add(child);

      // Tell the active checkpoint (if any) that a background process was
      // spawned during its window. The rollback status surface will then
      // warn the user that restore won't undo side effects from a still-
      // running migration / install / dev-server.
      try {
        const ss = context.sharedState as { checkpointManager?: { markBackgroundSpawned?: () => void } } | undefined;
        ss?.checkpointManager?.markBackgroundSpawned?.();
      } catch { /* shared state absent — non-fatal */ }

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
              spawn('taskkill', ['/pid', String(child.pid), '/f', '/t']);
            } else {
              process.kill(-child.pid!, 'SIGTERM');
            }
          } catch { /* already dead */ }
        }, { once: true });
      }
    });
  }
}
