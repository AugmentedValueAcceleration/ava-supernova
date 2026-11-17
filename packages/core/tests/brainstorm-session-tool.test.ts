// The brainstorm_session tool (plan 2026-11-17-brainstorm, Phase 2): kinds,
// the living plan, the experience, assigning by link, and the experience going
// into a brand kit — only ever as a proposal he agrees, or with his yes.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrainstormStore } from '../src/brainstorm/brainstorm-store.js';
import { BrainstormSessionTool } from '../src/tools/brainstorm-session.js';
import { readBrandKit, createBrandKit, linkBrandKit, listBrandKits } from '../src/brand/brand-kits.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import { toolRequestInWords } from '../src/tools/tool-request-words.js';
import { getBrainstormModePrefix } from '../src/agent/system-prompt.js';

let home: string;
let project: string;
let tool: BrainstormSessionTool;
const ctx = () => ({ cwd: project } as never);

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'ava-bs-'));
  // A real project lives in the projects folder (a kit links only to those).
  process.env.AVA_PROJECTS_DIR = join(home, 'projects');
  project = join(home, 'projects', 'calm-budget');
  await mkdir(project, { recursive: true });
  process.env.AVA_BRAND_KITS_DIR = home;
  tool = new BrainstormSessionTool(new BrainstormStore({ globalDir: home }));
});
afterEach(async () => {
  delete process.env.AVA_BRAND_KITS_DIR;
  delete process.env.AVA_PROJECTS_DIR;
  await rm(home, { recursive: true, force: true });
});

const idOf = (out: string) => /brainstorm (\w+)/.exec(out)![1];

describe('saving a brainstorm', () => {
  it('keeps the kind, ideas with reasons, the plan with ticks, changes and the experience', async () => {
    const r = await tool.execute({
      action: 'save', kind: 'project', headline: 'A calm budgeting app',
      ideas: [{ title: 'Envelopes', summary: 'Gentle envelopes', status: 'chosen' }, { title: 'AI predictions', summary: 'Forecasts', status: 'rejected', reason: 'would make me anxious' }],
      plan: { summary: 'Envelopes, gently', steps: [{ text: 'Envelopes' }, { text: 'Left this week' }, { text: 'Bank import', tier: 'ambitious' }] },
      experience: { words: ['calm'], not_words: ['guilty'], principles: [{ title: 'Nothing shouts', do: 'soft colours', dont: 'red numbers' }] },
    }, ctx());
    expect(r.success).toBe(true);
    const id = idOf(r.output);
    const r2 = await tool.execute({ action: 'save', session_id: id, tick: ['Envelopes'], changes: [{ type: 'changed', text: 'weekly not monthly' }] }, ctx());
    expect(r2.output).toMatch(/plan 1\/3 done, 1 ticked/);
    const full = JSON.parse((await tool.execute({ action: 'read', session_id: id }, ctx())).output);
    expect(full).toMatchObject({ kind: 'project', experience: { words: ['calm'], notWords: ['guilty'] } });
    expect(full.ideas.find((i: { title: string }) => i.title === 'AI predictions').reason).toBe('would make me anxious');
    expect(full.plan.changes[0]).toMatchObject({ type: 'changed', from: 'brainstorm' });
    const recall = (await tool.execute({ action: 'recall' }, ctx())).output;
    expect(recall).toMatch(/project · A calm budgeting app · 2 ideas · plan 1\/3 done · has an experience · not assigned/);
  });

  it('refuses to save into a brainstorm that does not exist (rather than quietly starting another)', async () => {
    const r = await tool.execute({ action: 'save', session_id: 'nope', headline: 'x' }, ctx());
    expect(r.success).toBe(false);
  });
});

describe('assigning', () => {
  it('links to a project and unlinks; the old "attach" does the same', async () => {
    const id = idOf((await tool.execute({ action: 'save', kind: 'feature', headline: 'Sharing' }, ctx())).output);
    expect((await tool.execute({ action: 'assign', session_id: id, project_path: project }, ctx())).output).toMatch(/assigned to/);
    expect((await tool.execute({ action: 'recall' }, ctx())).output).toContain(`assigned to ${project}`);
    await tool.execute({ action: 'assign', session_id: id, project_path: '' }, ctx());
    expect((await tool.execute({ action: 'recall' }, ctx())).output).toContain('not assigned');
    expect((await tool.execute({ action: 'attach', session_id: id, project_path: project }, ctx())).success).toBe(true);
  });
});

describe('the experience into a brand kit', () => {
  const save = async () => idOf((await tool.execute({
    action: 'save', kind: 'experience', headline: 'Calm, not stressful',
    experience: { words: ['calm', 'in control'], not_words: ['guilty'], principles: [{ title: 'Nothing shouts', do: 'soft colours', dont: 'red numbers' }] },
  }, ctx())).output);

  it('with no kit, proposes a NEW kit he agrees in the Design Studio — nothing in use until then', async () => {
    const id = await save();
    const r = await tool.execute({ action: 'experience_to_kit', session_id: id, kit_name: 'Calm Budget' }, ctx());
    expect(r.output).toMatch(/proposed kit "Calm Budget"/);
    const { kits } = await listBrandKits();
    expect(kits[0]).toMatchObject({ name: 'Calm Budget', status: 'proposed', experience: { words: ['calm', 'in control'] } });
    const again = JSON.parse((await tool.execute({ action: 'read', session_id: id }, ctx())).output);
    expect(again.experience.kitId).toBe(kits[0].id);
  });

  it("goes to the assigned project's linked kit when it has one", async () => {
    const kit = await createBrandKit({ name: 'Budget brand' });
    await linkBrandKit(kit.id, project);
    const id = await save();
    await tool.execute({ action: 'assign', session_id: id, project_path: project }, ctx());
    const r = await tool.execute({ action: 'experience_to_kit', session_id: id }, ctx());
    expect(r.output).toMatch(/saved in the brand kit "Budget brand"/);
    expect((await readBrandKit(kit.id))!.experience!.principles[0].title).toBe('Nothing shouts');
  });

  it('refuses when there is no experience yet', async () => {
    const id = idOf((await tool.execute({ action: 'save', kind: 'project', headline: 'x' }, ctx())).output);
    expect((await tool.execute({ action: 'experience_to_kit', session_id: id }, ctx())).success).toBe(false);
  });

  it('always shows him a card first, in every permission mode', () => {
    const reg = new ToolRegistry();
    reg.registerBuiltins();
    reg.setPermissionMode('autonomous' as never);
    const t = reg.getTool('brainstorm_session')!;
    expect(reg.needsConfirmation(t, { action: 'experience_to_kit' })).toBe(true);
    expect(reg.needsConfirmation(t, { action: 'save' })).toBe(false);
    expect(toolRequestInWords('brainstorm_session', { action: 'experience_to_kit', kit_name: 'Calm Budget' })).toMatch(/what your users should feel.*Calm Budget/);
  });
});

describe("the mode's instructions", () => {
  it('reads the kind from the fragment, and knows all five', () => {
    const p = getBrainstormModePrefix('x');
    for (const k of ['project', 'feature', 'experience', 'direction', 'unsure']) expect(p).toContain(`**${k}**`);
    expect(p).toMatch(/say it in ONE line/);
    expect(p).toMatch(/experience_to_kit/);
    expect(p).toMatch(/Assigning is a link/);
  });
});
