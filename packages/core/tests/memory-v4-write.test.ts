import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemorySession, consolidateSession } from '../src/memory-v4/index.js';
import { theirWords } from '../src/memory-v4/consolidate.js';
import { getWorkModePrefix } from '../src/agent/system-prompt.js';
import { MemorySaveV4Tool, MemoryUpdateV4Tool, MemoryDeleteV4Tool } from '../src/tools/memory-write-v4.js';
import type { Message } from '../src/core/types.js';

let root: string;
let projectPath: string;
let session: MemorySession;
const ctx = () => ({ sharedState: { memorySession: session } }) as never;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ava-mem-write-'));
  projectPath = join(root, 'projects', 'DawnSets');
  session = await MemorySession.open({ root, projectPath });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const idIn = (out: string) => out.match(/\[([a-z0-9-]+)\]/)?.[1] ?? '';

describe('memory_save (v4)', () => {
  const save = new MemorySaveV4Tool();

  it('saves what they said at once, with their words, scoped as asked', async () => {
    const r = await save.execute({ content: 'Prefers thin type.', scope: 'everywhere', source: 'said', quote: 'i hate bold', kind: 'preference' }, ctx());
    expect(r.success).toBe(true);
    const f = await session.mem.getFact(idIn(r.output));
    expect(f?.state).toBe('fact');
    expect(f?.quote).toBe('i hate bold');
    expect(f?.scope).toBe('everywhere');

    const p = await save.execute({ content: 'Walk is on the / key.', scope: 'project', source: 'said' }, ctx());
    expect((await session.mem.getFact(idIn(p.output)))?.scope).toBe(`project:${session.project!.id}`);
  });

  it('holds what she noticed for their yes, and tells her not to ask now', async () => {
    const r = await save.execute({ content: 'Seems to work late at night.', scope: 'everywhere', source: 'noticed' }, ctx());
    expect(r.output).toContain('Memory page');
    expect(r.output).toContain('Do not ask');
    expect((await session.mem.getFact(idIn(r.output)))?.state).toBe('pending');
  });

  it('notes a thread, with a due date', async () => {
    const r = await save.execute({ content: 'Remind him about the bill', scope: 'everywhere', source: 'said', kind: 'thread', due: '2026-11-19' }, ctx());
    expect(r.output).toContain('due 2026-11-19');
    expect((await session.mem.listThreads())[0].due).toBe('2026-11-19');
  });

  it('refuses credentials', async () => {
    const r = await save.execute({ content: 'Key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD', scope: 'everywhere', source: 'said' }, ctx());
    expect(r.success).toBe(false);
    expect(await session.mem.listFacts('all')).toEqual([]);
  });

  it('does not save the same fact twice', async () => {
    await save.execute({ content: 'Uses Git LFS.', scope: 'project', source: 'said' }, ctx());
    const again = await save.execute({ content: 'uses git lfs', scope: 'project', source: 'said' }, ctx());
    expect(again.output).toContain('Already remembered');
  });
});

describe('memory_update / memory_delete (v4)', () => {
  const save = new MemorySaveV4Tool();
  const update = new MemoryUpdateV4Tool();
  const del = new MemoryDeleteV4Tool();

  it('a change they told her replaces the fact; the old one becomes history', async () => {
    const id = idIn((await save.execute({ content: 'Trains four days a week.', scope: 'everywhere', source: 'said' }, ctx())).output);
    const r = await update.execute({ id, content: 'Trains three days a week (Mon/Wed/Fri).', quote: 'down to three days now' }, ctx());
    expect(r.success).toBe(true);
    expect((await session.mem.getFact(id))?.state).toBe('history');
  });

  it('a change she only noticed waits; the old fact stays current until their yes', async () => {
    const id = idIn((await save.execute({ content: 'Works on DawnSets in the evenings.', scope: 'everywhere', source: 'said' }, ctx())).output);
    const r = await update.execute({ id, content: 'Works on DawnSets in the afternoons.' }, ctx());
    expect(r.output).toContain('stays current');
    expect((await session.mem.getFact(id))?.state).toBe('fact');
    const pending = (await session.mem.listFacts('pending'))[0];
    expect(pending.replaces).toBe(id);

    await session.mem.confirmFact(pending.id);
    expect((await session.mem.getFact(id))?.state).toBe('history');
    expect((await session.mem.getFact(id))?.supersededBy).toBe(pending.id);
    expect((await session.mem.getFact(pending.id))?.state).toBe('fact');
  });

  it('a correction fixes wording without history', async () => {
    const id = idIn((await save.execute({ content: 'Likes Sora SemiBlod.', scope: 'everywhere', source: 'said' }, ctx())).output);
    await update.execute({ id, content: 'Likes Sora SemiBold.', change: 'correction' }, ctx());
    expect((await session.mem.getFact(id))?.text).toBe('Likes Sora SemiBold.');
    expect(await session.mem.listFacts('history')).toEqual([]);
  });

  it('closes a thread, and deletes facts and threads completely', async () => {
    const tid = idIn((await save.execute({ content: 'Finish the menu', scope: 'project', source: 'said', kind: 'thread' }, ctx())).output);
    expect((await update.execute({ id: tid, done: true }, ctx())).output).toContain('closed');
    expect(await session.mem.listThreads()).toEqual([]);

    const fid = idIn((await save.execute({ content: 'Was never true.', scope: 'everywhere', source: 'said' }, ctx())).output);
    expect((await del.execute({ id: `[${fid}]` }, ctx())).output).toContain('Forgotten');
    expect(await session.mem.getFact(fid)).toBeNull();
    expect((await del.execute({ id: tid }, ctx())).output).toContain('deleted');
  });
});

