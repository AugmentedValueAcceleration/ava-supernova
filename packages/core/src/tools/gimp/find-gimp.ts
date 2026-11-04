/**
 * Find GIMP's console build on this machine — the one that runs with no window.
 *
 * Order: the path chosen in Settings (`preferences.gimpPath`, shared by the
 * extension and the IDE), then AVA_GIMP, then the usual install places, then
 * PATH. GIMP 3 only: its Python API is a different world from 2.10's.
 */

import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { CONFIG_PATH } from '../../core/constants.js';

export interface GimpInstall {
  /** gimp-console — what Ava runs. */
  path: string;
  /** The windowed GIMP beside it — what the person opens their work in. */
  appPath: string;
  version: string;
  source: 'settings' | 'env' | 'detected' | 'path';
}

export const GIMP_DOWNLOAD_URL = 'https://www.gimp.org/downloads/';

const WIN = process.platform === 'win32';

/** Prefer the versioned console (gimp-console-3.2.exe), newest first. */
function consoleIn(binDir: string): string | null {
  if (!existsSync(binDir)) return null;
  let names: string[] = [];
  try { names = readdirSync(binDir); } catch { return null; }
  const found = names.filter((n) => /^gimp-console(-\d+(\.\d+)*)?(\.exe)?$/i.test(n))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return found.length ? join(binDir, found[0]) : null;
}

function detected(): string[] {
  const dirs: string[] = [];
  if (WIN) {
    const roots = [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs'), process.env.ProgramFiles, 'C:\\Program Files']
      .filter((r): r is string => !!r);
    for (const root of new Set(roots)) {
      let folders: string[] = [];
      try { folders = readdirSync(root).filter((d) => /^GIMP/i.test(d)); } catch { /* unreadable */ }
      folders.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const f of folders) dirs.push(join(root, f, 'bin'));
    }
  } else if (process.platform === 'darwin') {
    dirs.push('/Applications/GIMP.app/Contents/MacOS');
  } else {
    dirs.push('/usr/bin', '/usr/local/bin');
  }
  return dirs.map(consoleIn).filter((p): p is string => !!p);
}

function onPath(): string | null {
  for (const d of (process.env.PATH || '').split(WIN ? ';' : ':')) {
    const hit = d ? consoleIn(d) : null;
    if (hit) return hit;
  }
  return null;
}

/** Ask GIMP its version. Null unless it answers as GIMP 3 or newer. */
export function readGimpVersion(exe: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(exe, ['--version'], { timeout: 30_000, windowsHide: true }, (_err, stdout) => {
      const m = /version\s+(\d+)\.(\d+)(?:\.(\d+))?/i.exec(String(stdout));
      if (!m || Number(m[1]) < 3) return resolve(null);
      resolve(m.slice(1).filter(Boolean).join('.'));
    });
  });
}

/** The windowed GIMP beside a console build. */
function windowedBeside(consolePath: string): string {
  const name = basename(consolePath).replace(/^gimp-console/i, 'gimp');
  const beside = join(dirname(consolePath), name);
  return existsSync(beside) ? beside : consolePath;
}

async function configuredPath(): Promise<string | undefined> {
  try {
    const cfg = JSON.parse(await readFile(CONFIG_PATH, 'utf-8')) as { preferences?: { gimpPath?: string } };
    return cfg.preferences?.gimpPath?.trim() || undefined;
  } catch {
    return undefined;
  }
}

let cached: { key: string; install: GimpInstall | null } | null = null;

export async function findGimp(opts: { refresh?: boolean } = {}): Promise<GimpInstall | null> {
  const configured = await configuredPath();
  const key = `${configured ?? ''}|${process.env.AVA_GIMP ?? ''}`;
  if (!opts.refresh && cached?.key === key) return cached.install;

  const tries: Array<{ path: string; source: GimpInstall['source'] }> = [];
  if (configured) tries.push({ path: configured, source: 'settings' });
  if (process.env.AVA_GIMP) tries.push({ path: process.env.AVA_GIMP, source: 'env' });
  for (const p of detected()) tries.push({ path: p, source: 'detected' });
  const fromPath = onPath();
  if (fromPath) tries.push({ path: fromPath, source: 'path' });

  let install: GimpInstall | null = null;
  for (const t of tries) {
    if (!existsSync(t.path)) continue;
    // Someone may pick gimp.exe in Settings; use the console beside it.
    const exe = consoleIn(dirname(t.path)) ?? t.path;
    const version = await readGimpVersion(exe);
    if (version) { install = { path: exe, appPath: windowedBeside(exe), version, source: t.source }; break; }
  }
  cached = { key, install };
  return install;
}

/** Save (or clear, with null) the path chosen in Settings. Checked first. */
export async function setGimpPath(path: string | null): Promise<{ ok: boolean; install?: GimpInstall | null; error?: string }> {
  const chosen = path?.trim() || null;
  if (chosen) {
    if (!existsSync(chosen)) return { ok: false, error: 'There is no file at that path.' };
    const exe = consoleIn(dirname(chosen)) ?? chosen;
    if (!(await readGimpVersion(exe))) return { ok: false, error: 'That did not answer as GIMP 3. Pick gimp.exe inside the GIMP 3 bin folder.' };
  }
  let cfg: Record<string, unknown> = {};
  try { cfg = JSON.parse(await readFile(CONFIG_PATH, 'utf-8')); } catch { /* none yet */ }
  const prefs = { ...((cfg.preferences as Record<string, unknown> | undefined) ?? {}) };
  if (chosen) prefs.gimpPath = chosen; else delete prefs.gimpPath;
  cfg.preferences = prefs;
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  const tmp = `${CONFIG_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(cfg, null, 2), 'utf-8');
  await rename(tmp, CONFIG_PATH);
  return { ok: true, install: await findGimp({ refresh: true }) };
}

export async function gimpStatus(): Promise<{ install: GimpInstall | null; configured: string | null }> {
  return { install: await findGimp({ refresh: true }), configured: (await configuredPath()) ?? null };
}
