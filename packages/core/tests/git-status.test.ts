import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));

import { execFile } from 'node:child_process';
import { GitStatusTool } from '../src/tools/git.js';

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

const ctx = { cwd: '/test/repo' };

/** Helper: make execFile call its callback with given stdout/stderr/error */
function setupExecFile(stdout: string, stderr = '', error: (Error & { killed?: boolean; code?: string }) | null = null) {
  mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, callback: Function) => {
    callback(error, stdout, stderr);
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
    setupExecFile('On branch main\nnothing to commit');
    const result = await tool.execute({ command: 'status' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('On branch main');
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['status'],
      expect.anything(),
      expect.any(Function),
    );
  });

  it('executes "git log" with extra args', async () => {
    setupExecFile('abc1234 Fix bug\ndef5678 Add feature');
    const result = await tool.execute({ command: 'log', args: '--oneline -2' }, ctx);
    expect(result.success).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['log', '--no-ext-diff', '--no-textconv', '--oneline', '-2'],
      expect.anything(),
      expect.any(Function),
    );
  });

  // Security review, 25 Nov 2026: "read-only" has to hold for the arguments.
  it.each([
    ['diff', '--output=../../evil.txt'],
    ['log', '--output=/tmp/x'],
    ['diff', '--ext-diff'],
    ['diff', '--ext'],
    ['show', '--textconv'],
    ['show', '--textc'],
    ['branch', 'new-branch'],
    ['branch', '-D main'],
    ['branch', '--delete main'],
    ['branch', '-m old new'],
    ['branch', '--set-upstream-to=origin/x'],
  ])('refuses git %s %s', async (command, args) => {
    const result = await tool.execute({ command, args }, ctx);
    expect(result.success).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it.each([
    ['branch', '-a'],
    ['branch', '--show-current'],
    ['branch', '--list feat/*'],
    ['branch', '--merged main'],
    ['branch', '-vv'],
  ])('still lists with git %s %s', async (command, args) => {
    setupExecFile('* main');
    const result = await tool.execute({ command, args }, ctx);
    expect(result.success).toBe(true);
  });

  it('never runs an external diff program for diff/log/show', async () => {
    setupExecFile('');
    await tool.execute({ command: 'diff', args: 'HEAD~1' }, ctx);
    expect(mockExecFile.mock.calls[0][1].slice(0, 3)).toEqual(['diff', '--no-ext-diff', '--no-textconv']);
  });

  it('rejects disallowed commands', async () => {
    const result = await tool.execute({ command: 'commit' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('not allowed');
    expect(result.output).toContain('status');
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('rejects push command', async () => {
    const result = await tool.execute({ command: 'push' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('not allowed');
  });

  it('rejects shell metacharacters in args', async () => {
    const result = await tool.execute({ command: 'log', args: '--oneline; rm -rf /' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('disallowed characters');
  });

  it('truncates long output at 30,000 chars', async () => {
    setupExecFile('x'.repeat(35000));
    const result = await tool.execute({ command: 'diff' }, ctx);
    expect(result.output.length).toBeLessThanOrEqual(30100);
    expect(result.output).toContain('truncated');
  });

  it('reports git not found for ENOENT', async () => {
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
    setupExecFile('', '', err);
    const result = await tool.execute({ command: 'status' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Git not found');
  });

  it('reports timeout on killed process', async () => {
    const err = Object.assign(new Error('killed'), { killed: true });
    setupExecFile('', '', err);
    const result = await tool.execute({ command: 'log' }, ctx);
    expect(result.output).toContain('timed out');
  });

  it('returns "(no output)" for clean status', async () => {
    setupExecFile('');
    const result = await tool.execute({ command: 'status' }, ctx);
    expect(result.output).toBe('(no output)');
  });
});
