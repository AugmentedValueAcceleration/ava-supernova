/**
 * Claims Auditor — the honesty gate.
 *
 * The system prompt already tells Ava never to state a guess as a finding —
 * "done", "it works", "it's live", "it's secure" — without ground-truth
 * evidence. But instruction alone is bypassable under momentum. This is the
 * structural backstop.
 *
 * Pure function: given the finalized reply text and the tools that ran this
 * turn, it detects an unbacked state-claim and classifies it by severity:
 *
 *   - critical : security / safety ("it's secure", "no vulnerabilities")
 *   - high     : completion / system-state ("done", "tests pass", "deployed")
 *   - soft     : a bare "verified / confirmed" with no specific target
 *
 * The agent loop reads the tier to decide what to do (see HONESTY-GATE-SPEC.md):
 *   - critical / high → re-prompt once to verify-or-restate, then floor
 *   - soft            → just append the caveat (no round-trip)
 *
 * Severity is a property of the claim *pattern* (regex over output text), not
 * of the model — so the gate behaves identically on every model, frontier or
 * local. No I/O, no loop entanglement — fully unit-testable.
 */

export type ClaimTier = 'critical' | 'high' | 'soft';

export interface ClaimAuditInput {
  /** The user-facing assistant text for the finalized turn. */
  text: string;
  /** Tools that ran this turn, with whether each succeeded. */
  toolsUsed: Array<{ name: string; ok: boolean }>;
  /**
   * Everything the tools actually RETURNED this turn, concatenated.
   *
   * Phrasing can only be judged as a pattern; an identifier can be judged
   * exactly. An id that no tool returned and nobody supplied was invented,
   * and that is checkable rather than guessable.
   */
  toolOutput?: string;
  /** What the caller said this turn — an id they supplied is not invented. */
  userText?: string;
}

export interface ClaimAuditResult {
  /** True when a state-claim was found with no verifying evidence this run. */
  flagged: boolean;
  /** The specific claim phrases matched (for the nudge / caveat / telemetry). */
  claims: string[];
  /** A visible caveat to surface, or null when nothing to flag. */
  caveat: string | null;
  /** Severity, set when flagged; null otherwise. */
  tier: ClaimTier | null;
}

/**
 * Tools whose SUCCESSFUL result constitutes ground-truth verification of a
 * state claim — reads that confirm reality, and checks that exercise the
 * system. If any of these succeeded this run, a claim has something real
 * behind it and we don't flag.
 */
const VERIFYING_TOOLS = new Set<string>([
  'verify_change', 'test_run', 'test_generate', 'benchmark',
  'http_request', 'browser', 'browser_snapshot', 'browser_navigate', 'browser_click',
  'bash', 'git_diff', 'git_status', 'file_read', 'grep', 'database_query',
  'analyze_architecture', 'self_inspect', 'audit_dependencies',
  // Reads of the library a course claim is ABOUT. Without these a report on
  // what the library contains counted as verified because some unrelated
  // tool had succeeded — so "nine courses were lost" passed the gate on the
  // strength of a web search (26 Sep 2026).
  'read_course', 'check_course', 'find_course', 'browse_library',
  'read_recipe', 'check_recipe', 'find_recipe',
  'read_exercise', 'check_exercise', 'find_exercise',
]);

/**
 * Identifiers the reply states that nothing this turn produced.
 *
 * A uuid or a short hex id is either something a tool handed back, something
 * the caller supplied, or something that was made up. There is no fourth
 * case, which makes this the one honesty check that is exact.
 *
 * 26 Sep 2026: a report announced a course rebuilt at one id and a seed
 * cleared at another. The course was real; the seed did not exist, and nine
 * further courses it named as "lost" had never been in the library at all.
 * Every phrase-level check passed, because nothing about the SENTENCES was
 * wrong — only the identifiers in them.
 */
