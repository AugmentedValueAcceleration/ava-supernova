/**
 * When Ava has to stop and talk.
 *
 * The making rooms are powerful because she iterates: build, look, judge, fix.
 * Left alone she grinds: the first barrel took 15 runs, a title logo 12, with
 * nobody asked. She can't know what they think until they say, and they can't
 * steer what they aren't shown.
 *
 * This began as a nudge after six runs (4 Nov 2026), and she carried on past it.
 * His call, 7 Nov: a real stop. After three good runs since they last spoke, the
 * next run is refused until they answer, so this can't be argued with. Saying
 * anything starts the count again. Each person's message is a new turn, and so
 * is an answer to ask_user. "Keep going" gives her a longer stretch.
 */

import type { ToolExecutionContext } from './types.js';

/** Good runs since they last spoke before she has to stop and show them. */
export const RUNS_BEFORE_CHECK_IN = 3;
/** The same, when they've told her to carry on without them. */
export const RUNS_WHEN_TOLD_TO_KEEP_GOING = 10;
/** Failures in a row before she has to stop and say what's wrong. */
export const FAILS_BEFORE_STOP = 3;

const KEEP_GOING = /\b(keep going|carry on|don'?t stop|until (it'?s |they'?re |you'?re )?(done|finished)|finish (it|them|the \w+) off)\b/i;

/** Did they tell her to carry on? Only their words count, not the room's prefix. */
export function toldToKeepGoing(message: string): boolean {
  const marker = message.lastIndexOf('## Their request');
  return KEEP_GOING.test(marker >= 0 ? message.slice(marker) : message);
}

interface Tally { turn: unknown; good: number; failsInARow: number }

// One tally per conversation, across every piece: a new name is not a way round it.
const tallies = new WeakMap<object, Tally>();

function tallyFor(context: ToolExecutionContext): Tally | null {
  const shared = context.sharedState;
  if (!shared?.designTurnId) return null;
  let tally = tallies.get(shared);
  if (!tally || tally.turn !== shared.designTurnId) {
    tally = { turn: shared.designTurnId, good: 0, failsInARow: 0 };
    tallies.set(shared, tally);
  }
  return tally;
}

const limitFor = (context: ToolExecutionContext) =>
  context.sharedState?.designKeepGoing ? RUNS_WHEN_TOLD_TO_KEEP_GOING : RUNS_BEFORE_CHECK_IN;

/** Before a run: why it can't happen yet, or null. */
export function designRunRefusal(context: ToolExecutionContext): string | null {
  const tally = tallyFor(context);
  if (!tally) return null;
  if (tally.failsInARow >= FAILS_BEFORE_STOP) {
    return `Not run: that was ${tally.failsInARow} failures in a row. Stop and tell them plainly what you're stuck on and what you've tried, then wait for them.`;
  }
  if (tally.good >= limitFor(context)) {
    return `Not run: you've done ${tally.good} runs since they last said anything. They can't steer what you don't stop to show them. Stop now: say where it stands and what you think, ask what they'd change, and end your turn. You can carry on once they answer.`;
  }
  return null;
}

/** After a run that really happened. Returns a line for the report, or null. */
export function recordDesignRun(context: ToolExecutionContext, ok: boolean): string | null {
  const tally = tallyFor(context);
  if (!tally) return null;
  if (ok) { tally.good += 1; tally.failsInARow = 0; } else { tally.failsInARow += 1; }

  if (tally.failsInARow >= FAILS_BEFORE_STOP) {
    return `STOP: that is ${tally.failsInARow} failed runs in a row. Don't try again. Tell them plainly what you're stuck on and what you've tried, then wait.`;
  }
  if (ok && tally.good >= limitFor(context)) {
    return `STOP: that is ${tally.good} runs since they last said anything, and the next one will be refused. Show them where it stands, say what you think, ask what they'd change, and end your turn.`;
  }
  return null;
}
