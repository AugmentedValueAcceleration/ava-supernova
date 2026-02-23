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
import { GitStatusTool } from '../src/tools/git.js';

const mockExec = exec as unknown as ReturnType<typeof vi.fn>;

const ctx = { cwd: '/test/repo' };

function setupExec(stdout: string, stderr = '', error: (Error & { killed?: boolean; code?: string }) | null = null) {
  mockExec.mockImplementation((_cmd: string, _opts: unknown, callback: Function) => {
    callback(error, stdout, stderr);
    return { kill: vi.fn() };
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GitStatusTool', () => {
  const tool = new GitStatusTool();

  beforeEach(() => vi.clearAllMocks());

  it('has name "git_status" and riskLevel "safe"', () => {
    expect(tool.name).toBe('git_status');
    expect(tool.riskLevel).toBe('safe');
    expect(tool.requiresConfirmation).toBe(false);
  });

  it('executes "git status" and returns output', async () => {
    setupExec('On branch main\nnothing to commit');
    const result = await tool.execute({ command: 'status' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('On branch main');
    expect(mockExec).toHaveBeenCalledWith(
      'git status',
      expect.anything(),
      expect.any(Function),
    );
  });

  it('executes "git log" with extra args', async () => {
    setupExec('abc1234 Fix bug\ndef5678 Add feature');
    const result = await tool.execute({ command: 'log', args: '--oneline -2' }, ctx);
    expect(result.success).toBe(true);
    expect(mockExec).toHaveBeenCalledWith(
      'git log --oneline -2',
      expect.anything(),
      expect.any(Function),
    );
  });

  it('rejects disallowed commands', async () => {
    const result = await tool.execute({ command: 'commit' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('not allowed');
    expect(result.output).toContain('status');
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('rejects push command', async () => {
    const result = await tool.execute({ command: 'push' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('not allowed');
  });

  it('truncates long output at 30,000 chars', async () => {
    setupExec('x'.repeat(35000));
    const result = await tool.execute({ command: 'diff' }, ctx);
    expect(result.output.length).toBeLessThanOrEqual(30100);
    expect(result.output).toContain('truncated');
  });

  it('reports git not found for ENOENT', async () => {
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
    setupExec('', '', err);
    const result = await tool.execute({ command: 'status' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Git not found');
  });

  it('reports timeout on killed process', async () => {
    const err = Object.assign(new Error('killed'), { killed: true });
    setupExec('', '', err);
    const result = await tool.execute({ command: 'log' }, ctx);
    expect(result.output).toContain('timed out');
  });

  it('returns "(no output)" for clean status', async () => {
    setupExec('');
    const result = await tool.execute({ command: 'status' }, ctx);
    expect(result.output).toBe('(no output)');
  });
});
