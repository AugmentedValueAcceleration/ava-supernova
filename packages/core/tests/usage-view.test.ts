/**
 * The Usage timeline's page logic (usage/view.ts): ranges on the user's own
 * calendar, the period each is compared with, bars that cover the whole range,
 * and a CSV that is the same lines the totals come from.
 */
import { describe, it, expect } from 'vitest';
import {
  rangeFor, previousRange, bucketFor, bucketStart, usageBars, buildUsageView, usageCsv, changePct, daysToLoad,
  type UsageEntry,
} from '../src/usage/view.js';

const NOW = new Date(2026, 10, 21, 15); // Sat 21 Nov 2026, local

const e = (t: string, over: Partial<UsageEntry> = {}): UsageEntry => ({
  t, surface: 'ext', room: 'main', mode: 'work', provider: 'deepseek', model: 'flash', in: 100, out: 10, usd: 0.01, ...over,
});

describe('ranges', () => {
  it('presets are days on the local calendar', () => {
    expect(rangeFor('today', NOW)).toEqual({ from: '2026-11-21', to: '2026-11-21' });
    expect(rangeFor('7d', NOW)).toEqual({ from: '2026-11-15', to: '2026-11-21' });
    expect(rangeFor('30d', NOW)).toEqual({ from: '2026-10-23', to: '2026-11-21' });
    expect(rangeFor('month', NOW)).toEqual({ from: '2026-11-01', to: '2026-11-21' });
    expect(rangeFor('last_month', NOW)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(rangeFor('all', NOW)).toEqual({ to: '2026-11-21' });
    expect(rangeFor('custom', NOW, { from: '2026-11-10', to: '2026-11-02' })).toEqual({ from: '2026-11-02', to: '2026-11-10' });
  });

  it('a month compares with the same days of the month before; others with the days just before', () => {
    expect(previousRange('month', { from: '2026-11-01', to: '2026-11-21' })).toEqual({ from: '2026-10-01', to: '2026-10-21' });
    // 31 March: February has no 31st, so it stops at February's last day.
    expect(previousRange('month', { from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousRange('last_month', { from: '2026-10-01', to: '2026-10-31' })).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(previousRange('7d', { from: '2026-11-15', to: '2026-11-21' })).toEqual({ from: '2026-11-08', to: '2026-11-14' });
    expect(previousRange('today', { from: '2026-11-21', to: '2026-11-21' })).toEqual({ from: '2026-11-20', to: '2026-11-20' });
    expect(previousRange('all', { from: '2026-01-01', to: '2026-11-21' })).toBeNull();
    expect(daysToLoad('7d', { from: '2026-11-15', to: '2026-11-21' })).toEqual({ from: '2026-11-08', to: '2026-11-21' });
  });

  it('change is a percentage, or nothing when there is nothing to compare with', () => {
    expect(changePct(15, 10)).toBe(50);
    expect(changePct(5, 0)).toBeNull();
  });
});

describe('bars', () => {
  it('days up to two months, weeks to a year, months beyond; weeks start on Monday', () => {
    expect(bucketFor('2026-11-15', '2026-11-21')).toBe('day');
    expect(bucketFor('2026-06-01', '2026-11-21')).toBe('week');
    expect(bucketFor('2024-01-01', '2026-11-21')).toBe('month');
    expect(bucketStart('2026-11-21', 'week')).toBe('2026-11-16'); // Saturday → Monday
    expect(bucketStart('2026-11-16', 'week')).toBe('2026-11-16');
  });

  it('covers the whole range, empty days included, and sums each bar', () => {
    const bars = usageBars([e('2026-11-15T10:00:00.000+00:00'), e('2026-11-21T09:00:00.000+00:00'), e('2026-11-21T23:59:00.000+00:00')], '2026-11-15', '2026-11-21');
    expect(bars).toHaveLength(7);
    expect(bars.map((b) => b.replies)).toEqual([1, 0, 0, 0, 0, 0, 2]);
    expect(bars[6].in).toBe(200);
  });

  it('a week bar is clipped to the range', () => {
    const bars = usageBars([], '2026-06-03', '2026-11-21', 'week');
    expect(bars[0]).toMatchObject({ start: '2026-06-03', end: '2026-06-07' });
    expect(bars[bars.length - 1]).toMatchObject({ start: '2026-11-16', end: '2026-11-21' });
  });
});

describe('the page', () => {
  it('totals, the period before and the breakdowns all come from the same lines', () => {
    const entries = [
      e('2026-10-05T10:00:00.000+00:00', { usd: 0.10 }),
      e('2026-11-02T10:00:00.000+00:00', { usd: 0.20, room: 'health', mode: 'health' }),
      e('2026-11-20T10:00:00.000+00:00', { usd: 0.30, model: 'plus' }),
      e('2026-11-21T10:00:00.000+00:00', { usd: undefined, model: 'mystery' }),
    ];
    const v = buildUsageView(entries, 'month', rangeFor('month', NOW), NOW);
    expect(v.range).toEqual({ from: '2026-11-01', to: '2026-11-21' });
    expect(v.summary.totals.replies).toBe(3);
    expect(v.summary.totals.usd).toBeCloseTo(0.5, 10);
    expect(v.summary.totals.unpriced).toBe(1);
    expect(v.previous?.totals.usd).toBeCloseTo(0.1, 10);
    expect(v.summary.byRoom.map((r) => r.room)).toEqual(['main', 'health']);
    expect(v.bars.reduce((n, b) => n + b.replies, 0)).toBe(v.summary.totals.replies);
  });

  it("'all' starts at the first thing ever recorded", () => {
    const v = buildUsageView([e('2026-11-19T10:00:00.000+00:00')], 'all', rangeFor('all', NOW), NOW);
    expect(v.range).toEqual({ from: '2026-11-19', to: '2026-11-21' });
    expect(v.previous).toBeNull();
    expect(v.bars).toHaveLength(3);
  });
});

describe('CSV', () => {
  it('one row per line, and nothing a spreadsheet would run as a formula', () => {
    const csv = usageCsv([e('2026-11-21T10:00:00.000+00:00', { model: '=HYPERLINK("x")', cached: 40 })]);
    const [head, row] = csv.trim().split('\r\n');
    expect(head).toBe('time,program,room,mode,provider,model,input_tokens,output_tokens,cached_tokens,estimated_usd');
    expect(row).toBe('2026-11-21T10:00:00.000+00:00,ext,main,work,deepseek,"=HYPERLINK(""x"")",100,10,40,0.01');
  });
});
