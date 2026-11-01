/**
 * Bring account-era data home (BYOK plan, decided 1 Nov 2026).
 *
 * While Ava had accounts, a signed-in user's data lived in
 * `~/.ava/users/<accountId>/`, and a signed-out user was shown whichever
 * account folder held the most. With accounts gone, everything lives in
 * `~/.ava/` again — so on first launch after updating, account folders are
 * merged up into it. The rules, in order of importance:
 *
 *   1. NOTHING IS LOST. Files are COPIED, never moved; `~/.ava/users/` is left
 *      exactly as it was, as the safety net. Where two different files share a
 *      name, neither is overwritten — the one set aside is kept beside it.
 *   2. What the user SAW stays what they see. The active account (the one the
 *      apps were reading) goes first and wins a clash; the file it replaces in
 *      `~/.ava/` is kept as `<name>.before-merge<ext>`.
 *   3. Other account folders merge in after it: anything that does not clash
 *      is added; a clashing file is kept as `<name>.from-account-<id><ext>`.
 *   4. Lists merge, not replace. Two JSON lists of items with ids (the Library
 *      index, for one) become their union, so items from both folders show.
 *   5. Once. A marker file records what was done, and a second run is a no-op.
 *
 * Real machines have exactly this shape: the operator's had two account
 * folders (1.9 MB and 139 MB) and almost every name in them also existed in
 * `~/.ava/` itself.
 */

import { promises as fs } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';

export const ACCOUNT_MERGE_MARKER = '.account-folders-merged.json';

/** Left behind: cloud sync is gone, and its state means nothing now. */
const SKIP = new Set(['sync-state.json']);

/** Signs of real use, for picking the account the apps were showing. */
const MARKERS = ['creative/metadata.json', 'journal', 'tasks', 'history', 'learning.json', 'health', 'memory.json', 'general.json'];

export interface AccountMergeReport {
  merged: boolean;
  reason?: string;
  accounts: string[];
  activeAccount?: string;
  copied: number;
  listsMerged: number;
  keptAside: string[];
  skippedIdentical: number;
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}
async function isDir(p: string): Promise<boolean> {
  try { return (await fs.stat(p)).isDirectory(); } catch { return false; }
}

/** The account folder the apps were reading: the pointer if given, else the one with the most signs of use. */
export async function pickActiveAccount(usersDir: string, accounts: string[], preferred?: string): Promise<string | undefined> {
  if (!accounts.length) return undefined;
  if (preferred && accounts.includes(preferred)) return preferred;
  if (accounts.length === 1) return accounts[0];
  let best = accounts[0], bestHits = -1, bestAt = -1;
  for (const a of accounts) {
    let hits = 0, at = 0;
    for (const m of MARKERS) {
      try {
        const st = await fs.stat(join(usersDir, a, ...m.split('/')));
        hits++;
        if (st.mtimeMs > at) at = st.mtimeMs;
      } catch { /* absent — that is the signal */ }
    }
    if (hits > bestHits || (hits === bestHits && at > bestAt)) { best = a; bestHits = hits; bestAt = at; }
  }
  return best;
}

/** A free sibling name: `memory.before-merge.json`, then `memory.before-merge-2.json`… */
async function asideName(path: string, tag: string): Promise<string> {
  const ext = extname(path);
  const stem = join(dirname(path), basename(path, ext));
  let candidate = `${stem}.${tag}${ext}`;
  for (let n = 2; await exists(candidate); n++) candidate = `${stem}.${tag}-${n}${ext}`;
  return candidate;
}

