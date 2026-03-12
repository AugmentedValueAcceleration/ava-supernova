import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock filesystem ─────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
}));

// Mock security — tests use fake paths outside cwd
vi.mock('../src/tools/security.js', () => ({
  validatePath: vi.fn((rawPath: string, cwd: string) => {
    if (rawPath.startsWith('/') || rawPath.startsWith('C:')) return rawPath;
    return `${cwd}/${rawPath}`;
  }),
  validateSearchPath: vi.fn((rawPath: string | undefined, cwd: string) => rawPath || cwd),
}));

import { readdir, stat } from 'node:fs/promises';

const mockReaddir = readdir as unknown as ReturnType<typeof vi.fn>;
const mockStat = stat as unknown as ReturnType<typeof vi.fn>;

import { ListDirectoryTool } from '../src/tools/list-directory.js';

const ctx = { cwd: '/test/project' };

function makeDirent(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ListDirectoryTool', () => {
  const tool = new ListDirectoryTool();

  beforeEach(() => vi.clearAllMocks());

  it('lists directories first (with / suffix) then files with sizes', async () => {
    mockReaddir.mockResolvedValue([
      makeDirent('file.ts', false),
      makeDirent('src', true),
    ]);
    mockStat.mockResolvedValue({ size: 1024 });

    const result = await tool.execute({ path: '/project' }, ctx);
    expect(result.success).toBe(true);
    const lines = result.output.split('\n');
    expect(lines[0]).toBe('src/');
    expect(lines[1]).toContain('file.ts');
    expect(lines[1]).toContain('KB');
  });

  it('formats file sizes correctly (B, KB, MB)', async () => {
    mockReaddir.mockResolvedValue([
      makeDirent('tiny.txt', false),
      makeDirent('medium.ts', false),
      makeDirent('big.bin', false),
    ]);
    mockStat
      .mockResolvedValueOnce({ size: 512 })        // B
      .mockResolvedValueOnce({ size: 5120 })        // KB
      .mockResolvedValueOnce({ size: 2 * 1024 * 1024 }); // MB

    const result = await tool.execute({ path: '/project' }, ctx);
    expect(result.output).toContain('512 B');
    expect(result.output).toContain('5.0 KB');
    expect(result.output).toContain('2.0 MB');
  });

  it('handles empty directory', async () => {
    mockReaddir.mockResolvedValue([]);
    const result = await tool.execute({ path: '/empty' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('empty');
  });

  it('sorts entries alphabetically', async () => {
    mockReaddir.mockResolvedValue([
      makeDirent('zebra', true),
      makeDirent('alpha', true),
    ]);

    const result = await tool.execute({ path: '/project' }, ctx);
    const lines = result.output.split('\n');
    expect(lines[0]).toBe('alpha/');
    expect(lines[1]).toBe('zebra/');
  });

  it('truncates at 200 entries with message', async () => {
    const entries = Array.from({ length: 210 }, (_, i) =>
      makeDirent(`file${String(i).padStart(3, '0')}.ts`, false),
    );
    mockReaddir.mockResolvedValue(entries);
    mockStat.mockResolvedValue({ size: 100 });

    const result = await tool.execute({ path: '/big' }, ctx);
    expect(result.output).toContain('and 10 more');
    expect(result.metadata?.count).toBe(210);
  });

  it('returns error for nonexistent directory', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT: no such directory'));
    const result = await tool.execute({ path: '/missing' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Failed to list');
  });

  it('handles stat failure gracefully (shows "?" for size)', async () => {
    mockReaddir.mockResolvedValue([makeDirent('broken.ts', false)]);
    mockStat.mockRejectedValue(new Error('EACCES'));

    const result = await tool.execute({ path: '/project' }, ctx);
    expect(result.output).toContain('?');
  });
});
