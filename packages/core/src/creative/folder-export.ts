/**
 * Download a Library folder as a real folder (Library folders and packs plan,
 * Phase 2, 9 Nov 2026).
 *
 * What comes out is an ordinary folder with their structure, holding FINISHED
 * files only — never Ava's working material (briefs, scripts, version history,
 * previews, proofs). Optionally zipped.
 *
 * Layout (his call, 7 Nov): each model gets its own folder with a textures
 * folder beside its files, so nobody reorganises anything once it is in an
 * engine. A model ships .fbx (made fresh at download), .blend and .glb (his
 * call, 9 Nov — Godot and the web read .glb).
 *
 *   Fantasy-UI-Pack/
 *     Wooden-Barrel/
 *       Wooden-Barrel.fbx  Wooden-Barrel.blend  Wooden-Barrel.glb
 *       textures/ ...
 *     Stat-Icons/ heart.png star.png
 *     Hero-Banner.png
 *
 * Two things a plain copy would get wrong, so Blender does them at download:
 *   1. A built model links its baked textures by FULL path into ~/.ava. Copied
 *      as it is, the .blend would open with every texture missing on anyone
 *      else's machine. It is re-saved with links relative to its textures/.
 *   2. The .fbx is exported from the saved model linking textures/ by relative
 *      path, because Unity needs textures it can reach as files.
 * A model whose look is still a live shader (not baked) is flagged: its
 * exports would reach an engine flat.
 *
 * Streams: files are copied, never read whole, and a zip is written as it is
 * made — a multi-gigabyte pack must not have to fit in memory.
 */

import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative } from 'node:path';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { metadataFile } from '../tools/blender/paths.js';
import { findBlender } from '../tools/blender/find-blender.js';
import { readImageFinals } from '../tools/gimp/build-image.js';
import { readFolders, type LibraryFolder, type FolderMember } from './library-folders.js';
import { buildMakingReport, MAKING_RECORD_FILE, type ReportPiece } from './making-report.js';
export { MAKING_RECORD_FILE };
import { prepareForStore, STORE_PROFILES, STORE_WANTS_ZIP, type StoreId } from './store-profiles.js';

export interface ExportWarning { item: string; message: string }

export interface ExportPlanSummary {
  name: string;
  /** Pieces of work, across the folder and every folder inside it. */
  items: number;
  models: number;
  warnings: ExportWarning[];
  blender: boolean;
}

export interface ExportResult {
  ok: boolean;
  /** The folder, or the .zip, that was written. */
  path?: string;
  files?: number;
  bytes?: number;
  warnings: ExportWarning[];
  error?: string;
}

export type ExportProgress = (done: number, total: number, label: string) => void;

// ── Names ────────────────────────────────────────────────────────────────────

/** "Wooden Barrel (v2)!" → "Wooden-Barrel-v2". Readable, and safe on every system and store. */
export function safeName(raw: string, fallback = 'Untitled'): string {
  const n = String(raw ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 60)
    .replace(/[-._]+$/, '');
  return n || fallback;
}

/** A name not yet used in this folder (case-insensitive, as Windows and macOS are). */
function claim(used: Set<string>, name: string, ext = ''): string {
  let out = `${name}${ext}`;
  for (let n = 2; used.has(out.toLowerCase()); n++) out = `${name}-${n}${ext}`;
  used.add(out.toLowerCase());
  return out;
}

// ── The plan: what goes where ────────────────────────────────────────────────

type Op =
  | { kind: 'copy'; from: string; to: string }
  | { kind: 'model'; label: string; folder: string; slug: string; to: string; name: string };

interface Item {
  id: string; kind?: string; title?: string; absolutePath?: string; absoluteFolder?: string; origin?: string;
  prompt?: string; aiModel?: string; aiProvider?: string; createdAt?: string; originalName?: string;
  triangles?: number; sizeM?: number[];
}

async function libraryIndex(): Promise<Map<string, Item>> {
  try {
    const items = JSON.parse(await readFile(metadataFile(), 'utf-8'));
    return new Map((Array.isArray(items) ? items : []).filter((i) => typeof i?.id === 'string').map((i) => [i.id, i as Item]));
  } catch { return new Map(); }
}

