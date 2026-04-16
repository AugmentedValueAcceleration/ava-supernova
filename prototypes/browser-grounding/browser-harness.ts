// Harness — parent-side orchestrator for the browser worker.
//
// Responsibilities:
//  1. Spawn the worker (`tsx browser-worker.ts`) with a piped stdio channel.
//  2. Send commands over stdin, correlate responses by id.
//  3. Track chromium.exe process count before + after so orphan detection
//     is a hard number, not an assumption.
//  4. Graceful shutdown — issue `close`, wait for worker exit, then SIGKILL
//     if the worker hangs past timeout.
//
// This is the behaviour the Rust sidecar will mirror. Keeping it isolated
// here means we can exercise the subprocess lifecycle end-to-end before
// any Rust code touches it.

import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Command, Response } from './types.ts';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));

export interface HarnessOptions {
  /** Milliseconds to wait for a single command response before timing out. */
  commandTimeoutMs?: number;
  /** Milliseconds to wait for worker exit after `close` before SIGKILL. */
  shutdownGraceMs?: number;
}

export class BrowserHarness {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, (res: Response) => void>();
  private opts: Required<HarnessOptions>;
  private exitPromise: Promise<number | null> | null = null;

  constructor(opts: HarnessOptions = {}) {
    this.opts = {
      commandTimeoutMs: opts.commandTimeoutMs ?? 30_000,
      shutdownGraceMs: opts.shutdownGraceMs ?? 5_000,
    };
  }

  spawn(): void {
    if (this.child) throw new Error('worker already spawned');

    // `tsx` runs the worker directly — no compile step needed for the
    // prototype. In production the Rust sidecar will exec a bundled
    // Node runtime + the compiled JS.
    const workerPath = join(HERE, 'browser-worker.ts');
    const child = spawn('npx', ['tsx', workerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    this.child = child;

    // Read NDJSON responses line by line.
    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const res = JSON.parse(line) as Response;
        const resolver = this.pending.get(res.id);
        if (resolver) {
          this.pending.delete(res.id);
          resolver(res);
        }
      } catch {
        // Non-JSON lines from the worker are diagnostic — forward verbatim.
        process.stderr.write(`[worker:stdout] ${line}\n`);
      }
    });

    // Surface worker stderr verbatim so any Playwright complaint is visible.
    child.stderr.on('data', (buf: Buffer) => {
      process.stderr.write(`[worker:stderr] ${buf.toString()}`);
    });

    this.exitPromise = new Promise((resolve) => {
      child.on('exit', (code) => resolve(code));
    });
  }

  async send(action: Command['action'], params?: Command['params']): Promise<Response> {
    if (!this.child) throw new Error('worker not spawned');
    const id = randomUUID();
    const cmd: Command = { id, action, params };

    const responsePromise = new Promise<Response>((resolve, reject) => {
      this.pending.set(id, resolve);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`command ${action} timed out after ${this.opts.commandTimeoutMs}ms`));
        }
      }, this.opts.commandTimeoutMs);
    });

    this.child.stdin.write(JSON.stringify(cmd) + '\n');
    return responsePromise;
  }

  async shutdown(): Promise<number | null> {
    if (!this.child) return null;

    // Attempt graceful close first. If the worker never responds, force-kill.
    try {
      await Promise.race([
        this.send('close'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('close timeout')), this.opts.shutdownGraceMs),
        ),
      ]);
    } catch {
      // Swallow — we'll SIGKILL below if the process hasn't exited.
    }

    // Close stdin so the worker's readline loop terminates naturally.
    try { this.child.stdin.end(); } catch { /* already ended */ }

    const exitCode = await Promise.race([
      this.exitPromise ?? Promise.resolve(null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), this.opts.shutdownGraceMs)),
    ]);

    if (exitCode === null && !this.child.killed) {
      // Hung. SIGKILL the tree on Windows via taskkill /T so Chromium
      // children go with it; on POSIX, process group kill.
      if (process.platform === 'win32') {
        try {
          await execFileAsync('taskkill', ['/PID', String(this.child.pid), '/T', '/F']);
        } catch { /* best effort */ }
      } else {
        try { this.child.kill('SIGKILL'); } catch { /* best effort */ }
      }
    }

    this.child = null;
    return exitCode;
  }
}

// ── Orphan detection ────────────────────────────────────────────────────
// Count chromium.exe processes on the host. Works on Windows (tasklist) and
// POSIX (pgrep). Returns -1 on platforms we can't inspect rather than
// inventing a number.

export async function countChromiumProcesses(): Promise<number> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq chrome.exe', '/FO', 'CSV', '/NH']);
      // tasklist returns "INFO: No tasks..." when nothing matches.
      if (stdout.toLowerCase().includes('no tasks')) return 0;
      return stdout.split('\n').filter((l) => l.trim().length > 0).length;
    } catch {
      return -1;
    }
  }
  try {
    const { stdout } = await execFileAsync('pgrep', ['-c', 'chrome|chromium']);
    return Number(stdout.trim()) || 0;
  } catch {
    return 0; // pgrep exits non-zero when no match — that's zero processes
  }
}
