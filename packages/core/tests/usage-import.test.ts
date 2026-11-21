/**
 * Phase 3 of the Usage timeline: the months kept by the old counters come into
 * the ledger once, as monthly totals marked 'before daily records'.
 *
 * What must hold:
 *   - one line per model per month, stamped on the 1st, room/mode 'earlier';
 *   - the old counter ran alongside the ledger from the day it began, so what
 *     the ledger already holds from the SAME program is taken off — never
 *     counted twice — and another program's lines are not;
 *   - it runs once: a second start-up changes nothing;
 *   - the page counts a month line as its calls and draws its bar apart.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureUsageLedger, recordUsage, readUsage, importLegacyUsage } from '../src/usage/ledger.js';
import { legacyUsageLines, buildUsageView, rangeFor, usageCsv, type UsageEntry } from '../src/usage/view.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ava-usage-import-')); });
afterEach(() => { configureUsageLedger(null); rmSync(dir, { recursive: true, force: true }); });

const line = (t: string, over: Partial<UsageEntry> = {}): UsageEntry => ({
  t, surface: 'ext', room: 'main', mode: 'work', provider: 'deepseek', model: 'flash', in: 100, out: 10, ...over,
});

describe('legacyUsageLines', () => {
  it('one line per model per month, on the 1st, marked earlier', () => {
    const out = legacyUsageLines('ide', [
      { month: '2026-10', models: [{ model: 'flash', provider: 'deepseek', in: 1000, out: 100, requests: 7 }, { model: 'plus', in: 50, out: 5, requests: 1 }] },
    ], []);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ surface: 'ide', room: 'earlier', mode: 'earlier', span: 'month', model: 'flash', in: 1000, out: 100, n: 7 });
    expect(out[0].t.slice(0, 10)).toBe('2026-10-01');
    expect(out[1].provider).toBe('unknown');
  });

  it("takes off what the ledger already holds from the same program, not another's", () => {
    const recorded = [
      line('2026-11-21T16:00:00.000+00:00', { in: 300, out: 30 }),
      line('2026-11-21T16:05:00.000+00:00', { in: 200, out: 20 }),
      line('2026-11-21T16:06:00.000+00:00', { in: 999, out: 99, surface: 'ide' }),
    ];
    const out = legacyUsageLines('ext', [{ month: '2026-11', models: [{ model: 'flash', in: 1500, out: 150, requests: 10 }] }], recorded);
    expect(out).toEqual([expect.objectContaining({ in: 1000, out: 100, n: 8 })]);
  });

  it('a month the ledger already covers fully adds nothing; a repeated month is taken once', () => {
    const recorded = [line('2026-11-21T16:00:00.000+00:00', { in: 500, out: 50 })];
    expect(legacyUsageLines('ext', [{ month: '2026-11', models: [{ model: 'flash', in: 400, out: 40, requests: 1 }] }], recorded)).toEqual([]);
    const twice = legacyUsageLines('ext', [
      { month: '2026-09', models: [{ model: 'flash', in: 10, out: 1, requests: 1 }] },
      { month: '2026-09', models: [{ model: 'flash', in: 10, out: 1, requests: 1 }] },
    ], []);
    expect(twice).toHaveLength(1);
  });
});

describe('importLegacyUsage', () => {
  it('writes the months once; a second start-up is a no-op', () => {
    configureUsageLedger({ surface: 'ext', dir });
    recordUsage({ provider: 'deepseek', model: 'flash', usage: { prompt_tokens: 100, completion_tokens: 10 }, at: new Date(2026, 10, 21, 16) });
    const months = [
      { month: '2026-10', models: [{ model: 'flash', provider: 'deepseek', in: 5000, out: 500, requests: 20 }] },
      { month: '2026-11', models: [{ model: 'flash', provider: 'deepseek', in: 600, out: 60, requests: 3 }] },
    ];
    expect(importLegacyUsage('ext', months)).toEqual({ imported: 2, skipped: false });
    expect(importLegacyUsage('ext', months)).toEqual({ imported: 0, skipped: true });
    expect(readdirSync(dir).sort()).toEqual(['2026-10.jsonl', '2026-11.jsonl', 'imported-ext']);
    const nov = readUsage('2026-11-01', '2026-11-30');
    // 600 old − 100 already in the ledger = 500 brought in, plus the 100 recorded.
    expect(nov.reduce((n, e) => n + e.in, 0)).toBe(600);
  });
});

describe('on the page', () => {
  it('a month line counts as its calls, and its bar is drawn apart', () => {
    const entries: UsageEntry[] = [
      { t: '2026-11-01T00:00:00.000+00:00', surface: 'ext', room: 'earlier', mode: 'earlier', provider: 'deepseek', model: 'flash', in: 1000, out: 100, n: 12, usd: 0.5, span: 'month' },
      line('2026-11-21T16:00:00.000+00:00', { usd: 0.01 }),
    ];
    const now = new Date(2026, 10, 21, 18);
    const v = buildUsageView(entries, 'month', rangeFor('month', now), now);
    expect(v.summary.totals.replies).toBe(13);
    expect(v.bars[0]).toMatchObject({ start: '2026-11-01', earlier: true, replies: 12 });
    expect(v.bars[20].earlier).toBeUndefined();
    expect(v.summary.byRoom.map((r) => r.room)).toEqual(['earlier', 'main']);
    const csv = usageCsv(entries).split('\r\n');
    expect(csv[1].endsWith(',12,month total (before daily records)')).toBe(true);
    expect(csv[2].endsWith(',1,call')).toBe(true);
  });
});
