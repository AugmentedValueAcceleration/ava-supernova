/**
 * Part 1 step 2: Ava's plan tools refuse what breaks their hard rules, in
 * code. A scratch profile (AVA_HEALTH_DIR) and fake library facts; the real
 * tools and a fake store that records what was saved.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HealthPlanCreateTool } from '../src/tools/health-plan-create.js';
import { HealthPlanUpdateDayTool } from '../src/tools/health-plan-update-day.js';

const FACTS = {
  recipes: {
    'chicken-satay': { slug: 'chicken-satay', name: 'Chicken satay', allergens: ['Peanut'], flags: [], diets: ['Omnivore'] },
    'greek-salad': { slug: 'greek-salad', name: 'Greek salad', allergens: ['Dairy'], flags: ['nut_free', 'gluten_free'], diets: ['Vegetarian'] },
  },
  exercises: {
    'box-jump': { slug: 'box-jump', name: 'Box jump', contraindications: [{ name: 'Acute knee injury', severity: 'avoid', note: null }], equipment: [], regressions: [{ slug: 'step-up', name: 'Step-up' }] },
    'goblet-squat': { slug: 'goblet-squat', name: 'Goblet squat', contraindications: [{ name: 'Knee pain', severity: 'caution', note: 'keep the knees over the toes' }], equipment: ['dumbbells'], regressions: [{ slug: 'box-squat', name: 'Box squat' }] },
  },
};

let saved: unknown[] = [];
let calls = 0;
const fakeFetch = (async (_u: unknown, init?: { body?: string }) => {
  calls++;
  const want = JSON.parse(String(init?.body));
  const pick = (all: Record<string, unknown>, slugs: string[]) => Object.fromEntries(slugs.filter((s) => all[s]).map((s) => [s, all[s]]));
  return { ok: true, json: async () => ({ recipes: pick(FACTS.recipes, want.recipes), exercises: pick(FACTS.exercises, want.exercises) }) };
}) as unknown as typeof fetch;
const downFetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;

const store = {
  list: async () => [{ id: 'p1', title: 'Week', type: 'combined', duration_days: 7, status: 'draft' }],
  create: async (input: { title: string; type: string; duration_days: number; status: string; days?: unknown[] }) => { saved.push(input); return { id: 'p1', ...input, filled_days: input.days?.length ?? 0 }; },
  updateDay: async (_id: string, day: { day_index: number }) => { saved.push(day); return { plan_id: 'p1', day_index: day.day_index }; },
  update: async () => null,
};
const ctx = (f: typeof fetch) => ({ sharedState: { healthPlanStore: store, fetchImpl: f } }) as never;

async function profile(constraints: Record<string, unknown>) {
  const dir = await mkdtemp(join(tmpdir(), 'ava-health-'));
  process.env.AVA_HEALTH_DIR = dir;
  await writeFile(join(dir, 'profile.json'), JSON.stringify({ constraints }));
}
beforeEach(() => { saved = []; calls = 0; });
afterAll(() => { delete process.env.AVA_HEALTH_DIR; });

const meal = (slug: string, name: string) => ({ slot: 'dinner', name, servings: 1, ref: { kind: 'recipe', slug } });
const move = (slug: string, name: string) => ({ name, sets: 3, reps: '10', ref: { kind: 'exercise', slug } });
const create = (days: unknown[]) => new HealthPlanCreateTool().execute({ type: 'combined', title: 'Week', duration_days: 7, status: 'draft', days }, ctx(fakeFetch));

describe('health_plan_create', () => {
  it('refuses a plan with a dish that contains their allergen — and saves nothing', async () => {
    await profile({ allergens: ['peanuts'] });
    const r = await create([{ day_index: 1, kind: 'rest', meals: [meal('greek-salad', 'Greek salad'), meal('chicken-satay', 'Chicken satay')] }]);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/Nothing was saved/);
    expect(r.output).toMatch(/Chicken satay \(chicken-satay\): contains peanuts/);
    expect(saved).toHaveLength(0);
  });

  it('refuses an exercise to avoid with their injury, and offers the easier version', async () => {
    await profile({ injuries: ['left knee'] });
    const r = await create([{ day_index: 1, kind: 'training', training: [move('box-jump', 'Box jump')] }]);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/Box jump .*avoid with left knee.*Step-up \(step-up\)/s);
  });

  it('saves with a caution, and tells Ava to say so', async () => {
    await profile({ injuries: ['knee'], equipment_available: ['dumbbells'] });
    const r = await create([{ day_index: 1, kind: 'training', training: [move('goblet-squat', 'Goblet squat')] }]);
    expect(r.success).toBe(true);
    expect(saved).toHaveLength(1);
    expect(r.output).toMatch(/Take care.*Goblet squat.*knees over the toes.*Box squat/s);
  });

  it('names an allergen the library cannot check, and free-text meals it could not', async () => {
    await profile({ allergens: ['sesame'] });
    const r = await create([{ day_index: 1, kind: 'rest', meals: [meal('greek-salad', 'Greek salad'), { slot: 'lunch', name: 'Hummus wrap', servings: 1 }] }]);
    expect(r.success).toBe(true);
    expect(r.output).toMatch(/Not checkable for sesame/);
    expect(r.output).toMatch(/not checked against their rules: Hummus wrap/);
  });

  it('saves nothing when the facts cannot be fetched — unchecked is not safe', async () => {
    await profile({ allergens: ['milk'] });
    const r = await new HealthPlanCreateTool().execute({ type: 'meal', title: 'Week', duration_days: 1, status: 'draft', days: [{ day_index: 1, kind: 'rest', meals: [meal('greek-salad', 'Greek salad')] }] }, ctx(downFetch));
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/could not check/);
    expect(saved).toHaveLength(0);
  });

  it('with no hard rules on the profile, nothing is fetched and it saves', async () => {
    await profile({});
    const r = await create([{ day_index: 1, kind: 'rest', meals: [meal('chicken-satay', 'Chicken satay')] }]);
    expect(r.success).toBe(true);
    expect(calls).toBe(0);
  });
});

describe('health_plan_update_day', () => {
  it('refuses a day that breaks a hard rule', async () => {
    await profile({ dietary: ['vegetarian'] });
    const r = await new HealthPlanUpdateDayTool().execute({ plan_id: 'p1', day_index: 2, kind: 'rest', meals: [meal('chicken-satay', 'Chicken satay')] }, ctx(fakeFetch));
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/not vegetarian/);
    expect(saved).toHaveLength(0);
  });

  it('saves a day that fits', async () => {
    await profile({ dietary: ['vegetarian'] });
    const r = await new HealthPlanUpdateDayTool().execute({ plan_id: 'p1', day_index: 2, kind: 'rest', meals: [meal('greek-salad', 'Greek salad')] }, ctx(fakeFetch));
    expect(r.success).toBe(true);
    expect(saved).toHaveLength(1);
  });
});