async function plan(folderId: string): Promise<{ root: LibraryFolder; ops: Op[]; warnings: ExportWarning[]; items: number; models: number; pieces: ReportPiece[] } | null> {
  const folders = await readFolders();
  const root = folders.find((f) => f.id === folderId);
  if (!root) return null;
  const lib = await libraryIndex();
  const ops: Op[] = [];
  const warnings: ExportWarning[] = [];
  let items = 0;
  let models = 0;
  // What went in, piece by piece, for the making record.
  const pieces: ReportPiece[] = [];

  const walk = async (folder: LibraryFolder, at: string) => {
    const used = new Set<string>();
    // Folders inside first, so their names are taken before loose files.
    for (const kid of folders.filter((f) => f.parentId === folder.id).sort((a, b) => a.name.localeCompare(b.name))) {
      await walk(kid, join(at, claim(used, safeName(kid.name, 'Folder'))));
    }
    for (const m of folder.members) {
      items++;
      const before = ops.length;
      await member(m, at, used);
      if (ops.length === before && !warnings.some((w) => w.item === labelOf(m))) {
        warnings.push({ item: labelOf(m), message: 'Nothing from this could be included.' });
      }
      if (ops.length > before) {
        const added = ops.slice(before).map((o) => o.to.split(/[\\/]/));
        // One file: its path. Several: the folder they share.
        let common = added[0];
        for (const parts of added.slice(1)) { let i = 0; while (i < common.length && common[i] === parts[i]) i++; common = common.slice(0, i); }
        const where = (added.length === 1 && ops[before].kind === 'copy' ? added[0] : common).join('/') || '(the top of the pack)';
        const id = m.ref.replace(/^(creative|logo):/, '');
        pieces.push({
          label: labelOf(m), where, ref: m.ref,
          item: m.ref.startsWith('creative:') ? lib.get(id) : undefined,
          forms: m.ref.startsWith('logo:') ? [...lib.values()].filter((i) => i.id.startsWith(`${id}_`)).map((i) => ({ origin: i.origin })) : undefined,
        });
      }
    }
  };

  const labelOf = (m: FolderMember) => {
    if (m.ref.startsWith('file:')) return basename(m.ref.slice(5));
    const id = m.ref.replace(/^(creative|logo):/, '');
    return lib.get(id)?.title ?? (m.ref.startsWith('logo:') ? [...lib.values()].find((i) => i.id.startsWith(`${id}_`))?.title?.replace(/ — .*$/, '') : undefined) ?? id;
  };

  const member = async (m: FolderMember, at: string, used: Set<string>) => {
    const label = labelOf(m);

    // A project file, by path.
    if (m.ref.startsWith('file:')) {
      const from = m.ref.slice(5);
      if (!existsSync(from)) { warnings.push({ item: label, message: 'This project file isn\'t there now (another project, or a drive that isn\'t plugged in), so it was left out.' }); return; }
      const ext = extname(from);
      ops.push({ kind: 'copy', from, to: join(at, claim(used, safeName(basename(from, ext)), ext.toLowerCase())) });
      return;
    }

    // A logo system: its forms, in one folder.
    if (m.ref.startsWith('logo:')) {
      const group = m.ref.slice(5);
      const forms = [...lib.values()].filter((i) => i.id.startsWith(`${group}_`) && (!m.pick?.length || m.pick.includes(i.id.slice(group.length + 1))));
      if (!forms.length) return;
      const brand = safeName((forms[0].title ?? 'Logo').replace(/ — .*$/, ''), 'Logo');
      const dir = join(at, claim(used, `${brand}-Logo`));
      const inner = new Set<string>();
      for (const f of forms) {
        if (!f.absolutePath || !existsSync(f.absolutePath)) continue;
        const ext = extname(f.absolutePath).toLowerCase();
        ops.push({ kind: 'copy', from: f.absolutePath, to: join(dir, claim(inner, `${brand}-${safeName(f.id.slice(group.length + 1))}`, ext)) });
      }
      return;
    }

    const item = lib.get(m.ref.slice('creative:'.length));
    if (!item) { warnings.push({ item: label, message: 'This is no longer in the Library.' }); return; }
    const name = safeName(item.title ?? 'Untitled');

    // GIMP work: its finished files only.
    if (item.kind === 'gimp' && item.absoluteFolder) {
      const slug = basename(item.absoluteFolder);
      const finals = (await readImageFinals(slug)).filter((f) => !m.pick?.length || m.pick.includes(f));
      if (!finals.length) { warnings.push({ item: label, message: 'This has no finished file yet, so nothing was included. Mark a final in the GIMP room first.' }); return; }
      const dir = finals.length === 1 ? at : join(at, claim(used, name));
      const inner = finals.length === 1 ? used : new Set<string>();
      for (const f of finals) {
        const ext = extname(f).toLowerCase();
        const stem = finals.length === 1 ? name : safeName(basename(f, extname(f)));
        ops.push({ kind: 'copy', from: join(item.absoluteFolder, f), to: join(dir, claim(inner, stem, ext)) });
      }
      return;
    }

    // A 3D model Ava built: its own folder, re-saved and exported by Blender.
    if (item.kind === 'model' && item.absoluteFolder && !item.id.startsWith('upload_')) {
      models++;
      ops.push({ kind: 'model', label, folder: item.absoluteFolder, slug: basename(item.absoluteFolder), to: join(at, claim(used, name)), name });
      return;
    }

    // A model they uploaded: their files exactly as they are, in its own
    // folder. Names are KEPT: a .gltf names its .bin and textures, and an .obj
    // its .mtl, so a renamed side file is a missing one.
    if (item.kind === 'model' && item.absoluteFolder) {
      const dir = join(at, claim(used, name));
      for (const rel of await listFiles(item.absoluteFolder)) {
        if (rel === 'preview.png') continue;
        ops.push({ kind: 'copy', from: join(item.absoluteFolder, rel), to: join(dir, rel) });
      }
      return;
    }

    // One file: an image, a clip, a voiceover, an upload.
    if (item.absolutePath && existsSync(item.absolutePath)) {
      const ext = extname(item.absolutePath).toLowerCase();
      ops.push({ kind: 'copy', from: item.absolutePath, to: join(at, claim(used, name, ext)) });
      return;
    }
    warnings.push({ item: label, message: 'Its file is missing from the Library folder.' });
  };

  await walk(root, '');
  return { root, ops, warnings, items, models, pieces };
}

