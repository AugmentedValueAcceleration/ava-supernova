import { describe, it, expect } from 'vitest';
import {
  summariseCookingTime,
  HEALTH_PROFILE_FIELDS,
  HEALTH_PROFILE_FIELD_IDS,
  type CookingTime,
} from '../src/health/profile-fields.js';

// by_day keyed '0'–'6' (Sun=0…Sat=6); a tier per meal ('15'|'30'|'60'|'60+'),
// null = Any. Display order is Mon-first.
const day = (b: string | null, l: string | null, d: string | null) => ({ breakfast: b, lunch: l, dinner: d });

describe('summariseCookingTime', () => {
  it('returns null for undefined / null / empty grid', () => {
    expect(summariseCookingTime(undefined)).toBeNull();
    expect(summariseCookingTime(null)).toBeNull();
    expect(summariseCookingTime({ by_day: {} })).toBeNull();
  });

  it('returns null when every cell is Any (all-null)', () => {
    const grid: CookingTime = { by_day: { '1': day(null, null, null), '0': day(null, null, null) } };
    expect(summariseCookingTime(grid)).toBeNull();
  });

  it('summarises a single day with one set meal', () => {
    const grid: CookingTime = { by_day: { '3': day(null, null, '60+') } }; // Wed dinner
    expect(summariseCookingTime(grid)).toBe(
      'Cooking time (max minutes per meal; unset = no limit): Wed dinner 60+.',
    );
  });

  it('lists set meals in breakfast→lunch→dinner order with compact tiers', () => {
    const grid: CookingTime = { by_day: { '2': day('15', '30', '60') } }; // Tue
    expect(summariseCookingTime(grid)).toBe(
      'Cooking time (max minutes per meal; unset = no limit): Tue breakfast ≤15, lunch ≤30, dinner ≤60.',
    );
  });

  it('folds consecutive identical weekdays into a range, weekend separate', () => {
    const weekday = day('15', '30', '30');
    const weekend = day(null, null, '60+');
    const grid: CookingTime = {
      by_day: {
        '1': weekday, '2': weekday, '3': weekday, '4': weekday, '5': weekday, // Mon–Fri
        '6': weekend, '0': weekend, // Sat–Sun
      },
    };
    expect(summariseCookingTime(grid)).toBe(
      'Cooking time (max minutes per meal; unset = no limit): ' +
        'Mon–Fri breakfast ≤15, lunch ≤30, dinner ≤30; Sat–Sun dinner 60+.',
    );
  });

  it('skips unconstrained days inside the week without breaking the run', () => {
    const grid: CookingTime = {
      by_day: {
        '1': day('15', null, null), // Mon
        // Tue/Wed unset → skipped
        '4': day('15', null, null), // Thu — same sig as Mon but not consecutive
      },
    };
    // Mon and Thu share a signature but aren't consecutive in display order, so
    // they stay as separate segments.
    expect(summariseCookingTime(grid)).toBe(
      'Cooking time (max minutes per meal; unset = no limit): Mon breakfast ≤15; Thu breakfast ≤15.',
    );
  });
});

describe('cooking_time registry entry', () => {
  it('is registered as a cooking_grid control on the health store', () => {
    const def = HEALTH_PROFILE_FIELDS['cooking_time'];
    expect(def).toBeDefined();
    expect(def.control).toBe('cooking_grid');
    expect(def.target).toBe('health');
    expect(def.path).toBe('schedule.cooking_time');
  });

  it('is exposed in the health_profile_ask field-id enum', () => {
    expect(HEALTH_PROFILE_FIELD_IDS).toContain('cooking_time');
  });
});
