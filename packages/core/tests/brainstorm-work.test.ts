// Brainstormed plans in the work (plan 2026-11-17-brainstorm, Phase 4).
//
//   1. Working in a project, Code and Plan mode are shown the plans assigned to
//      it every turn — what, how far, what's next — and nothing when there are none.
//   2. brainstorm_plan: read one, tick what's built, change the plan only WITH
//      why (kept in its history, marked "while building"), note what the work
//      turned up.
//   3. Plan mode can use it and stays read-only for the project.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrainstormStore, setPlan, setExperience } from '../src/brainstorm/brainstorm-store.js';
import { assignedPlansContext, setWorkPlansStore } from '../src/brainstorm/work-plans.js';
import { BrainstormPlanTool } from '../src/tools/brainstorm-plan.js';
import { getWorkModePrefix, getWorkTalkPrefix, getPlanModePrefix } from '../src/agent/system-prompt.js';
import { modeAllowedTools, talkingToolsFor, modeCanEditFiles } from '../src/agent/agent.js';
import type { ToolExecutionContext } from '../src/tools/types.js';

let home: string;
let project: string;
let store: BrainstormStore;
const tool = new BrainstormPlanTool();
const run = (args: Record<string, unknown>, cwd = project) => tool.execute(args, { cwd } as ToolExecutionContext);

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'ava-home-'));
  project = await mkdtemp(join(tmpdir(), 'ava-project-'));
  store = new BrainstormStore({ globalDir: home });
  setWorkPlansStore(store);
});
afterEach(async () => {
  setWorkPlansStore(null);
  await rm(home, { recursive: true, force: true });
  await rm(project, { recursive: true, force: true });
});

async function sharingPlan(projectPath: string | null = project) {
  const s = store.create('feature', 'Sharing a shopping list', projectPath ?? undefined);
  setPlan(s, { summary: 'A list two people edit, shared by link.', steps: [
    { text: 'One list, shared by link', done: true }, { text: 'Both can tick items' },
    { text: 'Several lists', tier: 'ambitious' } ] });
  await store.save(s);
  return s;
}

describe('what the work is shown each turn', () => {
  it('nothing without a project, or with nothing assigned', async () => {
    expect(await assignedPlansContext(null)).toBeUndefined();
    await sharingPlan(null);
    expect(await assignedPlansContext(project)).toBeUndefined();
  });

  it('each assigned plan: id, progress, the next small step', async () => {
    const s = await sharingPlan();
    const ctx = await assignedPlansContext(project);
    expect(ctx).toContain(`[${s.id}] "Sharing a shopping list" (feature)`);
    expect(ctx).toContain('1 of 3 steps done; next: "Both can tick items"');
  });

  it('an assigned experience, and not a brainstorm with nothing decided yet', async () => {
    const e = store.create('experience', 'How it should feel', project);
    setExperience(e, { words: ['calm', 'safe'], notWords: ['rushed'] });
    await store.save(e);
    const empty = store.create('unsure', 'Just started', project);
    await store.save(empty);
    const ctx = await assignedPlansContext(project);
    expect(ctx).toContain('experience: calm, safe, never rushed');
    expect(ctx).not.toContain('Just started');
  });

  it('the same folder however the path is spelled', async () => {
    await sharingPlan(project.replace(/\\/g, '/').toUpperCase() + '/');
    expect(await assignedPlansContext(project)).toContain('Sharing a shopping list');
  });

  it('Code (Build and Talk) and Plan mode carry the plans and the tool; without plans, no section', async () => {
    const ctx = (await assignedPlansContext(project)) ?? '- [abc] "x" (feature) — 0 of 1 steps done; next: "y"';
    for (const p of [getWorkModePrefix('go', ctx), getWorkTalkPrefix('go', ctx), getPlanModePrefix('go', ctx)]) {
      expect(p).toContain("## Their brainstormed plans for this project");
      expect(p).toContain(ctx);
      expect(p).toContain('brainstorm_plan');
      expect(p.endsWith('go')).toBe(true);
    }
    expect(getWorkModePrefix('go', ctx)).toContain('built AND checked');
    expect(getWorkModePrefix('go')).not.toContain('brainstormed plans for this project');
    expect(getPlanModePrefix('go')).not.toContain('brainstormed plans for this project');
  });
});

