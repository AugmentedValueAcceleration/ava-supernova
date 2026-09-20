// revise_exercise — the Gym's repair path for the WRITING of an entry that
// already exists. Until it existed, a check failing on `no_beginner` could
// only be fixed by deleting the entry and landing it again under a new id.
//
// The store is injected, so what is tested here is the tool's contract: it
// sends only what was given, refuses an empty revision, and hands back the
// findings a refused revision would have introduced.

import { describe, it, expect } from 'vitest';
import { ReviseExerciseTool } from '../src/tools/exercise-repair.js';
import type { ExerciseStore, ExerciseRevision, ExerciseCheckFinding } from '../src/exercises/index.js';
import type { ToolExecutionContext } from '../src/tools/types.js';

function fakeStore(opts: { refuse?: ExerciseCheckFinding[] } = {}) {
  const calls: Array<{ id: string; revision: ExerciseRevision }> = [];
  const store = {
    async reviseExercise(id: string, revision: ExerciseRevision) {
      calls.push({ id, revision });
      if (opts.refuse) return { ok: false, error: 'would add a finding', findings: opts.refuse };
      return { ok: true };
    },
    async recheck() {
      return { status: 'pass' as const, checked_at: 'now', findings: [] };
    },
  } as unknown as ExerciseStore;
  return { store, calls };
}

const ctx = (store: ExerciseStore) => ({ sharedState: { exerciseStore: store } }) as unknown as ToolExecutionContext;

describe('revise_exercise', () => {
  it('sends only the fields given, and accepts `id` as well as `exercise_id`', async () => {
    const { store, calls } = fakeStore();
    const r = await new ReviseExerciseTool().execute(
      { id: 'abc', beginner_detail: '  Start light.  ', difficulty: 4, steps: ['Set up', { action: 'Move', safety_flag: true }] },
      ctx(store),
    );
    expect(r.success).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe('abc');
    expect(calls[0].revision).toEqual({
      beginner_detail: 'Start light.',
      difficulty: 4,
      steps: [{ action: 'Set up' }, { action: 'Move', notes: null, safety_flag: true }],
    });
    expect(JSON.parse(r.output).changed.sort()).toEqual(['beginner_detail', 'difficulty', 'steps']);
  });

  it('refuses an empty revision without touching the store', async () => {
    const { store, calls } = fakeStore();
    const r = await new ReviseExerciseTool().execute({ exercise_id: 'abc', difficulty: 9, movement_pattern: 'nope' }, ctx(store));
    expect(r.success).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('hands back what a refused revision would have introduced', async () => {
    const { store } = fakeStore({ refuse: [{ kind: 'equipment', term: 'barbell', message: 'The method uses "barbell" but it is not listed.' }] });
    const r = await new ReviseExerciseTool().execute({ exercise_id: 'abc', steps: ['Load the barbell', 'Lift', 'Lower'] }, ctx(store));
    expect(r.success).toBe(false);
    expect(JSON.parse(r.output).would_add).toEqual(['equipment: The method uses "barbell" but it is not listed.']);
  });
});
