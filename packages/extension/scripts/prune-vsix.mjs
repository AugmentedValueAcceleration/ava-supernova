#!/usr/bin/env node
/**
 * Keep the two most recent .vsix files and delete the rest.
 *
 * Runs at the end of `pnpm package`. On 2026-08-18 this directory held 112
 * packages going back to 0.1.0 — 0.7GB, and it had never once been cleared in
 * the project's life. Nothing cleans up after a build, so every release since
 * the first one is still sitting here.
 *
 * Deleting them costs nothing: every published version is downloadable from the
 * marketplace, and any version can be rebuilt from its tag. Two are kept so a
 * rollback does not need a download.
 *
 * Sorted by mtime rather than by parsing the version out of the filename. A
 * rebuild of the same version should count as the newest thing here, and
 * semver parsing would call it a duplicate of something old.
 */
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEEP = 2;

const packages = readdirSync(root)
  .filter((f) => f.endsWith('.vsix'))
  .map((f) => ({ name: f, mtime: statSync(join(root, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

const doomed = packages.slice(KEEP);
if (doomed.length === 0) {
  console.log(`[prune] ${packages.length} vsix, nothing to remove.`);
  process.exit(0);
}

let freed = 0;
for (const p of doomed) {
  const path = join(root, p.name);
  freed += statSync(path).size;
  unlinkSync(path);
}

console.log(
  `[prune] kept ${packages.slice(0, KEEP).map((p) => p.name).join(', ')}` +
  ` — removed ${doomed.length}, freed ${(freed / 1048576).toFixed(0)}MB`,
);
