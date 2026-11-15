import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AvaMemory,
  parseFact,
  serializeFact,
  slugFor,
  normalizeProjectPath,
  projectIdForPath,
  parseThreads,
  dayTitle,
  CORE_TOKEN_BUDGET,
  type Fact,
} from '../src/memory-v4/index.js';
import type { EmbeddingService } from '../src/memory/embedding-service.js';

let root: string;
let mem: AvaMemory;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ava-mem-v4-'));
  mem = new AvaMemory({ root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const ls = async (sub: string) => (existsSync(join(root, sub)) ? (await readdir(join(root, sub))).sort() : []);

describe('fact files', () => {
  it('round-trips every field, including a quote with quotes and a line break', () => {
    const fact: Fact = {
      id: 'doesnt-like-bold-type',
      kind: 'preference',
      scope: 'everywhere',
      source: 'said',
      quote: 'im not a "great" fan of bold\nnever have been',
      from: '2026-11-06',
      confirmed: '2026-11-06',
      replaces: 'likes-bold',
      tags: ['type', 'design'],
      text: "Doesn't like bold type; prefers thin or regular weights.",
      state: 'fact',
    };
    const back = parseFact(fact.id, serializeFact(fact), 'fact');
    expect(back).toEqual(fact);
  });

  it('is human-readable: frontmatter then the fact in plain words', () => {
    const text = serializeFact({ id: 'x', kind: 'person', scope: 'everywhere', source: 'said', from: '2026-11-15', text: 'Lives in the UK.', state: 'fact' });
    expect(text).toBe('---\nkind: person\nscope: everywhere\nsource: said\nfrom: 2026-11-15\n---\nLives in the UK.\n');
  });

  it('loads a hand-edited file leniently (CRLF, BOM, unknown values, no frontmatter)', () => {
    const edited = '\uFEFF---\r\nkind: banana\r\nscope: somewhere\r\nquote: \'single quoted\'\r\n---\r\nStill a fact.\r\n';
    const f = parseFact('hand', edited, 'fact')!;
    expect(f.text).toBe('Still a fact.');
    expect(f.kind).toBe('project');
    expect(f.scope).toBe('everywhere');
    expect(f.quote).toBe('single quoted');
    expect(parseFact('bare', 'Just words.', 'fact')!.text).toBe('Just words.');
    expect(parseFact('empty', '---\nkind: person\n---\n', 'fact')).toBeNull();
  });

  it('makes readable slugs', () => {
    expect(slugFor("Doesn't like bold type; prefers thin.")).toBe('doesnt-like-bold-type-prefers-thin');
    expect(slugFor('Café über naïve')).toBe('cafe-uber-naive');
    expect(slugFor('!!!')).toBe('fact');
    expect(slugFor('one two three four five six seven eight nine ten')).toBe('one-two-three-four-five-six-seven-eight');
  });
});

describe('saving facts', () => {
  it('saves what the person said as a fact, with their words', async () => {
    const { fact, created } = await mem.addFact({ text: 'Vegetarian, aiming for fat loss.', kind: 'person', quote: 'im vegetarian' });
    expect(created).toBe(true);
    expect(fact.state).toBe('fact');
    expect(await ls('facts')).toEqual([`${fact.id}.md`]);
    expect(await readFile(join(root, 'facts', `${fact.id}.md`), 'utf-8')).toContain('quote: "im vegetarian"');
  });

  it('holds an inferred fact in pending until confirmed', async () => {
    const { fact } = await mem.addFact({ text: 'Seems to prefer thin type.', source: 'inferred' });
    expect(fact.state).toBe('pending');
    expect(await ls('facts')).toEqual([]);
    expect(await mem.search('thin type')).toEqual([]);

    const confirmed = await mem.confirmFact(fact.id);
    expect(confirmed?.state).toBe('fact');
    expect(confirmed?.confirmed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await ls('pending')).toEqual([]);
    expect((await mem.search('thin type'))[0]?.fact.id).toBe(fact.id);
  });

  it('returns the existing fact instead of saving a copy', async () => {
    const a = await mem.addFact({ text: 'Verify with a tool before saying done.' });
    const b = await mem.addFact({ text: 'verify with a tool before saying done!' });
    expect(b.created).toBe(false);
    expect(b.fact.id).toBe(a.fact.id);
    expect(await ls('facts')).toHaveLength(1);
  });

  it('keeps the same words in two different projects as two facts', async () => {
    await mem.addFact({ text: 'Uses Git LFS.', scope: 'project:a-111111' });
    await mem.addFact({ text: 'Uses Git LFS.', scope: 'project:b-222222' });
    expect(await ls('facts')).toEqual(['uses-git-lfs-2.md', 'uses-git-lfs.md']);
  });

  it('refuses an empty memory', async () => {
    await expect(mem.addFact({ text: '   ' })).rejects.toThrow();
  });
});

describe('changing and deleting', () => {
  it('replaces a changed fact and keeps the old one as history', async () => {
    const { fact: old } = await mem.addFact({ text: 'Walk mode is on Shift.', scope: 'project:dawn-aaaaaa' });
    const res = await mem.replaceFact(old.id, { text: 'Walk mode is on / and D-pad Down; Shift is sprint.' });
    expect(res).not.toBeNull();
    expect(res!.fact.replaces).toBe(old.id);
    expect(res!.fact.scope).toBe('project:dawn-aaaaaa');
    expect(res!.previous.state).toBe('history');
    expect(res!.previous.supersededBy).toBe(res!.fact.id);
    expect(res!.previous.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(await ls('facts')).toEqual([`${res!.fact.id}.md`]);
    expect(await ls('history')).toEqual([`${old.id}.md`]);

    const chain = await mem.factHistory(res!.fact.id);
    expect(chain.map((f) => f.id)).toEqual([res!.fact.id, old.id]);

    // History is never searched as current.
    const hits = await mem.search('walk mode shift', { project: 'dawn-aaaaaa' });
    expect(hits.map((h) => h.fact.id)).toEqual([res!.fact.id]);
  });

  it('edits a fact in place without making history', async () => {
    const { fact } = await mem.addFact({ text: 'Dislikes bodl type.' });
    const edited = await mem.editFact(fact.id, { text: 'Dislikes bold type.' });
    expect(edited?.text).toBe('Dislikes bold type.');
    expect(await ls('history')).toEqual([]);
    expect((await mem.getFact(fact.id))?.text).toBe('Dislikes bold type.');
  });

  it('delete means gone: from every folder and from search, even a warm index', async () => {
    const { fact } = await mem.addFact({ text: 'Royal Engineers C3 systems specialist for twelve years.' });
    expect(await mem.search('Royal Engineers')).toHaveLength(1); // index now warm
    expect(await mem.deleteFact(fact.id)).toBe(true);
    expect(await mem.getFact(fact.id)).toBeNull();
    expect(await mem.search('Royal Engineers')).toEqual([]);
    expect(await mem.deleteFact(fact.id)).toBe(false);
  });

  it('deletes history and pending entries too', async () => {
    const { fact: p } = await mem.addFact({ text: 'Maybe likes jazz.', source: 'inferred' });
    const { fact: old } = await mem.addFact({ text: 'Training three days a week.' });
    await mem.replaceFact(old.id, { text: 'Training four days a week.' });
    expect(await mem.deleteFact(p.id)).toBe(true);
    expect(await mem.deleteFact(old.id)).toBe(true);
    expect(await ls('pending')).toEqual([]);
    expect(await ls('history')).toEqual([]);
  });
});

describe('core', () => {
  it('writes core within budget and refuses over it, writing nothing', async () => {
    expect((await mem.writeCore('# Who he is\nMemory loss; wants structure.')).ok).toBe(true);
    expect(await mem.readCore()).toContain('Memory loss');
    const tooLong = 'x'.repeat(CORE_TOKEN_BUDGET * 4 + 10);
    const res = await mem.writeCore(tooLong);
    expect(res.ok).toBe(false);
    expect(await mem.readCore()).toContain('Memory loss');
  });
});

describe('threads', () => {
  it('adds, skips repeats, closes and deletes, in a readable checklist', async () => {
    const t = await mem.addThread({ text: 'Remind him about the Alibaba bill', due: '2026-11-19' });
    const again = await mem.addThread({ text: 'remind him about the alibaba bill' });
    expect(again.id).toBe(t.id);
    await mem.addThread({ text: 'Finish the menu panel', project: 'dawn-aaaaaa' });

    const file = await readFile(join(root, 'threads.md'), 'utf-8');
    expect(file).toContain('- [ ] Remind him about the Alibaba bill <!--');
    expect(file).toContain('due:2026-11-19');

    expect(await mem.listThreads({ project: 'other-bbbbbb' })).toHaveLength(1); // only the unscoped one
    expect(await mem.listThreads({ project: 'dawn-aaaaaa' })).toHaveLength(2);

    expect(await mem.closeThread(t.id)).toBe(true);
    expect(await mem.closeThread(t.id)).toBe(false);
    expect((await mem.listThreads()).map((x) => x.text)).toEqual(['Finish the menu panel']);
    expect((await mem.listThreads({ includeDone: true })).find((x) => x.id === t.id)?.done).toBeTruthy();
    expect(await readFile(join(root, 'threads.md'), 'utf-8')).toContain('## Done');

    expect(await mem.deleteThread(t.id)).toBe(true);
    expect(await mem.listThreads({ includeDone: true })).toHaveLength(1);
  });

  it('keeps a thread on one line even if its text has line breaks', () => {
    const parsed = parseThreads('# Open threads\n\n- [ ] Call back <!-- id:ab12 added:2026-11-15 -->\nnoise line\n');
    expect(parsed).toEqual([{ id: 'ab12', text: 'Call back', project: undefined, added: '2026-11-15', due: undefined, done: undefined }]);
  });
});

describe('episodes', () => {
  it('records a day by project, skips repeats, and reads back', async () => {
    await mem.addToDay('2026-10-27', { project: 'dawn-aaaaaa', name: 'DawnSets' }, ['Menu drawer wired', 'Close button pause fixed']);
    await mem.addToDay('2026-10-27', { project: 'dawn-aaaaaa', name: 'DawnSets' }, ['menu drawer wired', 'CircularProgress assets committed (5b34725)']);
    await mem.addToDay('2026-10-27', { name: 'Everywhere' }, ['Talked about the brand']);
    const day = await mem.readDay('2026-10-27');
    expect(day.sections).toHaveLength(2);
    expect(day.sections[0].lines).toEqual(['Menu drawer wired', 'Close button pause fixed', 'CircularProgress assets committed (5b34725)']);
    expect(await readFile(join(root, 'episodes', '2026-10-27.md'), 'utf-8')).toMatch(/^# Tuesday 27 October 2026\n/);
    await mem.addToDay('2026-10-25', { name: 'Everywhere' }, ['Earlier day']);
    expect(await mem.listDays()).toEqual(['2026-10-25', '2026-10-27']);
  });

  it('rejects a non-date', async () => {
    await expect(mem.readDay('../../etc')).rejects.toThrow();
  });

  it('titles days in plain words', () => {
    expect(dayTitle('2026-11-15')).toBe('Sunday 15 November 2026');
  });
});

describe('projects', () => {
  it('gives the same id however a Windows path is spelled', () => {
    const a = projectIdForPath('C:\\Users\\stewa\\Desktop\\Stew.AI\\UnrealEngine\\SacredCrossing', 'win32');
    const b = projectIdForPath('c:\\users\\stewa\\desktop\\stew.ai\\unrealengine\\SacredCrossing\\', 'win32');
    expect(a).toBe(b);
    expect(a).toMatch(/^sacredcrossing-[0-9a-f]{6}$/);
    expect(normalizeProjectPath('C:\\A\\B\\', 'win32')).toBe('c:/a/b');
  });

  it('registers once, follows a moved project, and links both ways', async () => {
    const dawn = await mem.projectFor(join(root, 'DawnSets'), 'DawnSets');
    expect((await mem.projectFor(join(root, 'DawnSets'))).id).toBe(dawn.id);
    const sacred = await mem.projectFor(join(root, 'SacredCrossing'));

    await mem.projects.addPath(dawn.id, join(root, 'moved', 'DawnSets'));
    expect((await mem.projects.find(join(root, 'moved', 'DawnSets')))?.id).toBe(dawn.id);

    expect(await mem.linkProjects(dawn.id, sacred.id)).toBe(true);
    expect((await mem.projects.get(sacred.id))?.links).toEqual([dawn.id]);
    await mem.unlinkProjects(dawn.id, sacred.id);
    expect((await mem.projects.get(dawn.id))?.links).toEqual([]);
    expect(await mem.projects.all()).toHaveLength(2);
  });
});

describe('search keeps projects apart', () => {
  beforeEach(async () => {
    await mem.addFact({ text: 'Doesnt like bold type.', kind: 'preference' });
    await mem.addFact({ text: 'Project runs on Unreal Engine 5.8.', scope: 'project:dawn-aaaaaa' });
    await mem.addFact({ text: 'Project runs on Unreal Engine 5.7.', scope: 'project:sacred-bbbbbb' });
    await mem.addFact({ text: 'Website deploys from main on Render.', scope: 'project:web-cccccc' });
  });

  it('finds everywhere facts and the open project, never another project', async () => {
    const hits = await mem.search('Unreal Engine version', { project: 'dawn-aaaaaa' });
    expect(hits.map((h) => h.fact.text)).toEqual(['Project runs on Unreal Engine 5.8.']);
    expect(hits[0].from).toBe('here');
    expect((await mem.search('bold type', { project: 'dawn-aaaaaa' }))[0].from).toBe('everywhere');
  });

  it('with no project open, sees only everywhere facts', async () => {
    expect(await mem.search('Unreal Engine')).toEqual([]);
  });

  it('reaches linked projects only when asked, ranked below the open one', async () => {
    const dawn = await mem.projectFor(join(root, 'd'));
    const sacred = await mem.projectFor(join(root, 's'));
    await mem.addFact({ text: 'Unreal Engine build uses Build.bat.', scope: `project:${dawn.id}` });
    await mem.addFact({ text: 'Unreal Engine build uses Build.bat.', scope: `project:${sacred.id}` });
    await mem.linkProjects(dawn.id, sacred.id);

    expect((await mem.search('Build.bat', { project: dawn.id })).map((h) => h.from)).toEqual(['here']);
    const wide = await mem.search('Build.bat', { project: dawn.id, reach: 'linked' });
    expect(wide.map((h) => h.from)).toEqual(['here', 'linked']);
    expect(wide[0].score).toBeGreaterThan(wide[1].score);
  });

  it('reaches a named project, and labels it', async () => {
    const hits = await mem.search('Unreal Engine', { project: 'dawn-aaaaaa', alsoProjects: ['sacred-bbbbbb'] });
    expect(hits.map((h) => [h.fact.text, h.from])).toEqual([
      ['Project runs on Unreal Engine 5.8.', 'here'],
      ['Project runs on Unreal Engine 5.7.', 'other'],
    ]);
  });

  it('reach all searches everything, each hit saying where it is from', async () => {
    const hits = await mem.search('Unreal Engine', { reach: 'all' });
    expect(hits.map((h) => h.from).sort()).toEqual(['other', 'other']);
  });
});

describe('several apps at once', () => {
  it('loses nothing when many saves race', async () => {
    const other = new AvaMemory({ root });
    await Promise.all(
      Array.from({ length: 24 }, (_, i) => (i % 2 ? mem : other).addFact({ text: `Distinct fact number ${i} about the project.` })),
    );
    expect(await ls('facts')).toHaveLength(24);
    expect(existsSync(join(root, '.lock'))).toBe(false);
  });

  it('sees what another app saved and deleted', async () => {
    const other = new AvaMemory({ root });
    expect(await mem.search('flight apex')).toEqual([]);
    const { fact } = await other.addFact({ text: 'Flight engages at the jump apex.' });
    expect((await mem.search('flight apex'))[0]?.fact.id).toBe(fact.id);
    await other.deleteFact(fact.id);
    expect(await mem.search('flight apex')).toEqual([]);
  });

  it('takes over a lock left by a crashed app', async () => {
    await mkdir(join(root, '.lock'));
    const old = new Date(Date.now() - 60_000);
    const { utimes } = await import('node:fs/promises');
    await utimes(join(root, '.lock'), old, old);
    await mem.addFact({ text: 'Saved despite a stale lock.' });
    expect(await ls('facts')).toHaveLength(1);
  });

  it('notices a fact the person edited by hand in an editor', async () => {
    const { vi } = await import('vitest');
    const { fact } = await mem.addFact({ text: 'Prefers tea.' });
    expect((await mem.search('tea'))).toHaveLength(1); // cache and index warm
    // An editor writes in place: the folder's own time doesn't change.
    await writeFile(join(root, 'facts', `${fact.id}.md`), 'Prefers green tea, never coffee.\n');
    vi.useFakeTimers({ now: Date.now() + 5000, toFake: ['Date'] });
    try {
      expect((await mem.search('green tea coffee'))[0]?.fact.text).toBe('Prefers green tea, never coffee.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('picks up a fact the person added by hand', async () => {
    await mkdir(join(root, 'facts'), { recursive: true });
    await writeFile(join(root, 'facts', 'hand-written.md'), 'Prefers tea over coffee.\n');
    expect((await mem.search('tea coffee'))[0]?.fact.id).toBe('hand-written');
  });
});

describe('meaning search (local embeddings)', () => {
  // A stand-in embedder: maps words to fixed directions so "army" and
  // "Royal Engineers" land close together without any shared keyword.
  const AXES: Record<string, number> = { army: 0, soldier: 0, engineers: 0, royal: 0, military: 0, food: 1, vegetarian: 1, diet: 1, eat: 1 };
  const fake: EmbeddingService = {
    embedModel: 'fake-1',
    tripped: false,
    async embed(text: string) {
      const v = [0.01, 0.01, 0.01];
      for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) if (w in AXES) v[AXES[w]] += 1;
      return v;
    },
  } as unknown as EmbeddingService;

  it('finds a fact by meaning when no word matches, and forgets its vector on delete', async () => {
    const m = new AvaMemory({ root, embeddingService: fake });
    const { fact } = await m.addFact({ text: 'Served twelve years as a Royal Engineers C3 specialist.', kind: 'person' });
    await m.addFact({ text: 'Is vegetarian.', kind: 'person' });
    await m.backfillEmbeddings();

    const hits = await m.search('What did I do in the army?');
    expect(hits[0]?.fact.id).toBe(fact.id);
    expect(hits[0]?.match).toBe('meaning');

    await m.deleteFact(fact.id);
    const raw = JSON.parse(await readFile(join(root, '.index', 'embeddings.json'), 'utf-8'));
    expect(Object.keys(raw.vectors)).not.toContain(fact.id);
  });
});

describe('search in every language', () => {
  it('keeps file names and versions, drops trailing punctuation, folds plurals', async () => {
    const { tokenizeAll } = await import('../src/memory-v4/index.js');
    expect(tokenizeAll('Builds use Build.bat. On UE 5.8.')).toEqual(['build', 'use', 'build.bat', 'build', 'bat', 'ue', '5.8']);
  });

  it('indexes Arabic, Russian and Hindi words', async () => {
    const { tokenizeAll } = await import('../src/memory-v4/index.js');
    expect(tokenizeAll('نباتي منذ سنوات')).toEqual(['نباتي', 'منذ', 'سنوات']);
    expect(tokenizeAll('Вегетарианец, худеет.')).toEqual(['вегетарианец', 'худеет']);
    expect(tokenizeAll('शाकाहारी है')).toEqual(['शाकाहारी', 'है']);
  });

  it('indexes unspaced scripts as character pairs', async () => {
    const { tokenizeAll } = await import('../src/memory-v4/index.js');
    expect(tokenizeAll('素食主义')).toEqual(['素食', '食主', '主义']);
  });

  it('finds facts written in other languages', async () => {
    await mem.addFact({ text: '他是素食主义者，正在减脂。', kind: 'person' });
    await mem.addFact({ text: 'Он вегетарианец.', kind: 'person' });
    await mem.addFact({ text: 'Likes thin type.', kind: 'preference' });
    expect((await mem.search('素食'))[0]?.fact.text).toContain('素食');
    expect((await mem.search('вегетарианец'))[0]?.fact.text).toBe('Он вегетарианец.');
  });

  it('finds a brand-new user\'s first memory by one word', async () => {
    await mem.addFact({ text: 'Is vegetarian.', kind: 'person' });
    expect(await mem.search('vegetarian')).toHaveLength(1);
  });

  it('does not match on a common word alone', async () => {
    await mem.addFact({ text: 'The project uses Git LFS for large assets.', scope: 'project:p-111111' });
    await mem.addFact({ text: 'The project builds with Build.bat.', scope: 'project:p-111111' });
    await mem.addFact({ text: 'The project is an action RPG about a battle mage.', scope: 'project:p-111111' });
    await mem.addFact({ text: 'Menu state lives on the project HUD widget.', scope: 'project:p-111111' });
    await mem.addFact({ text: 'The project commits after each logical unit.', scope: 'project:p-111111' });
    expect(await mem.search('the project', { project: 'p-111111' })).toEqual([]);
    expect((await mem.search('large assets', { project: 'p-111111' }))).toHaveLength(1);
  });
});
