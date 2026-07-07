// ─── Local footprint scanner (host-side) ─────────────────────────────────────
//
// Walks ~/.ava and reports how much disk Ava is using, grouped into honest
// categories — Models, Runtime, Creative, Memory, Journal, Datasets, Backups,
// Other — plus the safely-reclaimable items (stale migration backups). This is
// what the storage bar (Command Center + Library) reads, so it reflects the
// WHOLE footprint, not just one corner.
//
// Sizing only reads directory entries + file sizes (never file contents), so it
// stays cheap even over an 800MB model. Everything is best-effort: unreadable
// entries are skipped, never fatal.

import { readdir, stat, rm } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import type { StorageScan, StorageCategory, StorageReclaim } from './dashboard-message-types.js';

const CATEGORY_LABEL: Record<string, string> = {
  models: 'Models', runtime: 'Runtime', creative: 'Creative', memory: 'Memory',
  journal: 'Journal', datasets: 'Datasets', backups: 'Old backups', other: 'Other',
};
// Stable display order (largest-first is applied after, but this breaks ties).
const CATEGORY_ORDER = ['models', 'runtime', 'creative', 'memory', 'journal', 'datasets', 'backups', 'other'];

/** Map a top-level entry name to a storage category. */
function categoryOf(name: string): string {
  const n = name.toLowerCase();
  if (/backup/.test(n)) return 'backups';
  if (n === 'models') return 'models';
  if (n === 'bin') return 'runtime';
  if (n === 'creative') return 'creative';
  if (n === 'memory' || n === 'memory.json' || n === 'memory.md' || n === 'embeddings' || n === 'graph.json') return 'memory';
  if (n === 'journal') return 'journal';
  if (n === 'datasets') return 'datasets';
  return 'other';
}

/** Recursive on-disk size of a directory (bytes). Best-effort. */
async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: Dirent[];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const full = join(dir, e.name);
    try {
      if (e.isDirectory()) total += await dirSize(full);
      else if (e.isFile()) total += (await stat(full)).size;
    } catch { /* skip unreadable */ }
  }
  return total;
}

async function sizeOf(full: string, isDir: boolean): Promise<number> {
  try { return isDir ? await dirSize(full) : (await stat(full)).size; } catch { return 0; }
}

/**
 * Scan AVA_HOME into categories + reclaimable items. Descends one level into
 * `users/<id>/` so account-scoped data (creative, memory, journal…) rolls up
 * into the same categories as the shared root.
 */
export async function scanStorage(home: string): Promise<StorageScan> {
  const bytesByCat = new Map<string, number>();
  const reclaimPaths: string[] = [];
  let reclaimBytes = 0;

  const add = async (name: string, full: string, isDir: boolean) => {
    const cat = categoryOf(name);
    const bytes = await sizeOf(full, isDir);
    bytesByCat.set(cat, (bytesByCat.get(cat) ?? 0) + bytes);
    if (cat === 'backups') { reclaimPaths.push(full); reclaimBytes += bytes; }
  };

  let top: Dirent[];
  try { top = await readdir(home, { withFileTypes: true }); } catch { return { totalBytes: 0, categories: [], reclaim: [] }; }

  for (const e of top) {
    const full = join(home, e.name);
    if (e.name === 'users' && e.isDirectory()) {
      // Roll each account-scoped dir's children into the shared categories.
      let users: string[] = [];
      try { users = (await readdir(full, { withFileTypes: true })).filter(u => u.isDirectory()).map(u => u.name); } catch { /* none */ }
      for (const u of users) {
        const udir = join(full, u);
        let children: Dirent[];
        try { children = await readdir(udir, { withFileTypes: true }); } catch { continue; }
        for (const c of children) await add(c.name, join(udir, c.name), c.isDirectory());
      }
      continue;
    }
    await add(e.name, full, e.isDirectory());
  }

  const totalBytes = [...bytesByCat.values()].reduce((a, b) => a + b, 0);
  const categories: StorageCategory[] = [...bytesByCat.entries()]
    .filter(([, bytes]) => bytes > 0)
    .map(([key, bytes]) => ({ key, label: CATEGORY_LABEL[key] ?? key, bytes }))
    .sort((a, b) => b.bytes - a.bytes || CATEGORY_ORDER.indexOf(a.key) - CATEGORY_ORDER.indexOf(b.key));

  const reclaim: StorageReclaim[] = reclaimBytes > 0
    ? [{ label: 'Old backups', bytes: reclaimBytes, paths: reclaimPaths }]
    : [];

  return { totalBytes, categories, reclaim };
}

/**
 * Delete reclaimable paths. Hardened: only removes paths that are INSIDE `home`
 * AND whose name contains "backup" — so a bad/hostile path can't wipe anything
 * else. Returns bytes freed (best-effort). Two-tap confirm lives in the UI.
 */
export async function reclaimStorage(paths: string[], home: string): Promise<number> {
  let freed = 0;
  for (const p of paths) {
    const rel = relative(home, p);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) continue;  // must be inside home
    if (!/backup/i.test(p)) continue;                                     // must be a backup
    const bytes = await sizeOf(p, true).catch(() => 0);
    try { await rm(p, { recursive: true, force: true }); freed += bytes; } catch { /* already gone */ }
  }
  return freed;
}
