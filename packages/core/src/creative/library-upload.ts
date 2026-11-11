/**
 * Their own files, brought into the Library (Library folders and packs plan,
 * Phase 1, 9 Nov 2026): professionals make work by hand, and a pack is often
 * part theirs, part Ava's. An upload is COPIED into ~/.ava/creative/uploads/,
 * so the Library never depends on where it came from, and it is recorded as
 * the person's own work (origin 'uploaded') — the opposite of AI-generated,
 * which the making record and the store disclosures rely on.
 *
 * A 3D model gets its own folder, like the models Ava builds, and a preview
 * rendered by Blender when Blender is here. Without Blender it has no picture,
 * and the card shows its kind instead.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, normalize } from 'node:path';
import { creativeDir, metadataFile, modelSlug } from '../tools/blender/paths.js';
import { findBlender } from '../tools/blender/find-blender.js';

export const UPLOAD_KINDS: Record<string, 'image' | 'video' | 'music' | 'model'> = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', svg: 'image',
  mp4: 'video', webm: 'video', mov: 'video',
  mp3: 'music', wav: 'music', ogg: 'music', m4a: 'music', flac: 'music',
  glb: 'model', gltf: 'model', fbx: 'model', obj: 'model', blend: 'model',
};
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const PREVIEW_TIMEOUT_MS = 120_000;

export interface UploadOutcome { source: string; ok: boolean; id?: string; error?: string; /** Said, not hidden: a side file that could not come with it. */ note?: string }

const uploadsDir = () => join(creativeDir(), 'uploads');

async function addEntry(entry: Record<string, unknown>): Promise<void> {
  let items: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(await readFile(metadataFile(), 'utf-8'));
    if (Array.isArray(parsed)) items = parsed;
  } catch { /* none yet */ }
  await mkdir(creativeDir(), { recursive: true });
  await writeFile(metadataFile(), JSON.stringify([entry, ...items.filter((i) => i.id !== entry.id)], null, 2), 'utf-8');
}

const titleOf = (file: string) => basename(file, extname(file)).replace(/[-_]+/g, ' ').trim() || 'Untitled';

/** Copy each file into the Library. One bad file never stops the rest. */
export async function uploadToLibrary(sources: string[]): Promise<UploadOutcome[]> {
  const out: UploadOutcome[] = [];
  // One at a time: every upload rewrites the Library index.
  for (const source of sources) out.push(await uploadOne(source).catch((e) => ({ source, ok: false, error: e instanceof Error ? e.message : String(e) })));
  return out;
}

async function uploadOne(source: string): Promise<UploadOutcome> {
  const ext = extname(source).slice(1).toLowerCase();
  const kind = UPLOAD_KINDS[ext];
  if (!kind) {
    return { source, ok: false, error: `".${ext || '?'}" files can't go in the Library yet. It takes images (PNG, JPEG, WebP, GIF, SVG), video (MP4, WebM, MOV), audio (MP3, WAV, OGG, M4A, FLAC) and 3D models (GLB, glTF, FBX, OBJ, .blend).` };
  }
  const size = (await stat(source).catch(() => null))?.size;
  if (size === undefined) return { source, ok: false, error: 'That file could not be read.' };
  if (size > MAX_UPLOAD_BYTES) return { source, ok: false, error: 'That file is over 2 GB.' };

  const at = new Date().toISOString();
  const title = titleOf(source);
  const common = { title, prompt: '', createdAt: at, updatedAt: at, origin: 'uploaded', originalName: basename(source) };

  if (kind !== 'model') {
    const id = `upload_${Date.now()}_${randomUUID().slice(0, 6)}`;
    const rel = `uploads/${id}.${ext}`;
    const abs = join(creativeDir(), rel);
    await mkdir(uploadsDir(), { recursive: true });
    await copyFile(source, abs);
    await addEntry({ id, kind, designType: kind === 'music' ? 'voice' : kind, path: rel, absolutePath: abs, bytes: size, ...common });
    return { source, ok: true, id };
  }

  // A model is a folder, like the ones Ava builds: the file, and a preview.
  let slug = modelSlug(title) || 'model';
  for (let n = 2; existsSync(join(uploadsDir(), slug)); n++) slug = `${modelSlug(title) || 'model'}-${n}`;
  const folder = join(uploadsDir(), slug);
  await mkdir(folder, { recursive: true });
  const fileName = `${slug}.${ext}`;
  await copyFile(source, join(folder, fileName));
  // A .gltf names its .bin and textures, an .obj its .mtl (which names its
  // textures), and an .fbx may keep textures in a <name>.fbm folder. Copied
  // alone, they arrive without them. Side files keep their own names and
  // places, because the model finds them by name.
  const missed = await copySideFiles(source, ext, folder);
  const preview = await renderPreview(join(folder, fileName), join(folder, 'preview.png')).catch(() => false);
  const id = `upload_${slug}`;
  await addEntry({
    id, kind: 'model', designType: 'model',
    // `path` is the picture the card shows; without one it points at the model
    // itself and the surfaces show the model's kind instead of a broken image.
    path: preview ? `uploads/${slug}/preview.png` : `uploads/${slug}/${fileName}`,
    absolutePath: join(folder, preview ? 'preview.png' : fileName),
    folder: `uploads/${slug}`, absoluteFolder: folder,
    ...(ext === 'glb' ? { glb: `uploads/${slug}/${fileName}` } : {}),
    files: preview ? [fileName, 'preview.png'] : [fileName],
    bytes: size, hasPreview: preview, ...common,
  });
  return { source, ok: true, id, ...(missed.length ? { note: `${basename(source)}: ${missed.length === 1 ? 'one file it uses' : `${missed.length} files it uses`} could not come with it (${missed.slice(0, 3).join(', ')}${missed.length > 3 ? ', …' : ''}). Put ${missed.length === 1 ? 'it' : 'them'} beside the model and upload again, or use a .glb or .blend, which carry everything inside.` } : {}) };
}

