/**
 * Factory reset — put Ava back to day one.
 *
 * Asked for as "restore a PC to factory settings", and the analogy is exact:
 * it has to clear the things that make a first run feel like a first run
 * (onboarding, consent, sign-in), or it is a memory wipe wearing a bigger name.
 *
 * It lives beside the backup bundle on purpose. `bundle.ts` already answers
 * "what counts as this user's data?", and a reset that kept its own second
 * answer would drift from it — deleting something backup never saved, or
 * sparing something backup always did. One question, one list: this module
 * imports ACCOUNT_DATA_PATHS and GLOBAL_DATA_PATHS rather than restating them.
 *
 * THREE RULES, and they matter more than the deleting does.
 *
 * 1. NOTHING LEAVES WITHOUT BEING ASKED FOR. Every category is opt-in and
 *    named in the user's terms. `projects/` holds their actual source code —
 *    19GB and four real projects on the machine this was written on — so it
 *    ships unticked and needs a typed confirmation. The difference between a
 *    reset and a catastrophe is one checkbox nobody read.
 *
 * 2. SAY WHAT IT COSTS BEFORE IT COSTS IT. Each category reports its real
 *    size first. "Projects (19.0 GB)" stops a hand that "Projects" would not.
 *
 * 3. A RESET THAT UN-RESETS ITSELF IS WORSE THAN NONE. Cloud sync is disabled
 *    BEFORE anything local goes; otherwise the next sync pulls the history
 *    back down and the user believes they started fresh when they did not.
 *
 * THE TRAP THIS MODULE EXISTS TO AVOID: account data is NOT at the Ava home.
 * It is under `users/<account-id>/`, which is why bundle.ts carries two roots.
 * A reset that deletes `~/.ava/memory` for a signed-in user deletes nothing
 * they own, and a reset that calls `users/` a cache deletes everything they
 * own under a label that says it is safe. Both were in this file's first
 * draft. See `scopedRoot`.
 */

