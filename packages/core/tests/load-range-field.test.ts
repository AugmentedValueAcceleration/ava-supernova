import { describe, it, expect } from 'vitest';
import { HEALTH_PROFILE_FIELDS, HEALTH_PROFILE_FIELD_IDS } from '../src/health/profile-fields.js';
import { coerceLoad, defaultLoadFor, isValidLoad, loadDetailGaps } from '../src/health/equipment-load.js';
import { EQUIPMENT } from '../src/health/equipment.js';

/**
 * The load_range field, end to end through the registry.
 *
 * The failure this guards against is specific and silent: both hosts coerce a
 * profile answer by control type, and their default branch returns null for
 * anything that is not a string. A load answer is an OBJECT, so without a
 * `load_range` case the card would say saved and the profile would hold
 * nothing — the worst kind of bug, because it looks like it worked.
 *
 * The coercion itself lives in core (coerceLoad) precisely so the two cards and
 * the two hosts cannot each have their own idea of a valid answer.
 */

describe('the registry', () => {
  it('has one field per load-bearing kind, and only those', () => {
    const loadFields = Object.entries(HEALTH_PROFILE_FIELDS).filter(([, d]) => d.control === 'load_range');
    const loadBearing = EQUIPMENT.filter((e) => e.loadBearing).map((e) => e.slug).sort();
    expect(loadFields.map(([, d]) => d.loadSlug).sort()).toEqual(loadBearing);
  });

  it('each writes to its own slug under equipment_loads', () => {
    expect(HEALTH_PROFILE_FIELDS.dumbbells_load?.path).toBe('constraints.equipment_loads.dumbbells');
    expect(HEALTH_PROFILE_FIELDS.barbell_load?.path).toBe('constraints.equipment_loads.barbell');
    // The host's setByPath builds the intermediate objects, so this writes
    // cleanly into a profile that has never held one.
    expect(HEALTH_PROFILE_FIELDS.dumbbells_load?.path.split('.').length).toBe(3);
  });

  it('is askable — the tool enum includes them', () => {
    expect(HEALTH_PROFILE_FIELD_IDS).toContain('dumbbells_load');
    expect(HEALTH_PROFILE_FIELD_IDS).toContain('gym_days');
  });

  it('carries the slug so the card can NAME the kit', () => {
    // "How heavy do your dumbbells go?" rather than a question about
    // "equipment" in the abstract.
    expect(HEALTH_PROFILE_FIELDS.kettlebell_load?.loadSlug).toBe('kettlebell');
  });

  it('never asks about kit whose load is not chosen', () => {
    for (const id of ['equipment', 'gym_days', 'training_days']) {
      expect(HEALTH_PROFILE_FIELDS[id]?.control).not.toBe('load_range');
    }
  });
});

describe('what the host must save', () => {
  it('an answer from the card survives coercion intact', () => {
    // What the card actually sends after its own coerceLoad.
    const fromCard = { mode: 'adjustable', minKg: 2.5, maxKg: 24, stepKg: 2.5 };
    expect(coerceLoad(fromCard)).toEqual(fromCard);
  });

  it('a bad answer becomes null, not a repaired guess', () => {
    expect(coerceLoad({ mode: 'adjustable', minKg: 30, maxKg: 10, stepKg: 2.5 })).toBeNull();
  });

  it('every default the card opens with is saveable', () => {
    for (const e of EQUIPMENT.filter((x) => x.loadBearing)) {
      const d = defaultLoadFor(e.slug);
      expect(isValidLoad(d)).toBe(true);
      expect(coerceLoad(d)).toEqual(d);
    }
  });
});

describe('when Ava asks', () => {
  it('only for kit they own whose range is unknown', () => {
    const owned = ['dumbbells', 'bench', 'barbell', 'pull_up_bar'];
    const gaps = loadDetailGaps(owned, { dumbbells: defaultLoadFor('dumbbells') });
    expect(gaps).toEqual(['barbell']);
    // …and the field name for that gap is one the tool accepts.
    expect(HEALTH_PROFILE_FIELD_IDS).toContain(`${gaps[0]}_load`);
  });

  it('and stops asking once every load-bearing item is answered', () => {
    expect(loadDetailGaps(['dumbbells', 'mat'], { dumbbells: defaultLoadFor('dumbbells') })).toEqual([]);
  });
});
