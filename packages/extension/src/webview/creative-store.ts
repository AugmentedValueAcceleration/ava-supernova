// ─── Local creative store (host-side) ────────────────────────────────────────
//
// Local-first storage for Creative Studio output, mirroring the IDE's
// creative-gallery: binaries live under <accountScopedDir>/creative/<kind-dir>/
// and metadata.json is the source of truth the Library Assets tab reads.
//
// No cloud. Everything Creative Studio generates is saved here and stays on the
// machine, account-scoped (~/.ava/users/<id>/creative/), so it travels with the
// local data export and never touches a bucket.

import { writeFile, readFile, mkdir, rm, stat, readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { copyWorkToProject, projectAssetDir } from '@ava/core';

export type CreativeKind = 'image' | 'video' | 'music' | 'voice' | 'sfx';

/** One stored creative asset. `path` is relative to the creative dir so the
 *  host can build a webview URI for display; `absolutePath` is for delete. */
export interface LocalCreativeItem {
  id: string;
  // 'model' items are written by core (design_build_model), never by
  // saveLocalCreative — hence not in CreativeKind.
  kind: CreativeKind | 'model' | 'gimp';
  // Fine-grained Design Studio type ('icon' | 'image' | 'logo' | 'game-sprite'
  // …). Optional — legacy assets and non-studio saves have only `kind`. The
  // Library uses it to sort assets into the same bucket they were made in.
  designType?: string;
  path: string;          // e.g. "images/image_123.webp"
  absolutePath: string;
  prompt: string;
  title: string;
  createdAt: string;
  // On-disk size in bytes. Stamped at save so the Library storage view can
  // total usage per type without stat-ing every file. Optional for legacy items.
  bytes?: number;
  // ── 3D models (kind 'model', written by core's design_build_model) ──
  // A model is ONE asset that is a whole folder (creative/blender/<slug>/):
  // .blend, .glb, .fbx, preview.png, the scripts, versions/. `path` points at
  // its preview so the Library shows the picture; these carry the rest.
  folder?: string;          // "blender/<slug>"
  absoluteFolder?: string;
  glb?: string;             // "blender/<slug>/<slug>.glb"
  files?: string[];
  triangles?: number;
  sizeM?: number[];
  blenderVersion?: string;
  updatedAt?: string;
  // ── GIMP work (kind 'gimp', written by core's design_build_image): same
  // shape, its folder under creative/gimp/.
  imageCount?: number;
  gimpVersion?: string;
  // ── How it was made, for the making record (Library folders and packs plan,
  // 9 Nov 2026). 'generated' = an AI model made it (aiModel names which);
  // 'composed' = built by code from shapes and fonts, as the Logo room does.
  // Absent on anything saved before 9 Nov: unknown, and said so, never guessed.
  // 'uploaded' = their own file, brought in with Upload (core's library-upload).
  origin?: 'generated' | 'composed' | 'uploaded';
  aiModel?: string;
  aiProvider?: string;
  hasPreview?: boolean;
}

/** How a saved asset was made. See LocalCreativeItem.origin. */
export interface CreativeOrigin { origin: 'generated' | 'composed'; aiModel?: string; aiProvider?: string }

/** The model's folder, but ONLY if it really sits inside this creative dir —
 *  a hand-edited metadata.json must never point a delete somewhere else. */
export function modelFolder(scopedDir: string, item: LocalCreativeItem): string | null {
  if ((item.kind !== 'model' && item.kind !== 'gimp') || !item.absoluteFolder) return null;
  // A model they uploaded has its own folder under uploads/ (core's library-upload).
  const roots = item.kind === 'gimp' ? ['gimp'] : ['blender', 'uploads'];
  const folder = resolve(item.absoluteFolder);
  return roots.some((r) => folder.toLowerCase().startsWith((resolve(join(creativeDir(scopedDir), r)) + sep).toLowerCase())) ? folder : null;
}

async function folderBytes(dir: string): Promise<number> {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? await folderBytes(p) : (await stat(p).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

const KIND_DIR: Record<CreativeKind, string> = {
  image: 'images', video: 'video', music: 'music', voice: 'voice', sfx: 'sfx',
};

// Each asset TYPE gets its own folder in the creative dir — icons, logos, and
// every design type live apart instead of piling into a generic images/ folder,
// so browsing the folder on disk mirrors the Library. Falls back to the kind's
// folder for non-Studio saves (legacy, chat images).
const DESIGN_DIR: Record<string, string> = {
  icon: 'icons', iconset: 'icons', appicon: 'app-icons', logo: 'logos',
  badge: 'badges', avatar: 'avatars', banner: 'banners', hero: 'hero',
  ogimage: 'social-images', illustration: 'illustrations', pattern: 'patterns',
  image: 'images', video: 'video', voice: 'voice',
};
function folderFor(kind: CreativeKind, designType?: string): string {
  const dt = (designType || '').toLowerCase().trim();
  if (dt) return DESIGN_DIR[dt] ?? dt.replace(/[^a-z0-9-]+/g, '-'); // game-* etc. get their own folder by id
  return KIND_DIR[kind] || 'images';
}
const KIND_EXT: Record<CreativeKind, string> = {
  image: 'jpg', video: 'mp4', music: 'mp3', voice: 'mp3', sfx: 'mp3',
};

// Map a data-URL mime to a file extension so the on-disk name matches the
// actual bytes (WebP saves land as .webp, not a mislabelled .jpg). Returns null
// for remote urls / unknown mimes, in which case the caller falls back to the
// kind's default extension.
const MIME_EXT: Record<string, string> = {
  'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/gif': 'gif', 'image/svg+xml': 'svg',
  'video/mp4': 'mp4', 'video/webm': 'webm',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
};
function dataUrlExt(url: string): string | null {
  const m = /^data:([a-z0-9.+/-]+)[;,]/i.exec(url);
  return m ? (MIME_EXT[m[1].toLowerCase()] ?? null) : null;
}

const creativeDir = (scopedDir: string): string => join(scopedDir, 'creative');
const metadataPath = (scopedDir: string): string => join(creativeDir(scopedDir), 'metadata.json');

/** Read the local gallery (newest-first as stored). Empty array when none. */
export async function readLocalCreative(scopedDir: string): Promise<LocalCreativeItem[]> {
  try {
    const raw = await readFile(metadataPath(scopedDir), 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalCreative(scopedDir: string, items: LocalCreativeItem[]): Promise<void> {
  await mkdir(creativeDir(scopedDir), { recursive: true });
  await writeFile(metadataPath(scopedDir), JSON.stringify(items, null, 2), 'utf-8');
}

/** Read the gallery, backfilling on-disk byte sizes for any item saved before
 *  sizes were stamped (stat the file once, then persist so it's a one-time cost).
 *  This is what the storage view reads, so pre-existing assets count correctly. */
export async function readLocalCreativeSized(scopedDir: string): Promise<LocalCreativeItem[]> {
  const items = await readLocalCreative(scopedDir);
  let changed = false;
  for (const it of items) {
    // A model's folder changes whenever it is opened and saved in Blender by
    // hand, so its size is measured every time rather than trusted.
    const folder = modelFolder(scopedDir, it);
    if (folder) {
      const b = await folderBytes(folder);
      if (b !== it.bytes) { it.bytes = b; changed = true; }
      continue;
    }
    if (typeof it.bytes === 'number') continue;
    try { it.bytes = (await stat(it.absolutePath)).size; changed = true; } catch { /* file gone */ }
  }
  if (changed) await writeLocalCreative(scopedDir, items).catch(() => {});
  return items;
}

/** Save a freshly-generated asset locally: decode/download the bytes, write the
 *  file under the account-scoped creative dir, and prepend it to metadata.
 *  Returns the stored item, or null on failure. */
export async function saveLocalCreative(
  scopedDir: string,
  args: { url: string; kind: CreativeKind; prompt?: string; title?: string; id?: string; designType?: string; made?: CreativeOrigin },
): Promise<LocalCreativeItem | null> {
  try {
    const kind = (KIND_DIR[args.kind] ? args.kind : 'image') as CreativeKind;
    const id = args.id ?? `${kind}_${Date.now()}`;
    const ext = dataUrlExt(args.url) ?? KIND_EXT[kind];
    const dir = folderFor(kind, args.designType);   // per-type folder (icons/, logos/, …)
    const rel = `${dir}/${id}.${ext}`;
    const abs = join(creativeDir(scopedDir), rel);
    await mkdir(join(creativeDir(scopedDir), dir), { recursive: true });

    let bytes: Buffer;
    if (args.url.startsWith('data:')) {
      // Data URLs come two ways: `;base64,<b64>` (raster) OR `,<url-encoded>`
      // (SVG logos are URL-encoded text, not base64). Decode by which it is —
      // base64-decoding URL-encoded text silently produced a corrupt file.
      const comma = args.url.indexOf(',');
      const meta = args.url.slice(5, comma);
      const payload = args.url.slice(comma + 1);
      bytes = /;base64/i.test(meta)
        ? Buffer.from(payload, 'base64')
        : Buffer.from(decodeURIComponent(payload), 'utf-8');
    } else {
      const res = await fetch(args.url);
      if (!res.ok) return null;
      bytes = Buffer.from(await res.arrayBuffer());
    }
    await writeFile(abs, bytes);

    const item: LocalCreativeItem = {
      id,
      kind,
      designType: args.designType,
      path: rel,
      absolutePath: abs,
      prompt: args.prompt ?? '',
      title: args.title ?? '',
      createdAt: new Date().toISOString(),
      bytes: bytes.length,
      ...(args.made ? { origin: args.made.origin, ...(args.made.aiModel ? { aiModel: args.made.aiModel } : {}), ...(args.made.aiProvider ? { aiProvider: args.made.aiProvider } : {}) } : {}),
    };
    const items = await readLocalCreative(scopedDir);
    await writeLocalCreative(scopedDir, [item, ...items.filter((i) => i.id !== id)]);
    return item;
  } catch {
    return null;
  }
}

/** Rename a stored asset. Only the metadata `title` changes — the file on disk
 *  keeps its generated name, so every path already handed out (to the Library,
 *  to Ava via browse_library, or copied into a project) stays valid. Renaming
 *  the file itself would silently break those. Returns the new title, or null
 *  if the id is unknown / the title is empty. */
export async function renameLocalCreative(scopedDir: string, id: string, title: string): Promise<string | null> {
  const next = title.trim();
  if (!next) return null;
  const items = await readLocalCreative(scopedDir);
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  item.title = next;
  await writeLocalCreative(scopedDir, items).catch(() => {});
  return next;
}

/**
 * Copy a Studio asset into the user's project so it can actually be used in
 * code — the Studio library lives account-scoped outside any project, so a
 * reference to it would only work on this machine.
 *
 * Destination follows the project's OWN convention: the first of public/,
 * src/assets/, assets/, static/, images/ that already exists, falling back to
 * creating images/. Deliberately NOT <project>/.ava/creative — that's
 * gitignored, so the asset would work locally and vanish for everyone else.
 *
 * Returns the project-relative path (forward slashes), ready to paste into
 * code, or null if there's no project open.
 */
export async function copyCreativeToProject(
  scopedDir: string,
  id: string,
  projectRoot: string,
): Promise<{ relPath: string; absPath: string; warnings: string[] } | null> {
  const items = await readLocalCreative(scopedDir);
  const item = items.find((i) => i.id === id);
  if (!item || !projectRoot) return null;

  // Models and GIMP work are folders. Core copies their FINISHED files only,
  // made the way a folder download makes them, into the place the project's
  // engine looks (Unity Assets/, Unreal Content/, Godot assets/) — never Ava's
  // briefs, scripts, history or tests, and never a .blend that still points
  // at textures in ~/.ava. Shared with the IDE.
  if (modelFolder(scopedDir, item)) {
    const r = await copyWorkToProject({ id: item.id, kind: item.kind, title: item.title, absoluteFolder: item.absoluteFolder }, projectRoot);
    if (!r.ok || !r.relPath || !r.absPath) throw new Error(r.error ?? 'Nothing could be copied.');
    return { relPath: r.relPath, absPath: r.absPath, warnings: r.warnings.map((w) => w.message) };
  }

  // One file. Same destination rules: the engine's folder, else the
  // project's own convention (public/, src/assets/, assets/, static/,
  // images/). Deliberately NOT <project>/.ava/creative — that's gitignored,
  // so the asset would work locally and vanish for everyone else.
  const { dir: destDir } = await projectAssetDir(projectRoot);

  // Name it after the user's title where we can — that's the name they gave it
  // — but keep the original extension, and never clobber an existing file.
  const ext = item.path.slice(item.path.lastIndexOf('.'));
  const base = (item.title || 'asset')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'asset';

  let filename = `${base}${ext}`;
  let n = 2;
  for (;;) {
    try {
      await stat(join(destDir, filename));
      filename = `${base}-${n++}${ext}`; // taken — try the next
    } catch {
      break; // free
    }
  }

  const absPath = join(destDir, filename);
  const data = await readFile(item.absolutePath);
  await writeFile(absPath, data);

  const relPath = absPath.slice(projectRoot.length + 1).replace(/\\/g, '/');
  return { relPath, absPath, warnings: [] };
}

/** Delete a stored asset (file + metadata entry). Best-effort. */
export async function deleteLocalCreative(scopedDir: string, id: string): Promise<void> {
  const items = await readLocalCreative(scopedDir);
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const folder = modelFolder(scopedDir, item);
  try { await rm(folder ?? item.absolutePath, { force: true, recursive: !!folder }); } catch { /* already gone */ }
  await writeLocalCreative(scopedDir, items.filter((i) => i.id !== id)).catch(() => {});
}

/** Bulk-delete stored assets by id (files + metadata entries). Best-effort per
 *  file. Returns how many metadata entries were removed. */
export async function pruneLocalCreative(scopedDir: string, ids: string[]): Promise<number> {
  const kill = new Set(ids);
  if (kill.size === 0) return 0;
  const items = await readLocalCreative(scopedDir);
  const doomed = items.filter((i) => kill.has(i.id));
  for (const it of doomed) {
    const folder = modelFolder(scopedDir, it);
    try { await rm(folder ?? it.absolutePath, { force: true, recursive: !!folder }); } catch { /* already gone */ }
  }
  await writeLocalCreative(scopedDir, items.filter((i) => !kill.has(i.id))).catch(() => {});
  return doomed.length;
}
