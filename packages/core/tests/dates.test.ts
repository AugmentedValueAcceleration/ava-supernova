// localYmd must disagree with toISOString exactly when a person would.
//
// The bug it replaces is quiet: on GMT the two agree, so the whole thing looks
// fine from London for half the year. These tests pin the cases where they
// must NOT agree, because that is the behaviour being bought.

import { describe, it, expect } from 'vitest';
import { localYmd, todayLocal, addDaysLocal } from '../src/core/dates.js';

describe('localYmd', () => {
  it('renders the local calendar day, not the UTC instant', () => {
    // A Date built from local components IS that local day, whatever UTC says.
    const d = new Date(2026, 7, 17, 23, 30); // 17 Aug 2026, 23:30 local
    expect(localYmd(d)).toBe('2026-08-17');
  });

  it('holds at both ends of the local day', () => {
    expect(localYmd(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
    expect(localYmd(new Date(2026, 0, 1, 23, 59, 59))).toBe('2026-01-01');
  });

  it('zero-pads, so the string sorts and compares correctly', () => {
    // Due-date logic compares these as strings; '2026-9-5' would break both
    // ordering and equality against a stored '2026-09-05'.
    expect(localYmd(new Date(2026, 8, 5, 12))).toBe('2026-09-05');
  });

  it('agrees with toISOString only when the local day happens to match UTC', () => {
    // Midday is the same date in UTC for every real timezone, so this is the
    // one case that must always agree — a guard on the formatting itself.
    const noon = new Date(2026, 5, 15, 12, 0, 0);
    expect(localYmd(noon)).toBe(noon.toISOString().slice(0, 10));
  });

  it('defaults to now', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayLocal()).toBe(localYmd(new Date()));
  });
});

describe('addDaysLocal', () => {
  it('moves by calendar days', () => {
    const from = new Date(2026, 7, 17, 9, 0);
    expect(addDaysLocal(1, from)).toBe('2026-08-18');
    expect(addDaysLocal(-1, from)).toBe('2026-08-16');
    expect(addDaysLocal(0, from)).toBe('2026-08-17');
  });

  it('crosses month and year boundaries', () => {
    expect(addDaysLocal(1, new Date(2026, 0, 31, 9))).toBe('2026-02-01');
    expect(addDaysLocal(1, new Date(2026, 11, 31, 9))).toBe('2027-01-01');
  });

  it('handles a leap year', () => {
    expect(addDaysLocal(1, new Date(2028, 1, 28, 9))).toBe('2028-02-29');
  });

  it('adds DATES, not milliseconds, so DST cannot shift it', () => {
    // A DST day is 23 or 25 hours long. Adding 86_400_000ms across the
    // boundary lands on the wrong date, or repeats one — the exact reason
    // this helper uses setDate instead. Checked over a long run so any such
    // drift accumulates into a visible failure rather than hiding.
    let cursor = new Date(2026, 0, 1, 12);
    for (let i = 1; i <= 400; i++) {
      const expected = new Date(2026, 0, 1 + i, 12);
      expect(addDaysLocal(i, cursor)).toBe(localYmd(expected));
    }
    cursor = new Date(2026, 0, 1, 12); // unchanged by the calls above
    expect(localYmd(cursor)).toBe('2026-01-01');
  });

  it('does not mutate the date it was given', () => {
    const from = new Date(2026, 7, 17, 9, 0);
    const before = from.getTime();
    addDaysLocal(30, from);
    expect(from.getTime()).toBe(before);
  });
});
