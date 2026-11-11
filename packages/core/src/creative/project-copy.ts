/**
 * "Use in project" — copy a piece of Library work into the project that is
 * open, the way that project's engine expects it (11 Nov 2026).
 *
 * It used to copy the whole work folder: Ava's brief, her scripts, the step
 * history, test exports and proofs, and a .blend whose textures still pointed
 * into ~/.ava — so it opened with every texture missing on anyone else's
 * machine. Now it copies FINISHED files only, made the same way as a folder
 * download (exportModel re-saves the .blend with relative links and exports a
 * fresh .fbx), and filed where the engine looks:
 *
 *   Unity   (ProjectSettings/ProjectVersion.txt)  → Assets/<Name>/   .fbx + textures/
 *   Unreal  (*.uproject)                           → Content/<Name>/  .fbx + textures/
 *           Epic's default auto-import watches Content and offers to import.
 *   Godot   (project.godot)                        → assets/<Name>/   .glb only
 *   other   first of public/, src/assets/, assets/, static/, images/ → every file
 *
 * One model format per engine on purpose: Unity imports a .blend as well as
 * the .fbx when Blender is installed, and Godot imports .fbx and .blend beside
 * the .glb — two copies of the same model in the project. Where the preferred
 * format could not be made (no Blender, no .fbx), the .glb stays, with a
 * warning, rather than leaving the project with no model at all.
 */

import { existsSync, readdirSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import { findBlender } from '../tools/blender/find-blender.js';
import { readImageFinals } from '../tools/gimp/build-image.js';
import { exportModel, safeName, type ExportWarning } from './folder-export.js';

export type ProjectEngine = 'unity' | 'unreal' | 'godot' | null;

export function detectEngine(projectRoot: string): ProjectEngine {
  if (existsSync(join(projectRoot, 'ProjectSettings', 'ProjectVersion.txt')) && existsSync(join(projectRoot, 'Assets'))) return 'unity';
  if (existsSync(join(projectRoot, 'project.godot'))) return 'godot';
  try {
    // The project root, one level: cheap.
    const names = readdirSync(projectRoot);
    if (names.some((n) => n.toLowerCase().endsWith('.uproject'))) return 'unreal';
  } catch { /* unreadable root: not an engine we know */ }
  return null;
}

const PREFERRED = ['public', join('src', 'assets'), 'assets', 'static', 'images'];

/** Where Library work goes in this project, creating the folder if it must. */
export async function projectAssetDir(projectRoot: string): Promise<{ dir: string; engine: ProjectEngine }> {
  const engine = detectEngine(projectRoot);
  const fixed = engine === 'unity' ? 'Assets' : engine === 'unreal' ? 'Content' : engine === 'godot' ? 'assets' : null;
  if (fixed) {
    const dir = join(projectRoot, fixed);
    await mkdir(dir, { recursive: true });
    return { dir, engine };
  }
  for (const c of PREFERRED) if (existsSync(join(projectRoot, c))) return { dir: join(projectRoot, c), engine };
  const dir = join(projectRoot, 'images');
  await mkdir(dir, { recursive: true });
  return { dir, engine };
}

/** A name not taken in `dir` (case-insensitive, as Windows and macOS are). */
function free(dir: string, name: string, ext = ''): string {
  const taken = new Set<string>();
  try {
    for (const n of readdirSync(dir)) taken.add(n.toLowerCase());
  } catch { /* new folder */ }
  let out = `${name}${ext}`;
  for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${name}-${n}${ext}`;
  return out;
}

async function filesUnder(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await filesUnder(p, base));
    else if (e.isFile()) out.push(relative(base, p));
  }
  return out;
}

export interface WorkToCopy {
  id: string;
  kind?: string;
  title?: string;
  absoluteFolder?: string;
}

export interface ProjectCopyResult {
  ok: boolean;
  /** Project-relative, forward slashes: ready to paste into code. */
  relPath?: string;
  absPath?: string;
  engine: ProjectEngine;
  warnings: ExportWarning[];
  error?: string;
}

/** Copy one piece of folder-shaped Library work (a model, GIMP work or an uploaded model) into the project. */
export async function copyWorkToProject(item: WorkToCopy, projectRoot: string): Promise<ProjectCopyResult> {
  const warnings: ExportWarning[] = [];
  const { dir, engine } = await projectAssetDir(projectRoot);
  const label = item.title ?? 'Untitled';
  const name = safeName(label);
  const rel = (p: string) => relative(projectRoot, p).split(/[\\/]/).join('/');
  const folder = item.absoluteFolder;
  if (!folder || !existsSync(folder)) return { ok: false, engine, warnings, error: 'Its folder is missing from the Library.' };

  // GIMP work: its finished files only.
  if (item.kind === 'gimp') {
    const finals = await readImageFinals(basename(folder));
    if (!finals.length) return { ok: false, engine, warnings, error: 'This has no finished file yet. Mark a final in the GIMP room first.' };
    if (finals.length === 1) {
      const ext = extname(finals[0]).toLowerCase();
      const to = join(dir, free(dir, name, ext));
      await copyFile(join(folder, finals[0]), to);
      return { ok: true, relPath: rel(to), absPath: to, engine, warnings };
    }
    const out = join(dir, free(dir, name));
    await mkdir(out, { recursive: true });
    for (const f of finals) {
      const ext = extname(f).toLowerCase();
      await copyFile(join(folder, f), join(out, free(out, safeName(basename(f, extname(f))), ext)));
    }
    return { ok: true, relPath: rel(out), absPath: out, engine, warnings };
  }

  if (item.kind !== 'model') return { ok: false, engine, warnings, error: 'This is not a model or GIMP work.' };
  const out = join(dir, free(dir, name));

  // A model they uploaded: their files exactly as they are (side files keep
  // their names — a .gltf names its .bin and textures).
  if (item.id.startsWith('upload_')) {
    for (const f of await filesUnder(folder)) {
      if (f === 'preview.png') continue;
      await mkdir(dirname(join(out, f)), { recursive: true });
      await copyFile(join(folder, f), join(out, f));
    }
    return { ok: true, relPath: rel(out), absPath: out, engine, warnings };
  }

  // A model Ava built: made the same way as a folder download.
  const blenderPath = (await findBlender().catch(() => null))?.path ?? null;
  await exportModel({ label, folder, slug: basename(folder), to: basename(out), name }, dir, blenderPath, warnings);

  const has = (ext: string) => existsSync(join(out, `${name}${ext}`));
  const drop = async (ext: string) => rm(join(out, `${name}${ext}`), { force: true });
  if (engine === 'unity' || engine === 'unreal') {
    await drop('.blend');
    if (has('.fbx')) await drop('.glb');
    else warnings.push({ item: label, message: `There is no .fbx (Blender isn't installed to make one), so the .glb was copied instead. ${engine === 'unity' ? 'Unity reads .glb only with its glTF package.' : 'Import it through the Content Browser.'}` });
  } else if (engine === 'godot') {
    if (has('.glb')) {
      await drop('.fbx'); await drop('.blend');
      await rm(join(out, 'textures'), { recursive: true, force: true }); // the .glb carries them
    }
  }
  return { ok: true, relPath: rel(out), absPath: out, engine, warnings };
}
