// ─── Deploy Manifest ────────────────────────────────────────────────────────
// Optional, project-supplied map of "which files deploy to which live surface,
// and how to read that surface's currently-serving commit."
//
// This is the data behind the `deploy_state` verification check. Core ships to
// every user, so it MUST NOT hardcode any URLs — the check does nothing until a
// project drops an `ava.deploy.json` (or `.ava/deploy.json`) at its root. That
// keeps the liveness check honest and portable: it observes whatever the
// project declares, and stays silent when nothing is declared.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * One deployed surface. `match` is a forgiving path pattern (a bare prefix like
 * `packages/web` or a globby `packages/web/**`); a changed file "belongs to"
 * this surface when its path starts with the literal portion of `match`.
 *
 * Liveness is read from the deployed URL via ONE of:
 *   - `marker`: a response header carrying the live commit/build id
 *     (default `x-ava-commit` when neither field is given), or
 *   - `markerJsonPath`: fetch the URL as JSON and read this dot-path
 *     (e.g. `commit` or `build.sha`).
 */
export interface DeploySurface {
  name: string;
  match: string;
  url: string;
  marker?: string;
  markerJsonPath?: string;
}

export interface DeployManifest {
  surfaces: DeploySurface[];
}

const MANIFEST_LOCATIONS = ['ava.deploy.json', join('.ava', 'deploy.json')];

/**
 * Reduce a `match` pattern to the literal directory prefix used for matching:
 * strips a trailing `/**`, `/*`, or `/`. Backslashes are normalised so Windows
 * paths compare cleanly against POSIX-style manifest entries.
 */
function matchPrefix(match: string): string {
  return match
    .replace(/\\/g, '/')
    .replace(/\/\*\*?$/, '')
    .replace(/\/$/, '');
}

/** True when `file` lives under `surface.match`'s prefix. */
export function fileMatchesSurface(file: string, surface: DeploySurface): boolean {
  const f = file.replace(/\\/g, '/').replace(/^\.\//, '');
  const prefix = matchPrefix(surface.match);
  if (!prefix) return false;
  return f === prefix || f.startsWith(prefix + '/');
}

/**
 * Load the deploy manifest from the nearest known location, or null when the
 * project hasn't declared one. Never throws — a malformed manifest is treated
 * as absent (logged by the caller if it cares), because a broken config must
 * not break verification.
 */
export async function loadDeployManifest(cwd: string): Promise<DeployManifest | null> {
  for (const rel of MANIFEST_LOCATIONS) {
    const abs = join(cwd, rel);
    if (!existsSync(abs)) continue;
    try {
      const parsed = JSON.parse(await readFile(abs, 'utf8')) as unknown;
      const surfaces = (parsed as { surfaces?: unknown }).surfaces;
      if (!Array.isArray(surfaces)) return null;
      const valid = surfaces.filter(
        (s): s is DeploySurface =>
          !!s &&
          typeof (s as DeploySurface).name === 'string' &&
          typeof (s as DeploySurface).match === 'string' &&
          typeof (s as DeploySurface).url === 'string',
      );
      return valid.length > 0 ? { surfaces: valid } : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The set of literal path prefixes declared by the manifest. Passed into the
 * (pure) verification matrix so it can tag changed files as `deployed` without
 * doing any IO itself.
 */
export function deployPrefixes(manifest: DeployManifest | null): string[] {
  if (!manifest) return [];
  return manifest.surfaces.map((s) => matchPrefix(s.match)).filter(Boolean);
}
