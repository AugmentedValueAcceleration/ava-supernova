import { describe, it, expect } from 'vitest';
import * as root from '../src/index.js';
import { checkExercise as libraryCheck } from '../src/exercises/index.js';
import { checkExercise as safetyCheck, checkRecipe as safetyRecipe } from '../src/health/safety.js';

// An explicit `export { x }` silently beats `export * from` with the same
// name. 0.2.180 shipped the plan-safety checkExercise in place of the
// exercise library's, and the website's exercise store stopped compiling.
describe('root export names', () => {
  it('checkExercise at the root is the exercise library checker', () => {
    expect(root.checkExercise).toBe(libraryCheck);
  });
  it('the plan-safety checkers are exported under their own names', () => {
    expect(root.checkExerciseSafety).toBe(safetyCheck);
    expect(root.checkRecipeSafety).toBe(safetyRecipe);
  });
});
