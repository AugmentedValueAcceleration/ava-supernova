/**
 * Claims Auditor — the soft honesty gate (first cut, "Option B").
 *
 * The system prompt already tells Ava never to state a guess as a finding —
 * "done", "it works", "it's live" — without ground-truth evidence (see the
 * Verified-done / Diagnosis-&-state rules). But instruction alone is
 * bypassable under momentum. This is the structural backstop: at turn
 * finalization, scan the user-facing reply for state-claim language and check
 * whether THIS run actually produced verifying evidence. If a strong claim has
 * no backing tool result, surface a visible caveat so the unverified claim
 * doesn't stand as fact.
 *
 * Soft by design: it RETURNS a finding + a caveat string — it does not block
 * or rewrite. The caller decides whether to append the caveat or emit an
 * event. A later pass can graduate high-stakes claim types to a hard
 * verify-or-restate gate (Option C).
 *
 * Pure function — no I/O, no loop entanglement — so it's fully unit-testable.
 */

export interface ClaimAuditInput {
  /** The user-facing assistant text for the finalized turn. */
  text: string;
  /** Tools that ran this turn, with whether each succeeded. */
  toolsUsed: Array<{ name: string; ok: boolean }>;
}

export interface ClaimAuditResult {
  /** True when a state-claim was found with no verifying evidence this run. */
  flagged: boolean;
  /** The specific claim phrases matched (for the caveat / telemetry). */
  claims: string[];
  /** A visible caveat to surface, or null when nothing to flag. */
  caveat: string | null;
}

/**
 * Tools whose SUCCESSFUL result constitutes ground-truth verification of a
 * state claim — reads that confirm reality, and checks that exercise the
 * system. If any of these succeeded this run, a "done/works" claim has
 * something real behind it and we don't flag.
 */
const VERIFYING_TOOLS = new Set<string>([
  'verify_change', 'test_run', 'test_generate', 'benchmark',
  'http_request', 'browser', 'browser_snapshot', 'browser_navigate', 'browser_click',
  'bash', 'git_diff', 'git_status', 'file_read', 'grep', 'database_query',
  'analyze_architecture', 'self_inspect',
]);

/**
 * State-claim language: assertions that something IS done / works / live /
 * verified. Deliberately narrow — completion + state, NOT explanatory phrasing
 * like "works by …" or action statements like "I made the change" (which are
 * facts, not claims, and must not be flagged).
 */
const CLAIM_PATTERNS: RegExp[] = [
  /\b(it'?s|that'?s|this is|everything'?s)\s+(now\s+)?(live|deployed|working|fixed|done|ready|passing)\b/i,
  /\b(done|fixed|deployed|shipped|sorted)\s*[—\-:.!]/i,
  /\ball\s+(set|done|working|passing|green|fixed)\b/i,
  /\b(verified|confirmed)\b/i,
  /\breturns?\s+(a\s+)?200\b/i,
  /\btests?\s+(pass|passing|are green|are passing)\b/i,
  /\bbuild\s+(passed|passes|is green|succeeded)\b/i,
  /\bit\s+works\b/i,
  /\bworking\s+(now|correctly|as expected|fine)\b/i,
];

/**
 * Hedge language — if the reply already qualifies the claim ("should work",
 * "haven't checked", "unverified"), it's being honest about uncertainty, so we
 * don't flag. Whole-text check: a soft first cut errs toward fewer false
 * positives.
 */
const HEDGE_PATTERNS: RegExp[] = [
  /\b(should|likely|probably|might|may|i think|i believe|appears? to|seems? to)\b/i,
  /\b(haven'?t|not yet|did(n'?t| not)|couldn'?t|can'?t|unable to)\s+(verif|check|confirm|test|run)/i,
  /\bunverified\b/i,
  /\bnot (yet )?(verified|confirmed|tested|checked)\b/i,
  /\bneeds? (a )?(test|check|verif|confirm)/i,
];

/**
 * Audit a finalized turn for unbacked state-claims.
 *
 * Flags when ALL hold:
 *   1. The text asserts completion/state (a CLAIM_PATTERN matches), AND
 *   2. No verifying tool succeeded this run, AND
 *   3. The text isn't already hedged.
 */
export function auditClaims(input: ClaimAuditInput): ClaimAuditResult {
  const text = input.text || '';
  const empty: ClaimAuditResult = { flagged: false, claims: [], caveat: null };

  // (2) Real evidence this run → the claim has something behind it.
  if (input.toolsUsed.some(t => t.ok && VERIFYING_TOOLS.has(t.name))) return empty;

  // (3) Already hedged → it's honest about uncertainty.
  if (HEDGE_PATTERNS.some(re => re.test(text))) return empty;

  // (1) Find the claim phrases.
  const claims: string[] = [];
  for (const re of CLAIM_PATTERNS) {
    const m = text.match(re);
    if (m && m[0]) claims.push(m[0].trim());
  }
  if (claims.length === 0) return empty;

  const caveat =
    '⚠ Unverified claim: this turn asserts completion/state but ran no verifying tool ' +
    '(test, build, request, or read) to confirm it. Treat it as "changed, not confirmed" until checked.';
  return { flagged: true, claims, caveat };
}