import { rm, lstat, readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { ACCOUNT_DATA_PATHS, GLOBAL_DATA_PATHS } from './bundle.js';

/** How dangerous a category is, which drives the UI's treatment of it. */
export type ResetSeverity =
  /** Re-earned by using the product again. */
  | 'ordinary'
  /** Gone for good, but only ours to lose — keys, settings, history. */
  | 'permanent'
  /** The user's own work, or other devices. Typed confirmation required. */
  | 'irreversible';

export interface ResetCategory {
  id: string;
  /** i18n key; the English fallback is supplied at the call site. */
  labelKey: string;
  severity: ResetSeverity;
  /** Ticked when the dialog opens. Never true for `irreversible`. */
  defaultSelected: boolean;
  /** Paths relative to the ACCOUNT root (`users/<id>/`, or home when signed out). */
  accountPaths?: readonly string[];
  /** Paths relative to the Ava home, always. */
  globalPaths?: readonly string[];
  /** Host secret keys to delete. */
  secrets?: readonly string[];
  /** Host setting keys to clear. */
  stateKeys?: readonly string[];
}

export const PROVIDER_SECRETS = [
  'ava-supernova.platformKey',
  'ava-supernova.secretVault',
  'ava-supernova.provider.deepseek.apiKey',
  'ava-supernova.provider.kimi.apiKey',
  'ava-supernova.provider.qwen.apiKey',
  'ava-supernova.provider.mistral.apiKey',
  'ava-supernova.provider.minimax.apiKey',
  'ava-supernova.provider.local.apiKey',
] as const;

/**
 * Clearing these is what actually produces "day one" — onboarding and the
 * consent screen come back. Without them a reset yields a cleaned install,
 * not a fresh one, and the user can tell the difference immediately.
 */
export const DAY_ONE_STATE_KEYS = [
  'ava.onboardedV1',
  'ava.consentAccepted',
  'ava.syncPrefs',
  'ava.categoryPermissions',
  'ava.workingHours',
  'ava.lastAccountId',
  'ava.dashboardPageAfterOpen',
  'ava.platformKey',
  'ava-supernova.provider.local.baseUrl',
  'ava-supernova.provider.local.modelLabel',
  'ava-supernova.provider.local.modelName',
  'ava-supernova.provider.local.models',
] as const;

/** Memory and the learned layer: everything Ava knows about this person. */
const MEMORY_ACCOUNT = ['memory', 'memory.json', 'memory.md', 'memory-v2-backup.json'] as const;
const MEMORY_GLOBAL = ['procedures.json', 'self-improvement.json'] as const;

/** Conversations and the life data that accumulates alongside them. */
const HISTORY_ACCOUNT = ['history', 'journal', 'tasks', 'learning.json', 'health'] as const;

/** Personalisation — who Ava thinks you are, and who she is. */
const PROFILE_ACCOUNT = ['personality.json', 'general.json', 'config', 'creative/metadata.json'] as const;

/**
 * The categories, in the order the dialog shows them: cheapest to lose first,
 * the user's own work last. Ordering is a safety feature — a list that opens
 * on "delete my source code" invites a reflexive tick-everything.
 */
export function resetCategories(): ResetCategory[] {
  return [
    {
      id: 'logs',
      labelKey: 'reset.cat.logs',
      severity: 'ordinary',
      defaultSelected: true,
      globalPaths: [
        'audit-log.jsonl', 'desktop-conductor.log', 'uia-debug.log',
        'cc-auditlog-probe.log', 'briefing-state.json', 'deploy-state.json',
        'sync-state.json', 'generation-jobs.json', 'desktop-forkpoints.json',
      ],
    },
    {
      id: 'caches',
      labelKey: 'reset.cat.caches',
      severity: 'ordinary',
      defaultSelected: true,
      // `bin` and `models` are downloaded artefacts, not the user's. `users`
      // is NOT here, however much its size suggests it belongs — see the
      // header. It holds account data and is covered by the categories below.
      globalPaths: ['models', 'bin'],
    },
    {
      id: 'memory',
      labelKey: 'reset.cat.memory',
      severity: 'permanent',
      defaultSelected: true,
      accountPaths: MEMORY_ACCOUNT,
      globalPaths: MEMORY_GLOBAL,
    },
    {
      id: 'conversations',
      labelKey: 'reset.cat.conversations',
      severity: 'permanent',
      defaultSelected: true,
      accountPaths: HISTORY_ACCOUNT,
    },
    {
      id: 'profile',
      labelKey: 'reset.cat.profile',
      severity: 'permanent',
      defaultSelected: true,
      accountPaths: PROFILE_ACCOUNT,
      globalPaths: ['avatar.dat', 'config.json', 'feedback.json'],
    },
    {
      id: 'datasets',
      labelKey: 'reset.cat.datasets',
      severity: 'permanent',
      // Generated FROM the user, so it leaves WITH them — but it is also the
      // only copy of captured training data, so it is never swept silently.
      defaultSelected: false,
      globalPaths: ['datasets'],
    },
    {
      id: 'project_data',
      labelKey: 'reset.cat.project_data',
      severity: 'permanent',
      defaultSelected: true,
      // What Ava knows ABOUT the projects. NOT the projects. Conflating the
      // two is exactly how somebody loses a year of work.
      accountPaths: ['projects.json'],
      globalPaths: ['project-index.json', 'projects-usage.json', 'project-notes'],
    },
    {
      id: 'credentials',
      labelKey: 'reset.cat.credentials',
      severity: 'permanent',
      defaultSelected: true,
      secrets: PROVIDER_SECRETS,
    },
    {
      id: 'settings',
      labelKey: 'reset.cat.settings',
      severity: 'permanent',
      defaultSelected: true,
      stateKeys: DAY_ONE_STATE_KEYS,
    },
    {
      id: 'projects',
      labelKey: 'reset.cat.projects',
      severity: 'irreversible',
      defaultSelected: false,
      globalPaths: ['projects'],
    },
  ];
}

/**
 * Every category path, resolved absolutely.
 *
 * `scopedDir` is the signed-in account's folder (`users/<id>/`). When absent —
 * a BYOK user who never signed in — account data sits at the home root, which
 * is why the fallback is `avaHome` and not an error.
 *
 * ACCOUNT PATHS ARE SWEPT AT BOTH ROOTS, and that is deliberate. Found by the
 * operator on 19 Oct 2026, testing a full wipe on his own machine: every box
 * ticked, projects deleted — and `~/.ava/memory.json` was still there
 * afterwards with 199 entries, current to two hours earlier, because memory is
 * an account path and only `users/<id>/memory.json` was in scope. Something
 * still writes to the unscoped copy, so a signed-in user could erase
 * everything, believe they were at day one, and find Ava still knew them.
 *
 * Reading from two homes is the bug behind that; reset is simply the one
 * operation where sweeping the stale duplicate is unambiguously correct.
 * Everywhere else, guessing which copy is live is how data goes missing — see
 * `gatherBundle`, which deliberately reads ONE root per path and must keep
 * doing so.
 */
export function categoryPaths(
  cat: ResetCategory,
  avaHome: string,
  scopedDir?: string | null,
): string[] {
  const roots = scopedDir && resolve(scopedDir) !== resolve(avaHome)
    ? [scopedDir, avaHome]
    : [avaHome];
  const out: string[] = [];
  for (const p of cat.accountPaths ?? []) {
    for (const r of roots) out.push(join(r, p));
  }
  for (const p of cat.globalPaths ?? []) out.push(join(avaHome, p));
  return [...new Set(out)];
}

/** Sanity net: every known data path, for tests and for the "select all" label. */
export function allKnownDataPaths(avaHome: string, scopedDir?: string | null): string[] {
  const accountRoot = scopedDir || avaHome;
  return [
    ...ACCOUNT_DATA_PATHS.map(p => join(accountRoot, p)),
    ...GLOBAL_DATA_PATHS.map(p => join(avaHome, p)),
  ];
}

export interface CategorySize {
  id: string;
  bytes: number;
  /** True when the walk hit its time budget and stopped counting. */
  approximate: boolean;
  /** Nothing to delete — the UI greys the row out rather than offering it. */
  empty: boolean;
}

/**
 * Size a path, with a time budget.
 *
 * `projects` was 19GB across four trees when this was written and an
 * exhaustive walk took over two minutes — far too long to hold a dialog open.
 * So the walk stops when the budget runs out and SAYS so, because a number
 * labelled "at least" is honest and a spinner that never resolves is not.
 */
async function sizeOf(target: string, deadline: number): Promise<{ bytes: number; done: boolean }> {
  let bytes = 0;
  const stack = [target];
  while (stack.length) {
    if (Date.now() > deadline) return { bytes, done: false };
    const cur = stack.pop()!;
    let st;
    try {
      st = await lstat(cur);
    } catch {
      continue; // absent or unreadable — nothing to count and nothing to fix
    }
    if (st.isSymbolicLink()) continue;  // never follow: a link out of the tree is not ours
    if (st.isFile()) { bytes += st.size; continue; }
    if (!st.isDirectory()) continue;
    let entries: string[];
    try {
      entries = await readdir(cur);
    } catch {
      continue;
    }
    for (const e of entries) stack.push(join(cur, e));
  }
  return { bytes, done: true };
}

/** Measure every category so the dialog can show what each one costs. */
export async function scanCategories(
  avaHome: string,
  scopedDir?: string | null,
  budgetMs = 5000,
): Promise<CategorySize[]> {
  const cats = resetCategories();
  // Budget is spent per-category so one enormous tree cannot starve the rest
  // of the list of a number.
  const per = Math.max(250, Math.floor(budgetMs / cats.length));
  const out: CategorySize[] = [];
  for (const c of cats) {
    let bytes = 0;
    let done = true;
    const deadline = Date.now() + per;
    for (const p of categoryPaths(c, avaHome, scopedDir)) {
      const r = await sizeOf(p, deadline);
      bytes += r.bytes;
      if (!r.done) done = false;
    }
    const hasKeys = (c.secrets?.length ?? 0) > 0 || (c.stateKeys?.length ?? 0) > 0;
    out.push({ id: c.id, bytes, approximate: !done, empty: bytes === 0 && !hasKeys });
  }
  return out;
}

export interface ResetReport {
  removed: string[];
  failed: { path: string; reason: string }[];
  secretsCleared: number;
  stateKeysCleared: number;
  bytesFreed: number;
}

/** Host capabilities the reset needs, injected so this module stays testable. */
export interface ResetHost {
  deleteSecret(key: string): Promise<void>;
  clearStateKey(key: string): Promise<void>;
  /** Turn cloud sync off BEFORE anything is deleted. See rule 3. */
  disableSyncFirst(): Promise<void>;
  log(msg: string): void;
}

/**
 * Remove the selected categories.
 *
 * Deliberately keeps going when one path fails. On Windows a file held open by
 * another process throws EBUSY, and stopping at the first one would leave the
 * user half-reset with no idea which half — worse than either finishing or
 * not starting. Every failure is collected and reported instead.
 */
export async function executeReset(
  selectedIds: readonly string[],
  host: ResetHost,
  avaHome: string,
  scopedDir?: string | null,
): Promise<ResetReport> {
  const report: ResetReport = {
    removed: [], failed: [], secretsCleared: 0, stateKeysCleared: 0, bytesFreed: 0,
  };
  const cats = resetCategories().filter(c => selectedIds.includes(c.id));
  if (cats.length === 0) return report;

  // Rule 3, and it must happen first.
  try {
    await host.disableSyncFirst();
  } catch (e) {
    host.log(`[factory-reset] could not disable sync first: ${e instanceof Error ? e.message : String(e)}`);
  }

  const root = resolve(avaHome);
  for (const c of cats) {
    for (const p of categoryPaths(c, avaHome, scopedDir)) {
      const abs = resolve(p);
      // Belt and braces: never delete outside the Ava home, whatever the
      // category table says. A bug up there should not reach the disk, and
      // `users/<id>/` is itself under the home so scoped paths still pass.
      if (abs !== root && !abs.startsWith(root + sep)) {
        report.failed.push({ path: abs, reason: 'outside the Ava folder — refused' });
        continue;
      }
      // Refuse to delete the home itself. No category asks for it, but the
      // one that someday does by accident would take everything at once.
      if (abs === root) {
        report.failed.push({ path: abs, reason: 'refused to delete the Ava folder itself' });
        continue;
      }
      let size = 0;
      try {
        size = (await sizeOf(abs, Date.now() + 2000)).bytes;
      } catch { /* a size is a nicety, not a reason to stop */ }
      try {
        await rm(abs, { recursive: true, force: true });
        report.removed.push(abs);
        report.bytesFreed += size;
      } catch (e) {
        report.failed.push({ path: abs, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    for (const s of c.secrets ?? []) {
      try { await host.deleteSecret(s); report.secretsCleared++; }
      catch (e) { report.failed.push({ path: s, reason: e instanceof Error ? e.message : String(e) }); }
    }
    for (const k of c.stateKeys ?? []) {
      try { await host.clearStateKey(k); report.stateKeysCleared++; }
      catch (e) { report.failed.push({ path: k, reason: e instanceof Error ? e.message : String(e) }); }
    }
  }

  host.log(
    `[factory-reset] removed ${report.removed.length} path(s), `
    + `${report.secretsCleared} secret(s), ${report.stateKeysCleared} setting(s), `
    + `${report.failed.length} failure(s), ${report.bytesFreed} byte(s) freed`,
  );
  return report;
}

/** Human-readable size, for the dialog. */
export function formatBytes(n: number): string {
  if (n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}
