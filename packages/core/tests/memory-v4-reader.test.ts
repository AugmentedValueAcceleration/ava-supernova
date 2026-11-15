import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AvaMemory, MemorySession, datesIn } from '../src/memory-v4/index.js';
import { MemoryRecallV4Tool } from '../src/tools/memory-recall-v4.js';
import { buildSystemPrompt } from '../src/agent/system-prompt.js';

let root: string;
let dawnPath: string;
let sacredPath: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ava-mem-reader-'));
  dawnPath = join(root, 'projects', 'DawnSets');
  sacredPath = join(root, 'projects', 'SacredCrossing');
  const mem = new AvaMemory({ root });
  const dawn = await mem.projectFor(dawnPath, 'DawnSets');
  const sacred = await mem.projectFor(sacredPath, 'Sacred Crossing');
  await mem.writeCore('## Who he is\n- Stewart. Lives with memory loss.');
  await mem.addFact({ text: 'Dislikes bold type; prefers thin weights.', kind: 'preference', quote: 'im not a great fan of bold' });
  await mem.addFact({ text: "Growth is Attunement, not XP: per-world attunement fills from scanning and flying.", scope: `project:${dawn.id}` });
  await mem.addFact({ text: 'Runs on Unreal Engine 5.8.', scope: `project:${dawn.id}` });
  await mem.addFact({ text: 'Runs on Unreal Engine 5.7.', scope: `project:${sacred.id}` });
  await mem.addFact({ text: 'Blueprints only for animation and UMG; all gameplay in C++.', scope: `project:${sacred.id}` });
  await mem.addToDay('2026-10-25', { project: dawn.id, name: 'DawnSets' }, ['Built the Charge component']);
  await mem.addToDay('2026-10-27', { project: dawn.id, name: 'DawnSets' }, ['Menu drawer wired', 'Close button pause fixed']);
  await mem.addToDay('2026-10-27', { project: sacred.id, name: 'Sacred Crossing' }, ['Baked the rock textures']);
  await mem.addToDay('2026-11-06', { name: 'Everywhere' }, ['Agreed the DawnSets brand kit']);
  await mem.addThread({ text: 'MetaHuman body swap, after a test project', project: dawn.id });
  await mem.addThread({ text: 'Remind him about the bill on the 19th' });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('datesIn', () => {
  const now = new Date(2026, 10, 15); // 15 Nov 2026
  it('reads the ways people name a day', () => {
    expect(datesIn('what did we do on 27 October?', now)).toEqual(['2026-10-27']);
    expect(datesIn('October 27th please', now)).toEqual(['2026-10-27']);
    expect(datesIn('on the 6th of november', now)).toEqual(['2026-11-06']);
    expect(datesIn('6th of November', now)).toEqual(['2026-11-06']);
    expect(datesIn('2026-10-25 and 3 Nov', now)).toEqual(['2026-10-25', '2026-11-03']);
    expect(datesIn('what about yesterday and today', now)).toEqual(['2026-11-15', '2026-11-14']);
  });
  it('puts a yearless date in the past, never the future', () => {
    expect(datesIn('25 December', now)).toEqual(['2025-12-25']);
  });
  it('ignores impossible days and words that only look like months', () => {
    expect(datesIn('45 March', now)).toEqual([]);
    expect(datesIn('I may do it', now)).toEqual([]);
  });
});

