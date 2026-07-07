// ─── Local creative store (host-side) ────────────────────────────────────────
//
// Local-first storage for Creative Studio output, mirroring the IDE's
// creative-gallery: binaries live under <accountScopedDir>/creative/<kind-dir>/
// and metadata.json is the source of truth the Library Assets tab reads.
//
// No cloud. Everything Creative Studio generates is saved here and stays on the
// machine, account-scoped (~/.ava/users/<id>/creative/), so it travels with the
// local data export and never touches a bucket.

import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
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
  path: string;          // e.g. "images/image_123.jpg"
  absolutePath: string;
  prompt: string;
  title: string;
  createdAt: string;
}

const KIND_DIR: Record<CreativeKind, string> = {
  image: 'images', video: 'video', music: 'audio', voice: 'voice', sfx: 'sfx',
};
const KIND_EXT: Record<CreativeKind, string> = {
  image: 'jpg', video: 'mp4', music: 'mp3', voice: 'mp3', sfx: 'mp3',
};

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
    const rel = `${KIND_DIR[kind]}/${id}.${KIND_EXT[kind]}`;
    const abs = join(creativeDir(scopedDir), rel);
    await mkdir(join(creativeDir(scopedDir), KIND_DIR[kind]), { recursive: true });

    let bytes: Buffer;
    if (args.url.startsWith('data:')) {
      bytes = Buffer.from(args.url.split(',')[1] ?? '', 'base64');
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