/** What a download would hold, and what it would leave out, before choosing where. */
export async function previewFolderExport(folderId: string): Promise<ExportPlanSummary | null> {
  const p = await plan(folderId);
  if (!p) return null;
  const blender = !!(await findBlender());
  const warnings = [...p.warnings];
  if (p.models && !blender) {
    warnings.push({ item: 'Models', message: 'Blender isn\'t installed, so models come without an .fbx, and their .blend files may still point at textures on this computer.' });
  }
  return { name: p.root.name, items: p.items, models: p.models, warnings, blender };
}

// ── Doing it ─────────────────────────────────────────────────────────────────

const MODEL_EXPORT_PY = String.raw`
import bpy, sys, os, json
blend, out_dir, name, want_fbx = sys.argv[sys.argv.index('--') + 1:][:4]
report = {'unbaked': [], 'fbx': False, 'blend': False, 'error': None}
try:
    bpy.ops.wm.open_mainfile(filepath=blend)
    # No .blend1 backups: saving twice below would leave one in the download.
    bpy.context.preferences.filepaths.save_version = 0
    tex_dir = os.path.join(out_dir, 'textures')
    # Point every texture at the copy in this download, so the saved .blend and
    # the .fbx both link textures/ by RELATIVE path.
    for img in bpy.data.images:
        if img.source != 'FILE' or not img.filepath:
            continue
        cand = os.path.join(tex_dir, os.path.basename(bpy.path.abspath(img.filepath)))
        if os.path.exists(cand):
            img.filepath = cand
    proc = ('ShaderNodeTexNoise', 'ShaderNodeTexVoronoi', 'ShaderNodeTexWave', 'ShaderNodeTexMusgrave',
            'ShaderNodeTexGradient', 'ShaderNodeTexMagic', 'ShaderNodeTexChecker', 'ShaderNodeTexBrick',
            'ShaderNodeMath', 'ShaderNodeVectorMath', 'ShaderNodeValToRGB', 'ShaderNodeBump', 'ShaderNodeMix')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    report['unbaked'] = sorted({sl.material.name for o in meshes for sl in o.material_slots
                                if sl.material and sl.material.use_nodes and not sl.material.get('ava_baked')
                                and any(n.bl_idname in proc for n in sl.material.node_tree.nodes)})
    # Save AS the downloaded file first, then make every link relative to it:
    # relative_remap alone only adjusts links that are already relative, and
    # Ava's bakes link textures by full path.
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, name + '.blend'), compress=True)
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_mainfile(compress=True)
    report['blend'] = True
    if want_fbx == '1':
        bpy.ops.export_scene.fbx(filepath=os.path.join(out_dir, name + '.fbx'), use_selection=False,
                                 apply_scale_options='FBX_SCALE_ALL', path_mode='RELATIVE', embed_textures=False)
        report['fbx'] = True
except Exception as e:
    report['error'] = str(e)
sys.stdout.write('\n@@AVA_EXPORT@@' + json.dumps(report) + '\n')
sys.stdout.flush()
`;

