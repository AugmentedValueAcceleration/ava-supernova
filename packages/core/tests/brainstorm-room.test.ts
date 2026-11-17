// The Brainstorm room (plan 2026-11-17-brainstorm, Phase 3).
//
//   1. One page for both apps: brainstormPage(op, args) reads and changes
//      ~/.ava/brainstorm and answers with what the room shows.
//   2. Each brainstorm has its own conversation, and Ava is told which one it is,
//      so everything she saves lands in the brainstorm he is looking at.
//   3. Room turns are tagged [Brainstorm Room]: brainstorm mode's tools, the
//      brainstorm surface in History, and the tag never becomes a title.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrainstormStore, setPlan, setExperience } from '../src/brainstorm/brainstorm-store.js';
import {
  brainstormPage, brainstormRoomContext, setBrainstormPageStore,
  type BrainstormPageState, type BrainstormPageDetail,
} from '../src/brainstorm/page.js';
import { getBrainstormModePrefix } from '../src/agent/system-prompt.js';
import { modeForTaggedText } from '../src/agent/mode-tags.js';
import { deriveConversationSurface, stripPromptScaffold } from '../src/history/conversation-title.js';
import type { Message } from '../src/core/types.js';

let home: string;
let projects: string;
let store: BrainstormStore;
const savedProjectsDir = process.env.AVA_PROJECTS_DIR;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'ava-home-'));
  projects = await mkdtemp(join(tmpdir(), 'ava-projects-'));
  process.env.AVA_PROJECTS_DIR = projects;
  store = new BrainstormStore({ globalDir: home });
  setBrainstormPageStore(store);
});
afterEach(async () => {
  setBrainstormPageStore(null);
  if (savedProjectsDir === undefined) delete process.env.AVA_PROJECTS_DIR;
  else process.env.AVA_PROJECTS_DIR = savedProjectsDir;
  await rm(home, { recursive: true, force: true });
  await rm(projects, { recursive: true, force: true });
});

type Changed = { detail: BrainstormPageDetail | null; state: BrainstormPageState };

