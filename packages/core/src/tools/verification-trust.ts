// ─── Verification trust state ───────────────────────────────────────────────
// Per-project per-check counter that compounds every consecutive clean run
// and resets on any failure. At the graduation threshold, eligible checks
// switch to a lighter variant (shorter timeouts, incremental typecheck,
// etc.) — the check still runs, just faster, because the evidence base
// says this project has been shipping clean in this category for a while.
//
// High-stakes check IDs (auth_full_suite, migration_dry_run) are hardcoded
// off the graduation path via the `neverGraduates` set — they always run
// full regardless of history. This mirrors the stakesFloor='mandatory'
// contract in verification-matrix.ts.
//
// State lives at ~/.ava/projects/<cwd-hash>/trust.json. Per-machine,
// per-project; not synced. That's the right granularity — trust is
// evidence that a specific project's code has been behaving in a specific
// working tree. Switching machines resets it (cheap rebuild) and switching
// projects doesn't cross-contaminate.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { CheckId } from '../personas/verification-matrix.js';

const GRADUATION_THRESHOLD = 10;

/**
 * Check IDs that are permanently pinned to the full check — they read
 * stakesFloor='mandatory' upstream, and the trust layer honours the same
 * floor here as defence-in-depth. Adding a high-stakes check to the matrix
 * without also adding it here would silently allow graduation.
 */
const NEVER_GRADUATES: ReadonlySet<CheckId> = new Set<CheckId>([
  'auth_full_suite',
  'migration_dry_run',
]);

interface CheckTrust {
  consecutiveCleanRuns: number;
  totalRuns: number;
  totalFailures: number;
  lastRunAt: string;
  lastFailAt: string | null;
}

export interface ProjectTrustState {
  version: 1;
  checks: Partial<Record<CheckId, CheckTrust>>;
}

function cwdHash(cwd: string): string {
  // Canonicalise so trailing slashes / drive-letter casing on Windows don't
  // create separate trust buckets for the same project.
  const canonical = resolve(cwd).replace(/[\\/]+$/, '').toLowerCase();
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function trustFilePath(cwd: string): string {
  return join(homedir(), '.ava', 'projects', cwdHash(cwd), 'trust.json');
}

function emptyState(): ProjectTrustState {
  return { version: 1, checks: {} };
}

export async function loadTrustState(cwd: string): Promise<ProjectTrustState> {
  const file = trustFilePath(cwd);
  if (!existsSync(file)) return emptyState();
  try {
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as ProjectTrustState;
    if (!parsed || parsed.version !== 1 || typeof parsed.checks !== 'object') {
      return emptyState();
    }
    return parsed;
  } catch {
    // Corrupt state is not a bug worth blocking on — start fresh.
    return emptyState();
  }
}

async function saveTrustState(cwd: string, state: ProjectTrustState): Promise<void> {
  const file = trustFilePath(cwd);
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Trust state is advisory — failing to persist it means next run just
    // runs a full check, which is safe. Don't block the verification flow.
  }
}

/**
 * True if the given check has earned the lighter variant in this project.
 * Hard floors (auth / migration) always return false. Unknown / new checks
 * return false until they've accumulated evidence.
 */
export function isTrusted(state: ProjectTrustState, checkId: CheckId): boolean {
  if (NEVER_GRADUATES.has(checkId)) return false;
  const entry = state.checks[checkId];
  if (!entry) return false;
  return entry.consecutiveCleanRuns >= GRADUATION_THRESHOLD;
}

/**
 * Record the outcomes of one verification pass. Called once per
 * verify_change invocation with the (checkId, status) pairs from that
 * pass. Pass → increment consecutiveCleanRuns. Fail → reset to 0 and
 * update lastFailAt. skip / na → neutral (lastRunAt touched only).
 */
export async function recordCheckResults(
  cwd: string,
  results: Array<{ checkId: CheckId; status: 'pass' | 'fail' | 'skip' | 'na' }>,
): Promise<void> {
  if (results.length === 0) return;

  const state = await loadTrustState(cwd);
  const now = new Date().toISOString();

  for (const { checkId, status } of results) {
    const existing = state.checks[checkId] ?? {
      consecutiveCleanRuns: 0,
      totalRuns: 0,
      totalFailures: 0,
      lastRunAt: now,
      lastFailAt: null,
    };

    if (status === 'pass') {
      state.checks[checkId] = {
        ...existing,
        consecutiveCleanRuns: existing.consecutiveCleanRuns + 1,
        totalRuns: existing.totalRuns + 1,
        lastRunAt: now,
      };
    } else if (status === 'fail') {
      state.checks[checkId] = {
        ...existing,
        consecutiveCleanRuns: 0,
        totalRuns: existing.totalRuns + 1,
        totalFailures: existing.totalFailures + 1,
        lastRunAt: now,
        lastFailAt: now,
      };
    } else {
      // skip / na — neutral for the counter, but still record we observed it.
      state.checks[checkId] = {
        ...existing,
        lastRunAt: now,
      };
    }
  }

  await saveTrustState(cwd, state);
}

export const _internals = { GRADUATION_THRESHOLD, NEVER_GRADUATES, cwdHash, trustFilePath };
