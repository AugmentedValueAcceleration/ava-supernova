/**
 * Portability bundle — gather all on-device user data into one object, and
 * restore it. This is the payload that gets sealed (crypto.ts) into a
 * `.ava-backup` file or carried over a transfer.
 *
 * A bundle is a flat map of `relativePath -> file contents`, snapshotting the
 * known user-data files/dirs under AVA_HOME. Snapshotting raw files (rather
 * than going through each manager's API) keeps the bundle complete and
 * format-agnostic: it captures the memory graph + edges, every history
 * transcript, tasks, journal, learning, health, settings — whatever exists —
 * without coupling to a dozen store schemas.
 *
 * NOTE: v1 covers the JSON/text stores. Large binary creative media
 * (`creative/<kind>/*`) is intentionally excluded here — it's handled by the
 * large-file transfer path (WebRTC / chunked) because a single bundle of
 * multi-hundred-MB videos isn't the right shape. Creative *metadata* is included.
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';

export const BUNDLE_VERSION = 1 as const;

/**
 * Allowlist of user-content paths under AVA_HOME (files or directories,
 * collected recursively). Only what exists is included. Operational/cloud
 * state (billing, usage, auth tokens) is deliberately NOT here.
 */
/**
 * Per-ACCOUNT data. When signed in this lives under `~/.ava/users/<id>/`, and
 * at the AVA_HOME root otherwise. Gather reads it from the scoped dir; restore
 * writes it back to whichever scoped dir is active NOW — so a backup taken on
 * one account restores into the account you're signed into, not over the root.
 */
export const ACCOUNT_DATA_PATHS: readonly string[] = [
  // Memory (v3 graph + legacy v2 + markdown mirror)
  'memory',                 // graph.json, brain.json
  'memory.json',
  'memory.md',
  'memory-v2-backup.json',
  // Conversations
  'history',                // {id}.json transcripts
  // Productivity + life data
  'tasks',                  // tasks/tasks.json — a DIRECTORY. It was listed as
                            // 'tasks.json' (a file that has never existed), so
                            // every backup taken so far contained zero tasks.
  'journal',                // {date}.json
  'learning.json',
  'health',                 // profile.json, plans/, daily-plans/, sessions/
                            // A whole DIRECTORY, so the training log added on
                            // 28 Jul is swept without touching this list.
  // Creative metadata only (binaries go via large-file transfer)
  'creative/metadata.json',
  // Personalisation
  'personality.json',
  'general.json',           // GeneralProfile — name, pronouns, body basics
  'config',                 // personality.json / app config that is user-set
  'projects.json',
];

/**
 * MACHINE-WIDE data. Always at the AVA_HOME root, never under `users/<id>/`.
 * Gathering these from the scoped dir (as the extension did) finds nothing;
 * gathering the account paths from the root (as the IDE did) finds the wrong
 * account. They need different roots, which is why they're separate lists.
 */
export const GLOBAL_DATA_PATHS: readonly string[] = [
  // The learned layer. An earlier comment claimed these sat under memory/.
  // They don't, so they were never actually backed up.
  'procedures.json',        // procedural memory
  'self-improvement.json',  // learnings from past failures
  'feedback.json',
  // Captured training data. It's generated FROM the user, so it leaves WITH them.
  'datasets',
];

/** Every user-data path, both roots. Kept for back-compat with existing callers. */
export const USER_DATA_PATHS: readonly string[] = [...ACCOUNT_DATA_PATHS, ...GLOBAL_DATA_PATHS];

/** Does this bundle entry belong to the account dir (vs the AVA_HOME root)? */
function isAccountPath(rel: string): boolean {
  return ACCOUNT_DATA_PATHS.some(p => rel === p || rel.startsWith(p + '/'));
}

export interface DataBundle {
  v: typeof BUNDLE_VERSION;
  /** ISO timestamp the bundle was created. */
  createdAt: string;
  /** Which surface produced it (extension / ide / companion / cli). */
  source: string;
  /** relativePath (posix) -> utf8 file contents. */
  files: Record<string, string>;
}

async function collectInto(absPath: string, root: string, out: Record<string, string>): Promise<void> {
  const st = await stat(absPath);
  if (st.isDirectory()) {
    for (const name of await readdir(absPath)) {
      await collectInto(join(absPath, name), root, out);
    }
  } else if (st.isFile()) {
    const rel = relative(root, absPath).split(sep).join('/');
    out[rel] = await readFile(absPath, 'utf8');
  }
}

/**
 * Snapshot every user-data file into a bundle.
 *
 * Account data is read from `opts.scopedDir` (the signed-in user's
 * `~/.ava/users/<id>/`); machine-wide data is always read from `avaHome`.
 * Omit `scopedDir` and both collapse to `avaHome` — the signed-out case.
 *
 * Keys stay flat and root-relative either way, so a bundle is portable between
 * a scoped and an unscoped install.
 */
export async function gatherBundle(
  avaHome: string,
  opts: { source: string; createdAt?: string; scopedDir?: string },
): Promise<DataBundle> {
  const files: Record<string, string> = {};
  const accountRoot = opts.scopedDir ?? avaHome;

  for (const p of ACCOUNT_DATA_PATHS) {
    const abs = join(accountRoot, p);
    if (existsSync(abs)) await collectInto(abs, accountRoot, files);
  }
  for (const p of GLOBAL_DATA_PATHS) {
    const abs = join(avaHome, p);
    if (existsSync(abs)) await collectInto(abs, avaHome, files);
  }
  return {
    v: BUNDLE_VERSION,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    source: opts.source,
    files,
  };
}

export interface RestoreResult { written: number; skipped: number; rejected: string[] }

/**
 * Write a bundle's files back under `avaHome`. By default it does NOT overwrite
 * existing files (safe merge — import onto a fresh device); pass `overwrite`
 * to replace. Path-traversal is guarded: any entry that would resolve outside
 * `avaHome` is rejected, never written (a bundle can come from an untrusted
 * file).
 */
export async function restoreBundle(
  avaHome: string,
  bundle: DataBundle,
  opts?: { overwrite?: boolean; scopedDir?: string },
): Promise<RestoreResult> {
  if (bundle?.v !== BUNDLE_VERSION) throw new Error('Unsupported bundle version');
  let written = 0, skipped = 0;
  const rejected: string[] = [];

  for (const [rel, content] of Object.entries(bundle.files)) {
    // Route each entry back to the root it came from: account data into the
    // account you are signed into now, machine-wide data to the AVA_HOME root.
    const root = isAccountPath(rel) ? (opts?.scopedDir ?? avaHome) : avaHome;
    const rootResolved = resolve(root);
    const abs = resolve(root, rel);
    // Containment check — abs must be inside its own root. A bundle can come
    // from an untrusted file, so traversal is rejected, never written.
    if (abs !== rootResolved && !abs.startsWith(rootResolved + sep)) {
      rejected.push(rel);
      continue;
    }
    if (!opts?.overwrite && existsSync(abs)) { skipped++; continue; }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
    written++;
  }
  return { written, skipped, rejected };
}