describe('session block (system prompt)', () => {
  it('in a project: core, that project\'s last day, its threads and the general ones', async () => {
    const s = await MemorySession.open({ root, projectPath: dawnPath });
    const block = await s.sessionBlock();
    expect(block).toContain('<core-memory>');
    expect(block).toContain('Lives with memory loss');
    expect(block).toContain('Where you left off in DawnSets (Tuesday 27 October 2026)');
    expect(block).toContain('Menu drawer wired');
    expect(block).not.toContain('rock textures'); // another project's day
    expect(block).toMatch(/- MetaHuman body swap, after a test project \[[0-9a-f]{8}\]\n/); // its own project: no label, first; id for closing it
    expect(block).toContain('Remind him about the bill');
  });

  it('with no project: core and the most recent day overall', async () => {
    const s = await MemorySession.open({ root });
    const block = await s.sessionBlock();
    expect(block).toContain('Where you left off (Friday 6 November 2026)');
    expect(block).toContain('Agreed the DawnSets brand kit');
    expect(block).toContain('MetaHuman body swap, after a test project [DawnSets]'); // carried everywhere, labelled
  });

  it('reaches buildSystemPrompt in every mode via coreMemory', async () => {
    const s = await MemorySession.open({ root, projectPath: dawnPath });
    const prompt = buildSystemPrompt({ cwd: dawnPath, platform: 'win32', shell: 'bash', coreMemory: await s.sessionBlock() });
    expect(prompt).toContain('<core-memory>');
    expect(prompt).toContain('search memory first');
  });

  it('is empty for a brand-new memory', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'ava-mem-empty-'));
    try {
      const s = await MemorySession.open({ root: empty, projectPath: dawnPath });
      expect(await s.sessionBlock()).toBe('');
      expect(await s.messageBlock('anything at all here')).toBe('');
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe('message block (each message)', () => {
  it('finds this project\'s facts and never another project\'s', async () => {
    const s = await MemorySession.open({ root, projectPath: sacredPath });
    const block = await s.messageBlock('What Unreal Engine version are we on?');
    expect(block).toContain('5.7');
    expect(block).not.toContain('5.8');
  });

  it('labels facts and carries their own words', async () => {
    const s = await MemorySession.open({ root, projectPath: dawnPath });
    const block = await s.messageBlock('should I use bold type for the logo?');
    expect(block).toContain('(about them, since');
    expect(block).toContain('their words: "im not a great fan of bold"');
  });

  it('adds a day the message names', async () => {
    const s = await MemorySession.open({ root, projectPath: dawnPath });
    const block = await s.messageBlock('What did we do on 27 October?', new Date(2026, 10, 15));
    expect(block).toContain('What happened on Tuesday 27 October 2026');
    expect(block).toContain('Menu drawer wired');
    expect(block).toContain('Baked the rock textures'); // a day is a day: every project
  });

  it('says so when a named day has nothing', async () => {
    const s = await MemorySession.open({ root });
    expect(await s.messageBlock('anything on 1 November?', new Date(2026, 10, 15))).toContain('Nothing is recorded for Sunday 1 November 2026');
  });

  it('skips very short messages', async () => {
    const s = await MemorySession.open({ root, projectPath: dawnPath });
    expect(await s.messageBlock('ok')).toBe('');
  });
});

describe('memory_recall (v4)', () => {
  const tool = new MemoryRecallV4Tool();
  const run = async (session: MemorySession, args: Record<string, unknown>) =>
    tool.execute(args, { sharedState: { memorySession: session } } as never);

  it('searches here by default', async () => {
    const s = await MemorySession.open({ root, projectPath: dawnPath });
    const r = await run(s, { query: 'XP growth' });
    expect(r.success).toBe(true);
    expect(r.output).toContain('Attunement');
    expect(r.output).toContain('(DawnSets, since');
  });

  it('reaches another project by name, labelled', async () => {
    const s = await MemorySession.open({ root, projectPath: dawnPath });
    const r = await run(s, { query: 'Blueprints gameplay C++', project: 'sacred crossing' });
    expect(r.output).toContain('(Sacred Crossing, since');
    expect(r.output).toContain('animation and UMG');
  });

  it('names the known projects when asked for one that does not exist', async () => {
    const s = await MemorySession.open({ root, projectPath: dawnPath });
    const r = await run(s, { query: 'x', project: 'Nope' });
    expect(r.output).toContain('No project called "Nope"');
    expect(r.output).toContain('DawnSets');
  });

  it('reads a day', async () => {
    const s = await MemorySession.open({ root });
    const r = await run(s, { date: '2026-10-25' });
    expect(r.output).toContain('Built the Charge component');
    expect((await run(s, { date: '25 Oct' })).output).toContain('is not a date');
  });

  it('fails clearly without a memory session', async () => {
    const r = await tool.execute({ query: 'x' }, { sharedState: {} } as never);
    expect(r.success).toBe(false);
  });
});