export async function exportModel(op: { label: string; folder: string; slug: string; to: string; name: string }, dest: string, blenderPath: string | null, warnings: ExportWarning[]): Promise<string[]> {
  const out = join(dest, op.to);
  await mkdir(out, { recursive: true });
  const written: string[] = [];
  // Textures first: Blender points the model at these copies.
  const tex = join(op.folder, 'textures');
  if (existsSync(tex)) {
    await mkdir(join(out, 'textures'), { recursive: true });
    for (const e of await readdir(tex, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      await copyFile(join(tex, e.name), join(out, 'textures', e.name));
      written.push(join(out, 'textures', e.name));
    }
  }
  const glb = join(op.folder, `${op.slug}.glb`);
  if (existsSync(glb)) { await copyFile(glb, join(out, `${op.name}.glb`)); written.push(join(out, `${op.name}.glb`)); }
  const blend = join(op.folder, `${op.slug}.blend`);
  if (!existsSync(blend)) { warnings.push({ item: op.label, message: 'Its Blender file is missing, so only the .glb and textures were included.' }); return written; }

  if (!blenderPath) {
    await copyFile(blend, join(out, `${op.name}.blend`));
    written.push(join(out, `${op.name}.blend`));
    // No Blender to export a fresh .fbx — but an .fbx made at build time
    // carries its textures inside, so it is still a working model file.
    const builtFbx = join(op.folder, `${op.slug}.fbx`);
    if (existsSync(builtFbx)) { await copyFile(builtFbx, join(out, `${op.name}.fbx`)); written.push(join(out, `${op.name}.fbx`)); }
    return written;
  }
  const script = join(tmpdir(), `ava-export-${randomUUID()}.py`);
  await writeFile(script, MODEL_EXPORT_PY, 'utf-8');
  let stdout = '';
  try {
    await new Promise<void>((resolve) => {
      const child = spawn(blenderPath, ['-b', '--factory-startup', '--disable-autoexec', '--python', script, '--', blend, out, op.name, '1'], { windowsHide: true });
      const timer = setTimeout(() => child.kill(), 300_000);
      child.stdout.on('data', (d) => { if (stdout.length < 200_000) stdout += d; });
      child.on('close', () => { clearTimeout(timer); resolve(); });
      child.on('error', () => { clearTimeout(timer); resolve(); });
    });
  } finally {
    await rm(script, { force: true }).catch(() => {});
  }
  const at = stdout.lastIndexOf('@@AVA_EXPORT@@');
  let report: { unbaked?: string[]; fbx?: boolean; blend?: boolean; error?: string | null } = {};
  try { report = at >= 0 ? JSON.parse(stdout.slice(at + 14).split(/\r?\n/)[0]) : {}; } catch { /* reported below */ }
  if (report.blend) written.push(join(out, `${op.name}.blend`));
  else {
    await copyFile(blend, join(out, `${op.name}.blend`));
    written.push(join(out, `${op.name}.blend`));
    warnings.push({ item: op.label, message: 'Blender couldn\'t re-save it, so the .blend is the original and may point at textures on this computer.' });
  }
  if (report.fbx) written.push(join(out, `${op.name}.fbx`));
  else warnings.push({ item: op.label, message: `No .fbx: Blender couldn't export it${report.error ? ` (${report.error})` : ''}.` });
  if (report.unbaked?.length) {
    warnings.push({ item: op.label, message: `Its look is still a live shader (${report.unbaked.join(', ')}), which doesn't export: engines will show it flat. Ask Ava to bake it, then download again.` });
  }
  return written;
}

/** Everything under a folder, for zipping, relative to it. */
async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await listFiles(p, base));
    else if (e.isFile()) out.push(relative(base, p));
  }
  return out;
}

const STORED = /\.(png|jpe?g|webp|gif|mp4|webm|mov|mp3|m4a|ogg|flac|zip|glb)$/i; // already compressed

/** Write a zip as it is made, waiting for the disk, so nothing has to fit in memory. */
async function zipFolder(src: string, zipPath: string, topName: string): Promise<void> {
  const out = createWriteStream(zipPath);
  const failed = new Promise<never>((_, reject) => out.on('error', reject));
  failed.catch(() => { /* raced below; this only keeps it from going unhandled */ });
  let wait: Promise<void> = Promise.resolve();
  const zip = new Zip((err, chunk, final) => {
    if (err) { out.destroy(err); return; }
    if (!out.write(Buffer.from(chunk))) wait = new Promise((r) => out.once('drain', () => r()));
    if (final) out.end();
  });
  const done = new Promise<void>((resolve) => out.on('finish', () => resolve()));
  for (const rel of await listFiles(src)) {
    const name = `${topName}/${rel.split(/[\\/]/).join('/')}`;
    const entry = STORED.test(rel) ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
    zip.add(entry);
    for await (const chunk of createReadStream(join(src, rel))) {
      entry.push(chunk as Uint8Array);
      await Promise.race([wait, failed]);
    }
    entry.push(new Uint8Array(0), true);
    await Promise.race([wait, failed]);
  }
  zip.end();
  await Promise.race([done, failed]);
}

