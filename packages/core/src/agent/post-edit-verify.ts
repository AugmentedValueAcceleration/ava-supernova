/**
 * Post-edit verification — universal hook that runs verify_change against
 * files mutated during the trajectory, regardless of mode (Maestro,
 * Supernova, Aurora, BYOK direct-model). Lives in the agent layer rather
 * than the AutoCoordinator so single-model BYOK chats get the same
 * enforcement that orchestrated modes have always had.
 *
 * Flow:
 *   1. Tool post-hook (recordEditFromTool) — every successful file_write
 *      / file_edit adds the file path to pendingVerifyFiles on the
 *      trajectory.
 *   2. Tool-tick check (shouldVerifyAfterTool) — every Nth tool call,
 *      if pendingVerifyFiles is non-empty, fire verify_change
 *      opportunistically. Catches errors mid-task before they snowball.
 *   3. Closure guard (pendingFilesAtClosure) — when the model attempts
 *      to end its turn, the agent checks for pending files and either
 *      runs the verify (passing → close) or refuses the close and
 *      injects a nudge (failing → fix-and-retry path).
 *
 * Pass result clears the pending set and adds files to verifiedFiles.
 * Fail result clears pending too — verify happened, regardless of
 * outcome — and the failure is recorded on verifyFailureHistory by
 * the error-loop detector. Subsequent edits to the same files re-add
 * them to pending automatically.
 */

import type { TrajectoryContext } from '../dataset/emitter.js';
import { VerifyChangeTool } from '../tools/verify-change.js';
import type { ToolExecutionContext } from '../tools/types.js';

/**
 * Tools whose successful execution mutates a file at args.file_path. Limited
 * to the two universal file-mutation tools — bash and migration tools also
 * mutate files but their target paths are buried inside command strings, so
 * tracking them robustly would need a parser per shell-tool. Out of scope;
 * the user can declare those manually via a follow-up file_edit if needed.
 */
const FILE_MUTATING_TOOLS = new Set(['file_write', 'file_edit']);

/** Default opportunistic-verify cadence — every Nth tool call. */
const DEFAULT_VERIFY_TICK = 6;

/**
 * Hook called from the agent's tool-execution path after every tool
 * completes. Adds the touched file path to pendingVerifyFiles when the
 * tool was a mutation and succeeded. Returns the path added (or null).
 */
export function recordEditFromTool(
  traj: TrajectoryContext,
  toolName: string,
  args: Record<string, unknown>,
  success: boolean,
): string | null {
  if (!success) return null;
  if (!FILE_MUTATING_TOOLS.has(toolName)) return null;
  const filePath = typeof args.file_path === 'string' ? args.file_path : null;
  if (!filePath) return null;
  if (!traj.pendingVerifyFiles) traj.pendingVerifyFiles = new Set();
  traj.pendingVerifyFiles.add(filePath);
  // Re-edit invalidates any prior verified state for this file.
  traj.verifiedFiles?.delete(filePath);
  return filePath;
}

/**
 * Decide whether the agent should fire an opportunistic verify_change run
 * now. Only true when (a) there are pending files and (b) the tool count
 * is on a multiple of the tick. Avoids over-verifying — verify_change
 * itself is fast on typecheck-only paths but route_curl / migration_dry_run
 * have real cost.
 */
export function shouldVerifyAfterTool(
  traj: TrajectoryContext,
  threshold: number = DEFAULT_VERIFY_TICK,
): boolean {
  if (!traj.pendingVerifyFiles || traj.pendingVerifyFiles.size === 0) return false;
  const count = traj.toolsSoFar.length;
  return count > 0 && count % threshold === 0;
}

/**
 * If the trajectory has unverified file edits, return them. Caller (the
 * agent's pre-closure logic) uses the return to decide whether to refuse
 * a turn-ending response and nudge the model to verify first.
 */
export function pendingFilesAtClosure(traj: TrajectoryContext): string[] | null {
  if (!traj.pendingVerifyFiles || traj.pendingVerifyFiles.size === 0) return null;
  return Array.from(traj.pendingVerifyFiles);
}

/**
 * Run verify_change against the trajectory's pending files and update
 * trajectory state based on the result. Returns the structured outcome
 * the caller uses to inject the failure report (on fail) or proceed
 * with closure (on pass).
 *
 * Side effects:
 *   - On pass: pending files move to verifiedFiles
 *   - On fail: pending files are cleared (verify happened, errors get
 *     surfaced via the failure report; if the model edits again, those
 *     edits re-populate pending automatically)
 */
export async function runPendingVerify(
  traj: TrajectoryContext,
  ctx: ToolExecutionContext,
): Promise<{ passed: boolean; output: string; metadata: Record<string, unknown>; files: string[] }> {
  const files = Array.from(traj.pendingVerifyFiles ?? []);
  if (files.length === 0) {
    return { passed: true, output: 'No pending files.', metadata: {}, files: [] };
  }

  const tool = new VerifyChangeTool();
  const result = await tool.execute({ files }, ctx);

  if (result.success) {
    if (!traj.verifiedFiles) traj.verifiedFiles = new Set();
    for (const f of files) {
      traj.pendingVerifyFiles?.delete(f);
      traj.verifiedFiles.add(f);
    }
  } else {
    // Failure path: clear pending (the verify is done) and let the
    // caller handle the failure report. Subsequent edits re-add files.
    traj.pendingVerifyFiles?.clear();
  }

  return {
    passed: result.success,
    output: result.output,
    metadata: result.metadata ?? {},
    files,
  };
}

/**
 * Format the failure report into a user-role context message the model
 * sees on its next turn. Mirrors AutoCoordinator's retry-context shape
 * so models that have learned the orchestrated retry pattern recognise
 * the same format here.
 */
export function buildVerifyFailureNudge(report: string, files: string[]): string {
  return (
    `[verification failed]\n\n${report}\n\n` +
    `The previous edit(s) to ${files.join(', ')} did not pass verification. ` +
    `Read the failure above carefully — fix the actual issue (don't paper over it), ` +
    `then re-edit the file(s) and let verification re-run.`
  );
}

/**
 * Format the closure-time nudge for when the model tries to end its
 * turn with unverified edits. Encourages running verify itself rather
 * than just declaring done.
 */
export function buildClosureVerifyNudge(files: string[]): string {
  return (
    `[verification required before close]\n\n` +
    `You're about to end the turn but ${files.length} file(s) you edited haven't been verified: ${files.join(', ')}.\n\n` +
    `Run typecheck / tests on the changes before closing — call verify_change with the file list, ` +
    `or run the project's test command via bash. If you're certain the edits don't need verification ` +
    `(prose-only, config comments, etc.), say so explicitly so the user knows. Don't silently skip.`
  );
}
