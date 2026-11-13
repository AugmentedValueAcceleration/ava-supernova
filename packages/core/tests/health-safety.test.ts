/**
 * The one set of health hard rules (Part 1, 11 Nov 2026). Every rule here was
 * carried over from the web generate route; the tests pin the ones that were
 * learned the hard way, plus the tree_nuts slug that the old copy missed.
 */

import { describe, it, expect } from 'vitest';
import {
  sameAllergen, freeFromFlagFor, refersToSame, checkRecipe, checkExercise, checkPlanItems,
  safetyProfileFrom, hasHardRules, fetchSafetyFacts, type RecipeFacts, type ExerciseFacts,
} from '../src/health/safety.js';

const recipe = (over: Partial<RecipeFacts> = {}): RecipeFacts => ({ slug: 'r', name: 'Dish', allergens: [], flags: [], diets: [], ...over });
const exercise = (over: Partial<ExerciseFacts> = {}): ExerciseFacts => ({ slug: 'e', name: 'Move', contraindications: [], equipment: [], ...over });

describe('allergen vocabulary', () => {
  it('matches real synonyms exactly, and never fish to shellfish', () => {
    expect(sameAllergen('peanuts', 'Groundnut')).toBe(true);
    expect(sameAllergen('milk', 'dairy')).toBe(true);
    expect(sameAllergen('fish', 'shellfish')).toBe(false);
    expect(sameAllergen('shellfish', 'fish')).toBe(false);
  });

  it('understands the profile slug tree_nuts (the old copy did not)', () => {
    expect(freeFromFlagFor('tree_nuts')).toBe('nut_free');
    expect(sameAllergen('tree_nuts', 'tree nuts')).toBe(true);
  });

  it('knows which allergens have no free-from flag', () => {
    expect(freeFromFlagFor('sesame')).toBeNull();
    expect(freeFromFlagFor('fish')).toBeNull();
  });
});

describe('recipes: hard rules', () => {
  it('blocks a dish that contains their allergen', () => {
    const r = checkRecipe(recipe({ allergens: ['Peanuts'], flags: [] }), { allergens: ['peanuts'] });
    expect(r.verdict).toBe('blocked');
    expect(r.reasons).toContain('contains peanuts');
  });

  it('blocks a dish not CONFIRMED free from it: unknown is unsafe', () => {
    const r = checkRecipe(recipe({ allergens: [], flags: [] }), { allergens: ['milk'] });
    expect(r.verdict).toBe('blocked');
    expect(r.reasons).toContain('not confirmed free from milk');
  });

  it('passes a dish confirmed free from it', () => {
    expect(checkRecipe(recipe({ flags: ['dairy_free'] }), { allergens: ['milk'] }).verdict).toBe('ok');
  });

  it('names an allergen the library cannot speak to, and never calls it clear', () => {
    const r = checkRecipe(recipe(), { allergens: ['sesame'] });
    expect(r.verdict).toBe('ok');
    expect(r.unverified).toEqual(['sesame']);
  });

  it('still blocks an unflaggable allergen the ingredients name', () => {
    expect(checkRecipe(recipe({ allergens: ['Sesame'] }), { allergens: ['sesame'] }).verdict).toBe('blocked');
  });

  it('requires every diet', () => {
    expect(checkRecipe(recipe({ diets: ['Vegetarian'] }), { dietary: ['vegan'] }).verdict).toBe('blocked');
    expect(checkRecipe(recipe({ diets: ['Vegan', 'Vegetarian'] }), { dietary: ['vegan'] }).verdict).toBe('ok');
  });

  it('gluten-free, dairy-free, halal, kosher and low-FODMAP are FLAGS, not diets', () => {
    // The live library has no diet called any of these; checked as diets, they
    // threw out every recipe. As flags: confirmed passes, missing is blocked.
    expect(checkRecipe(recipe({ flags: ['gluten_free'] }), { dietary: ['gluten_free'] }).verdict).toBe('ok');
    expect(checkRecipe(recipe({ flags: ['halal', 'no_alcohol'] }), { dietary: ['halal'] }).verdict).toBe('ok');
    const notConfirmed = checkRecipe(recipe({ diets: ['Vegetarian'] }), { dietary: ['halal', 'vegetarian'] });
    expect(notConfirmed.verdict).toBe('blocked');
    expect(notConfirmed.reasons).toEqual(['not confirmed halal']);
    expect(checkRecipe(recipe({ flags: ['low_fodmap'] }), { dietary: ['low-fodmap'] }).verdict).toBe('ok');
  });

  it('dislikes are not rules', () => {
    expect(checkRecipe(recipe(), safetyProfileFrom({ food: { dislikes: ['mushrooms'] } })).verdict).toBe('ok');
  });
});

