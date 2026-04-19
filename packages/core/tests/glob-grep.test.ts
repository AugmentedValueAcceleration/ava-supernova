import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('glob', () => ({
  glob: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

// Mock security — tests use fake paths outside cwd
vi.mock('../src/tools/security.js', () => ({
  validatePath: vi.fn((rawPath: string, cwd: string) => {
    if (rawPath.startsWith('/') || rawPath.startsWith('C:')) return rawPath;
    return `${cwd}/${rawPath}`;
  }),
  validateSearchPath: vi.fn((rawPath: string | undefined, cwd: string) => {
    if (!rawPath) return cwd;
    if (rawPath.startsWith('/') || rawPath.startsWith('C:')) return rawPath;
    return `${cwd}/${rawPath}`;
  }),
}));

import { glob } from 'glob';
import { readFile } from 'node:fs/promises';

const mockGlob = glob as unknown as ReturnType<typeof vi.fn>;
const mockReadFile = readFile as unknown as ReturnType<typeof vi.fn>;

import { GlobTool } from '../src/tools/glob.js';
import { GrepTool } from '../src/tools/grep.js';

const ctx = { cwd: '/test/project' };

// ── GlobTool ─────────────────────────────────────────────────────────────────

describe('GlobTool', () => {
  const tool = new GlobTool();

  beforeEach(() => vi.clearAllMocks());

  it('returns sorted matching file paths', async () => {
    mockGlob.mockResolvedValue(['/a/c.ts', '/a/b.ts', '/a/a.ts']);
    const result = await tool.execute({ pattern: '**/*.ts' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('/a/a.ts\n/a/b.ts\n/a/c.ts');
    expect(result.metadata?.count).toBe(3);
  });

  it('returns "No files matched" for zero results', async () => {
    mockGlob.mockResolvedValue([]);
    const result = await tool.execute({ pattern: '**/*.xyz' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('No files matched');
  });

  it('resolves relative search path against cwd', async () => {
    mockGlob.mockResolvedValue([]);
    await tool.execute({ pattern: '*.ts', path: 'src' }, ctx);
    expect(mockGlob).toHaveBeenCalledWith('*.ts', expect.objectContaining({
      cwd: expect.stringContaining('project'),
    }));
  });

  it('passes correct options to glob', async () => {
    mockGlob.mockResolvedValue([]);
    await tool.execute({ pattern: '**/*.ts' }, ctx);
    expect(mockGlob).toHaveBeenCalledWith('**/*.ts', expect.objectContaining({
      nodir: true,
      dot: false,
      absolute: true,
    }));
  });

  it('returns error on glob failure', async () => {
    mockGlob.mockRejectedValue(new Error('invalid pattern'));
    const result = await tool.execute({ pattern: '[' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Glob failed');
  });
});

// ── GrepTool ─────────────────────────────────────────────────────────────────

describe('GrepTool', () => {
  const tool = new GrepTool();

  beforeEach(() => vi.clearAllMocks());

  it('finds matching lines with file:line format', async () => {
    mockGlob.mockResolvedValue(['/src/file.ts']);
    mockReadFile.mockResolvedValue('hello\nworld\nhello again');

    const result = await tool.execute({ pattern: 'hello' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('/src/file.ts:1: hello');
    expect(result.output).toContain('/src/file.ts:3: hello again');
    expect(result.metadata?.count).toBe(2);
  });

  it('supports case-insensitive search', async () => {
    mockGlob.mockResolvedValue(['/src/file.ts']);
    mockReadFile.mockResolvedValue('Hello World');

    const result = await tool.execute(
      { pattern: 'hello', case_insensitive: true },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(result.metadata?.count).toBe(1);
  });

  it('returns "No matches found" for no results', async () => {
    mockGlob.mockResolvedValue(['/src/file.ts']);
    mockReadFile.mockResolvedValue('nothing here');

    const result = await tool.execute({ pattern: 'xyz' }, ctx);
    expect(result.output).toContain('No matches found');
  });

  it('truncates at 200 results', async () => {
    // Single file with 210 matching lines
    mockGlob.mockResolvedValue(['/src/big.ts']);
    const lines = Array.from({ length: 210 }, () => 'match').join('\n');
    mockReadFile.mockResolvedValue(lines);

    const result = await tool.execute({ pattern: 'match' }, ctx);
    expect(result.metadata?.count).toBe(200);
    expect(result.metadata?.truncated).toBe(true);
    expect(result.output).toContain('truncated');
  });

  it('skips unreadable files gracefully', async () => {
    mockGlob.mockResolvedValue(['/src/binary.bin', '/src/good.ts']);
    mockReadFile
      .mockRejectedValueOnce(new Error('Binary file'))
      .mockResolvedValueOnce('findme');

    const result = await tool.execute({ pattern: 'findme' }, ctx);
    expect(result.success).toBe(true);
    expect(result.metadata?.count).toBe(1);
  });

  it('returns error for invalid regex pattern', async () => {
    const result = await tool.execute({ pattern: '[invalid' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Grep failed');
  });

  it('respects file_pattern filter', async () => {
    mockGlob.mockResolvedValue([]);
    await tool.execute({ pattern: 'test', file_pattern: '*.spec.ts' }, ctx);
    expect(mockGlob).toHaveBeenCalledWith('*.spec.ts', expect.anything());
  });

  // ── Output ceilings (token-reduction changes) ──────────────────────────────

  it('truncates a single matching line at ~400 bytes', async () => {
    mockGlob.mockResolvedValue(['/src/min.js']);
    const longLine = 'match' + 'x'.repeat(10_000);
    mockReadFile.mockResolvedValue(longLine);

    const result = await tool.execute({ pattern: 'match' }, ctx);
    expect(result.success).toBe(true);
    // Each result entry = `path:line: ` prefix (~15 chars) + line snippet
    // The snippet itself is capped at 400 chars with the truncation marker appended.
    expect(result.output).toContain('[line truncated]');
    // Total output for the single hit should be under a comfortable ceiling —
    // the 10K char line must NOT come through verbatim.
    expect(result.output.length).toBeLessThan(1_000);
  });

  it('stops at the 20KB byte ceiling before reaching the 200-result cap', async () => {
    // 100 matching lines × 400 bytes each = 40KB worth of hits, so the byte
    // cap should fire first, well before 200 results are collected.
    mockGlob.mockResolvedValue(['/src/file.ts']);
    const lineBody = 'match' + 'y'.repeat(500); // will itself be trimmed to 400
    const lines = Array.from({ length: 100 }, () => lineBody).join('\n');
    mockReadFile.mockResolvedValue(lines);

    const result = await tool.execute({ pattern: 'match' }, ctx);
    expect(result.metadata?.truncated).toBe(true);
    expect(result.metadata?.truncReason).toContain('KB output cap');
    expect(result.output).toContain('KB output cap');
    // Must fewer than 200 entries — the byte cap fired first.
    expect((result.metadata?.count as number)).toBeLessThan(200);
  });

  it('reports "200 results" as the truncation reason when count cap fires first', async () => {
    // Short matching lines => byte cap is comfortable; count cap hits first.
    mockGlob.mockResolvedValue(['/src/tiny.ts']);
    const lines = Array.from({ length: 250 }, () => 'hit').join('\n');
    mockReadFile.mockResolvedValue(lines);

    const result = await tool.execute({ pattern: 'hit' }, ctx);
    expect(result.metadata?.truncated).toBe(true);
    expect(result.metadata?.count).toBe(200);
    expect(result.metadata?.truncReason).toContain('200 results');
  });

  it('does not set truncReason when the full result set fits under every cap', async () => {
    mockGlob.mockResolvedValue(['/src/small.ts']);
    mockReadFile.mockResolvedValue('match\nno\nmatch');

    const result = await tool.execute({ pattern: 'match' }, ctx);
    expect(result.metadata?.truncated).toBe(false);
    expect(result.metadata?.truncReason).toBeUndefined();
  });
});
