// Brainstorm sessions are kept, and they are kept LOCALLY.
//
// Two rules, both settled with the operator on 2026-08-20:
//
//   1. Always local. Never in the repo — not even gitignored inside it.
//      `Decisions/drafts/` was considered and rejected: gitignored is usually
//      safe, not always, because the folder still sits in the project tree
//      where a `git add -f`, a zip, or a copied directory takes it along.
//
//   2. Saved as you go, attached later. The mode exists for someone who is not
//      ready to commit yet — that IS the state — so nothing waits for a project
//      to exist. Requiring commitment before anything is kept would lose
//      exactly the sessions worth keeping: explore five ideas, pick none, close
//      the app, and Thursday starts from nothing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrainstormStore, projectHash } from '../src/brainstorm/brainstorm-store.js';

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

describe('nothing is written into the project', () => {
  it('keeps an evolve session under the local dir, not the project folder', async () => {
    // The rule that matters most. An evolve session knows the project path —
    // which is exactly when it would be tempting to write beside the code.
    const s = store.create('evolve', 'Where does the inventory go next', project);
    store.addIdea(s, { title: 'Drag to equip', summary: 'Slot-to-slot drag', status: 'candidate' });
    await store.save(s);

    expect(await readdir(project)).toEqual([]);
    expect(existsSync(join(home, 'projects', projectHash(project), 'brainstorm', s.id + '.json'))).toBe(true);
  });

  it('hashes the project path the same way regardless of trailing slash or case', async () => {
    // Matches verification-trust's cwdHash, so one project cannot end up with
    // two buckets — for trust or for brainstorming.
    expect(projectHash(project)).toBe(projectHash(project + '/'));
    expect(projectHash(project)).toBe(projectHash(project.toUpperCase()));
  });
});

describe('a session survives before there is a project', () => {
  it('saves a blank-page session with no project at all', async () => {
    const s = store.create('blank', 'Something to build on Sunday');
    store.addIdea(s, { title: 'Tide clock', summary: 'A clock face showing the tide', status: 'candidate' });
    await store.save(s);

    const found = await store.get(s.id);
    expect(found?.headline).toBe('Something to build on Sunday');
    expect(found?.ideas).toHaveLength(1);
    expect(found?.projectPath).toBeUndefined();
  });

  it('lists it back so she can say "you were circling this"', async () => {
    const s = store.create('blank', 'Weekend project ideas');
    store.addIdea(s, { title: 'Tide clock', summary: 'x', status: 'candidate' });
    store.addIdea(s, { title: 'Bus timer', summary: 'x', status: 'rejected', reason: 'API costs money' });
    await store.save(s);

    const [row] = await store.list();
    expect(row.headline).toBe('Weekend project ideas');
    expect(row.ideaCount).toBe(2);
    // Only the live ones count as open — a rejected idea is not unfinished business.
    expect(row.openCount).toBe(1);
    expect(row.attached).toBe(false);
  });

  it('keeps WHY an idea was turned down', async () => {
    // Without the reason, a returning session re-proposes what was already
    // rejected, and "you looked at this and dropped it" says nothing useful.
    const s = store.create('blank', 'Ideas');
    store.addIdea(s, { title: 'Bus timer', summary: 'x', status: 'rejected', reason: 'API costs money' });
    await store.save(s);
    const back = await store.get(s.id);
    expect(back!.ideas[0].reason).toBe('API costs money');
  });
});

describe('attaching to a project', () => {
  it('moves the session rather than copying it', async () => {
    // Two copies would drift, and the loose one would keep showing up as
    // unattached thinking about a project that already exists.
    const s = store.create('blank', 'Something to build');
    store.addIdea(s, { title: 'Tide clock', summary: 'x', status: 'chosen' });
    await store.save(s);

    const loose = join(home, 'brainstorm', s.id + '.json');
    expect(existsSync(loose)).toBe(true);

    const moved = await store.attach(s.id, project);
    expect(moved?.projectPath).toBe(project);
    expect(existsSync(loose)).toBe(false);
    expect(existsSync(join(home, 'projects', projectHash(project), 'brainstorm', s.id + '.json'))).toBe(true);
    // …and still nothing in the project itself.
    expect(await readdir(project)).toEqual([]);
  });

  it('carries the thinking across with it', async () => {
    const s = store.create('blank', 'Something to build');
    store.addIdea(s, { title: 'Bus timer', summary: 'x', status: 'rejected', reason: 'API costs money' });
    store.addIdea(s, { title: 'Tide clock', summary: 'x', status: 'chosen' });
    await store.save(s);
    await store.attach(s.id, project);

    const back = await store.get(s.id, project);
    expect(back!.ideas.map((i) => i.title)).toEqual(['Bus timer', 'Tide clock']);
    expect(back!.ideas[0].reason).toBe('API costs money');
  });

  it('returns null when there is nothing to attach', async () => {
    expect(await store.attach('nope', project)).toBeNull();
  });
});

describe('listing inside a project', () => {
  it('shows the project sessions AND the loose pile', async () => {
    // A blank-page session that later became this project is still the thinking
    // that produced it, and someone circling an idea for weeks should hear
    // about it whether or not they had a folder at the time.
    const attached = store.create('evolve', 'Next move', project);
    await store.save(attached);
    const loose = store.create('blank', 'Half an idea');
    await store.save(loose);

    const headlines = (await store.list(project)).map((s) => s.headline).sort();
    expect(headlines).toEqual(['Half an idea', 'Next move']);
  });

  it('is empty rather than failing before anything has been saved', async () => {
    expect(await store.list()).toEqual([]);
    expect(await store.list(project)).toEqual([]);
  });

  it('skips a corrupt file rather than losing the whole list', async () => {
    const good = store.create('blank', 'Readable');
    await store.save(good);
    await mkdir(join(home, 'brainstorm'), { recursive: true });
    await writeFile(join(home, 'brainstorm', 'broken.json'), '{ not json', 'utf-8');

    const rows = await store.list();
    expect(rows.map((r) => r.headline)).toEqual(['Readable']);
  });
});