/**
 * Download a folder into `destParent`: a new folder named after it, or a .zip
 * of that folder. Never overwrites: a name already there gets "-2".
 */
export async function exportFolder(folderId: string, destParent: string, opts: { zip?: boolean; onProgress?: ExportProgress; record?: boolean; store?: StoreId } = {}): Promise<ExportResult> {
  const profile = opts.store ? STORE_PROFILES.find((s) => s.id === opts.store) : undefined;
  if (opts.store && profile?.status === 'blocked') return { ok: false, warnings: [], error: profile.note };
  if (opts.store && STORE_WANTS_ZIP[opts.store]) opts = { ...opts, zip: true };
  const p = await plan(folderId);
  if (!p) return { ok: false, warnings: [], error: 'That folder no longer exists.' };
  if (!p.ops.length) return { ok: false, warnings: p.warnings, error: 'There is nothing in this folder that can be downloaded yet.' };
  const top = safeName(p.root.name, 'Folder');
  const blender = (await findBlender())?.path ?? null;
  const warnings = [...p.warnings];
  if (p.models && !blender) warnings.push({ item: 'Models', message: 'Blender isn\'t installed, so models come without an .fbx, and their .blend files may still point at textures on this computer.' });

  // A zip is built in a scratch folder first, then written as it is zipped.
  const stage = opts.zip ? await mkdtemp(join(tmpdir(), 'ava-pack-')) : destParent;
  let folderName = top;
  if (!opts.zip) for (let n = 2; existsSync(join(destParent, folderName)); n++) folderName = `${top}-${n}`;
  const root = join(stage, folderName);

  try {
    await mkdir(root, { recursive: true });
    let files = 0;
    let done = 0;
    for (const op of p.ops) {
      opts.onProgress?.(done, p.ops.length, op.kind === 'model' ? op.label : basename(op.to));
      if (op.kind === 'copy') {
        await mkdir(dirname(join(root, op.to)), { recursive: true });
        await copyFile(op.from, join(root, op.to));
        files++;
      } else {
        files += (await exportModel(op, root, blender, warnings)).length;
      }
      done++;
    }
    // The making record, on by default (plan, Phase 4): how each piece was made.
    if (opts.record !== false) {
      await writeFile(join(root, MAKING_RECORD_FILE), await buildMakingReport(p.root.name, p.pieces), 'utf-8');
      files++;
    }
    // Prepared for a store: its layout, its files, its checks (Phase 5).
    if (opts.store) {
      opts.onProgress?.(done, p.ops.length, `Preparing for ${profile?.name ?? opts.store}`);
      const lib = await libraryIndex();
      await prepareForStore(opts.store, {
        root, topName: folderName, pieces: p.pieces, blender,
        models: p.ops.filter((o): o is Extract<Op, { kind: 'model' }> => o.kind === 'model').map((o) => {
          const it = lib.get(`model_${o.slug}`);
          return { label: o.label, to: o.to, name: o.name, triangles: it?.triangles, sizeM: it?.sizeM };
        }),
        warn: (item, message) => warnings.push({ item, message }),
      });
      files = (await listFiles(root)).length;
    }
    opts.onProgress?.(done, p.ops.length, opts.zip ? 'Zipping' : 'Done');

    if (opts.zip) {
      let zipName = `${top}.zip`;
      for (let n = 2; existsSync(join(destParent, zipName)); n++) zipName = `${top}-${n}.zip`;
      await mkdir(destParent, { recursive: true });
      await zipFolder(root, join(destParent, zipName), folderName);
      const bytes = (await stat(join(destParent, zipName))).size;
      return { ok: true, path: join(destParent, zipName), files, bytes, warnings };
    }
    let bytes = 0;
    for (const rel of await listFiles(root)) bytes += (await stat(join(root, rel)).catch(() => ({ size: 0 }))).size;
    return { ok: true, path: root, files, bytes, warnings };
  } catch (err) {
    // A half-written folder is worse than none: it looks finished.
    if (!opts.zip) await rm(root, { recursive: true, force: true }).catch(() => {});
    return { ok: false, warnings, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (opts.zip) await rm(stage, { recursive: true, force: true }).catch(() => {});
  }
}
