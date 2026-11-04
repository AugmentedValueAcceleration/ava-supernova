/**
 * When Ava should stop and talk (his call, 4 Nov 2026).
 *
 * The making rooms are powerful because she iterates: build, look, judge, fix.
 * The other half is knowing when to stop. Left alone she will grind: the first
 * barrel took 15 runs with nobody asked, and from the outside that looks like
 * nothing is happening. Working together means pausing at the right moments.
 *
 * This is a nudge in the tool's report, not a stop. Forcing a halt would break
 * a good run; the judgement stays hers, and her guidance says what the pauses
 * are for. It counts real runs since the person last spoke, and runs that
 * failed in a row. Each person's message is a new turn, which resets both.
 */

import type { ToolExecutionContext } from './types.js';

/** Runs since they last spoke before she is reminded to show them. */
export const RUNS_BEFORE_CHECK_IN = 6;
/** Failures in a row before she is told to stop and say what's wrong. */
export const FAILS_BEFORE_STOP = 3;

interface Tally { turn: unknown; runs: number; failsInARow: number }

const tallies = new Map<string, Tally>();

/** Call after a run that really happened. Returns a line for the report, or null. */
export function recordDesignRun(context: ToolExecutionContext, work: string, ok: boolean): string | null {
  const turn = context.sharedState?.designTurnId ?? context.conversationId ?? null;
  let t = tallies.get(work);
  if (!t || t.turn !== turn) {
    t = { turn, runs: 0, failsInARow: 0 };
    tallies.set(work, t);
  }
  t.runs += 1;
  t.failsInARow = ok ? 0 : t.failsInARow + 1;

  if (t.failsInARow >= FAILS_BEFORE_STOP) {
    return `CHECK IN: that is ${t.failsInARow} failed runs in a row. Stop here. Tell them plainly what you are stuck on and what you have tried, and ask how they want to go; don't try a fourth time on your own.`;
  }
  if (ok && t.runs >= RUNS_BEFORE_CHECK_IN && t.runs % RUNS_BEFORE_CHECK_IN === 0) {
    return `CHECK IN: that is ${t.runs} runs since they last said anything. At the next natural stopping point, show them where it stands, say what you think, and ask before going further.`;
  }
  return null;
}