describe('exercises: injuries and kit', () => {
  it('avoid blocks; caution warns and offers easier versions', () => {
    const avoid = checkExercise(exercise({ contraindications: [{ name: 'Knee injury', severity: 'avoid' }] }), { injuries: ['left knee'] });
    expect(avoid.verdict).toBe('blocked');
    const care = checkExercise(exercise({
      contraindications: [{ name: 'Lower back pain', severity: 'caution', note: 'keep a neutral spine' }],
      regressions: [{ slug: 'glute-bridge', name: 'Glute bridge' }],
    }), { injuries: ['bad lower back'] });
    expect(care.verdict).toBe('warn');
    expect(care.reasons[0]).toMatch(/neutral spine/);
    expect(care.alternatives?.[0].slug).toBe('glute-bridge');
  });

  it('blocks what needs kit they have not got — all of it, not any', () => {
    expect(checkExercise(exercise({ equipment: ['barbell', 'bench'] }), { equipment_available: ['barbell'] }).verdict).toBe('blocked');
    expect(checkExercise(exercise({ equipment: ['barbell', 'bench'] }), { equipment_available: ['barbell', 'bench'] }).verdict).toBe('ok');
  });

  it('an empty kit list is "not stated", never "owns nothing"', () => {
    expect(checkExercise(exercise({ equipment: ['barbell'] }), { equipment_available: [] }).verdict).toBe('ok');
  });

  it('injury matching over-matches on purpose, but not on noise words', () => {
    expect(refersToSame('pregnant', 'Pregnancy')).toBe(true);
    expect(refersToSame('left knee', 'Right knee')).toBe(true);
    expect(refersToSame('old injury', 'chronic pain')).toBe(false);
  });
});

describe('a whole plan', () => {
  it('reports blocked, warnings, unverified and unknown — separately', () => {
    const facts = {
      recipes: { satay: recipe({ slug: 'satay', allergens: ['Peanuts'] }), salad: recipe({ slug: 'salad', flags: ['nut_free'] }) },
      exercises: { squat: exercise({ slug: 'squat', contraindications: [{ name: 'Knee', severity: 'caution' }] }) },
    };
    const r = checkPlanItems({ recipes: ['satay', 'salad', 'mystery'], exercises: ['squat'] }, facts, { allergens: ['peanuts', 'sesame'], injuries: ['knee'] });
    expect(r.blocked.map((b) => b.slug)).toEqual(['satay']);
    expect(r.warnings.map((w) => w.slug)).toEqual(['squat']);
    expect(r.unverified).toEqual(['sesame']);
    expect(r.unknown).toEqual(['mystery']);
  });
});

describe('the profile', () => {
  it('reads the hard rules from the stored shape, and knows when there are none', () => {
    const p = safetyProfileFrom({ constraints: { allergens: ['milk', ''], injuries: ['knee'], equipment_available: 'x' } });
    expect(p.allergens).toEqual(['milk']);
    expect(p.equipment_available).toEqual([]);
    expect(hasHardRules(p)).toBe(true);
    expect(hasHardRules(safetyProfileFrom(null))).toBe(false);
  });
});

describe('fetching facts', () => {
  it('sends slugs only — never the profile — and fails loudly', async () => {
    let sent = '';
    const ok = (async (_u: unknown, init?: { body?: string }) => { sent = String(init?.body); return { ok: true, json: async () => ({ recipes: {}, exercises: {} }) }; }) as unknown as typeof fetch;
    await fetchSafetyFacts({ recipes: ['a', 'a', 'b'], exercises: ['c'] }, ok);
    expect(JSON.parse(sent)).toEqual({ recipes: ['a', 'b'], exercises: ['c'], level: null });
    const down = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(fetchSafetyFacts({ recipes: ['a'] }, down)).rejects.toThrow(/503/);
  });
});
