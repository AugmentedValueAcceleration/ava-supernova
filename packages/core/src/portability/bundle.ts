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
export const USER_DATA_PATHS: readonly string[] = [
  // Memory (v3 graph + legacy v2 + markdown mirror)
  'memory',                 // graph.json, brain.json
  'memory.json',
  'memory.md',
  'memory-v2-backup.json',
  // The learned layer. These sit at the AVA_HOME root, NOT under memory/ —
  // an earlier comment claimed otherwise and they were never actually backed up.
  'procedures.json',        // procedural memory
  'self-improvement.json',  // learnings from past failures
  // Conversations
  'history',                // {id}.json transcripts
  // Productivity + life data
  'tasks',                  // tasks/tasks.json — a DIRECTORY. It was listed as
                            // 'tasks.json' (a file that has never existed), so
                            // every backup taken so far contained zero tasks.
  'journal',                // {date}.json
  'learning.json',
  'health',                 // profile.json, plans/, daily-plans/
  // Creative metadata only (binaries go via large-file transfer)
  'creative/metadata.json',
  // Personalisation
  'personality.json',
  'general.json',           // GeneralProfile — name, body basics
  'config',                 // personality.json / app config that is user-set
  'projects.json',
  'feedback.json',
  // Captured training data. It's generated FROM the user, so it leaves with them.
  'datasets',
];

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

/** Snapshot every user-data file under `avaHome` into a bundle. */
export async function gatherBundle(
  avaHome: string,
  opts: { source: string; createdAt?: string },
): Promise<DataBundle> {
  const files: Record<string, string> = {};
  for (const p of USER_DATA_PATHS) {
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
  opts?: { overwrite?: boolean },
): Promise<RestoreResult> {
  if (bundle?.v !== BUNDLE_VERSION) throw new Error('Unsupported bundle version');
  const rootResolved = resolve(avaHome);
  let written = 0, skipped = 0;
  const rejected: string[] = [];

  for (const [rel, content] of Object.entries(bundle.files)) {
    const abs = resolve(avaHome, rel);
    // Containment check — abs must be inside avaHome.
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