describe('the page', () => {
  it('creates a new, empty brainstorm the chat writes into', async () => {
    const r = await brainstormPage('create', { headline: '  A budgeting app  ' }) as { id: string; state: BrainstormPageState };
    const s = await store.get(r.id);
    expect(s?.headline).toBe('A budgeting app');
    expect(s?.kind).toBe('unsure');
    expect(r.state.brainstorms.map((b) => b.id)).toContain(r.id);
  });

  it('reads one in full', async () => {
    const s = store.create('feature', 'Sharing');
    setPlan(s, { summary: 'Share a list', steps: [{ text: 'Invite by link' }] });
    await store.save(s);
    const d = await brainstormPage('read', { id: s.id }) as BrainstormPageDetail;
    expect(d.brainstorm.plan?.steps[0].text).toBe('Invite by link');
    expect(d.kit).toBeNull();
    expect(await brainstormPage('read', { id: 'nope' })).toBeNull();
  });

  it('assigns by link and unassigns with an empty project', async () => {
    const s = store.create('project', 'Garden planner');
    await store.save(s);
    const target = join(projects, 'garden');
    let r = await brainstormPage('assign', { id: s.id, project: target }) as Changed;
    expect(r.detail?.brainstorm.projectPath).toBe(target);
    r = await brainstormPage('assign', { id: s.id, project: '' }) as Changed;
    expect(r.detail?.brainstorm.projectPath).toBeUndefined();
  });

  it('ticks and unticks a plan step by hand', async () => {
    const s = store.create('feature', 'Export');
    setPlan(s, { steps: [{ text: 'CSV first' }, { text: 'PDF', tier: 'ambitious' }] });
    await store.save(s);
    const step = s.plan!.steps[0].id;
    let r = await brainstormPage('tick', { id: s.id, step, done: true }) as Changed;
    expect(r.detail?.brainstorm.plan?.steps[0].done).toBe(true);
    expect(r.state.brainstorms.find((b) => b.id === s.id)?.stepsDone).toBe(1);
    r = await brainstormPage('tick', { id: s.id, step, done: false }) as Changed;
    expect(r.detail?.brainstorm.plan?.steps[0].done).toBe(false);
  });

  it('moves an idea between columns, keeping why', async () => {
    const s = store.create('project', 'Recipe swap');
    const idea = store.addIdea(s, { title: 'Swap by post', summary: 'Mail recipe cards', status: 'candidate' });
    await store.save(s);
    const r = await brainstormPage('idea', { id: s.id, ideaId: idea.id, status: 'rejected', reason: ' Too slow ' }) as Changed;
    const moved = r.detail?.brainstorm.ideas[0];
    expect(moved?.status).toBe('rejected');
    expect(moved?.reason).toBe('Too slow');
    // A column that doesn't exist changes nothing.
    const r2 = await brainstormPage('idea', { id: s.id, ideaId: idea.id, status: 'binned' }) as Changed;
    expect(r2.detail?.brainstorm.ideas[0].status).toBe('rejected');
  });

  it('deletes', async () => {
    const s = store.create('direction', 'What next');
    await store.save(s);
    const st = await brainstormPage('delete', { id: s.id }) as BrainstormPageState;
    expect(st.brainstorms.find((b) => b.id === s.id)).toBeUndefined();
    expect(await store.get(s.id)).toBeNull();
  });

  it('hides empty brainstorms left for over a day, but never the newest', async () => {
    const age = async (id: string) => {
      const p = join(home, 'brainstorm', `${id}.json`);
      const j = JSON.parse(await readFile(p, 'utf8'));
      j.createdAt = j.updatedAt = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
      await writeFile(p, JSON.stringify(j));
    };
    const used = store.create('feature', '');
    setExperience(used, { words: ['calm'] });
    await store.save(used); await age(used.id);
    const left = store.create('unsure', '');
    await store.save(left); await age(left.id);
    const fresh = store.create('unsure', '');
    await store.save(fresh);
    const st = await brainstormPage('state') as BrainstormPageState;
    const ids = st.brainstorms.map((b) => b.id);
    expect(ids).toContain(used.id);   // old, but has an experience in it
    expect(ids).toContain(fresh.id);  // empty, but new
    expect(ids).not.toContain(left.id);
  });

  it('refuses a request it does not know', async () => {
    await expect(brainstormPage('rename', {})).rejects.toThrow(/Unknown Brainstorm room request/);
  });
});

describe('the room chat', () => {
  it('tells Ava which brainstorm this conversation is, and to save into it', async () => {
    const s = store.create('experience', 'How Pocket should feel');
    setExperience(s, { words: ['calm', 'safe'] });
    await store.save(s);
    const ctx = await brainstormRoomContext(s.id);
    expect(ctx).toContain(`This conversation IS brainstorm [${s.id}]`);
    expect(ctx).toContain(`session_id="${s.id}"`);
    expect(ctx).toContain('experience: calm, safe');
    expect(await brainstormRoomContext('missing')).toBeUndefined();
  });

  it('a room turn is brainstorm mode, the brainstorm surface, and never a title', async () => {
    const s = store.create('unsure', '');
    await store.save(s);
    const text = getBrainstormModePrefix('I want an app for my allotment', undefined, await brainstormRoomContext(s.id));
    expect(text.startsWith('[Brainstorm Room]')).toBe(true);
    expect(text).toContain(`This conversation IS brainstorm [${s.id}]`);
    expect(modeForTaggedText(text)).toBe('brainstorm');
    const msgs = [{ role: 'user', content: text }] as unknown as Message[];
    expect(deriveConversationSurface(msgs)).toBe('brainstorm');
    expect(stripPromptScaffold(text)).toBe('I want an app for my allotment');
  });

  it('the main chat mode keeps its own tag', () => {
    const text = getBrainstormModePrefix('an idea');
    expect(text.startsWith('[Brainstorm Mode]')).toBe(true);
    expect(text).toContain('open_brainstorm_room');
  });
});
