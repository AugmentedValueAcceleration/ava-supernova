import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock filesystem ─────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const mockReadFile = readFile as unknown as ReturnType<typeof vi.fn>;
const mockWriteFile = writeFile as unknown as ReturnType<typeof vi.fn>;
const mockMkdir = mkdir as unknown as ReturnType<typeof vi.fn>;

import { FileReadTool } from '../src/tools/file-read.js';
import { FileWriteTool } from '../src/tools/file-write.js';
import { FileEditTool } from '../src/tools/file-edit.js';

const ctx = { cwd: '/test/project' };

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default implementations (clearAllMocks only clears history, not impl)
  mockWriteFile.mockResolvedValue(undefined);
  mockMkdir.mockResolvedValue(undefined);
});

// ── FileReadTool ─────────────────────────────────────────────────────────────

describe('FileReadTool', () => {
  const tool = new FileReadTool();

  it('reads file and returns numbered lines', async () => {
    mockReadFile.mockResolvedValue('line1\nline2\nline3');
    const result = await tool.execute({ file_path: '/abs/file.ts' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('1');
    expect(result.output).toContain('line1');
    expect(result.output).toContain('line3');
  });

  it('resolves relative path against context.cwd', async () => {
    mockReadFile.mockResolvedValue('hello');
    await tool.execute({ file_path: 'src/index.ts' }, ctx);
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('test'),
      'utf-8',
    );
  });

  it('respects offset parameter (1-based)', async () => {
    mockReadFile.mockResolvedValue('a\nb\nc\nd\ne');
    const result = await tool.execute({ file_path: '/f.ts', offset: 3 }, ctx);
    expect(result.output).toContain('c');
    expect(result.output).not.toContain('  1  a');
  });

  it('respects limit parameter', async () => {
    mockReadFile.mockResolvedValue('a\nb\nc\nd\ne');
    const result = await tool.execute({ file_path: '/f.ts', limit: 2 }, ctx);
    expect(result.metadata?.shownLines).toBe(2);
  });

  it('returns metadata with totalLines and shownLines', async () => {
    mockReadFile.mockResolvedValue('a\nb\nc');
    const result = await tool.execute({ file_path: '/f.ts' }, ctx);
    expect(result.metadata?.totalLines).toBe(3);
    expect(result.metadata?.shownLines).toBe(3);
  });

  it('returns error result for nonexistent file', async () => {
    const err = new Error('ENOENT: no such file');
    (err as NodeJS.ErrnoException).code = 'ENOENT';
    mockReadFile.mockRejectedValue(err);

    const result = await tool.execute({ file_path: '/missing.ts' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Failed to read');
  });

  it('handles empty file', async () => {
    mockReadFile.mockResolvedValue('');
    const result = await tool.execute({ file_path: '/empty.ts' }, ctx);
    expect(result.success).toBe(true);
  });
});

// ── FileWriteTool ────────────────────────────────────────────────────────────

describe('FileWriteTool', () => {
  const tool = new FileWriteTool();

  it('writes content and creates parent directories', async () => {
    const result = await tool.execute(
      { file_path: '/out/dir/file.ts', content: 'hello world' },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('dir'), { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith('/out/dir/file.ts', 'hello world', 'utf-8');
  });

  it('returns success with line count', async () => {
    const result = await tool.execute(
      { file_path: '/f.ts', content: 'a\nb\nc' },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain('3 lines');
    expect(result.metadata?.lineCount).toBe(3);
  });

  it('resolves relative path against cwd', async () => {
    await tool.execute({ file_path: 'out.ts', content: 'x' }, ctx);
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('project'),
      'x',
      'utf-8',
    );
  });

  it('returns error result on write failure', async () => {
    mockWriteFile.mockRejectedValue(new Error('EACCES: permission denied'));
    const result = await tool.execute({ file_path: '/f.ts', content: 'x' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Failed to write');
  });
});

// ── FileEditTool ─────────────────────────────────────────────────────────────

describe('FileEditTool', () => {
  const tool = new FileEditTool();

  it('replaces single occurrence of old_string', async () => {
    mockReadFile.mockResolvedValue('foo bar baz');
    const result = await tool.execute(
      { file_path: '/f.ts', old_string: 'bar', new_string: 'qux' },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(mockWriteFile).toHaveBeenCalledWith('/f.ts', 'foo qux baz', 'utf-8');
    expect(result.output).toContain('1 occurrence');
  });

  it('fails when old_string not found', async () => {
    mockReadFile.mockResolvedValue('foo bar baz');
    const result = await tool.execute(
      { file_path: '/f.ts', old_string: 'xyz', new_string: 'abc' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.output).toContain('not found');
  });

  it('fails when old_string has multiple matches and replace_all is false', async () => {
    mockReadFile.mockResolvedValue('foo foo foo');
    const result = await tool.execute(
      { file_path: '/f.ts', old_string: 'foo', new_string: 'bar' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.output).toContain('3 times');
  });

  it('replaces all occurrences when replace_all is true', async () => {
    mockReadFile.mockResolvedValue('foo foo foo');
    const result = await tool.execute(
      { file_path: '/f.ts', old_string: 'foo', new_string: 'bar', replace_all: true },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(mockWriteFile).toHaveBeenCalledWith('/f.ts', 'bar bar bar', 'utf-8');
    expect(result.output).toContain('all 3 occurrences');
  });

  it('returns error on file read failure', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const result = await tool.execute(
      { file_path: '/f.ts', old_string: 'a', new_string: 'b' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.output).toContain('Failed to edit');
  });
});
