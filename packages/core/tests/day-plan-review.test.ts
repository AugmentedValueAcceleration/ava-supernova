// Phase 4: the loop closes.
//
// 20 Oct 2026, the operator: "i will mark as pass but i want ava to always
// have her say and judge her own work — it is what will help her improve as
// she has her memory too."

import { describe, it, expect } from 'vitest';
import { DayPlanReadTool, DayPlanReviewTool } from '../src/tools/day-plan.js';
import type { DayPlanItem, DayPlanStore } from '../src/social/day-plan.js';

const row = (o: Partial<DayPlanItem>): DayPlanItem => ({
  id: 'x', plan_date: '2026-10-19', plan_time: '09:00:00', title: 'memory that survives a reinstall',
  notes: null, kind: 'post', platform: 'tiktok', status: 'done', done_by: 'operator', group_id: 'g1', ...o,
});

function ctxWith(store: Partial<DayPlanStore>) {
  return { cwd: '.', sharedState: { dayPlanStore: { list: async () => [], add: async () => 0, setStatus: async () => true, ...store } } } as never;
}

describe('day_plan_read, a fortnight back', () => {
  it('shows his marks and her verdicts across days', async () => {
    let asked: [string, string] | null = null;
    const r = await new DayPlanReadTool().execute({ date: '2026-10-20', days_back: 14 }, ctxWith({
      listRange: async (from, to) => {
        asked = [from, to];
        return [
          row({ id: 'a', platform: 'tiktok', landed: true, ava_verdict: 'the claim in the first second carried it' }),
          row({ id: 'b', platform: 'tweet', landed: false }),
          row({ id: 'c', plan_date: '2026-10-20', group_id: 'g2', title: 'news beat', landed: null }),
        ];
      },
    }));
    expect(r.success).toBe(true);
    expect(asked).toEqual(['2026-10-06', '2026-10-20']);
    expect(r.output).toMatch(/2 outputs — 1 landed, 1 did not/);
    expect(r.output).toMatch(/tiktok: done \(operator\), LANDED/);
    expect(r.output).toMatch(/tweet: done \(operator\), did not land/);
    expect(r.output).toMatch(/your verdict: the claim in the first second carried it/);
    expect(r.output).toMatch(/2026-10-19[\s\S]*2026-10-20/);
  });

  // Nothing marked is not "nothing worked".
  it('says plainly when he has marked nothing', async () => {
    const r = await new DayPlanReadTool().execute({ date: '2026-10-20', days_back: 3 }, ctxWith({
      listRange: async () => [row({ landed: null })],
    }));
    expect(r.output).toMatch(/has not marked anything/);
    expect(r.output).toMatch(/do not invent one/);
  });

  it('refuses rather than guessing when the host cannot read the past', async () => {
    const r = await new DayPlanReadTool().execute({ days_back: 14 }, ctxWith({}));
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/cannot read past days/);
  });

  it('caps the window at 14 days', async () => {
    let asked: [string, string] | null = null;
    await new DayPlanReadTool().execute({ date: '2026-10-20', days_back: 90 }, ctxWith({
      listRange: async (from, to) => { asked = [from, to]; return []; },
    }));
    expect(asked).toEqual(['2026-10-06', '2026-10-20']);
  });
});

describe('day_plan_review — her own verdict', () => {
  it('records the verdict on the items named', async () => {
    let got: [string[], string] | null = null;
    const r = await new DayPlanReviewTool().execute(
      { ids: ['a', 'b'], verdict: 'The hook was buried in line three.' },
      ctxWith({ setVerdict: async (ids, v) => { got = [ids, v]; return ids.length; } }),
    );
    expect(r.success).toBe(true);
    expect(got).toEqual([['a', 'b'], 'The hook was buried in line three.']);
    expect(r.output).toMatch(/memory_save/);
  });

  it('refuses an empty verdict', async () => {
    const r = await new DayPlanReviewTool().execute({ ids: ['a'], verdict: '  ' }, ctxWith({ setVerdict: async () => 1 }));
    expect(r.success).toBe(false);
  });

  it('says so when no id matched', async () => {
    const r = await new DayPlanReviewTool().execute({ ids: ['nope'], verdict: 'fine' }, ctxWith({ setVerdict: async () => 0 }));
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/read it again/);
  });

  it('points to the chat and memory when the host cannot record it', async () => {
    const r = await new DayPlanReviewTool().execute({ ids: ['a'], verdict: 'fine' }, ctxWith({}));
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/memory_save/);
  });
});