describe('end-of-session tidy-up', () => {
  // A stand-in model that returns a fixed reply and records what it was sent.
  function fakeModel(reply: unknown) {
    const sent: string[] = [];
    const provider = {
      async createCompletion(req: { messages: Array<{ content: string }> }) {
        sent.push(req.messages.map((m) => m.content).join('\n'));
        return { choices: [{ message: { content: typeof reply === 'string' ? reply : JSON.stringify(reply) } }] };
      },
    };
    return { provider: provider as never, model: { id: 'fake' } as never, sent };
  }

  const convo = (pairs: Array<[string, string]>): Message[] =>
    pairs.flatMap(([u, a]) => [{ role: 'user', content: u }, { role: 'assistant', content: a }] as Message[]);

  const transcript = convo([
    ['we moved walk off shift, its on the slash key now and dpad down', 'Done: walk is on / and D-pad Down; Shift stays for sprint.'],
    ['also i never want bold in the logo', 'Understood. Thin weights only.'],
    ['lets park the metahuman swap till after the test project', 'Parked.'],
  ]);

  it('writes the day, threads, facts (told vs noticed) and changes', async () => {
    const old = await session.mem.addFact({ text: 'Walk mode is on Shift.', scope: `project:${session.project!.id}` });
    const doneThread = await session.mem.addThread({ text: 'Rebind walk', project: session.project!.id });
    const m = fakeModel({
      day: ['Moved walk to / and D-pad Down; Shift kept for sprint'],
      threads_open: [{ text: 'MetaHuman swap, after the test project', due: '' }],
      threads_done: [doneThread.id],
      facts: [
        { text: 'Never wants bold in the logo.', kind: 'preference', scope: 'everywhere', source: 'said', quote: 'i never want bold in the logo' },
        { text: 'Prefers to park big swaps until tested.', kind: 'preference', scope: 'everywhere', source: 'noticed', quote: '' },
        { text: 'Claims a quote that is not there.', kind: 'preference', scope: 'everywhere', source: 'said', quote: 'words he never typed' },
      ],
      changes: [{ id: old.fact.id, text: 'Walk mode is on / (keyboard) and D-pad Down; Shift is sprint.', quote: 'its on the slash key now and dpad down' }],
    });
    const r = await consolidateSession({ session, messages: transcript, ...m, now: new Date(2026, 10, 15) });
    expect(r).toEqual({ dayLines: 1, threadsOpened: 1, threadsClosed: 1, saved: 1, waiting: 2, changed: 1 });

    expect((await session.mem.readDay('2026-11-15')).sections[0].lines).toEqual(['Moved walk to / and D-pad Down; Shift kept for sprint']);
    expect((await session.mem.listThreads()).map((t) => t.text)).toEqual(['MetaHuman swap, after the test project']);
    expect((await session.mem.getFact(old.fact.id))?.state).toBe('history');
    const facts = await session.mem.listFacts('fact');
    expect(facts.find((f) => f.text.startsWith('Never wants bold'))?.quote).toBe('i never want bold in the logo');
    // "said" with words that are not in the conversation is downgraded to noticed.
    expect((await session.mem.listFacts('pending')).map((f) => f.text).sort()).toEqual(['Claims a quote that is not there.', 'Prefers to park big swaps until tested.']);
    // It was shown the existing fact and the open thread, so it could update instead of repeat.
    expect(m.sent[0]).toContain(`[${old.fact.id}] Walk mode is on Shift.`);
    expect(m.sent[0]).toContain(`[${doneThread.id}] Rebind walk`);
  });

  it('ignores a change to a fact it was not shown, and never writes credentials', async () => {
    const m = fakeModel({
      facts: [{ text: 'API key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD', kind: 'project', scope: 'project', source: 'noticed' }],
      changes: [{ id: 'made-up-id', text: 'x', quote: '' }],
    });
    const r = await consolidateSession({ session, messages: transcript, ...m });
    expect(r?.saved).toBe(0);
    expect(r?.waiting).toBe(0);
    expect(await session.mem.listFacts('all')).toEqual([]);
  });

  it('does nothing for a one-message session or an unreadable reply', async () => {
    const m = fakeModel('not json at all');
    expect(await consolidateSession({ session, messages: convo([['hi there, quick one', 'Hello!']]), ...m })).toBeNull();
    expect(m.sent).toEqual([]);
    expect(await consolidateSession({ session, messages: transcript, ...m })).toBeNull();
  });

  it('never sends the host memory primers back to the model', async () => {
    const m = fakeModel({});
    const withPrimer: Message[] = [{ role: 'user', content: '[Memory Brief]\nsecret-ish primer' } as Message, ...transcript];
    await consolidateSession({ session, messages: withPrimer, ...m });
    expect(m.sent[0]).not.toContain('secret-ish primer');
  });

  it('reads their words without the mode wrapper, keeping every paragraph', () => {
    const msg = 'first paragraph of mine\n\nsecond paragraph of mine';
    expect(theirWords(getWorkModePrefix(msg))).toBe(msg);
    expect(theirWords('plain message')).toBe('plain message');
  });
});

