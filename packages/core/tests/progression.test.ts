import { describe, it, expect } from 'vitest';
import {
  lastTimeOf, lastTimeFor, stepOptions, applyProgression, progressionAfterSession, lastTimesForDay, plannedKg, weightJump,
} from '../src/health/progression.js';
import type { GymSession, GymExercise } from '../src/health/session-types.js';
import type { HealthPlanExercise, HealthPlanRecord } from '../src/health/types.js';

const set = (reps: number | null, weight: number | null) => ({ id: 's', reps, weight, rpe: null, notes: null, completed_at: '2026-11-14T10:00:00Z' });
const gx = (slug: string, sets: ReturnType<typeof set>[], t: [number | null, string | null, string | null], state: GymExercise['state'] = null): GymExercise => ({
  id: 'e', ref: { kind: 'exercise', slug }, name: slug, target_sets: t[0], target_reps: t[1], target_weight: t[2],
  target_rest_seconds: null, tempo: null, notes: null, state, sets,
});
const session = (date: string, ex: GymExercise[], day = 1): GymSession => ({
  schema_version: 1, id: date, date, source: 'plan', plan_id: 'p', day_index: day, status: 'completed', title: null,
  exercises: ex, notes: null, started_at: null, completed_at: null, updated_at: `${date}T12:00:00Z`,
} as GymSession);
const px = (slug: string, sets: number | null, reps: string | null, weight: string | null, extra: Partial<HealthPlanExercise> = {}): HealthPlanExercise => ({
  id: slug, ref: { kind: 'exercise', slug }, name: slug, sets, reps, weight, rest_seconds: null, tempo: null, notes: null, ...extra,
});
const plan = (days: Array<[number, HealthPlanExercise[]]>): HealthPlanRecord => ({
  id: 'p', type: 'fitness', title: 'P', status: 'active', duration_days: 14,
  days: days.map(([i, training]) => ({ day_index: i, kind: 'training', title: null, training, meals: [], notes: null })),
} as unknown as HealthPlanRecord);