// ── Side files: what a model file names ──────────────────────────────────────

/** A reference that can be copied keeping its place: relative, and inside the model's own folder. */
function safeRef(ref: string): string | null {
  if (!ref || /^[a-z]+:/i.test(ref) || isAbsolute(ref)) return null;
  const n = normalize(ref);
  return n.startsWith('..') ? null : n;
}

async function copyRef(from: string, ref: string, to: string, missed: string[]): Promise<void> {
  const rel = safeRef(ref);
  if (!rel) { if (!/^data:/i.test(ref)) missed.push(ref); return; }
  const src = join(dirname(from), rel);
  if (!existsSync(src)) { missed.push(ref); return; }
  await mkdir(dirname(join(to, rel)), { recursive: true });
  await copyFile(src, join(to, rel));
}

async function copySideFiles(source: string, ext: string, folder: string): Promise<string[]> {
  const missed: string[] = [];
  try {
    if (ext === 'gltf') {
      const g = JSON.parse(await readFile(source, 'utf-8')) as { buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }> };
      for (const r of [...(g.buffers ?? []), ...(g.images ?? [])]) if (r.uri) await copyRef(source, decodeURIComponent(r.uri), folder, missed);
    } else if (ext === 'obj') {
      const text = await readFile(source, 'utf-8');
      for (const line of text.split(/\r?\n/)) {
        const m = /^\s*mtllib\s+(.+?)\s*$/.exec(line);
        if (!m) continue;
        const mtl = m[1];
        await copyRef(source, mtl, folder, missed);
        const mtlPath = join(dirname(source), safeRef(mtl) ?? '');
        if (!safeRef(mtl) || !existsSync(mtlPath)) continue;
        // Texture lines end with the file, after any options (-bm 1 …).
        for (const t of (await readFile(mtlPath, 'utf-8')).split(/\r?\n/)) {
          const tm = /^\s*(map_\w+|bump|disp|decal|refl|norm)\s+(.+?)\s*$/i.exec(t);
          if (!tm) continue;
          const parts = tm[2].split(/\s+/);
          const file = parts[parts.length - 1];
          const relToMtl = join(dirname(safeRef(mtl)!), file);
          await copyRef(source, relToMtl, folder, missed);
        }
      }
    } else if (ext === 'fbx') {
      const fbm = join(dirname(source), `${basename(source, extname(source))}.fbm`);
      if (existsSync(fbm)) {
        const { cp } = await import('node:fs/promises');
        await cp(fbm, join(folder, basename(fbm)), { recursive: true });
      }
    }
  } catch { /* an unreadable model file: it still came in; the preview will say if it is broken */ }
  return [...new Set(missed)];
}

// ── A preview for an uploaded model, when Blender is here ────────────────────

const PREVIEW_PY = String.raw`
import bpy, sys, os, math
from mathutils import Vector
src, out = sys.argv[sys.argv.index('--') + 1:][:2]
ext = os.path.splitext(src)[1].lower()
if ext == '.blend':
    bpy.ops.wm.open_mainfile(filepath=src)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=src)
    elif ext == '.fbx': bpy.ops.import_scene.fbx(filepath=src)
    elif ext == '.obj': bpy.ops.wm.obj_import(filepath=src)
scene = bpy.context.scene
meshes = [o for o in scene.objects if o.type == 'MESH']
if not meshes: sys.exit(3)
lo = [math.inf] * 3; hi = [-math.inf] * 3
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        for i in range(3): lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
c = Vector([(hi[i] + lo[i]) / 2 for i in range(3)]); size = max(hi[i] - lo[i] for i in range(3)) or 1.0
cam_data = bpy.data.cameras.new('AvaPreviewCam'); cam = bpy.data.objects.new('AvaPreviewCam', cam_data)
scene.collection.objects.link(cam)
cam.location = c + Vector((1.0, -1.25, 0.8)).normalized() * size * 2.6
cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam_data.clip_end = size * 100
scene.camera = cam
for nm, rot, energy in (('AvaKey', (0.9, 0.2, 0.8), 4.0), ('AvaFill', (1.1, -0.3, -2.4), 1.5)):
    ld = bpy.data.lights.new(nm, 'SUN'); ld.energy = energy
    lo_ = bpy.data.objects.new(nm, ld); lo_.rotation_euler = rot; scene.collection.objects.link(lo_)
if scene.world is None: scene.world = bpy.data.worlds.new('AvaPreviewWorld')
r = scene.render
r.resolution_x = r.resolution_y = 768; r.resolution_percentage = 100; r.film_transparent = True
r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'; r.filepath = out
bpy.ops.render.render(write_still=True)
`;

async function renderPreview(model: string, out: string): Promise<boolean> {
  const blender = await findBlender();
  if (!blender) return false;
  const script = join(tmpdir(), `ava-upload-preview-${randomUUID()}.py`);
  await writeFile(script, PREVIEW_PY, 'utf-8');
  try {
    // --disable-autoexec: their file's own scripts never run.
    await new Promise<void>((resolve) => {
      const child = spawn(blender.path, ['-b', '--factory-startup', '--disable-autoexec', '--python', script, '--', model, out], { windowsHide: true });
      const timer = setTimeout(() => child.kill(), PREVIEW_TIMEOUT_MS);
      child.on('close', () => { clearTimeout(timer); resolve(); });
      child.on('error', () => { clearTimeout(timer); resolve(); });
    });
    return existsSync(out);
  } finally {
    await rm(script, { force: true }).catch(() => {});
  }
}
