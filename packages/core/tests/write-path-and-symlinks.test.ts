/**
 * Security review, 25 Nov 2026 (item 4).
 *  - The file tools could rewrite Ava's own control files in ~/.ava.
 *  - A symlink inside the project could point anywhere on the disk.
 *  - test_run / benchmark / debug_logs ran any command with no approval card.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePath, validateWritePath } from '../src/tools/security.js';
import { TestRunTool } from '../src/tools/test-run.js';
import { BenchmarkTool } from '../src/tools/benchmark.js';
import { DebugLogsTool } from '../src/tools/debug-logs.js';

let root: string, home: string, project: string, outside: string;
const savedHome = process.env.HOME, savedProfile = process.env.USERPROFILE;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'ava-sec-'));
  home = join(root, 'home'); project = join(root, 'project'); outside = join(root, 'outside');
  for (const d of [join(home, '.ava', 'memory'), project, outside]) mkdirSync(d, { recursive: true });
  writeFileSync(join(outside, 'secret.txt'), 'x');
  process.env.HOME = home; process.env.USERPROFILE = home;
});
afterAll(() => {
  process.env.HOME = savedHome; process.env.USERPROFILE = savedProfile;
  rmSync(root, { recursive: true, force: true });
});

describe('validateWritePath — Ava\'s control files', () => {
  it.each(['mcp.json', 'settings.json', 'config.json', 'audit-log.jsonl', 'bin/llama.exe', 'mcp/server.json', 'MCP.JSON'])(
    'refuses writing ~/.ava/%s', (name) => {
      expect(() => validateWritePath(join(home, '.ava', name), project)).toThrow(/settings file/);
    });

  it('still lets other ~/.ava files be written, and the control files be read', () => {
    expect(validateWritePath(join(home, '.ava', 'memory', 'note.md'), project)).toContain('note.md');
    expect(validatePath(join(home, '.ava', 'mcp.json'), project)).toContain('mcp.json');
  });

  it('still writes inside the project', () => {
    expect(validateWritePath('src/a.ts', project)).toBe(join(project, 'src', 'a.ts'));
  });
});

describe('symlinks cannot leave the project', () => {
  let linked = true;
  beforeAll(() => {
    try {
      // 'junction' works on Windows without admin rights; ignored elsewhere.
      symlinkSync(outside, join(project, 'escape'), 'junction');
      symlinkSync(join(home, '.ava'), join(project, 'ava-link'), 'junction');
    } catch { linked = false; }
  });

  it('refuses a path through a link that points outside', () => {
    if (!linked) return;
    expect(() => validatePath('escape/secret.txt', project)).toThrow(/outside the project/);
    expect(() => validatePath('escape/new-file.txt', project)).toThrow(/outside the project/);
  });

  it('refuses writing a control file through a link into ~/.ava', () => {
    if (!linked) return;
    expect(() => validateWritePath('ava-link/settings.json', project)).toThrow();
  });
});

describe('command-running tools ask like bash does', () => {
  it.each([new TestRunTool(), new BenchmarkTool(), new DebugLogsTool()])('$name is dangerous', (tool) => {
    expect(tool.riskLevel).toBe('dangerous');
  });
});
