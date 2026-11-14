import { describe, it, expect } from 'vitest';
import {
  libraryFit, slugsToCheck, orderByPreference, profileHasHardRules, planRefs, starterFit,
  type FitState,
} from '../src/health/library-fit.js';

const items = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }, { slug: 'd' }];
const state: FitState = {
  checked: true,
  results: {
    a: { verdict: 'ok', reasons: [] },
    b: { verdict: 'blocked', reasons: ['contains peanuts'] },
    c: { verdict: 'warn', reasons: ['take care with knee'] },
  },
};

describe('libraryFit', () => {
  it('no hard rules: everything, nothing hidden', () => {
    expect(libraryFit(items, state, { rules: false, fitsOnly: true })).toEqual({ shown: items, hidden: 0, pending: 0, failed: false });
  });

  it('fits only: blocked and unanswered held back, cautions stay', () => {
    const v = libraryFit(items, state, { rules: true, fitsOnly: true });
    expect(v.shown.map((i) => i.slug)).toEqual(['a', 'c']);
    expect([v.hidden, v.pending, v.failed]).toEqual([1, 1, false]);
  });

  it('show all: everything, in order', () => {
    const v = libraryFit(items, state, { rules: true, fitsOnly: false });
    expect(v.shown.map((i) => i.slug)).toEqual(['a', 'b', 'c', 'd']);
    expect(v.hidden).toBe(0);
  });

  it('check failed: everything shown and flagged, never called fitting', () => {
    const v = libraryFit(items, { ...state, checked: false }, { rules: true, fitsOnly: true });
    expect(v.shown).toHaveLength(4);
    expect(v.failed).toBe(true);
  });

  it('asks only about slugs with no verdict yet', () => {
    expect(slugsToCheck(items, state)).toEqual(['d']);
  });
});

describe('profileHasHardRules', () => {
  it('reads constraints only; preferences are not rules', () => {
    expect(profileHasHardRules(null)).toBe(false);
    expect(profileHasHardRules({ food: { dislikes: ['olives'] } })).toBe(false);
    expect(profileHasHardRules({ constraints: { allergens: [' '] } })).toBe(false);
    expect(profileHasHardRules({ constraints: { injuries: ['left knee'] } })).toBe(true);
    expect(profileHasHardRules({ constraints: { equipment_available: ['dumbbells'] } })).toBe(true);
  });
});

describe('orderByPreference', () => {
  const recipes = [
    { name: 'Mushroom risotto', cuisine_name: 'Italian' },
    { name: 'Pad thai', cuisine_name: 'Thai' },
    { name: 'Chicken curry', cuisine_name: 'Indian' },
    { name: 'Lentil soup', cuisine_name: null },
  ];

  it('no preferences: order untouched', () => {
    expect(orderByPreference(recipes, {})).toBe(recipes);
  });

  it('favourite cuisine first, dislikes last, nothing removed', () => {
    const out = orderByPreference(recipes, { food: { cuisines: ['thai'], dislikes: ['mushrooms'] } });
    expect(out.map((r) => r.name)).toEqual(['Pad thai', 'Chicken curry', 'Lentil soup', 'Mushroom risotto']);
    expect(out).toHaveLength(4);
  });

  it('a liked food lifts a dish; ties keep the library order', () => {
    const out = orderByPreference(recipes, { food: { likes: ['lentils'] } });
    expect(out.map((r) => r.name)).toEqual(['Lentil soup', 'Mushroom risotto', 'Pad thai', 'Chicken curry']);
  });
});

describe('starter fit', () => {
  const days = [
    { training: [{ ref: { slug: 'a' } }, { ref: null }], meals: [] },
    { training: [{ ref: { slug: 'c' } }, { ref: { slug: 'a' } }] },
  ];

  it('collects each slug once, skipping free-text items', () => {
    expect(planRefs(days)).toEqual({ recipes: [], exercises: ['a', 'c'] });
  });

  it('fits only once every item is answered; a caution still fits', () => {
    expect(starterFit({ recipes: [], exercises: ['a', 'c'] }, state)).toEqual({ state: 'fits', blocked: [], cautions: ['c'] });
    expect(starterFit({ recipes: [], exercises: ['a', 'd'] }, state).state).toBe('pending');
    expect(starterFit({ recipes: [], exercises: ['a', 'd'] }, { ...state, checked: false }).state).toBe('unchecked');
  });

  it('any blocked item means it needs a swap', () => {
    expect(starterFit({ recipes: ['b'], exercises: ['a', 'd'] }, state)).toEqual({ state: 'swap', blocked: ['b'], cautions: [] });
  });
});
