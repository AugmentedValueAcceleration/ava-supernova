import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AvaMemory, memoryPage } from '../src/memory-v4/index.js';
import type { PageOverview, PageFact } from '../src/memory-v4/index.js';

let root: string;
let mem: AvaMemory;
let dawnId: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ava-mem-page-'));
  mem = new AvaMemory({ root });
  dawnId = (await mem.projectFor(join(root, 'DawnSets'), 'DawnSets')).id;
  await mem.writeCore('## Who he is\n- Stewart.');
  await mem.addFact({ text: 'Dislikes bold type.', kind: 'preference', source: 'said', quote: 'not a fan of bold' });
  const old = await mem.addFact({ text: 'Trains four days.', kind: 'person' });
  await mem.replaceFact(old.fact.id, { text: 'Trains three days.', source: 'said', from: '2026-09-17' });
  await mem.addFact({ text: 'Runs on UE 5.8.', scope: `project:${dawnId}` });
  await mem.addFact({ text: 'Seems to prefer evenings.', source: 'inferred' });
  await mem.addToDay('2026-11-15', { project: dawnId, name: 'DawnSets' }, ['Stayed on 5.8']);
  await mem.addThread({ text: 'MetaHuman swap', project: dawnId });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('memory page', () => {
  it('gives the overview the page header needs', async () => {
    const o = await memoryPage(mem, 'overview') as PageOverview;
    expect(o).toMatchObject({ facts: 3, aboutYou: 2, days: 1, pending: 1, threadsOpen: 1, coreBudget: 1500 });
    expect(o.projects).toEqual([{ id: dawnId, name: 'DawnSets', count: 1, links: [], paths: [expect.any(String)] }]);
    expect(o.allProjects).toEqual([{ id: dawnId, name: 'DawnSets' }]);
  });

  it('lists each tab, with origin, quote and history', async () => {
    const you = await memoryPage(mem, 'facts', { view: 'you' }) as { items: PageFact[]; total: number };
    expect(you.total).toBe(2);
    const trains = you.items.find((f) => f.text === 'Trains three days.')!;
    expect(trains.origin).toBe('said');
    expect(trains.history).toEqual([expect.objectContaining({ text: 'Trains four days.', until: '2026-09-17' })]);
    expect(you.items.find((f) => f.text.startsWith('Dislikes'))!.quote).toBe('not a fan of bold');

    const proj = await memoryPage(mem, 'facts', { view: 'project', project: dawnId }) as { items: PageFact[] };
    expect(proj.items.map((f) => [f.text, f.project])).toEqual([['Runs on UE 5.8.', 'DawnSets']]);

    const pending = await memoryPage(mem, 'facts', { view: 'pending' }) as { items: PageFact[] };
    expect(pending.items[0]).toMatchObject({ text: 'Seems to prefer evenings.', origin: 'noticed' });
  });

  it('searches, and pages at 40', async () => {
    for (let i = 0; i < 45; i++) await mem.addFact({ text: `Filler fact number ${i} about nothing.` });
    const first = await memoryPage(mem, 'facts', { view: 'you' }) as { items: PageFact[]; total: number };
    expect(first.items).toHaveLength(40);
    expect(first.total).toBe(47);
    const next = await memoryPage(mem, 'facts', { view: 'you', offset: 40 }) as { items: PageFact[] };
    expect(next.items).toHaveLength(7);
    const found = await memoryPage(mem, 'facts', { view: 'you', query: 'BOLD' }) as { total: number };
    expect(found.total).toBe(1);
  });

  it('acts: yes, no, edit, forget, core, threads', async () => {
    const pendingId = (await mem.listFacts('pending'))[0].id;
    expect(await memoryPage(mem, 'confirm', { id: pendingId })).toEqual({ ok: true });
    expect((await mem.getFact(pendingId))?.state).toBe('fact');

    const bold = (await mem.listFacts('fact')).find((f) => f.text.startsWith('Dislikes'))!;
    expect(await memoryPage(mem, 'edit', { id: bold.id, text: 'Dislikes bold type; prefers thin.' })).toEqual({ ok: true });
    expect(await memoryPage(mem, 'forget', { id: bold.id })).toEqual({ ok: true });
    expect(await mem.getFact(bold.id)).toBeNull();

    expect((await memoryPage(mem, 'core', { text: 'x'.repeat(7000) }) as { ok: boolean }).ok).toBe(false);
    expect(await memoryPage(mem, 'core', { text: '## Who he is\n- Stewart, UK.' })).toEqual({ ok: true, tokens: 7 });

    const t = (await mem.listThreads())[0];
    await memoryPage(mem, 'thread_done', { id: t.id });
    expect(await mem.listThreads()).toEqual([]);
    await memoryPage(mem, 'thread_reopen', { id: t.id });
    expect((await mem.listThreads())[0].id).toBe(t.id);
    await memoryPage(mem, 'thread_add', { text: 'Ask about the bill', due: '2026-11-19' });
    const threads = await memoryPage(mem, 'threads') as Array<{ text: string; projectName: string | null }>;
    expect(threads.map((x) => [x.text, x.projectName])).toEqual([['MetaHuman swap', 'DawnSets'], ['Ask about the bill', null]]);
  });

  it('lists days newest first', async () => {
    await mem.addToDay('2026-11-14', { name: 'Everywhere' }, ['Released Health']);
    const d = await memoryPage(mem, 'days') as { days: Array<{ date: string }>; total: number };
    expect(d.days.map((x) => x.date)).toEqual(['2026-11-15', '2026-11-14']);
  });

  it('links and unlinks projects', async () => {
    const other = (await mem.projectFor(join(root, 'Web'), 'Website')).id;
    expect(await memoryPage(mem, 'link', { a: dawnId, b: other })).toEqual({ ok: true });
    expect((await mem.projects.get(other))?.links).toEqual([dawnId]);
    await memoryPage(mem, 'unlink', { a: dawnId, b: other });
    expect((await mem.projects.get(dawnId))?.links).toEqual([]);
  });
});