describe('tidy-up model per fleet', () => {
  // A stand-in registry: holds the models of the providers it is given keys for.
  const registry = (keys: string[]) => ({
    resolveModel(id: string) {
      const [p, m] = id.includes(':') ? id.split(':') : [undefined, id];
      const owner = m.startsWith('qwen') ? 'qwen' : m.startsWith('deepseek') ? 'deepseek' : m.startsWith('mistral') ? 'mistral' : 'other';
      if (!keys.includes(owner) || (p && p !== owner)) return undefined;
      return { provider: { name: owner }, model: { id: m } };
    },
  }) as never;

  it('uses each fleet\'s main model, on its own providers only', async () => {
    const { resolveMemoryModel } = await import('../src/memory-v4/model.js');
    const all = ['qwen', 'deepseek', 'mistral'];
    expect(resolveMemoryModel(registry(all), all, 'auto')?.model.id).toBe('qwen3.7-plus');
    expect(resolveMemoryModel(registry(all), all, 'supernova')?.model.id).toBe('deepseek-flash');
    expect(resolveMemoryModel(registry(all), all, 'aurora')?.model.id).toBe('mistral-small-4');
    // Aurora without a Mistral key has no tidy-up: it never borrows another provider.
    expect(resolveMemoryModel(registry(['qwen']), ['qwen'], 'aurora')).toBeNull();
    // Own keys, no fleet: the first held.
    expect(resolveMemoryModel(registry(['mistral']), ['mistral'])?.model.id).toBe('mistral-small-4');
  });
});

describe('memory_save quote', () => {
  it('drops a quote that is only a request to save', async () => {
    const save = new MemorySaveV4Tool();
    const r = await save.execute({ content: 'Risky .uasset writes stay with him.', scope: 'everywhere', source: 'said', quote: 'can you save that as a memory please' }, ctx());
    const f = await session.mem.getFact(idIn(r.output));
    expect(f?.quote).toBeUndefined();
    expect(f?.state).toBe('fact');
    const r2 = await save.execute({ content: 'Dislikes bold.', scope: 'everywhere', source: 'said', quote: 'im not a great fan of bold fonts' }, ctx());
    expect((await session.mem.getFact(idIn(r2.output)))?.quote).toBe('im not a great fan of bold fonts');
  });
});
