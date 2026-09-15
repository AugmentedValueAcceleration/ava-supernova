import { describe, it, expect } from 'vitest';
import {
  EQUIPMENT, EQUIPMENT_BY_SLUG, FULL_GYM_SLUGS,
  toEquipmentSlug, normaliseEquipment, ownedEquipmentSlugs,
  canPerformWithEquipment, missingEquipmentNames, equipmentName,
} from '../src/health/equipment.js';

/**
 * The equipment vocabulary, and the matching that replaces `refersToSame`.
 *
 * Context (audit 2026-09-15): the profile field was written as display NAMES by
 * the companion and as SLUGS by core, and the gap was bridged by a fuzzy
 * matcher built for injuries. It over-matched so badly that owning a cable
 * machine claimed every other machine, and a hip ABductor machine matched a hip
 * ADductor machine. web/tests/equipment-matching.test.ts pins that behaviour;
 * these tests pin its replacement.
 */

describe('the vocabulary itself', () => {
  it('has unique slugs and a name for every one', () => {
    const slugs = EQUIPMENT.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const e of EQUIPMENT) expect(e.name.trim().length).toBeGreaterThan(0);
  });

  it('marks exactly the three things you can add weight to, plus plates and a sandbag', () => {
    // These are the ones that will carry a load range in the next phase —
    // "add 2.5kg" is only meaningful where the load is chosen.
    expect(EQUIPMENT.filter((e) => e.loadBearing).map((e) => e.slug).sort())
      .toEqual(['barbell', 'dumbbells', 'kettlebell', 'sandbag', 'weight_plate']);
  });

  it('gym_full is access, not kit — it expands, and never claims itself', () => {
    expect(EQUIPMENT_BY_SLUG.get('gym_full')).toBeDefined();
    expect(EQUIPMENT_BY_SLUG.get('gym_full')!.inFullGym).toBeUndefined();
    expect(FULL_GYM_SLUGS).not.toContain('gym_full');
    expect(FULL_GYM_SLUGS).toContain('cable_machine');
    expect(FULL_GYM_SLUGS.length).toBeGreaterThan(20);
  });

  it('a gym membership covers the gym FLOOR, bodyweight and a mat included', () => {
    // This test used to assert the opposite, reasoning about ownership: a gym
    // membership is not a yoga mat you own. But the list answers "what can you
    // DO", and a gym plainly lets you do press-ups. Excluding them made a gym
    // member match 88 exercises against 105 for someone with dumbbells at
    // home — found by checking the live endpoint, not by this suite.
    expect(FULL_GYM_SLUGS).toContain('bodyweight');
    expect(FULL_GYM_SLUGS).toContain('mat');
    expect(FULL_GYM_SLUGS).toContain('resistance_bands');
    // Specialist kit is still not standard issue.
    expect(FULL_GYM_SLUGS).not.toContain('sandbag');
  });
});

describe('toEquipmentSlug — one format out of the several on disk', () => {
  it('accepts the slug, the display name, and the shapes seen in the wild', () => {
    expect(toEquipmentSlug('resistance_bands')).toBe('resistance_bands');
    expect(toEquipmentSlug('Resistance bands')).toBe('resistance_bands');   // companion's format
    expect(toEquipmentSlug('bands')).toBe('resistance_bands');
    expect(toEquipmentSlug('Pull-up bar')).toBe('pull_up_bar');
    expect(toEquipmentSlug('pullupbar')).toBe('pull_up_bar');
    expect(toEquipmentSlug('dumbbell')).toBe('dumbbells');                  // singular
    expect(toEquipmentSlug('TRX / suspension straps')).toBe('trx_straps');
    expect(toEquipmentSlug('gym')).toBe('gym_full');
  });

  it('returns null rather than guessing', () => {
    // The whole point. A confident wrong slug is how somebody gets a plan built
    // on kit they do not own — exactly the fault being removed.
    expect(toEquipmentSlug('sausage machine')).toBeNull();
    expect(toEquipmentSlug('')).toBeNull();
    expect(toEquipmentSlug('   ')).toBeNull();
  });

  it('never collapses the two machines the old matcher confused', () => {
    expect(toEquipmentSlug('Hip abductor machine')).toBe('hip_abductor_machine');
    expect(toEquipmentSlug('Hip adductor machine')).toBe('hip_adductor_machine');
    expect(toEquipmentSlug('Hip abductor machine')).not.toBe(toEquipmentSlug('Hip adductor machine'));
  });
});