describe('brainstorm_plan', () => {
  it('lists the plans assigned to the open project', async () => {
    const s = await sharingPlan();
    await sharingPlan(null);
    const r = await run({ action: 'list' });
    expect(r.output.split('\n')).toHaveLength(1);
    expect(r.output).toContain(`[${s.id}]`);
    expect((await run({ action: 'list' }, home)).output).toMatch(/No brainstormed plans/);
  });

  it('reads one for building from: steps with ids, the experience, turned-down ideas with why', async () => {
    const s = await sharingPlan();
    store.addIdea(s, { title: 'Accounts', summary: 'Sign-up to share', status: 'rejected', reason: 'Too much friction' });
    setExperience(s, { words: ['calm'], principles: [{ title: 'No guilt', do: 'say what is left', dont: 'red warnings' }] });
    await store.save(s);
    const r = await run({ action: 'read', id: `[${s.id}]` });
    expect(r.success).toBe(true);
    expect(r.output).toContain(`[x] One list, shared by link  (id ${s.plan!.steps[0].id})`);
    expect(r.output).toContain('The ambitious version:');
    expect(r.output).toContain('No guilt: do say what is left');
    expect(r.output).toContain('Accounts (rejected: Too much friction)');
  });

  it('ticks by text or id, and says which steps it could not find', async () => {
    const s = await sharingPlan();
    let r = await run({ action: 'tick', id: s.id, steps: ['both can tick items'] });
    expect(r.output).toContain('Now 2 of 3 done.');
    r = await run({ action: 'untick', id: s.id, steps: [s.plan!.steps[0].id, 'Invented step'] });
    expect(r.success).toBe(false);
    expect(r.output).toContain('Not in the plan: "Invented step"');
    expect((await store.get(s.id))!.plan!.steps[0].done).toBe(false);
  });

  it('adds and drops steps only with why, recorded as changed while building', async () => {
    const s = await sharingPlan();
    expect((await run({ action: 'add_steps', id: s.id, steps: ['Works offline'] })).success).toBe(false);
    await run({ action: 'add_steps', id: s.id, steps: ['Works offline'], why: 'Shops have no signal.' });
    await run({ action: 'drop_steps', id: s.id, steps: ['Several lists'], why: 'One list per household is enough.' });
    const after = (await store.get(s.id))!;
    expect(after.plan!.steps.map((x) => x.text)).toEqual(['One list, shared by link', 'Both can tick items', 'Works offline']);
    expect(after.plan!.steps[0].done).toBe(true); // ticks survive a change
    expect(after.plan!.changes.map((c) => [c.type, c.from, c.text])).toEqual([
      ['changed', 'work', 'Added "Works offline": Shops have no signal.'],
      ['changed', 'work', 'Dropped "Several lists": One list per household is enough.'],
    ]);
  });

  it('notes what the work turned up, from the work', async () => {
    const s = await sharingPlan();
    await run({ action: 'note', id: s.id, type: 'new-idea', text: 'A fridge widget.' });
    const c = (await store.get(s.id))!.plan!.changes[0];
    expect([c.type, c.from, c.text]).toEqual(['new-idea', 'work', 'A fridge widget.']);
  });

  it('writes nothing into the project', async () => {
    const s = await sharingPlan();
    await run({ action: 'tick', id: s.id, steps: ['Both can tick items'] });
    await run({ action: 'note', id: s.id, text: 'x' });
    expect(await readdir(project)).toEqual([]);
  });
});

describe('which modes have it', () => {
  it('Code (and its Talk switch) and Plan; Plan stays read-only', () => {
    expect(modeAllowedTools('work')?.has('brainstorm_plan')).toBe(true);
    expect(talkingToolsFor(new Set(modeAllowedTools('work')!)).has('brainstorm_plan')).toBe(true);
    expect(modeAllowedTools('plan')?.has('brainstorm_plan')).toBe(true);
    expect(modeCanEditFiles('plan')).toBe(false);
  });
});
