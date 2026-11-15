// The new memory is the only memory (15 Nov 2026): forgetting everything,
// deleting the old files, and desktop mode's learned steps kept out of it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AvaMemory, importOldMemory, memoryPage, removeOldMemoryFiles, memoryV4Root } from '../src/memory-v4/index.js';
import { DesktopLearnedSteps } from '../src/desktop/learned-steps.js';

let base: string;
let oldHome: string;
let projectPath: string;

const step = (task: string, app = 'settings') => ({
  content: `**Desktop task:** ${task}\n\n**On this machine — what was tried and how it went:**\n1. launch → ${app}  ✓`,
  category: 'pattern',
  tags: ['desktop', app],
  createdAt: '2026-10-01T10:00:00Z',
});

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'ava-v4only-'));
  oldHome = join(base, 'home', '.ava');
  projectPath = join(base, 'projects', 'DawnSets');
  await mkdir(join(oldHome, 'memory'), { recursive: true });
  await mkdir(join(projectPath, '.ava'), { recursive: true });
  await writeFile(join(oldHome, 'memory', 'graph.json'), JSON.stringify({ nodes: [
    { content: 'Prefers thin type over bold in every design.', createdAt: '2026-11-06T10:00:00Z', category: 'preference' },
    step('open the Start menu, then click the Settings icon'),
    step('double-click the Recycle Bin', 'explorer'),
  ] }));
  await writeFile(join(oldHome, 'memory.json'), JSON.stringify({ entries: [] }));
  await writeFile(join(projectPath, '.ava', 'memory.json'), JSON.stringify({ entries: [
    { content: 'DawnSets uses a fixed timestep of 60 updates a second.', createdAt: '2026-10-02T10:00:00Z' },
  ] }));
  await writeFile(join(oldHome, 'projects.json'), JSON.stringify([{ path: projectPath, name: 'DawnSets' }]));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
  delete process.env.AVA_MEMORY_V4;
});

describe('there is no switch back to the old memory', () => {
  it('memoryV4Root always gives a folder, even with AVA_MEMORY_V4=off', () => {
    process.env.AVA_MEMORY_V4 = 'off';
    expect(memoryV4Root()).toBeTruthy();
  });
});

describe('the import leaves learned desktop steps out of memory', () => {
  it('brings the preference and the project fact, not the desktop steps', async () => {
    const mem = new AvaMemory({ root: join(base, 'mem') });
    await importOldMemory({ mem, oldHome });
    const texts = (await mem.listFacts('all')).map((f) => f.text);
    expect(texts.some((t) => t.includes('thin type'))).toBe(true);
    expect(texts.some((t) => t.includes('fixed timestep'))).toBe(true);
    expect(texts.some((t) => t.includes('Desktop task'))).toBe(false);
  });
});

describe('DesktopLearnedSteps', () => {
  it('brings the old desktop steps across once, and finds them by task', async () => {
    const steps = await DesktopLearnedSteps.open(oldHome);
    expect(steps.size).toBe(2);
    const found = steps.find('open settings from the start menu');
    expect(found[0]?.content).toContain('Start menu');
    // Opened again: read from its own file, not brought across a second time.
    const again = await DesktopLearnedSteps.open(oldHome);
    expect(again.size).toBe(2);
  });

  it('a task learned again replaces the older run', async () => {
    const steps = await DesktopLearnedSteps.open(oldHome);
    await steps.add(step('double-click the Recycle Bin', 'explorer').content.replace('✓', '✓ (again)'), ['desktop', 'explorer']);
    expect(steps.size).toBe(2);
    expect(steps.find('recycle bin')[0]?.content).toContain('(again)');
    const saved = JSON.parse(await readFile(join(oldHome, 'desktop', 'learned-steps.json'), 'utf-8'));
    expect(saved.steps).toHaveLength(2);
  });

  it('finds nothing for an unrelated task', async () => {
    const steps = await DesktopLearnedSteps.open(oldHome);
    expect(steps.find('write a haiku about the sea')).toHaveLength(0);
  });
});

describe('forget everything', () => {
  it('the page op empties the memory but keeps the import marker', async () => {
    const root = join(base, 'mem');
    const mem = new AvaMemory({ root });
    await importOldMemory({ mem, oldHome });
    await mem.writeCore('About them: builds games.');
    await mem.addThread({ text: 'Finish the timestep refactor' });
    await mem.addFact({ text: 'Maybe they prefer dark themes.', source: 'inferred' });
    await mem.addToDay('2026-11-15', { name: 'Everywhere' }, ['Talked about memory.']);
    expect((await mem.listFacts('all')).length).toBeGreaterThan(0);

    const r = await memoryPage(mem, 'forget_all', {}) as { ok: boolean; facts: number };
    expect(r.ok).toBe(true);
    expect(r.facts).toBeGreaterThan(0);

    expect(await mem.listFacts('all')).toHaveLength(0);
    expect(await mem.readCore()).toBe('');
    expect(await mem.listThreads({ includeDone: true })).toHaveLength(0);
    expect(await mem.listDays()).toHaveLength(0);
    expect(await mem.projects.all()).toHaveLength(0);
    expect(await mem.search('timestep')).toHaveLength(0);
    expect(existsSync(join(root, '.import', 'done.json'))).toBe(true);

    // And it still works afterwards.
    await mem.addFact({ text: 'Likes short answers.' });
    expect((await mem.search('short answers')).length).toBe(1);
  });

  it('removeOldMemoryFiles deletes the old global and project files the import reads', async () => {
    const removed = await removeOldMemoryFiles(oldHome);
    expect(removed).toBe(3);
    expect(existsSync(join(oldHome, 'memory', 'graph.json'))).toBe(false);
    expect(existsSync(join(oldHome, 'memory.json'))).toBe(false);
    expect(existsSync(join(projectPath, '.ava', 'memory.json'))).toBe(false);
    expect(await removeOldMemoryFiles(oldHome)).toBe(0);
  });
});
