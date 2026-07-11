// ─── Local creative store (host-side) ────────────────────────────────────────
//
// Local-first storage for Creative Studio output, mirroring the IDE's
// creative-gallery: binaries live under <accountScopedDir>/creative/<kind-dir>/
// and metadata.json is the source of truth the Library Assets tab reads.
//
// No cloud. Everything Creative Studio generates is saved here and stays on the
// machine, account-scoped (~/.ava/users/<id>/creative/), so it travels with the
// local data export and never touches a bucket.

import { writeFile, readFile, mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

export type CreativeKind = 'image' | 'video' | 'music' | 'voice' | 'sfx';

/** One stored creative asset. `path` is relative to the creative dir so the
 *  host can build a webview URI for display; `absolutePath` is for delete. */
export interface LocalCreativeItem {
  id: string;
  kind: CreativeKind;
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
  args: { url: string; kind: CreativeKind; prompt?: string; title?: string; id?: string; designType?: string },
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
    };
    const items = await readLocalCreative(scopedDir);
    await writeLocalCreative(scopedDir, [item, ...items.filter((i) => i.id !== id)]);
    return item;
  } catch {
    return null;
  }
}

/** Delete a stored asset (file + metadata entry). Best-effort. */
export async function deleteLocalCreative(scopedDir: string, id: string): Promise<void> {
  const items = await readLocalCreative(scopedDir);
  const item = items.find((i) => i.id === id);
  if (!item) return;
  try { await rm(item.absolutePath, { force: true }); } catch { /* already gone */ }
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
    try { await rm(it.absolutePath, { force: true }); } catch { /* already gone */ }
  }
  await writeLocalCreative(scopedDir, items.filter((i) => !kill.has(i.id))).catch(() => {});
  return doomed.length;
}
