// Depth should follow the shape of the work, not the user's vocabulary.
//
// `detectConductorDepth` used to look only for "deep dive" / "full review",
// which asks the user to know when a task is risky. They cannot: riskiness is
// a property of the work. Nobody says "deep dive" before asking to wire a
// setting through four surfaces — which is exactly the turn where a wrong
// assumption is expensive.
//
// The cases that must STAY light matter as much as the ones that escalate. A
// heuristic that fires on everything is the same as no heuristic, and costs
// four persona calls to say so.
import { describe, it, expect } from 'vitest';
import { detectConductorDepth, WORK_FULL_TEAM_FILE_THRESHOLD } from '../src/personas/conductor.js';

describe('work depth from the shape of the request', () => {
  it('threshold is a named, findable constant', () => {
    expect(WORK_FULL_TEAM_FILE_THRESHOLD).toBe(3);
  });

  describe('escalates', () => {
    it('when the request names enough distinct files', () => {
      expect(detectConductorDepth('update agent.ts, conductor.ts and definitions.ts', 'work')).toBe('full');
    });

    it('on work that cannot be done in one place', () => {
      expect(detectConductorDepth('refactor how exports are built', 'work')).toBe('full');
      expect(detectConductorDepth('consolidate the two storage scans', 'work')).toBe('full');
      expect(detectConductorDepth('the locale keys are wrong everywhere', 'work')).toBe('full');
    });

    it('when the change has to be mirrored across surfaces', () => {
      expect(detectConductorDepth('add the drawer to the extension and ide', 'work')).toBe('full');
      expect(detectConductorDepth('mirror it in both surfaces', 'work')).toBe('full');
    });

    it('on wiring something through', () => {
      // The motivating example: no risk vocabulary at all, four surfaces of work.
      expect(detectConductorDepth('wire the projects home setting through to the sidecar', 'work')).toBe('full');
    });
  });

  describe('stays light', () => {
    it('on a one-file edit', () => {
      expect(detectConductorDepth('fix the apostrophe in tr.ts', 'work')).toBe('light');
    });

    it('below the file threshold', () => {
      expect(detectConductorDepth('change agent.ts and conductor.ts', 'work')).toBe('light');
    });

    it('when one file is named repeatedly', () => {
      // Distinct names, not mentions. Saying it three times is still one file.
      expect(detectConductorDepth('open agent.ts, edit agent.ts, then build agent.ts', 'work')).toBe('light');
    });

    it('on a rename', () => {
      // Mechanical, and the typecheck is a better reviewer than four personas.
      expect(detectConductorDepth('rename handleClick to onClick', 'work')).toBe('light');
    });
  });

  describe('scoping', () => {
    it('does not fire outside work mode', () => {
      // "refactor" in a Chat turn is a topic, not a job.
      expect(detectConductorDepth('can we refactor how we think about this?', 'chat')).toBe('light');
      expect(detectConductorDepth('refactor how exports are built', 'chat')).toBe('light');
    });

    it('leaves teach detection alone', () => {
      expect(detectConductorDepth('teach me rust', 'teach')).toBe('full');
      expect(detectConductorDepth('another example please', 'teach')).toBe('light');
    });

    it('keeps the explicit keyword override', () => {
      expect(detectConductorDepth('deep dive on this please', 'work')).toBe('full');
      expect(detectConductorDepth('give it a comprehensive review', 'plan')).toBe('full');
    });
  });
});