/** Two JSON lists of id'd items → their union (first list's items win on a shared id). Null if not that shape. */
function unionById(winner: unknown, other: unknown): unknown[] | null {
  if (!Array.isArray(winner) || !Array.isArray(other)) return null;
  const all = [...winner, ...other];
  if (!all.every((x) => x && typeof x === 'object' && 'id' in (x as object))) {
    return winner.length === 0 && other.length === 0 ? [] : null;
  }
  const seen = new Set<unknown>();
  const out: unknown[] = [];
  for (const item of all) {
    const id = (item as { id: unknown }).id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

/**
 * Merge two JSON stores. A list of id'd items → union. An object → the
 * winner's fields, plus any list of id'd items inside it merged with the
 * other's (Ava's stores look like `{ version, lastModified, entries: [...] }`).
 * Null when there is nothing safe to merge — the caller keeps both files.
 */
function mergeJson(winner: unknown, other: unknown): unknown | null {
  const asList = unionById(winner, other);
  if (asList) return asList;
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(winner) || !isObj(other)) return null;
  let mergedAny = false;
  const out: Record<string, unknown> = { ...other, ...winner };
  for (const key of Object.keys(winner)) {
    if (!(key in other)) continue;
    const u = unionById(winner[key], other[key]);
    if (u && Array.isArray(winner[key]) && Array.isArray(other[key])) {
      out[key] = u;
      mergedAny = true;
    } else if (JSON.stringify(winner[key]) !== JSON.stringify(other[key]) && !['version', 'lastModified', 'updatedAt'].includes(key)) {
      return null; // a real difference that is not a list we understand — keep both files instead
    }
  }
  return mergedAny ? out : null;
}

async function readJson(p: string): Promise<unknown> {
  try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch { return undefined; }
}

async function mergeInto(src: string, dst: string, active: boolean, account: string, report: AccountMergeReport): Promise<void> {
  await fs.mkdir(dst, { recursive: true });
  for (const name of await fs.readdir(src)) {
    if (SKIP.has(name)) continue;
    const s = join(src, name);
    const d = join(dst, name);
    const sDir = await isDir(s);

    if (!(await exists(d))) {
      await fs.cp(s, d, { recursive: true, errorOnExist: false, force: false });
      report.copied++;
      continue;
    }
    const dDir = await isDir(d);
    if (sDir && dDir) {
      await mergeInto(s, d, active, account, report);
      continue;
    }
    if (sDir !== dDir) {
      // A folder where a file is, or the reverse — keep both, never overwrite.
      const aside = await asideName(d, `from-account-${account.slice(0, 8)}`);
      await fs.cp(s, aside, { recursive: true });
      report.keptAside.push(aside);
      continue;
    }

    const [sb, db] = await Promise.all([fs.readFile(s), fs.readFile(d)]);
    if (sb.equals(db)) { report.skippedIdentical++; continue; }

    if (name.endsWith('.json')) {
      const [sj, dj] = await Promise.all([readJson(s), readJson(d)]);
      const merged = active ? mergeJson(sj, dj) : mergeJson(dj, sj);
      if (merged) {
        await fs.writeFile(await asideName(d, 'before-merge'), db);
        await fs.writeFile(d, JSON.stringify(merged, null, 2), 'utf-8');
        report.listsMerged++;
        continue;
      }
    }

    if (active) {
      // What they were shown wins; the file it replaces is kept beside it.
      const aside = await asideName(d, 'before-merge');
      await fs.writeFile(aside, db);
      await fs.writeFile(d, sb);
      report.keptAside.push(aside);
    } else {
      const aside = await asideName(d, `from-account-${account.slice(0, 8)}`);
      await fs.writeFile(aside, sb);
      report.keptAside.push(aside);
    }
  }
}

/**
 * Merge `<avaHome>/users/*` up into `<avaHome>`. Safe to call on every
 * launch: does nothing when there is nothing to merge or it already ran.
 */
export async function mergeAccountFolders(
  avaHome: string,
  opts: { preferredAccount?: string; log?: (line: string) => void } = {},
): Promise<AccountMergeReport> {
  const report: AccountMergeReport = { merged: false, accounts: [], copied: 0, listsMerged: 0, keptAside: [], skippedIdentical: 0 };
  const usersDir = join(avaHome, 'users');
  const marker = join(avaHome, ACCOUNT_MERGE_MARKER);
  if (await exists(marker)) return { ...report, reason: 'already merged' };
  if (!(await isDir(usersDir))) return { ...report, reason: 'no account folders' };

  const accounts = [];
  for (const e of await fs.readdir(usersDir, { withFileTypes: true })) if (e.isDirectory()) accounts.push(e.name);
  if (!accounts.length) return { ...report, reason: 'no account folders' };

  const active = await pickActiveAccount(usersDir, accounts, opts.preferredAccount);
  report.accounts = accounts;
  report.activeAccount = active;
  const order = [active!, ...accounts.filter((a) => a !== active)];
  for (const a of order) {
    await mergeInto(join(usersDir, a), avaHome, a === active, a, report);
    opts.log?.(`[account-merge] merged ${a}${a === active ? ' (active)' : ''}`);
  }
  report.merged = true;
  await fs.writeFile(marker, JSON.stringify({ at: new Date().toISOString(), ...report }, null, 2), 'utf-8');
  opts.log?.(`[account-merge] done: ${report.copied} copied, ${report.listsMerged} lists merged, ${report.keptAside.length} kept aside, ${report.skippedIdentical} identical`);
  return report;
}