describe('progression from the log', () => {
  it('reads a complete session, above plan, and a short one', () => {
    expect(lastTimeOf(gx('squat', [set(12, 16), set(12, 16), set(12, 16)], [3, '10', '16 kg']), 'd')?.verdict).toBe('above');
    expect(lastTimeOf(gx('squat', [set(10, 16), set(10, 16), set(10, 16)], [3, '10', '16 kg']), 'd')?.verdict).toBe('as_planned');
    expect(lastTimeOf(gx('squat', [set(10, 16), set(10, 16)], [3, '10', '16 kg']), 'd')?.verdict).toBe('short');
  });

  it('never reads unrecorded or skipped as a performance', () => {
    expect(lastTimeOf(gx('squat', [], [3, '10', null]), 'd')).toBeNull();
    expect(lastTimeOf(gx('squat', [], [3, '10', null], 'skipped'), 'd')).toBeNull();
    expect(lastTimeOf(gx('squat', [], [3, '10', null], 'done'), 'd')?.verdict).toBe('ticked');
  });

  it('offers nothing after a short session, or for a warm-up', () => {
    const short = lastTimeOf(gx('row', [set(10, 20)], [3, '10', '20 kg']), 'd');
    expect(stepOptions(px('row', 3, '10', '20 kg'), short)).toEqual([]);
    const full = lastTimeOf(gx('row', [set(10, 20), set(10, 20), set(10, 20)], [3, '10', '20 kg']), 'd');
    expect(stepOptions(px('row', 3, '10', '20 kg', { meta: { session_role: 'warmup' } }), full)).toEqual([]);
  });

  it('offers keep, one more rep, one more set and heavier by the kit', () => {
    const full = lastTimeOf(gx('goblet-squat', [set(12, 16), set(12, 16), set(12, 16)], [3, '10', '16 kg']), 'd');
    const opts = stepOptions(px('goblet-squat', 3, '10', '16 kg', { meta: { equipment: ['dumbbells'] } }), full);
    expect(opts.map((o) => [o.step, o.sets, o.reps, o.weight])).toEqual([
      ['keep', 3, '10', '16 kg'], ['one_more_rep', 3, '11', '16 kg'], ['one_more_set', 4, '10', '16 kg'], ['heavier', 3, '10', '18 kg'],
    ]);
    expect(weightJump({ name: 'Kettlebell swing', meta: null })).toBe(4);
    expect(weightJump({ name: 'Back squat', meta: { equipment: ['barbell'] } })).toBe(2.5);
  });

  it('a timed move gets keep and one more set only; RPE and bodyweight are not weights', () => {
    const full = lastTimeOf(gx('plank', [set(null, null), set(null, null), set(null, null)], [3, '30s', null]), 'd');
    expect(stepOptions(px('plank', 3, '30s', null), full).map((o) => o.step)).toEqual(['keep', 'one_more_set']);
    expect(plannedKg('RPE 7')).toBeNull();
    expect(plannedKg('bodyweight')).toBeNull();
    expect(plannedKg('60kg')).toBe(60);
    expect(plannedKg('35 lb')).toBe(15.9);
  });

  it('applies a choice from a day onward, never to days already done', () => {
    const p = plan([[1, [px('squat', 3, '10', '16 kg')]], [3, [px('squat', 3, '10', '16 kg')]], [5, [px('squat', 3, '8', '20 kg')]]]);
    const out = applyProgression(p, 2, [{ slug: 'squat', step: 'one_more_rep' }]);
    expect(out.days.map((d) => d.training[0].reps)).toEqual(['10', '11', '9']);
    const heavy = applyProgression(p, 2, [{ slug: 'squat', step: 'heavier', weight: '18 kg' }]);
    expect(heavy.days.map((d) => d.training[0].weight)).toEqual(['16 kg', '18 kg', '18 kg']);
    expect(applyProgression(p, 2, [{ slug: 'squat', step: 'keep' }])).toBe(p);
  });

  it('"Next time?" lists exercises that come up again, short ones shown with no choices', () => {
    const p = plan([[1, [px('squat', 3, '10', '16 kg'), px('row', 3, '10', '20 kg'), px('curl', 3, '10', '8 kg')]], [3, [px('squat', 3, '10', '16 kg'), px('row', 3, '10', '20 kg')]]]);
    const s = session('2026-11-14', [
      gx('squat', [set(12, 16), set(12, 16), set(12, 16)], [3, '10', '16 kg']),
      gx('row', [set(10, 20), set(10, 20)], [3, '10', '20 kg']),
      gx('curl', [set(10, 8), set(10, 8), set(10, 8)], [3, '10', '8 kg']),
    ]);
    const rows = progressionAfterSession(p, s);
    expect(rows.map((r) => [r.slug, r.last.verdict, r.options.length > 0])).toEqual([['squat', 'above', true], ['row', 'short', false]]);
  });

  it('nothing to offer → no "Next time?" at all', () => {
    const p = plan([[1, [px('row', 3, '10', '20 kg')]], [3, [px('row', 3, '10', '20 kg')]]]);
    expect(progressionAfterSession(p, session('2026-11-14', [gx('row', [set(10, 20)], [3, '10', '20 kg'])]))).toEqual([]);
  });

  it('the plan day shows last time from BEFORE that day, and says when it was stepped up', () => {
    const p = plan([[3, [px('squat', 3, '10', '18 kg'), px('rdl', 3, '8', '30 kg')]]]);
    const log = [
      session('2026-11-14', [gx('squat', [set(12, 16), set(12, 16), set(12, 16)], [3, '10', '16 kg']), gx('rdl', [set(8, 30), set(8, 30), set(8, 30)], [3, '8', '30 kg'])]),
      session('2026-11-17', [gx('squat', [set(10, 18)], [3, '10', '18 kg'])], 3),
    ];
    const rows = lastTimesForDay(p, 3, log, '2026-11-17');
    expect(rows.squat.last.date).toBe('2026-11-14');
    expect(rows.squat.stepped).toBe(true);
    expect(rows.squat.options).toEqual([]);
    expect(rows.rdl.stepped).toBe(false);
    expect(rows.rdl.options.find((o) => o.step === 'heavier')?.weight).toBe('32.5 kg');
    expect(lastTimeFor(log, 'squat')?.verdict).toBe('short'); // the newest, short on the 17th
  });
});
