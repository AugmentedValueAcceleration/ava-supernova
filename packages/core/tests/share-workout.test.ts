import { describe, it, expect } from 'vitest';
import { encodeSharedWorkout, decodeSharedWorkout, sharedWorkoutUrl, workoutFromDay, type SharedWorkout } from '../src/health/share-workout.js';

const w: SharedWorkout = {
  v: 1, title: 'Lower body', date: '2026-11-14', plan: 'plan123', day: 2,
  exercises: [
    { n: 'Goblet Squat', s: 'goblet-squat', sets: 3, reps: '10', w: '16 kg', rest: 90, note: '' },
    { n: 'Bulgarian Split Squat', s: 'bulgarian-split-squat', sets: 3, reps: '8 each leg', w: '', rest: 60, note: 'take care with left knee: go only as deep as is comfortable' },
    { n: 'Wall Sit', s: '', sets: 3, reps: '30s', w: 'bodyweight', rest: 45, note: '' },
  ],
};

describe('a session in a link', () => {
  it('round-trips exactly', async () => {
    const h = await encodeSharedWorkout(w);
    expect(h.startsWith('1.')).toBe(true);
    expect(await decodeSharedWorkout(h)).toEqual(w);
    expect(await decodeSharedWorkout('#' + h)).toEqual(w);
  });

  it('is a URL-safe link to the workout page', async () => {
    const url = await sharedWorkoutUrl(w);
    expect(url.startsWith('https://avasupernova.com/workout#1.')).toBe(true);
    expect(url.split('#')[1]).toMatch(/^1\.[A-Za-z0-9_-]+$/);
  });

  it('a broken or foreign link is null, never a crash', async () => {
    expect(await decodeSharedWorkout('')).toBeNull();
    expect(await decodeSharedWorkout('#2.abc')).toBeNull();
    expect(await decodeSharedWorkout('#1.!!!not-base64')).toBeNull();
  });

  it('a plan day becomes a session; missing numbers get sensible defaults', () => {
    const s = workoutFromDay({
      planId: 'p', date: '2026-11-14', fallbackTitle: 'Training',
      day: { day_index: 2, title: null, training: [
        { name: 'Goblet Squat', ref: { slug: 'goblet-squat' }, sets: 3, reps: '10', weight: '16 kg', rest_seconds: 90, notes: null },
        { name: 'Plank', ref: null, sets: null, reps: '30s', weight: null, rest_seconds: null, notes: 'keep hips level' },
      ] },
    });
    expect(s.title).toBe('Training');
    expect(s.exercises[1]).toEqual({ n: 'Plank', s: '', sets: 3, reps: '30s', w: '', rest: 60, note: 'keep hips level' });
  });
});
