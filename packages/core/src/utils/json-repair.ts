/**
 * Recovering JSON whose escapes were lost on the way in.
 *
 * A tool call's arguments are JSON. When one of its values is ITSELF JSON —
 * a `modules` array sent as text — that inner document gets parsed twice, and
 * anything the outer parse un-escapes lands raw in the inner one. An escaped
 * `\n` becomes a real newline, and a real newline inside a JSON string
 * literal is invalid: the parse dies exactly there, with thousands of valid
 * characters still sitting after it.
 *
 * Measured 27 Sep 2026 against five real failures. The break contexts were
 * all ordinary prose — "…n# then open the live URL", "…What do you do
 * first?" — and every one was a control character where an escape used to be.
 * The first was 36,164 characters long and died at 7,952.
 *
 * This is a REPAIR, not a guess. A raw control character inside a JSON string
 * literal is never valid and can only have been an escape, so escaping it
 * back is the single possible reading. Nothing else is touched: structure,
 * spacing between tokens, and every character outside a string literal are
 * left exactly as they arrived, and if the result still will not parse the
 * original error is what the caller hears about.
 */

/**
 * Escape raw control characters that sit INSIDE string literals.
 *
 * Walks the text tracking whether it is inside a string and whether the last
 * character was a backslash, so an already-escaped sequence is never touched
 * twice and a quote inside a string never ends it by mistake.
 */
export function escapeRawControlChars(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString) {
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      // Anything else below space is unprintable and equally invalid here.
      const code = ch.charCodeAt(0);
      if (code < 0x20) { out += `\\u${code.toString(16).padStart(4, '0')}`; continue; }
    }
    out += ch;
  }
  return out;
}

/**
 * Parse, and if it fails for a lost escape, repair once and parse again.
 *
 * Returns what was recovered and whether repairing was needed — the caller
 * wants to know, because a call that only parsed after repair is worth saying
 * out loud rather than passing off as clean.
 */
export function parseJsonForgivingly<T = unknown>(
  text: string,
): { ok: true; value: T; repaired: boolean } | { ok: false; error: Error; position: number | null } {
  try {
    return { ok: true, value: JSON.parse(text) as T, repaired: false };
  } catch (first) {
    try {
      return { ok: true, value: JSON.parse(escapeRawControlChars(text)) as T, repaired: true };
    } catch {
      // Report the ORIGINAL failure. The repaired text is an internal detail,
      // and a position measured against it would point at the wrong character.
      const error = first instanceof Error ? first : new Error(String(first));
      const at = Number(/position (\d+)/.exec(error.message)?.[1] ?? NaN);
      return { ok: false, error, position: Number.isNaN(at) ? null : at };
    }
  }
}
