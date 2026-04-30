/**
 * Error-loop detector — recognises when the agent is stuck on the same
 * verify_change failure across multiple fix attempts and triggers a
 * fresh-eyes Challenger pass instead of letting the loop spiral.
 *
 * Pattern observed in practice: model writes broken code → typecheck
 * fails → model "fixes" by adjusting a different line → typecheck
 * fails on the same root cause → repeat. The signature derivation
 * collapses these into the same identifier so the third occurrence
 * can be detected and escalated.
 *
 * Lives at the trajectory level (TrajectoryContext.verifyFailureHistory)
 * so a sub-agent / persona spawned mid-task inherits the failure trail
 * — keeps the threshold check honest across orchestrated dispatches.
 */

import type { TrajectoryContext } from '../dataset/emitter.js';

/**
 * How many same-signature failures trigger a fresh-eyes escalation.
 * Set conservatively so the model gets two genuine fix attempts before
 * we hand the problem to a Challenger. Tunable per-mode if needed.
 */
const LOOP_THRESHOLD = 3;

/**
 * Build a stable signature from a verify_change failure report. The
 * signature anchors on the failing checkId + the first error-shaped
 * line, with line/column/digit positions normalised so a TS error
 * that "moves" by one line between attempts still collides on the
 * same signature.
 *
 * Inputs:
 *   - report: the formatted verify_change output (starts with VERIFY_FAIL: …)
 *   - files: the files that triggered the verify (for fallback signature
 *            when the report can't be parsed)
 */
export function signatureForFailure(report: string, files: string[]): string {
  // First failing check line in the formatted report:
  //   "  ✗ typecheck (1234ms) — <message>"
  // Pull the checkId and message portion.
  const failedLine = report
    .split('\n')
    .find((l) => l.trim().startsWith('✗ '));

  let checkId = 'unknown';
  let message = '';
  if (failedLine) {
    const trimmed = failedLine.trim().slice(2); // drop "✗ "
    const checkMatch = trimmed.match(/^([a-z_]+)\s+\(/);
    if (checkMatch) checkId = checkMatch[1];
    const msgIdx = trimmed.indexOf('—');
    if (msgIdx >= 0) message = trimmed.slice(msgIdx + 1).trim();
  }

  // Fallback to file list when the report shape was unexpected — at
  // least same-files + same-checkId still collides.
  if (!message) {
    return `${checkId}|${files.slice(0, 3).sort().join(',')}`;
  }

  // Normalise the message:
  //   - line:col references (App.tsx:42:13) → App.tsx
  //   - bare line numbers ("at line 42") → "at line"
  //   - any remaining digits collapsed to # so retries that shift by
  //     a line or fix one of multiple errors collide on the same key
  const normalised = message
    .replace(/:\d+:\d+/g, '')
    .replace(/at\s+line\s+\d+/gi, 'at line')
    .replace(/\bline\s+\d+/gi, 'line')
    .replace(/\d+/g, '#')
    .slice(0, 160);

  return `${checkId}|${normalised}`;
}

/**
 * Append a verify_change failure to the trajectory's history. Idempotent
 * to call from the same code path multiple times — duplicate signatures
 * are exactly what we're looking for.
 */
export function recordFailure(traj: TrajectoryContext, signature: string, check: string): void {
  if (!traj.verifyFailureHistory) traj.verifyFailureHistory = [];
  traj.verifyFailureHistory.push({ signature, check, firedAt: Date.now() });
}

/**
 * True when the trajectory has hit the loop threshold for the given
 * signature AND fresh-eyes hasn't been triggered yet for this run.
 *
 * The "not yet escalated" check is critical — without it, a Challenger's
 * suggestion that also fails would itself trigger another Challenger,
 * recursing until the user or a tool budget kills it. One escalation
 * per trajectory is the contract.
 */
export function shouldEscalateFreshEyes(traj: TrajectoryContext, signature: string): boolean {
  if (traj.freshEyesEscalated) return false;
  if (!traj.verifyFailureHistory) return false;
  const matches = traj.verifyFailureHistory.filter((e) => e.signature === signature).length;
  return matches >= LOOP_THRESHOLD;
}

/**
 * Mark this trajectory as having received its fresh-eyes pass. Called
 * by the agent immediately before the Challenger spawn, so a failure
 * mid-spawn doesn't leave the gate unset.
 */
export function markFreshEyesEscalated(traj: TrajectoryContext): void {
  traj.freshEyesEscalated = true;
}

/**
 * Read-only summary for the user-role context message the agent injects
 * when escalating. Returns the last N failures grouped by signature so
 * the Challenger sees how the same root cause kept re-surfacing despite
 * ostensibly different fix attempts.
 */
export function describeFailureLoop(traj: TrajectoryContext, limit: number = 5): string {
  const history = traj.verifyFailureHistory ?? [];
  if (history.length === 0) return 'No verification failures recorded.';

  const recent = history.slice(-limit);
  const lines: string[] = [];
  lines.push(`Last ${recent.length} verification failure(s):`);
  for (const e of recent) {
    const ago = Math.round((Date.now() - e.firedAt) / 1000);
    lines.push(`  - ${e.check} (${ago}s ago) :: ${e.signature.slice(0, 80)}`);
  }
  return lines.join('\n');
}
