/**
 * Halt-intent detection for user messages — distinguishes a hard STOP from a
 * gentle PAUSE so each gets the behaviour the user expects:
 *
 *  - STOP  ("stop", "abort", "leave it", "enough") → emergency brake. The
 *    caller aborts immediately, even mid-step. Use when it's going wrong and
 *    you want it dead now.
 *  - PAUSE ("wait", "pause", "hold on", "hang on a sec") → let the current
 *    step finish, then hold at a clean boundary. Use when you just thought of
 *    something to add and don't want her stopping halfway through a write.
 *
 * Both match only when the message is essentially ONLY the directive
 * (optionally wrapped in filler / address / politeness), NOT the word buried
 * inside a real request ("stop the loop", "wait for the build", "don't stop").
 * Anchored ^…$ plus a short-length guard. The Stop button is always the
 * unconditional hard stop regardless of wording.
 */

export type HaltIntent = 'stop' | 'pause';

// Optional leading filler / address / politeness ("ok", "just", "ava", "please").
const LEAD = "(?:(?:ok|okay|alright|aight|right|now|just|please|pls|hey|ava|oi|yo|yeah|oh|ugh|ffs|no|nah|jesus|christ|for fuck'?s sake|for god'?s sake)\\s+)*";

// Hard stop — emergency brake, immediate.
const STOP_CORE = "(?:stop|stahp|halt|quit|enough|leave it(?:\\s+alone)?|cut it out|knock it off|pack it in|drop it|abort|i said stop|how dare you|don'?t\\s+touch(?:\\s+(?:it|that))?)";

// Gentle pause — finish the current step, then hold.
const PAUSE_CORE = "(?:wait|pause|hold on|hold up|hang on|hold tight|one\\s+(?:sec|second|moment|min|minute|mo)|gimme\\s+a\\s+(?:sec|second|moment|min|minute|mo))";

// Optional trailing fillers ("it", "now", "ava", "a sec", "for a minute").
const TRAIL = "(?:\\s+(?:it|this|that|everything|now|please|pls|ava|already|then|stop|halt|quit|enough|man|mate|ok|okay|a\\s+(?:sec|second|moment|min|minute|mo)|for\\s+a\\s+(?:sec|second|moment|min|minute|mo)))*";

const STOP_RE = new RegExp(`^${LEAD}${STOP_CORE}${TRAIL}$`, 'i');
const PAUSE_RE = new RegExp(`^${LEAD}${PAUSE_CORE}${TRAIL}$`, 'i');

function normalise(message: string): string | null {
  if (typeof message !== 'string') return null;
  // lowercase, punctuation → spaces (so "stop!", "stop." and "stop-motion"
  // reduce cleanly), collapse whitespace.
  const norm = message
    .toLowerCase()
    .replace(/[^a-z'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // A genuine halt is short — belt-and-braces against a long sentence that
  // happens to start with a halt word.
  if (norm.length === 0 || norm.length >= 80) return null;
  return norm;
}

/** Returns 'stop' (hard), 'pause' (gentle), or null (not a halt directive). */
export function haltIntent(message: string): HaltIntent | null {
  const norm = normalise(message);
  if (norm === null) return null;
  if (STOP_RE.test(norm)) return 'stop';
  if (PAUSE_RE.test(norm)) return 'pause';
  return null;
}

/** True for any halt directive (stop OR pause). Used by the turn-start guard. */
export function isStopCommand(message: string): boolean {
  return haltIntent(message) !== null;
}
