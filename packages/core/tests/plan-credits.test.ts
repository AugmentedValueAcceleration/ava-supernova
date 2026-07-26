// What a plan costs.
//
// creditsForPlan used to round UP TO WHOLE WEEKS, so a 1-day plan cost exactly
// what a 7-day plan cost. That was a harmless edge case while the offered
// durations were 1/7/28/56/84 and nobody chose 1. It stopped being harmless
// when the durations became 1/3/7 (operator, 2026-07-26: "do you not think the
// same price for 1/3/7 days is a bad look?") — we would have been steering
// people toward the shortest plan while charging them a full week for a
// seventh of the output.
//
// The bar this locks down is not just "short plans are fairer". It is that
// EVERY PRICE THAT ALREADY EXISTED IS UNCHANGED. A billing change that quietly
// moves what someone already pays is a different and much worse thing than a
// billing change that only makes a new option fair, and the table below is the
// proof that this is the second kind.

import { describe, it, expect } from 'vitest';
import { creditsForPlan, PLAN_CREDITS_PER_WEEK } from '../src/billing/credits.js';

describe('creditsForPlan', () => {
  it('leaves every previously-offered duration at exactly its old price', () => {
    // Old rule: ceil(days / 7) * perWeek. These are the values it produced.
    const unchanged: Array<[number, number, number]> = [
      // days, single, combined
      [7, 5, 10],
      [14, 10, 20],
      [21, 15, 30],
      [28, 20, 40],
      [56, 40, 80],
      [84, 60, 120],
    ];
    for (const [days, single, combined] of unchanged) {
      expect(creditsForPlan('fitness', days), `${days}d fitness`).toBe(single);
      expect(creditsForPlan('meal', days), `${days}d meal`).toBe(single);
      expect(creditsForPlan('combined', days), `${days}d combined`).toBe(combined);
    }
  });

  it('prices the short durations by the day rather than as a full week', () => {
    expect(creditsForPlan('fitness', 1)).toBe(1);
    expect(creditsForPlan('fitness', 3)).toBe(3);
    expect(creditsForPlan('combined', 1)).toBe(2);
    expect(creditsForPlan('combined', 3)).toBe(5);
  });

  it('never charges a shorter plan more than a longer one', () => {
    for (const type of ['fitness', 'meal', 'combined'] as const) {
      let previous = 0;
      for (let days = 1; days <= 90; days++) {
        const cost = creditsForPlan(type, days);
        expect(cost, `${type} ${days}d must not undercut ${days - 1}d`).toBeGreaterThanOrEqual(previous);
        previous = cost;
      }
    }
  });

  it('charges combined more than a single-discipline plan of the same length', () => {
    for (const days of [1, 3, 7, 28, 84]) {
      expect(creditsForPlan('combined', days)).toBeGreaterThan(creditsForPlan('fitness', days));
    }
  });

  it('never returns zero, whatever it is handed', () => {
    for (const days of [0, -1, NaN, 0.5]) {
      expect(creditsForPlan('fitness', days as number)).toBeGreaterThanOrEqual(1);
    }
  });

  it('stays consistent with the published weekly rate', () => {
    expect(creditsForPlan('fitness', 7)).toBe(PLAN_CREDITS_PER_WEEK.single);
    expect(creditsForPlan('combined', 7)).toBe(PLAN_CREDITS_PER_WEEK.combined);
  });
});