describe('across projects', () => {
  it('suggests a lesson seen in a second project as everywhere, once, waiting for a yes', async () => {
    const { suggestPromotion } = await import('../src/memory-v4/promotion.js');
    const web = (await mem.projectFor(join(root, 'Web'), 'Website')).id;
    await mem.addFact({ text: 'Always read a file before writing it to avoid clobbering.', scope: `project:${dawnId}` });
    // Padding so the search has a realistic spread of words.
    for (const t of ['Menu rows are hand-placed.', 'Charge drains 20 per second.', 'Uses Git LFS for assets.', 'Walk is on the slash key.']) await mem.addFact({ text: t, scope: `project:${dawnId}` });
    const { fact } = await mem.addFact({ text: 'Always read a file before writing it, to avoid clobbering it.', scope: `project:${web}` });
    const s = await suggestPromotion(mem, fact);
    expect(s).not.toBeNull();
    expect(s).toMatchObject({ scope: 'everywhere', state: 'pending' });
    expect(await suggestPromotion(mem, fact)).toBeNull(); // not suggested twice
    const page = await memoryPage(mem, 'facts', { view: 'pending' }) as { items: Array<{ text: string; seenIn?: string[] }> };
    const promo = page.items.find((i) => i.seenIn);
    expect(promo?.seenIn?.sort()).toEqual(['DawnSets', 'Website']);
  });

  it('lets a linked project\'s facts into the lookup, ranked below this one\'s', async () => {
    const { MemorySession } = await import('../src/memory-v4/reader.js');
    const web = (await mem.projectFor(join(root, 'Web'), 'Website')).id;
    await mem.addFact({ text: 'The website deploys from main on Render.', scope: `project:${web}` });
    const before = await MemorySession.open({ root, projectPath: join(root, 'DawnSets') });
    expect(await before.messageBlock('what branch deploys on Render?')).not.toContain('deploys from main');
    await mem.linkProjects(dawnId, web);
    const after = await MemorySession.open({ root, projectPath: join(root, 'DawnSets') });
    expect(await after.messageBlock('what branch deploys on Render?')).toContain('(Website, since');
  });

  it('follows a moved project, and forgets a finished one', async () => {
    const moved = join(root, 'Moved', 'DawnSets');
    expect(await memoryPage(mem, 'project_move', { project: dawnId, path: moved })).toEqual({ ok: true });
    expect((await mem.projects.find(moved))?.id).toBe(dawnId);
    const r = await memoryPage(mem, 'project_forget', { project: dawnId }) as { ok: boolean; facts: number; threads: number };
    expect(r).toEqual({ ok: true, facts: 1, threads: 1 });
    expect((await mem.listFacts('all')).some((f) => f.scope === `project:${dawnId}`)).toBe(false);
    expect(await mem.projects.get(dawnId)).toBeUndefined();
    expect((await mem.readDay('2026-11-15')).sections).toHaveLength(1); // the day stays
  });
});
