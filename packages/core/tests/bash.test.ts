import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));

import { exec } from 'node:child_process';
import { BashTool } from '../src/tools/bash.js';

const mockExec = exec as unknown as ReturnType<typeof vi.fn>;

const ctx = { cwd: '/test/project' };

/** Helper: make exec call its callback with given stdout/stderr/error */
function setupExec(stdout: string, stderr = '', error: (Error & { killed?: boolean; code?: string }) | null = null) {
  mockExec.mockImplementation((_cmd: string, _opts: unknown, callback: Function) => {
    const child = {
      kill: vi.fn(),
      stdout: { on: vi.fn(), removeAllListeners: vi.fn() },
      stderr: { on: vi.fn(), removeAllListeners: vi.fn() },
    };
    // Defer callback so `const child = exec(...)` assignment completes first
    Promise.resolve().then(() => callback(error, stdout, stderr));
    return child;
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BashTool', () => {
  const tool = new BashTool();

  beforeEach(() => vi.clearAllMocks());

  it('has name "bash" and riskLevel "dangerous"', () => {
    expect(tool.name).toBe('bash');
    expect(tool.riskLevel).toBe('dangerous');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('executes command and returns stdout', async () => {
    setupExec('hello world');
    const result = await tool.execute({ command: 'echo hello world' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('hello world');
  });

  it('includes stderr in output', async () => {
    setupExec('out', 'warn');
    const result = await tool.execute({ command: 'cmd' }, ctx);
    expect(result.output).toContain('out');
    expect(result.output).toContain('warn');
  });

  it('returns success:false on command error', async () => {
    const err = Object.assign(new Error('fail'), { code: '1' });
    setupExec('', 'error msg', err);
    const result = await tool.execute({ command: 'bad' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('error msg');
  });

  it('truncates output at 30,000 characters', async () => {
    setupExec('x'.repeat(35000));
    const result = await tool.execute({ command: 'big' }, ctx);
    expect(result.output.length).toBeLessThanOrEqual(30100); // 30000 + truncation message
    expect(result.output).toContain('truncated');
  });

  it('reports timeout when command is killed', async () => {
    const err = Object.assign(new Error('killed'), { killed: true });
    setupExec('', '', err);
    const result = await tool.execute({ command: 'slow' }, ctx);
    expect(result.output).toContain('timed out');
  });

  it('reports shell not found for ENOENT', async () => {
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
    setupExec('', '', err);
    const result = await tool.execute({ command: 'cmd' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Shell not found');
  });

  it('returns "(no output)" when command produces nothing', async () => {
    setupExec('');
    const result = await tool.execute({ command: 'true' }, ctx);
    expect(result.output).toBe('(no output)');
  });

  it('caps timeout at 600,000ms', async () => {
    setupExec('ok');
    await tool.execute({ command: 'cmd', timeout: 999999 }, ctx);
    expect(mockExec).toHaveBeenCalledWith(
      'cmd',
      expect.objectContaining({ timeout: 600000 }),
      expect.any(Function),
    );
  });

  it('uses default timeout of 120,000ms', async () => {
    setupExec('ok');
    await tool.execute({ command: 'cmd' }, ctx);
    expect(mockExec).toHaveBeenCalledWith(
      'cmd',
      expect.objectContaining({ timeout: 120000 }),
      expect.any(Function),
    );
  });
});
