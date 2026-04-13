/**
 * Verification + correction-detection helpers used by the agent to
 * emit verification_decision and correction_received events.
 *
 * Kept in a dedicated module so the same tool-set and pattern list
 * power the dataset emitter, the older capture.ts (still on disk
 * but disabled), and any future review tooling that wants to ask
 * "was this answer verified?" or "was this user message a correction
 * of the prior reply?".
 */

/**
 * Tools whose use during a trajectory counts as Ava verifying before
 * answering. Read-only / search-shaped tools — anything that gathers
 * evidence from the codebase, the web, or git state.
 */
export const VERIFICATION_TOOLS: ReadonlySet<string> = new Set([
  'file_read',
  'grep',
  'glob',
  'list_directory',
  'find_symbol',
  'project_index',
  'analyze_architecture',
  'docs_lookup',
  'web_search',
  'http_request',
  'browser',
  'git_status',
  'git_diff',
]);

/**
 * Return the verification-shaped tools from a list of tool names that
 * were called during a trajectory.
 */
export function pickVerificationTools(toolsCalled: readonly string[]): string[] {
  return toolsCalled.filter((t) => VERIFICATION_TOOLS.has(t));
}

/**
 * Categorise a user message as a correction of the prior assistant
 * response, returning a high-level category or null if the message
 * does not look like a correction at all. Categories never include
 * raw user text — only the kind of correction.
 */
export function categorizeCorrection(text: string): string | null {
  const t = text.toLowerCase().trim();
  if (!t || t.length > 500) return null;

  // Strong factual rejections — "wrong", "incorrect", "false", "lied"
  if (/\b(wrong|incorrect|false|lied|lying|mistaken)\b/.test(t)) {
    return 'factual-error';
  }
  // Approach flaws — "won't work", "that's not the right approach"
  if (/\b(won'?t work|doesn'?t work|not the right approach|wrong approach)\b/.test(t)) {
    return 'approach-flaw';
  }
  // Hallucination signals — "that doesn't exist", "made that up"
  if (/\b(doesn'?t exist|never existed|made (it|that) up|hallucinat)\b/.test(t)) {
    return 'hallucination';
  }
  // Soft corrections — "actually", "actually no"
  if (/^actually\b|\bactually,?\b/.test(t) && t.length < 100) {
    return 'soft-correction';
  }
  // Bare rejections — "no", "nope", "that's not what I meant"
  if (/^(no|nope|nah|not (what|quite))\b/.test(t)) {
    return 'rejection';
  }
  return null;
}
