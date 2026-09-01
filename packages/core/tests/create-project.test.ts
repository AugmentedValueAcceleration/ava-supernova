// create_project may only ever create a folder inside the projects home.
//
// It is the single tool allowed to write outside the open project, which makes
// its argument the most interesting input in the codebase: if a name can carry
// a path, then a tool justified entirely by "it can only reach one directory"
// reaches every directory. So the containment is tested rather than asserted.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CreateProjectTool } from '../src/tools/create-project.js';
import { ToolRegistry } from '../src/index.js';

function ctx(projectsHome: string) {
  return { cwd: projectsHome, sharedState: { projectsHome } } as never;
}

describe('create_project', () => {
  let home: string;
  const tool = new CreateProjectTool();

  beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'ava-projects-')); });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  it('creates the folder in the projects home', async () => {
    const res = await tool.execute({ name: 'todo-cli' }, ctx(home));
    expect(res.success).toBe(true);
    expect(existsSync(join(home, 'todo-cli'))).toBe(true);
    expect(res.metadata?.path).toBe(join(home, 'todo-cli'));
  });

  // The whole point of the tool. Each of these, accepted, would let a name
  // reach outside the one directory this is permitted to touch.
  it.each([
    ['..'],
    ['../escape'],
    ['..\\escape'],
    ['sub/dir'],
    ['sub\\dir'],
    ['/etc'],
    ['C:\\Windows'],
    ['.hidden'],
    ['.'],
  ])('refuses %s', async (name) => {
    const res = await tool.execute({ name }, ctx(home));
    expect(res.success).toBe(false);
    // The home is still empty — a broader check than "join(home, name) does
    // not exist", which passes vacuously for '..' and '.' since those resolve
    // to directories that existed all along. That version reported a pass for
    // the two inputs it most needed to test.
    expect(readdirSync(home)).toHaveLength(0);
  });

  it('refuses an empty name', async () => {
    expect((await tool.execute({ name: '   ' }, ctx(home))).success).toBe(false);
  });

  // The reason the tool scaffolds rather than offering: plans and decision
  // records live here, so "we'll set it up when you ask" makes the most
  // important folder the one that might never exist.
  it('gives the new project its Decisions folder', async () => {
    const res = await tool.execute({ name: 'with-decisions' }, ctx(home));
    expect(res.success).toBe(true);
    expect(res.metadata?.decisions).toBe(true);

    const decisions = join(home, 'with-decisions', 'Decisions');
    expect(existsSync(join(decisions, 'records'))).toBe(true);
    expect(existsSync(join(decisions, 'design'))).toBe(true);
    expect(existsSync(join(decisions, 'README.md'))).toBe(true);
    // records/ is where plans land — the reason the folder matters at all.
    expect(existsSync(join(decisions, 'overview.md'))).toBe(true);
  });

  // Adopting an existing folder is how "create" quietly becomes "write into
  // someone else's project".
  it('refuses a name that already exists, and says whether it holds anything', async () => {
    mkdirSync(join(home, 'taken'));
    writeFileSync(join(home, 'taken', 'file.txt'), 'x');
    const res = await tool.execute({ name: 'taken' }, ctx(home));
    expect(res.success).toBe(false);
    expect(res.output).toContain('already exists');
    expect(res.output).toContain('1 entries');
  });

  it('is registered under the name the allowlists use', () => {
    const registry = new ToolRegistry();
    registry.registerBuiltins();
    expect(registry.getTool('create_project')).toBeDefined();
  });
});
