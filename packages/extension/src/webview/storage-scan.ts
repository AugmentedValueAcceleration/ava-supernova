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

import { readdir, stat, rm, readFile, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import type { StorageScan, StorageCategory, StorageReclaim } from './dashboard-message-types.js';

// The category rules — labels, order, and which folder counts as what — live
// in core so this surface and the other cannot disagree about the user's disk.
import { CATEGORY_LABEL, CATEGORY_ORDER, categoryOf, type ProjectsUsage } from '@ava/core/projects/storage';


// ─── The user's projects ─────────────────────────────────────────────────────
//
// Measured separately from ~/.ava, and never on render.
//
// A source tree is not a config folder. An Unreal project's Intermediate,
// Binaries and DerivedDataCache run to tens of gigabytes, and walking that on
// every page load would stall the UI every single time. So the figure is
// cached, shown with its age, and re-measured only on request or once stale.
//
// The cache lives in ~/.ava so a measurement taken in the IDE is visible in the
// extension and vice versa — one disk, one answer.

/** Where the cached figure lives, shared between surfaces. */
function usageCachePath(avaHome: string): string {
  return join(avaHome, 'projects-usage.json');
}

export async function readProjectsUsage(avaHome: string): Promise<ProjectsUsage | null> {
  try {
    const raw = await readFile(usageCachePath(avaHome), 'utf8');
    const parsed = JSON.parse(raw) as ProjectsUsage;
    return parsed?.measuredAt ? parsed : null;
  } catch { return null; }
}

/**
 * Walk the projects home and total it.
 *
 * Counts EVERY immediate subfolder, not only projects Ava created — the number
 * should match what the file manager says about that folder. Counting only
 * hers would silently under-report the moment someone clones a repo into it,
 * with no way for them to tell why.
 */
export async function measureProjects(projectsHome: string, avaHome: string): Promise<ProjectsUsage> {
  let projectCount = 0;
  let bytes = 0;

  let entries: Dirent[] = [];
  try { entries = await readdir(projectsHome, { withFileTypes: true }); } catch { entries = []; }

  for (const e of entries) {
    const full = join(projectsHome, e.name);
    if (e.isDirectory()) {
      projectCount++;
      bytes += await dirSize(full);
    } else if (e.isFile()) {
      // Loose files in the folder still occupy the disk the user is being
      // shown, even though they are not projects.
      try { bytes += (await stat(full)).size; } catch { /* skip */ }
    }
  }

  const usage: ProjectsUsage = {
    path: projectsHome,
    bytes,
    projectCount,
    measuredAt: new Date().toISOString(),
  };
  // Best-effort: a measurement that cannot be cached is still worth showing.
  try {
    await writeFile(usageCachePath(avaHome), JSON.stringify(usage, null, 2), 'utf8');
  } catch { /* ignore */ }
  return usage;
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
