import { describe, it, expect } from 'vitest';
import {
  acceptsLoadDetail, isValidLoad, availableLoadsKg, nextLoadKg, maxLoadKg,
  canMakeLoadKg, describeLoad, describeLoads, loadDetailGaps,
  toWeekDay, toWeekDays, equipmentAvailableOn, summariseEquipment,
  type EquipmentLoad,
} from '../src/health/equipment-load.js';

/**
 * Load ranges and day availability.
 *
 * The point of the whole file: "add 2.5kg next week" is either a real
 * instruction or advice the person cannot follow, and which one depends on kit
 * the profile did not describe. A pair of fixed 5kg dumbbells and an adjustable
 * 2.5–24kg set were the same word.
 */

const ADJ: EquipmentLoad = { mode: 'adjustable', minKg: 2.5, maxKg: 24, stepKg: 2.5 };
const FIXED: EquipmentLoad = { mode: 'fixed', weightsKg: [5, 10, 15] };

describe('which kit is even asked about', () => {
  it('only the things whose load you choose', () => {
    expect(acceptsLoadDetail('dumbbells')).toBe(true);
    expect(acceptsLoadDetail('barbell')).toBe(true);
    expect(acceptsLoadDetail('kettlebell')).toBe(true);
    // Asking a pull-up bar's weight range is noise in a form people already
    // abandon.
    expect(acceptsLoadDetail('pull_up_bar')).toBe(false);
    expect(acceptsLoadDetail('treadmill')).toBe(false);
    expect(acceptsLoadDetail('gym_full')).toBe(false);
  });
});

describe('what the kit can actually make', () => {
  it('an adjustable set steps through its range', () => {
    expect(availableLoadsKg({ mode: 'adjustable', minKg: 2.5, maxKg: 10, stepKg: 2.5 }))
      .toEqual([2.5, 5, 7.5, 10]);
  });

  it('a fixed set is exactly what is on the rack', () => {
    expect(availableLoadsKg(FIXED)).toEqual([5, 10, 15]);
  });

  it('floating point does not produce 7.500000000000001', () => {
    // It would end up written into a plan verbatim.
    expect(availableLoadsKg({ mode: 'adjustable', minKg: 0, maxKg: 1, stepKg: 0.1 }))
      .toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  });

  it('refuses nonsense rather than looping forever', () => {
    expect(isValidLoad({ mode: 'adjustable', minKg: 0, maxKg: 100, stepKg: 0 })).toBe(false);
    expect(availableLoadsKg({ mode: 'adjustable', minKg: 0, maxKg: 100, stepKg: 0 })).toEqual([]);
    expect(isValidLoad({ mode: 'adjustable', minKg: 50, maxKg: 10, stepKg: 5 })).toBe(false);
    expect(isValidLoad({ mode: 'fixed', weightsKg: [] })).toBe(false);
    expect(isValidLoad(undefined)).toBe(false);
  });

  it('caps a range that would otherwise run away', () => {
    expect(availableLoadsKg({ mode: 'adjustable', minKg: 0, maxKg: 1000, stepKg: 0.1 }).length)
      .toBeLessThanOrEqual(200);
  });
});

describe('nextLoadKg — the instruction a plan can actually give', () => {
  it('finds the next step on an adjustable set', () => {
    expect(nextLoadKg(ADJ, 10)).toBe(12.5);
    expect(nextLoadKg(ADJ, 0)).toBe(2.5);
  });

  it('jumps the real gap on a fixed set, not a polite 2.5', () => {
    // The honest answer for fixed 5/10/15 is "next is 10", a 100% jump — which
    // is exactly the fact a plan needs in order to say "add reps instead".
    expect(nextLoadKg(FIXED, 5)).toBe(10);
    expect(nextLoadKg(FIXED, 6)).toBe(10);
  });

  it('returns NULL at the ceiling of what they own', () => {
    // Not a failure — the moment a plan should stop saying "add weight".
    expect(nextLoadKg(ADJ, 22.5)).toBeNull();
    expect(nextLoadKg(FIXED, 15)).toBeNull();
    expect(maxLoadKg(FIXED)).toBe(15);
  });

  it('the stated maximum is not always REACHABLE, and the honest answer is the top rung', () => {
    // ADJ is 2.5–24 in 2.5 steps, which is what somebody actually writes about
    // a set sold as "up to 24kg". From 2.5 the rungs are 2.5, 5 … 22.5, and 25
    // is over the top, so 24 is not a weight this kit can make. maxLoadKg says
    // 22.5, and a plan that wrote "work up to 24kg" would be asking for a
    // number that does not exist on their dumbbells.
    //
    // This test exists because the first draft asserted 24 and the code was
    // right.
    expect(maxLoadKg(ADJ)).toBe(22.5);
    expect(canMakeLoadKg(ADJ, 24)).toBe(false);
    expect(nextLoadKg(ADJ, 20)).toBe(22.5);
  });

  it('says nothing when the kit was never described', () => {
    // A profile with no detail behaves exactly as it does today.
    expect(nextLoadKg(undefined, 10)).toBeNull();
    expect(maxLoadKg(undefined)).toBeNull();
  });
});

describe('canMakeLoadKg — before writing a number into a plan', () => {
  it('knows 17.5 is not a thing on fixed 5s', () => {
    expect(canMakeLoadKg(FIXED, 17.5)).toBe(false);
    expect(canMakeLoadKg(FIXED, 10)).toBe(true);
    expect(canMakeLoadKg(ADJ, 17.5)).toBe(true);
    expect(canMakeLoadKg(ADJ, 17)).toBe(false);
  });
});

