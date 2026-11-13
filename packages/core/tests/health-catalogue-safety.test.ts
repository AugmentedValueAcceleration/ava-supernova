/**
 * Part 1 step 3: the catalogue search Ava uses leaves out what breaks their
 * hard rules, counts and explains it, and flags cautions inline.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HealthCatalogueSearchTool } from '../src/tools/health-catalogue-search.js';

const RECIPES = [
  { slug: 'pad-thai', name: 'Pad Thai', course: 'main' },
  { slug: 'greek-salad', name: 'Greek salad', course: 'main' },
];
const FACTS = {
  'pad-thai': { slug: 'pad-thai', name: 'Pad Thai', allergens: ['Peanut', 'Egg'], flags: [], diets: ['Omnivore'] },
  'greek-salad': { slug: 'greek-salad', name: 'Greek salad', allergens: ['Dairy'], flags: ['nut_free'], diets: ['Vegetarian'] },
};
const EXERCISES = [{ slug: 'goblet-squat', name: 'Goblet squat', workout_type: 'strength' }];
const EX_FACTS = { 'goblet-squat': { slug: 'goblet-squat', name: 'Goblet squat', contraindications: [{ name: 'Knee pain', severity: 'caution', note: null }], equipment: [], regressions: [{ slug: 'box-squat', name: 'Box squat' }] } };

let factsUp = true;
beforeEach(() => {
  factsUp = true;
  vi.stubGlobal('fetch', async (url: string, init?: { body?: string }) => {
    if (String(url).includes('/api/health/safety-facts')) {
      if (!factsUp) return { ok: false, status: 503 };
      const want = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({
        recipes: Object.fromEntries((want.recipes ?? []).map((s: string) => [s, (FACTS as Record<string, unknown>)[s]])),
        exercises: Object.fromEntries((want.exercises ?? []).map((s: string) => [s, (EX_FACTS as Record<string, unknown>)[s]])),
      }) };
    }
    if (String(url).includes('/api/health/exercises')) return { ok: true, json: async () => ({ exercises: EXERCISES, total: 1 }) };
    return { ok: true, json: async () => ({ recipes: RECIPES, total: 2 }) };
  });
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.AVA_HEALTH_DIR; });

async function profile(constraints: Record<string, unknown>) {
  const dir = await mkdtemp(join(tmpdir(), 'ava-health-'));
  process.env.AVA_HEALTH_DIR = dir;
  await writeFile(join(dir, 'profile.json'), JSON.stringify({ constraints }));
}
const search = (args: Record<string, unknown>) => new HealthCatalogueSearchTool().execute(args, { sharedState: {} } as never);

describe('health_catalogue_search with their hard rules', () => {
  it('leaves out a dish with their allergen, and says how many and why', async () => {
    await profile({ allergens: ['peanuts'] });
    const r = await search({ kind: 'recipe', query: 'dinner' });
    expect(r.output).toMatch(/Greek salad/);
    expect(r.output).not.toMatch(/Pad Thai/);
    expect(r.output).toMatch(/1 left out because they break their hard rules \(contains peanuts/);
  });

  it('flags an exercise that needs care, with the easier version', async () => {
    await profile({ injuries: ['knee'] });
    const r = await search({ kind: 'exercise', query: 'squat' });
    expect(r.output).toMatch(/Goblet squat.*⚠ take care with knee.*easier: box-squat/);
  });

  it('when the check cannot be reached, says the results are NOT checked', async () => {
    await profile({ allergens: ['milk'] });
    factsUp = false;
    const r = await search({ kind: 'recipe', query: 'dinner' });
    expect(r.output).toMatch(/NOT CHECKED/);
  });

  it('with no hard rules, results are untouched and nothing is checked', async () => {
    await profile({});
    const r = await search({ kind: 'recipe', query: 'dinner' });
    expect(r.output).toMatch(/Pad Thai/);
    expect(r.output).not.toMatch(/left out|NOT CHECKED/);
  });
});
