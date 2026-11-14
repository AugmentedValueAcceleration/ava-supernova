import { describe, it, expect } from 'vitest';
import { encodeResults, decodeResults, resultsUrl, sessionFromResults, compareExercise, kgFrom, type SharedResults } from '../src/health/share-results.js';
import { summariseTrainingLog } from '../src/health/session-summary.js';

const r: SharedResults = {
  v: 1, title: 'Lower body', date: '2026-11-14', plan: 'plan1', day: 2, mins: 41,
  exercises: [
    { n: 'Goblet Squat', s: 'goblet-squat', ts: 3, tr: '10', tw: '16 kg', done: [['10', '16 kg'], ['10', '16 kg'], ['10', '16 kg']] },
    { n: 'Glute Bridge', s: 'glute-bridge', ts: 3, tr: '12', tw: '', done: [['14', ''], ['14', ''], ['14', '']] },
    { n: 'Wall Sit', s: '', ts: 3, tr: '30s', tw: 'bodyweight', done: [['30s', 'bodyweight']] },
    { n: 'Calf Raise', s: 'calf-raise', ts: 3, tr: '15', tw: '', done: [] },
  ],
};

describe('results back from the phone', () => {
  it('round-trips, from the payload, a #payload or a whole link', async () => {
    const h = await encodeResults(r);
    expect(await decodeResults(h)).toEqual(r);
    const url = await resultsUrl(r);
    expect(url.startsWith('https://avasupernova.com/log#1.')).toBe(true);
    expect(await decodeResults(url)).toEqual(r);
    expect(await decodeResults(`vscode://augmentedvalueacceleration.ava-supernova/log#${h}`)).toEqual(r);
    expect(await decodeResults('nonsense')).toBeNull();
  });

  it('compares planned and done as facts', () => {
    expect(compareExercise(r.exercises[0])).toEqual({ verdict: 'on_plan', setsShort: 0 });
    expect(compareExercise(r.exercises[1]).verdict).toBe('above');
    expect(compareExercise(r.exercises[2])).toEqual({ verdict: 'short', setsShort: 2 });
    expect(compareExercise(r.exercises[3]).verdict).toBe('not_done');
  });

  it('reads weights into kilograms', () => {
    expect(kgFrom('16 kg')).toBe(16);
    expect(kgFrom('35 lb')).toBe(15.9);
    expect(kgFrom('bodyweight')).toBeNull();
  });

  it('becomes a log session tied to its plan day; nothing typed is lost; unticked is unrecorded, never skipped', () => {
    const s = sessionFromResults(r, '2026-11-14T18:00:00.000Z');
    expect(s).toMatchObject({ date: '2026-11-14', source: 'plan', plan_id: 'plan1', day_index: 2, status: 'completed', title: 'Lower body' });
    expect(s.exercises[0].sets.map((x) => [x.reps, x.weight])).toEqual([[10, 16], [10, 16], [10, 16]]);
    expect(s.exercises[2].sets[0]).toMatchObject({ reps: null, weight: null, notes: '30s · bodyweight' });
    expect(s.exercises[3].state).toBeNull();
    expect(s.exercises[3].sets).toEqual([]);
  });

  it('is what Ava reads in the Health room', () => {
    const text = summariseTrainingLog([sessionFromResults(r, '2026-11-14T18:00:00.000Z')], '2026-11-15');
    expect(text).toContain('Glute Bridge');
    expect(text).not.toContain('Calf Raise — SKIPPED');
  });
});