describe('describeLoad — the line that goes in the profile summary', () => {
  it('reads as a sentence, not as JSON', () => {
    expect(describeLoad('dumbbells', ADJ)).toBe('Dumbbells: adjustable 2.5–24 kg in 2.5 kg steps');
    expect(describeLoad('kettlebell', FIXED)).toBe('Kettlebell: fixed 5, 10, 15 kg');
  });

  it('says nothing rather than something empty', () => {
    expect(describeLoad('dumbbells', undefined)).toBeNull();
    expect(describeLoads(['dumbbells', 'bench'], { dumbbells: ADJ })).toEqual([
      'Dumbbells: adjustable 2.5–24 kg in 2.5 kg steps',
    ]);
    expect(describeLoads(['bench'], undefined)).toEqual([]);
  });
});

describe('loadDetailGaps — asking once, and only where it matters', () => {
  it('names only load-bearing kit that has not been answered', () => {
    expect(loadDetailGaps(['dumbbells', 'bench', 'barbell'], { dumbbells: ADJ }))
      .toEqual(['barbell']);
  });

  it('is empty when everything that matters is known', () => {
    expect(loadDetailGaps(['dumbbells', 'pull_up_bar', 'mat'], { dumbbells: ADJ })).toEqual([]);
  });
});

describe('days', () => {
  it('takes what a person or a model would write', () => {
    expect(toWeekDay('Tuesday')).toBe('tue');
    expect(toWeekDay('TUE')).toBe('tue');
    expect(toWeekDay('tues')).toBe('tue');
    expect(toWeekDay('someday')).toBeNull();
    expect(toWeekDays(['Monday', 'thu', 'nonsense', 'mon'])).toEqual(['mon', 'thu']);
  });
});

describe('equipmentAvailableOn — a week is not the same every day', () => {
  const owned = ['dumbbells', 'mat', 'gym_full'];

  it('a gym day gives the gym floor', () => {
    const tue = equipmentAvailableOn(owned, 'tue', ['tue', 'thu']);
    expect(tue).toContain('cable_machine');
    expect(tue).toContain('squat_rack');
    expect(tue).toContain('dumbbells');
  });

  it('a non-gym day gives only what they own outright', () => {
    // The point: no squat rack on a Sunday.
    const sun = equipmentAvailableOn(owned, 'sun', ['tue', 'thu']);
    expect(sun).not.toContain('cable_machine');
    expect(sun).not.toContain('squat_rack');
    expect(sun).not.toContain('gym_full');
    expect(sun).toContain('dumbbells');
    expect(sun).toContain('mat');
  });

  it('kit they own outright never disappears on a non-gym day', () => {
    // Owning a treadmill does not stop you owning it on a Sunday, even though
    // a gym also has one.
    const sun = equipmentAvailableOn(['treadmill', 'gym_full'], 'sun', ['tue']);
    expect(sun).toContain('treadmill');
  });

  it('no gym days recorded means the gym is open — not stated is not "never"', () => {
    // Same rule the equipment filter follows for an empty profile.
    const any = equipmentAvailableOn(owned, 'sun', []);
    expect(any).toContain('cable_machine');
  });

  it('no day asked about means everything they can reach', () => {
    expect(equipmentAvailableOn(owned, null, ['tue'])).toContain('cable_machine');
  });

  it('someone with no gym is unaffected', () => {
    expect(equipmentAvailableOn(['dumbbells', 'bench'], 'sun', ['tue']))
      .toEqual(['dumbbells', 'bench']);
  });

  it('still normalises the old stored format', () => {
    expect(equipmentAvailableOn(['Dumbbells', 'Pull-up bar'], 'mon', []))
      .toEqual(['dumbbells', 'pull_up_bar']);
  });
});

describe('summariseEquipment — what a model actually reads', () => {
  it('groups by place, with the gym on its own line and its days', () => {
    const lines = summariseEquipment(
      ['dumbbells', 'bench', 'gym_full'],
      { dumbbells: ADJ },
      ['tue', 'thu'],
    );
    expect(lines).toContain('Equipment — Home: Dumbbells, Bench');
    expect(lines).toContain('Equipment — Gym (tue, thu): full gym floor');
    expect(lines).toContain('Loads: Dumbbells: adjustable 2.5–24 kg in 2.5 kg steps');
  });

  it('says the gym days are not stated rather than implying never', () => {
    const lines = summariseEquipment(['gym_full'], {}, []);
    expect(lines.join('\n')).toContain('days not stated');
  });

  it('names the kit whose range is unknown, so a weight jump is not invented', () => {
    const lines = summariseEquipment(['dumbbells', 'barbell'], { dumbbells: ADJ });
    const gap = lines.find((l) => l.startsWith('Load range not stated'));
    expect(gap).toBeDefined();
    expect(gap).toContain('Barbell');
    expect(gap).not.toContain('Dumbbells');   // already answered
  });

  it('says nothing at all for an empty profile', () => {
    // "Not stated" must not become a paragraph explaining that nothing is stated.
    expect(summariseEquipment([], {}, [])).toEqual([]);
    expect(summariseEquipment(null)).toEqual([]);
  });

  it('reads an old name-format profile without complaint', () => {
    expect(summariseEquipment(['Dumbbells', 'Pull-up bar'])).toContain(
      'Equipment — Home: Dumbbells, Pull-up bar',
    );
  });
});
