/**
 * Ava's plan preview (12 Nov 2026): before a plan is saved the person sees the
 * whole plan, already checked against their hard rules. A plan that breaks a
 * rule goes back to Ava and is never put in front of them; asking for changes
 * tells her to revise and show it again. Real tool, real registry, a scratch
 * profile (AVA_HEALTH_DIR) and fake library facts.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HealthPlanCreateTool, type PlanReview } from '../src/tools/health-plan-create.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import { toolRequestInWords } from '../src/tools/tool-request-words.js';

const FACTS = {
  recipes: {
    'chicken-satay': { slug: 'chicken-satay', name: 'Chicken satay', allergens: ['Peanut'], flags: [], diets: ['Omnivore'] },
    'greek-salad': { slug: 'greek-salad', name: 'Greek salad', allergens: ['Dairy'], flags: ['nut_free'], diets: ['Vegetarian'] },
  },
  exercises: {
    'goblet-squat': { slug: 'goblet-squat', name: 'Goblet squat', contraindications: [{ name: 'Knee pain', severity: 'caution', note: 'keep the knees over the toes' }], equipment: [], regressions: [{ slug: 'box-squat', name: 'Box squat' }] },
  },
};
const fakeFetch = (async (_u: unknown, init?: { body?: string }) => {
  const want = JSON.parse(String(init?.body));
  const pick = (all: Record<string, unknown>, slugs: string[]) => Object.fromEntries(slugs.filter((s) => all[s]).map((s) => [s, all[s]]));
  return { ok: true, json: async () => ({ recipes: pick(FACTS.recipes, want.recipes), exercises: pick(FACTS.exercises, want.exercises) }) };
}) as unknown as typeof fetch;

let saved: unknown[] = [];
const store = {
  list: async () => [],
  create: async (input: { title: string; type: string; duration_days: number; status: string; days?: unknown[] }) => { saved.push(input); return { id: 'p1', ...input, filled_days: input.days?.length ?? 0 }; },
};
const ctx = { cwd: '.', sharedState: { healthPlanStore: store, fetchImpl: fakeFetch } };

async function profile(constraints: Record<string, unknown>) {
  const dir = await mkdtemp(join(tmpdir(), 'ava-health-'));
  process.env.AVA_HEALTH_DIR = dir;
  await writeFile(join(dir, 'profile.json'), JSON.stringify({ constraints }));
}
beforeEach(() => { saved = []; });
afterAll(() => { delete process.env.AVA_HEALTH_DIR; });

const meal = (slug: string, name: string) => ({ slot: 'dinner', name, servings: 1, ref: { kind: 'recipe', slug } });
const plan = (days: unknown[]) => ({ type: 'combined', title: 'Easy week', duration_days: 3, status: 'active', start_date: '2026-11-16', days });

function registryWith(decision: unknown) {
  const registry = new ToolRegistry();
  registry.register(new HealthPlanCreateTool());
  const handler = vi.fn(async () => decision as never);
  registry.setConfirmationHandler(handler);
  return { registry, handler };
}

describe('the plan preview', () => {
  it('a plan that breaks a hard rule never reaches them — Ava gets it back to fix', async () => {
    await profile({ allergens: ['peanuts'] });
    const { registry, handler } = registryWith(true);
    const r = await registry.execute('health_plan_create', plan([{ day_index: 1, kind: 'rest', meals: [meal('chicken-satay', 'Chicken satay')] }]), ctx as never);
    expect(handler).not.toHaveBeenCalled();
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/contains peanuts/);
    expect(r.output).toMatch(/have not seen this plan/);
    expect(saved).toHaveLength(0);
  });

  it('shows them every day, with what is worth knowing', async () => {
    await profile({ allergens: ['sesame'], injuries: ['knee'] });
    const { registry, handler } = registryWith(true);
    await registry.execute('health_plan_create', plan([
      { day_index: 1, kind: 'training', training: [{ name: 'Goblet squat', sets: 3, reps: '10', ref: { kind: 'exercise', slug: 'goblet-squat' } }] },
      { day_index: 2, kind: 'rest', meals: [meal('greek-salad', 'Greek salad'), { slot: 'lunch', name: 'Hummus wrap', servings: 1 }] },
    ]), ctx as never);
    expect(handler).toHaveBeenCalledTimes(1);
    const review = (handler.mock.calls[0] as unknown[])[3] as PlanReview;
    expect(review.title).toBe('Easy week');
    expect(review.status).toBe('active');
    expect(review.start_date).toBe('2026-11-16');
    expect(review.days).toHaveLength(2);
    expect(review.days[0].training[0].name).toBe('Goblet squat');
    expect(review.cautions[0]).toMatchObject({ name: 'Goblet squat', alternatives: [{ slug: 'box-squat', name: 'Box squat' }] });
    expect(review.unverified).toContain('sesame');
    expect(review.unchecked).toEqual(['Hummus wrap']);
  });

  it('nothing is saved until they say so — and Save saves it', async () => {
    await profile({});
    const { registry } = registryWith(true);
    const r = await registry.execute('health_plan_create', plan([{ day_index: 1, kind: 'rest', meals: [meal('greek-salad', 'Greek salad')] }]), ctx as never);
    expect(r.success).toBe(true);
    expect(saved).toHaveLength(1);
  });

  it('asking for changes saves nothing and tells Ava to revise and show it again', async () => {
    await profile({});
    const { registry } = registryWith({ approved: false, reason: 'swap the salad for something warm' });
    const r = await registry.execute('health_plan_create', plan([{ day_index: 1, kind: 'rest', meals: [meal('greek-salad', 'Greek salad')] }]), ctx as never);
    expect(r.success).toBe(false);
    expect(saved).toHaveLength(0);
    expect(r.output).toMatch(/swap the salad for something warm/);
    expect(r.output).toMatch(/call health_plan_create again with the WHOLE revised plan/);
  });

  it('a plain no saves nothing and does not get saved another way', async () => {
    await profile({});
    const { registry } = registryWith(false);
    const r = await registry.execute('health_plan_create', plan([{ day_index: 1, kind: 'rest', meals: [meal('greek-salad', 'Greek salad')] }]), ctx as never);
    expect(r.success).toBe(false);
    expect(saved).toHaveLength(0);
    expect(r.output).toMatch(/chose not to keep this plan/);
  });

  it('an invalid call is sent back before any card', async () => {
    await profile({});
    const { registry, handler } = registryWith(true);
    const r = await registry.execute('health_plan_create', { ...plan([]), duration_days: 28 }, ctx as never);
    expect(handler).not.toHaveBeenCalled();
    expect(r.output).toMatch(/must be 1, 3 or 7/);
  });

  it('the card says what will happen, in plain words', () => {
    expect(toolRequestInWords('health_plan_create', { title: 'Easy week', status: 'active' })).toBe('Start the plan "Easy week"');
    expect(toolRequestInWords('health_plan_create', { title: 'Easy week', status: 'draft' })).toBe('Save as a draft the plan "Easy week"');
  });
});

describe('the preview cannot be skipped', () => {
  it('still shows when their documents permission is set to always allow', async () => {
    await profile({});
    const { registry, handler } = registryWith(true);
    registry.approveCategory(registry.getCategoryForTool('health_plan_create') as never);
    await registry.execute('health_plan_create', plan([{ day_index: 1, kind: 'rest', meals: [meal('greek-salad', 'Greek salad')] }]), ctx as never);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
