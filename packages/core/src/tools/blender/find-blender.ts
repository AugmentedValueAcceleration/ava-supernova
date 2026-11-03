/**
 * Find Blender on this machine.
 *
 * Order: the path the person set in settings (`preferences.blenderPath` in
 * ~/.ava/config.json, so it follows them between the extension and the IDE),
 * then AVA_BLENDER, then the usual install places, then PATH. The newest
 * version wins when several are installed. Nothing found → null, and the tool
 * says so with a link instead of failing quietly.
 */

import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { CONFIG_PATH } from '../../core/constants.js';

export interface BlenderInstall {
  path: string;
  /** e.g. "5.2.2 LTS" — read from Blender itself, not from the folder name. */
  version: string;
  /** Where it was found: settings | env | detected | path. */
  source: 'settings' | 'env' | 'detected' | 'path';
}

export const BLENDER_DOWNLOAD_URL = 'https://www.blender.org/download/';

const EXE = process.platform === 'win32' ? 'blender.exe' : 'blender';

/** Candidate install folders for this OS, newest-looking first. */
function detectedCandidates(): string[] {
  const out: string[] = [];
  if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files']
      .filter((r): r is string => !!r);
    for (const root of new Set(roots)) {
      const foundation = join(root, 'Blender Foundation');
      if (!existsSync(foundation)) continue;
      let dirs: string[] = [];
      try { dirs = readdirSync(foundation); } catch { /* unreadable */ }
      // "Blender 5.2", "Blender 4.5" … sort by version number, highest first.
      dirs.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const d of dirs) out.push(join(foundation, d, EXE));
    }
    for (const root of roots) out.push(join(root, 'Steam', 'steamapps', 'common', 'Blender', EXE));
    if (process.env.LOCALAPPDATA) out.push(join(process.env.LOCALAPPDATA, 'Programs', 'Blender Foundation', 'Blender', EXE));
  } else if (process.platform === 'darwin') {
    out.push('/Applications/Blender.app/Contents/MacOS/Blender');
    if (process.env.HOME) out.push(join(process.env.HOME, 'Applications', 'Blender.app', 'Contents', 'MacOS', 'Blender'));
  } else {
    out.push('/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender');
    if (process.env.HOME) out.push(join(process.env.HOME, '.steam', 'steam', 'steamapps', 'common', 'Blender', 'blender'));
  }
  return out;
}

function onPath(): string | null {
  const dirs = (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':');
  for (const d of dirs) {
    if (!d) continue;
    const p = join(d, EXE);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Ask Blender its version. Null when the file is not a working Blender. */
export function readBlenderVersion(exe: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(exe, ['-b', '--factory-startup', '--version'], { timeout: 30_000, windowsHide: true }, (err, stdout) => {
      if (err && !stdout) return resolve(null);
      const m = /Blender\s+(\d+\.\d+(?:\.\d+)?(?:\s+LTS)?)/.exec(String(stdout));
      resolve(m ? m[1] : null);
    });
  });
}

async function configuredPath(): Promise<string | undefined> {
  try {
    const cfg = JSON.parse(await readFile(CONFIG_PATH, 'utf-8')) as { preferences?: { blenderPath?: string } };
    return cfg.preferences?.blenderPath?.trim() || undefined;
  } catch {
    return undefined;
  }
}

let cached: { key: string; install: BlenderInstall | null } | null = null;

/**
 * Locate Blender. Cached per configured path, so changing the setting is
 * picked up on the next call without a restart.
 */
export async function findBlender(opts: { refresh?: boolean } = {}): Promise<BlenderInstall | null> {
  const configured = await configuredPath();
  const key = `${configured ?? ''}|${process.env.AVA_BLENDER ?? ''}`;
  if (!opts.refresh && cached?.key === key) return cached.install;

  const tries: Array<{ path: string; source: BlenderInstall['source'] }> = [];
  if (configured) tries.push({ path: configured, source: 'settings' });
  if (process.env.AVA_BLENDER) tries.push({ path: process.env.AVA_BLENDER, source: 'env' });
  for (const p of detectedCandidates()) tries.push({ path: p, source: 'detected' });
  const fromPath = onPath();
  if (fromPath) tries.push({ path: fromPath, source: 'path' });

  let install: BlenderInstall | null = null;
  for (const t of tries) {
    if (!existsSync(t.path)) continue;
    const version = await readBlenderVersion(t.path);
    if (version) { install = { path: t.path, version, source: t.source }; break; }
  }
  cached = { key, install };
  return install;
}

/**
 * Save (or clear, with null) the Blender path the person chose in Settings.
 * Checked first — a path that isn't a working Blender is refused with a
 * reason, never saved. Lives in ~/.ava/config.json so the extension and the
 * IDE share it.
 */
export async function setBlenderPath(path: string | null): Promise<{ ok: boolean; install?: BlenderInstall | null; error?: string }> {
  const chosen = path?.trim() || null;
  if (chosen) {
    if (!existsSync(chosen)) return { ok: false, error: 'There is no file at that path.' };
    const version = await readBlenderVersion(chosen);
    if (!version) return { ok: false, error: 'That file did not answer as Blender. Pick blender.exe inside the Blender folder.' };
  }
  let cfg: Record<string, unknown> = {};
  try { cfg = JSON.parse(await readFile(CONFIG_PATH, 'utf-8')); } catch { /* none yet */ }
  const prefs = { ...((cfg.preferences as Record<string, unknown> | undefined) ?? {}) };
  if (chosen) prefs.blenderPath = chosen; else delete prefs.blenderPath;
  cfg.preferences = prefs;
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  const tmp = `${CONFIG_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(cfg, null, 2), 'utf-8');
  await rename(tmp, CONFIG_PATH);
  return { ok: true, install: await findBlender({ refresh: true }) };
}

/** What Settings shows: the Blender in use, and whether it was chosen by hand. */
export async function blenderStatus(): Promise<{ install: BlenderInstall | null; configured: string | null }> {
  return { install: await findBlender({ refresh: true }), configured: (await configuredPath()) ?? null };
}
