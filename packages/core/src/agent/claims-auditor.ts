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
]);

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
