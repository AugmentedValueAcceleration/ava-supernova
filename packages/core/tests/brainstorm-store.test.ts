// Brainstorms are kept, and they are kept LOCALLY (plan 2026-11-17-brainstorm).
//
//   1. Always local, never in a project — not even gitignored inside it: a
//      `git add -f`, a zip or a copied folder takes it along.
//   2. Saved as you go. The mode exists for someone not ready to commit — so
//      nothing waits for a project to exist.
//   3. Plans live OUTSIDE projects; assigning is a LINK (17 Nov: "create plans
//      outside of a project but not part of a project"). Until then "attach"
//      MOVED a session into the project's notes — those come back.
//   4. Plans are living: steps get ticked, changes get noted with why.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BrainstormStore, projectHash, normaliseKind, setPlan, tickSteps, addChange, setExperience, summarise,
} from '../src/brainstorm/brainstorm-store.js';

let home: string;      // stands in for ~/.ava
let project: string;   // stands in for a real project folder
let store: BrainstormStore;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'ava-home-'));
  project = await mkdtemp(join(tmpdir(), 'ava-project-'));
  store = new BrainstormStore({ globalDir: home });
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
  await rm(project, { recursive: true, force: true });
});

describe('nothing is written into a project', () => {
  it('keeps every brainstorm in ~/.ava/brainstorm, assigned or not', async () => {
    const s = store.create('feature', 'Sharing with a partner', project);
    await store.save(s);
    expect(existsSync(join(home, 'brainstorm', `${s.id}.json`))).toBe(true);
    expect(await readdir(project)).toEqual([]);
  });

  // A Windows promise (drive letters, backslashes, any case): checked where it applies.
  it.runIf(process.platform === 'win32')('hashes the project path the same way regardless of trailing slash or case (shared with project data)', () => {
    expect(projectHash('C:\\Work\\App\\')).toBe(projectHash('c:/work/app'));
  });
});

describe('a brainstorm survives before there is a project', () => {
  it('saves one with no project at all, and lists it back', async () => {
    const s = store.create('project', 'Something with music');
    store.addIdea(s, { title: 'Beat maker', summary: 'A tiny step sequencer', status: 'candidate' });
    await store.save(s);
    const [only] = await store.list();
    expect(only).toMatchObject({ id: s.id, kind: 'project', headline: 'Something with music', ideaCount: 1, openCount: 1, attached: false });
    expect(only.projectPath).toBeUndefined();
  });

  it('keeps WHY an idea was turned down', async () => {
    const s = store.create('project', 'x');
    store.addIdea(s, { title: 'Open Banking', summary: 'Live sync', status: 'rejected', reason: 'costs money' });
    await store.save(s);
    expect((await store.get(s.id))!.ideas[0].reason).toBe('costs money');
  });
});

describe('the kinds', () => {
  it('reads the old two as the new ones: a blank page was a project, evolving was a direction', () => {
    expect(normaliseKind('blank')).toBe('project');
    expect(normaliseKind('evolve')).toBe('direction');
    expect(normaliseKind('experience')).toBe('experience');
    expect(normaliseKind('nonsense')).toBe('unsure');
  });

  it('upgrades an old file when it is read', async () => {
    await mkdir(join(home, 'brainstorm'), { recursive: true });
    await writeFile(join(home, 'brainstorm', 'old1.json'), JSON.stringify({ version: 1, id: 'old1', kind: 'evolve', headline: 'h', ideas: [], notes: [], startedAt: '2026-09-01', updatedAt: '2026-09-01' }));
    expect(await store.get('old1')).toMatchObject({ version: 2, kind: 'direction' });
  });
});

describe('assigning to a project is a link', () => {
  it('records the project and moves nothing', async () => {
    const s = store.create('project', 'Calm budget');
    await store.save(s);
    await store.assign(s.id, project);
    expect(existsSync(join(home, 'brainstorm', `${s.id}.json`))).toBe(true);
    expect((await store.get(s.id))!.projectPath).toBe(project);
    expect((await store.forProject(project)).map((x) => x.id)).toEqual([s.id]);
    await store.assign(s.id, null);
    expect((await store.get(s.id))!.projectPath).toBeUndefined();
  });

  it('lists a project\'s own brainstorms first, then the rest', async () => {
    const other = store.create('project', 'Other');
    await store.save(other);
    const mine = store.create('feature', 'Mine', project);
    await store.save(mine);
    // Saved first, so "other" is older — but "mine" leads because it's this project's.
    const listed = await store.list(project);
    expect(listed.map((x) => x.id)).toEqual([mine.id, other.id]);
  });

  it('brings back brainstorms the old "attach" moved into a project\'s notes, keeping the assignment', async () => {
    const oldDir = join(home, 'project-notes', projectHash(project), 'brainstorm');
    await mkdir(oldDir, { recursive: true });
    await writeFile(join(oldDir, 'moved1.json'), JSON.stringify({ version: 1, id: 'moved1', kind: 'blank', headline: 'From before', ideas: [], notes: [], projectPath: project, startedAt: '2026-10-01', updatedAt: '2026-10-01' }));
    const listed = await store.list();
    expect(listed.map((x) => x.id)).toContain('moved1');
    expect(existsSync(join(oldDir, 'moved1.json'))).toBe(false);
    expect(await store.get('moved1')).toMatchObject({ kind: 'project', projectPath: project });
  });

  it('can be deleted', async () => {
    const s = store.create('project', 'x');
    await store.save(s);
    expect(await store.delete(s.id)).toBe(true);
    expect(await store.get(s.id)).toBeNull();
  });

  it('is empty rather than failing before anything has been saved, and skips a corrupt file', async () => {
    expect(await store.list()).toEqual([]);
    await mkdir(join(home, 'brainstorm'), { recursive: true });
    await writeFile(join(home, 'brainstorm', 'bad.json'), '{ not json');
    const ok = store.create('project', 'fine');
    await store.save(ok);
    expect((await store.list()).map((x) => x.id)).toEqual([ok.id]);
  });
});

describe('the plan is living', () => {
  it('keeps ticks across a rewrite, notes changes with why, and counts progress', () => {
    const s = store.create('project', 'Calm budget');
    setPlan(s, { summary: 'Envelopes, gently', steps: [{ text: 'Envelopes' }, { text: 'Left this week' }, { text: 'Bank import', tier: 'ambitious' }] });
    expect(tickSteps(s, ['envelopes'])).toBe(1);
    setPlan(s, { steps: [{ text: 'Envelopes' }, { text: 'Left this week' }, { text: 'Sunday check-in' }] });
    expect(s.plan!.steps.find((x) => x.text === 'Envelopes')!.done).toBe(true);
    addChange(s, { type: 'changed', text: 'Weekly, not monthly — monthly felt scary', from: 'work' });
    expect(s.plan!.changes[0]).toMatchObject({ type: 'changed', from: 'work' });
    expect(summarise(s)).toMatchObject({ stepsDone: 1, stepsTotal: 3 });
  });

  it('keeps the experience: words, what it must not be, principles', () => {
    const s = store.create('experience', 'Calm, not stressful');
    setExperience(s, { words: ['calm', 'in control'], notWords: ['guilty'], principles: [{ title: 'Nothing shouts', do: 'soft colours', dont: 'red numbers' }] });
    setExperience(s, { words: ['calm', 'in control', 'encouraged'] });
    expect(s.experience).toMatchObject({ words: ['calm', 'in control', 'encouraged'], notWords: ['guilty'] });
    expect(s.experience!.principles).toHaveLength(1);
    expect(summarise(s).hasExperience).toBe(true);
  });
});