describe('normaliseEquipment — migrating what is already on disk', () => {
  it('upgrades a companion-format profile in place, without asking anybody anything', () => {
    expect(normaliseEquipment(['Dumbbells', 'Resistance bands', 'Pull-up bar']))
      .toEqual(['dumbbells', 'resistance_bands', 'pull_up_bar']);
  });

  it('de-duplicates across formats', () => {
    // Someone who ticked it on the phone and answered Ava on the desktop.
    expect(normaliseEquipment(['Dumbbells', 'dumbbells', 'dumbbell'])).toEqual(['dumbbells']);
  });

  it('KEEPS what it does not recognise', () => {
    // Dropping it would make the profile shrink every time it was opened. The
    // person told us this; we just do not have a word for it yet.
    expect(normaliseEquipment(['Dumbbells', 'homemade bulgarian bag']))
      .toEqual(['dumbbells', 'homemade bulgarian bag']);
  });

  it('handles nothing at all', () => {
    expect(normaliseEquipment(null)).toEqual([]);
    expect(normaliseEquipment(undefined)).toEqual([]);
    expect(normaliseEquipment([])).toEqual([]);
  });
});

describe('canPerformWithEquipment — exact, and ALL of it', () => {
  it('needs every piece, not any', () => {
    // 57 catalogue exercises need more than one thing. "Any" hands somebody a
    // bench press with no bench.
    expect(canPerformWithEquipment(['barbell', 'bench'], ['barbell'])).toBe(false);
    expect(canPerformWithEquipment(['barbell', 'bench'], ['barbell', 'bench'])).toBe(true);
  });

  it('no longer treats one machine as another', () => {
    // The headline regression from the old matcher.
    expect(canPerformWithEquipment(['smith_machine'], ['cable_machine'])).toBe(false);
    expect(canPerformWithEquipment(['hip_adductor_machine'], ['hip_abductor_machine'])).toBe(false);
    expect(canPerformWithEquipment(['leg_curl_machine'], ['rowing_machine'])).toBe(false);
  });

  it('a gym membership covers the gym floor', () => {
    expect(canPerformWithEquipment(['cable_machine'], ['gym_full'])).toBe(true);
    expect(canPerformWithEquipment(['barbell', 'squat_rack'], ['gym_full'])).toBe(true);
    expect(canPerformWithEquipment(['bodyweight'], ['gym_full'])).toBe(true);
    // …but not the things a gym does not give you.
    expect(canPerformWithEquipment(['sandbag'], ['gym_full'])).toBe(false);
  });

  it('matches across the old and new storage formats', () => {
    expect(canPerformWithEquipment(['Dumbbells'], ['dumbbells'])).toBe(true);
    expect(canPerformWithEquipment(['dumbbells'], ['Dumbbells'])).toBe(true);
  });

  it('an empty PROFILE means "not stated" and blocks nothing', () => {
    // Filtering on silence would leave a beginner with almost no exercises.
    expect(canPerformWithEquipment(['barbell'], [])).toBe(true);
    expect(canPerformWithEquipment(['barbell'], null)).toBe(true);
  });

  it('an empty EXERCISE list means it needs nothing', () => {
    expect(canPerformWithEquipment([], ['dumbbells'])).toBe(true);
    expect(canPerformWithEquipment(null, ['dumbbells'])).toBe(true);
  });
});

describe('missingEquipmentNames — saying why, in words', () => {
  it('names what is missing, not its slug', () => {
    expect(missingEquipmentNames(['barbell', 'bench'], ['barbell'])).toEqual(['Bench']);
    expect(missingEquipmentNames(['trx_straps'], ['dumbbells'])).toEqual(['TRX / suspension straps']);
  });

  it('says nothing when there is nothing to say', () => {
    expect(missingEquipmentNames(['barbell'], ['barbell'])).toEqual([]);
    expect(missingEquipmentNames(['barbell'], [])).toEqual([]);   // not stated
  });

  it('equipmentName falls back to the slug rather than rendering blank', () => {
    expect(equipmentName('dumbbells')).toBe('Dumbbells');
    expect(equipmentName('something_new')).toBe('something_new');
  });
});

describe('ownedEquipmentSlugs', () => {
  it('expands a gym membership but keeps what they own at home', () => {
    const owned = ownedEquipmentSlugs(['gym_full', 'Sandbag']);
    expect(owned).toContain('sandbag');
    expect(owned).toContain('cable_machine');
    expect(owned).toContain('gym_full');
  });

  it('leaves a non-gym profile exactly as it found it', () => {
    expect(ownedEquipmentSlugs(['dumbbells', 'bench'])).toEqual(['dumbbells', 'bench']);
  });
});
