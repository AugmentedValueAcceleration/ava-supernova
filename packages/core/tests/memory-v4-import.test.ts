import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AvaMemory, importOldMemory, importDone } from '../src/memory-v4/index.js';

let base: string;
let oldHome: string;
let projectPath: string;
let mem: AvaMemory;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'ava-import-'));
  oldHome = join(base, 'home', '.ava');
  projectPath = join(base, 'projects', 'DawnSets');
  await mkdir(join(oldHome, 'memory'), { recursive: true });
  await mkdir(join(projectPath, '.ava'), { recursive: true });
  const e = (content: string, createdAt: string, category = 'general') => ({ content, createdAt, category });
  await writeFile(join(oldHome, 'memory', 'graph.json'), JSON.stringify({ nodes: [
    e('Stewart is vegetarian and aiming for fat loss.', '2026-06-22T10:00:00Z', 'person'),
    e('Stewart is vegetarian and aiming for fat loss.', '2026-06-22T10:00:00Z', 'person'),
    e('The assistant uses enthusiastic language about images.', '2026-04-29T10:00:00Z'),
    e('Prefers thin type over bold.', '2026-11-06T10:00:00Z', 'preference'),
  ] }));
  await writeFile(join(oldHome, 'memory.json'), JSON.stringify({ entries: [
    e('Stewart is vegetarian and aiming for fat loss.', '2026-06-22T10:00:00Z', 'person'),
    { ...e('An archived old note that should not come back.', '2026-01-01T00:00:00Z'), archived: true },
  ] }));
  await writeFile(join(projectPath, '.ava', 'memory.json'), JSON.stringify({ entries: [
    e('DawnSets runs on Unreal Engine 5.8.', '2026-10-23T10:00:00Z', 'architecture'),
    e('Discovery: the fix is one line.', '2026-10-27T10:00:00Z'),
    e('Menu rows are hand-placed in WBP_Menu.', '2026-11-16T09:00:00Z', 'decision'),
  ] }));
  await writeFile(join(oldHome, 'projects.json'), JSON.stringify([
    { path: projectPath, name: 'DawnSets' },
    { path: projectPath.toUpperCase(), name: 'DawnSets' }, // the old registry's case-duplicates
    { path: join(base, 'home'), name: 'home' },            // the home folder listed as a project
  ]));
  mem = new AvaMemory({ root: join(base, 'v4') });
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('free import of the old memory', () => {
  it('brings everything across once: repeats folded, projects kept, noise set aside', async () => {
    const r = await importOldMemory({ mem, oldHome, now: new Date('2026-11-20T12:00:00Z') });
    expect(r).toMatchObject({ imported: 4, setAside: 2, projects: 1 });
    expect(r.repeatsFolded).toBeGreaterThanOrEqual(2);

    const facts = await mem.listFacts('fact');
    expect(facts.map((f) => f.text).sort()).toEqual([
      'DawnSets runs on Unreal Engine 5.8.',
      'Menu rows are hand-placed in WBP_Menu.',
      'Prefers thin type over bold.',
      'Stewart is vegetarian and aiming for fat loss.',
    ]);
    const veg = facts.find((f) => f.text.startsWith('Stewart is vegetarian'))!;
    expect(veg).toMatchObject({ scope: 'everywhere', kind: 'person', from: '2026-06-22', confirmed: '2026-11-20', tags: ['imported'] });
    const engine = facts.find((f) => f.text.includes('5.8'))!;
    expect(engine.scope).toBe(`project:${(await mem.projects.find(projectPath))!.id}`);
    expect(await mem.listFacts('pending')).toEqual([]); // their old memory works at once

    const aside = JSON.parse(await readFile(join(base, 'v4', '.import', 'set-aside.json'), 'utf-8'));
    expect(aside.map((a: { text: string }) => a.text)).toEqual(['The assistant uses enthusiastic language about images.', 'Discovery: the fix is one line.']);
    expect(importDone(join(base, 'v4'))).toBe(true);
  });

  it('runs once, and never touches the old files', async () => {
    const before = await readFile(join(oldHome, 'memory', 'graph.json'), 'utf-8');
    await importOldMemory({ mem, oldHome });
    expect((await importOldMemory({ mem, oldHome })).skippedAsDone).toBe(true);
    expect(await readFile(join(oldHome, 'memory', 'graph.json'), 'utf-8')).toBe(before);
    expect(existsSync(join(oldHome, 'memory.json'))).toBe(true);
  });

  it('with since, brings only what was saved after it', async () => {
    const r = await importOldMemory({ mem, oldHome, since: '2026-11-15T13:00:00Z' });
    expect(r.imported).toBe(1);
    expect((await mem.listFacts('fact')).map((f) => f.text)).toEqual(['Menu rows are hand-placed in WBP_Menu.']);
  });
});