export function findUnbackedIds(text: string, backing: string): string[] {
  // A uuid, or a run of hex long enough to be an id rather than a number.
  const ID = /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b|\b[0-9a-f]{8,}\b/gi;
  const backed = backing.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(ID)) {
    const id = m[0].toLowerCase();
    // A truncated form ("6940f5c9…" for a full uuid) is backed by the whole
    // one, so compare by prefix rather than demanding an exact match.
    if (backed.includes(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(m[0]);
  }
  return out;
}

const CAVEAT_INVENTED_ID = (ids: string[]): string =>
  `⚠ Unbacked identifier${ids.length === 1 ? '' : 's'}: this turn names ${ids.map((i) => `\`${i}\``).join(', ')}, which `
  + `${ids.length === 1 ? 'appears' : 'appear'} in no tool result and in nothing you said. Nothing confirms that record exists — `
  + 'check it before acting on this report.';

/**
 * Tier A — critical: security / safety claims. The single most dangerous thing
 * the agent can assert without a check behind it, and verifiable (a scan,
 * `audit_dependencies`, a grep).
 */
const SECURITY_PATTERNS: RegExp[] = [
  /\b(it'?s|this is|that'?s|everything'?s|now)\s+(fully\s+|completely\s+)?(secure|safe to run|safe to deploy|safe to ship|sanitised|sanitized)\b/i,
  /\bno\s+(known\s+)?(vulnerabilit\w*|security\s+(issues?|holes?|risks?|flaws?)|exploits?|secrets?\s+(leaked|exposed)|leaks?)\b/i,
  /\b(injection|xss|sql\s*injection|csrf)\s+(safe|free|protected|prevented)\b/i,
  /\bno\s+(injection|xss|sql\s*injection|csrf)\s+(risk|vulnerab\w*)?\b/i,
];

/**
 * Tier B — high: completion + system-state. The everyday burn case, and the
 * cheapest to verify (file_read / git_diff / test_run / http_request).
 * Deliberately narrow — completion + state, NOT explanatory phrasing ("works
 * by …") or action statements ("I made the change"), which are facts not claims.
 */
const HIGH_PATTERNS: RegExp[] = [
  /\b(it'?s|that'?s|this is|everything'?s)\s+(now\s+)?(live|deployed|working|fixed|done|ready|passing)\b/i,
  /\b(done|fixed|deployed|shipped|sorted)\s*[—\-:.!]/i,
  /\ball\s+(set|done|working|passing|green|fixed)\b/i,
  /\breturns?\s+(a\s+)?200\b/i,
  /\btests?\s+(pass|passing|are green|are passing)\b/i,
  /\bbuild\s+(passed|passes|is green|succeeded)\b/i,
  /\bit\s+works\b/i,
  /\bworking\s+(now|correctly|as expected|fine)\b/i,
];

/** Tier C — soft: a bare assertion of verification with no specific target. */
const SOFT_PATTERNS: RegExp[] = [
  /\b(verified|confirmed)\b/i,
];

/**
 * Hedge language — if the reply already qualifies the claim ("should work",
 * "haven't checked", "unverified"), it's being honest about uncertainty, so we
 * don't flag. Whole-text check: errs toward fewer false positives.
 */
const HEDGE_PATTERNS: RegExp[] = [
  /\b(should|likely|probably|might|may|i think|i believe|appears? to|seems? to)\b/i,
  /\b(haven'?t|not yet|did(n'?t| not)|couldn'?t|can'?t|unable to)\s+(verif|check|confirm|test|run)/i,
  /\bunverified\b/i,
  /\bnot (yet )?(verified|confirmed|tested|checked)\b/i,
  /\bneeds? (a )?(test|check|verif|confirm)/i,
];

function matchAll(patterns: RegExp[], text: string): string[] {
  const out: string[] = [];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[0]) out.push(m[0].trim());
  }
  return out;
}

const CAVEAT_HIGH =
  '⚠ Unverified claim: this turn asserts completion/state but ran no verifying tool ' +
  '(test, build, request, or read) to confirm it. Treat it as "changed, not confirmed" until checked.';
const CAVEAT_CRITICAL =
  '⚠ Unverified security claim: this turn asserts something is secure/safe but ran no scan or check ' +
  'to back it. Do not rely on it — treat it as unverified until a real check confirms it.';

/**
 * Audit a finalized turn for unbacked state-claims.
 *
 * Flags when ALL hold:
 *   1. The text asserts security/completion/state (a pattern matches), AND
 *   2. No verifying tool succeeded this run, AND
 *   3. The text isn't already hedged.
 * Severity = highest tier matched (critical > high > soft).
 */
export function auditClaims(input: ClaimAuditInput): ClaimAuditResult {
  const text = input.text || '';
  const empty: ClaimAuditResult = { flagged: false, claims: [], caveat: null, tier: null };

  // (0) Identifiers first — the only check here that is exact rather than a
  // pattern, so it outranks the rest and is NOT excused by hedging or by some
  // other tool having succeeded. An invented id is invented either way.
  const unbacked = findUnbackedIds(text, `${input.toolOutput ?? ''}\n${input.userText ?? ''}`);
  if (unbacked.length > 0) {
    return { flagged: true, claims: unbacked, caveat: CAVEAT_INVENTED_ID(unbacked), tier: 'high' };
  }

  // (2) Real evidence this run → the claim has something behind it.
  if (input.toolsUsed.some(t => t.ok && VERIFYING_TOOLS.has(t.name))) return empty;

  // (3) Already hedged → it's honest about uncertainty.
  if (HEDGE_PATTERNS.some(re => re.test(text))) return empty;

  // (1) Classify by severity — highest tier wins.
  const security = matchAll(SECURITY_PATTERNS, text);
  if (security.length > 0) {
    return { flagged: true, claims: security, caveat: CAVEAT_CRITICAL, tier: 'critical' };
  }
  const high = matchAll(HIGH_PATTERNS, text);
  if (high.length > 0) {
    return { flagged: true, claims: high, caveat: CAVEAT_HIGH, tier: 'high' };
  }
  const soft = matchAll(SOFT_PATTERNS, text);
  if (soft.length > 0) {
    return { flagged: true, claims: soft, caveat: CAVEAT_HIGH, tier: 'soft' };
  }
  return empty;
}
