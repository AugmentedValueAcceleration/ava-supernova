/**
 * Library folders (Phase 1): names, not disk folders. Files never move, one
 * piece can sit in several folders, deleting a folder never deletes work, and
 * work that leaves the Library leaves its folders — but a half-read Library
 * index can never empty a folder, and a project file on an unplugged drive is
 * never cleared. Always in a scratch folder (AVA_CREATIVE_DIR).
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readFolders, createFolder, renameFolder, moveFolder, deleteFolder, addToFolder, removeFromFolder, setMemberPick, missingFiles, foldersFile,
  type LibraryFolder,
} from '../src/creative/library-folders.js';
import { uploadToLibrary } from '../src/creative/library-upload.js';
import { findBlender } from '../src/tools/blender/find-blender.js';

const blender = await findBlender();
let scratch: string;
const creative = () => process.env.AVA_CREATIVE_DIR!;
const library = (ids: string[]) => writeFile(join(creative(), 'metadata.json'), JSON.stringify(ids.map((id) => ({ id, kind: 'image' }))));
const ok = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => { if (!r.ok) throw new Error(r.error); return r.value; };

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'ava-folders-'));
  process.env.AVA_CREATIVE_DIR = join(scratch, 'creative');
  await mkdir(creative(), { recursive: true });
});
afterAll(() => { delete process.env.AVA_CREATIVE_DIR; });

describe('making and naming folders', () => {
  it('creates, nests and renames', async () => {
    const pack = ok(await createFolder('  Fantasy   UI Pack '));
    expect(pack.name).toBe('Fantasy UI Pack');
    const icons = ok(await createFolder('Icons', pack.id));
    expect(icons.parentId).toBe(pack.id);
    ok(await renameFolder(icons.id, 'Stat Icons'));
    expect((await readFolders()).map((f) => f.name).sort()).toEqual(['Fantasy UI Pack', 'Stat Icons']);
  });

  it('refuses a clash at the same level, but not in a different folder', async () => {
    const a = ok(await createFolder('Props'));
    expect((await createFolder('props')).ok).toBe(false);
    expect((await createFolder('Props', a.id)).ok).toBe(true);
  });

  it('refuses names a real folder could not have', async () => {
    for (const bad of ['', '   ', 'a/b', 'what?', '..', 'x'.repeat(81)]) expect((await createFolder(bad)).ok).toBe(false);
  });

  it('a folder never goes inside itself, however deep', async () => {
    const a = ok(await createFolder('A'));
    const b = ok(await createFolder('B', a.id));
    const c = ok(await createFolder('C', b.id));
    expect(await moveFolder(a.id, c.id)).toMatchObject({ ok: false, error: expect.stringContaining('itself') });
    expect((await moveFolder(c.id, null)).ok).toBe(true);
  });
});

describe('what is in a folder', () => {
  it('one piece can be in several folders, and taking it out leaves the work alone', async () => {
    await library(['image_1', 'gimp_icons']);
    const a = ok(await createFolder('A'));
    const b = ok(await createFolder('B'));
    ok(await addToFolder(a.id, [{ ref: 'creative:image_1' }, { ref: 'creative:gimp_icons', pick: ['final/heart.png'] }]));
    ok(await addToFolder(b.id, [{ ref: 'creative:image_1' }]));
    ok(await removeFromFolder(a.id, ['creative:image_1']));
    const all = await readFolders();
    expect(all.find((f) => f.id === a.id)!.members.map((m) => m.ref)).toEqual(['creative:gimp_icons']);
    expect(all.find((f) => f.id === b.id)!.members.map((m) => m.ref)).toEqual(['creative:image_1']);
    expect(JSON.parse(await readFile(join(creative(), 'metadata.json'), 'utf-8'))).toHaveLength(2);
  });

  it('choosing which designs of a set are in, and adding the whole work again means the whole work', async () => {
    await library(['gimp_icons']);
    const a = ok(await createFolder('A'));
    ok(await addToFolder(a.id, [{ ref: 'creative:gimp_icons', pick: ['final/heart.png'] }]));
    ok(await addToFolder(a.id, [{ ref: 'creative:gimp_icons', pick: ['final/star.png'] }]));
    expect((await readFolders())[0].members[0].pick).toEqual(['final/heart.png', 'final/star.png']);
    ok(await setMemberPick(a.id, 'creative:gimp_icons', []));
    expect((await readFolders())[0].members[0].pick).toBeUndefined();
  });

  it('refuses anything that is not Library work or a file', async () => {
    const a = ok(await createFolder('A'));
    expect((await addToFolder(a.id, [{ ref: 'http://example.com/x.png' }])).ok).toBe(false);
  });
});

describe('deleting', () => {
  it('deleting a folder never deletes work, and its folders move up rather than vanish', async () => {
    await library(['image_1']);
    const top = ok(await createFolder('Top'));
    const mid = ok(await createFolder('Mid', top.id));
    ok(await createFolder('Low', mid.id));
    ok(await createFolder('Low', top.id)); // will clash when Mid's "Low" moves up
    ok(await addToFolder(mid.id, [{ ref: 'creative:image_1' }]));
    expect(ok(await deleteFolder(mid.id))).toEqual({ movedUp: 1 });
    const all = await readFolders();
    expect(all.filter((f) => f.parentId === top.id).map((f) => f.name).sort()).toEqual(['Low', 'Low (2)']);
    expect(existsSync(join(creative(), 'metadata.json'))).toBe(true);
  });

  it('work removed from the Library leaves its folders', async () => {
    await library(['image_1', 'image_2', 'logo_17_primary', 'logo_17_favicon']);
    const a = ok(await createFolder('A'));
    ok(await addToFolder(a.id, [{ ref: 'creative:image_1' }, { ref: 'creative:image_2' }, { ref: 'logo:logo_17' }]));
    await library(['image_2']);
    expect((await readFolders())[0].members.map((m) => m.ref)).toEqual(['creative:image_2']);
  });

  it('a Library index that cannot be read never empties a folder', async () => {
    await library(['image_1']);
    const a = ok(await createFolder('A'));
    ok(await addToFolder(a.id, [{ ref: 'creative:image_1' }]));
    await writeFile(join(creative(), 'metadata.json'), '[{"id": "image_1", "ki'); // caught mid-write
    expect((await readFolders())[0].members).toHaveLength(1);
  });

  it('a project file that is missing is reported, never cleared', async () => {
    const gone = join(scratch, 'unplugged-drive', 'art.png');
    const a = ok(await createFolder('A'));
    ok(await addToFolder(a.id, [{ ref: `file:${gone}` }]));
    const [folder] = await readFolders();
    expect(folder.members).toHaveLength(1);
    expect(missingFiles(folder as LibraryFolder)).toEqual([gone]);
  });
});

describe('the file itself', () => {
  it('changes made at once all land', async () => {
    const made = await Promise.all(Array.from({ length: 12 }, (_, i) => createFolder(`F${i}`)));
    expect(made.every((r) => r.ok)).toBe(true);
    expect(await readFolders()).toHaveLength(12);
    expect(JSON.parse(await readFile(foldersFile(), 'utf-8')).version).toBe(1);
  });
});

describe('their own files', () => {
  it('copies images, video and audio into the Library as their own work', async () => {
    const src = join(scratch, 'mine');
    await mkdir(src, { recursive: true });
    await writeFile(join(src, 'hand_drawn-sword.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
    await writeFile(join(src, 'theme.mp3'), 'id3');
    await writeFile(join(src, 'notes.docx'), 'x');
    const res = await uploadToLibrary([join(src, 'hand_drawn-sword.png'), join(src, 'theme.mp3'), join(src, 'notes.docx'), join(src, 'nope.png')]);
    expect(res.map((r) => r.ok)).toEqual([true, true, false, false]);
    expect(res[2].error).toContain("can't go in the Library");
    const items = JSON.parse(await readFile(join(creative(), 'metadata.json'), 'utf-8')) as Array<Record<string, unknown>>;
    const sword = items.find((i) => i.originalName === 'hand_drawn-sword.png')!;
    expect(sword).toMatchObject({ kind: 'image', origin: 'uploaded', title: 'hand drawn sword' });
    expect(existsSync(String(sword.absolutePath))).toBe(true);
    expect(items.find((i) => i.originalName === 'theme.mp3')).toMatchObject({ kind: 'music', origin: 'uploaded' });
  });

  it.skipIf(!blender)('a 3D model gets its own folder and a preview from Blender', async () => {
    // Make a real .glb with Blender, then upload it.
    const { spawnSync } = await import('node:child_process');
    const glb = join(scratch, 'crate.glb');
    const py = join(scratch, 'make.py');
    await writeFile(py, `import bpy\nbpy.ops.wm.read_factory_settings(use_empty=True)\nbpy.ops.mesh.primitive_cube_add()\nbpy.ops.export_scene.gltf(filepath=r"${glb}", export_format='GLB')\n`);
    spawnSync(blender!.path, ['-b', '--factory-startup', '--python', py], { windowsHide: true });
    expect(existsSync(glb)).toBe(true);
    const [res] = await uploadToLibrary([glb]);
    expect(res.ok).toBe(true);
    const items = JSON.parse(await readFile(join(creative(), 'metadata.json'), 'utf-8')) as Array<Record<string, unknown>>;
    const model = items.find((i) => i.id === res.id)!;
    expect(model).toMatchObject({ kind: 'model', origin: 'uploaded', hasPreview: true, glb: 'uploads/crate/crate.glb' });
    expect(existsSync(join(creative(), 'uploads', 'crate', 'preview.png'))).toBe(true);
  }, 180_000);
});

afterAll(async () => { await rm(scratch, { recursive: true, force: true }).catch(() => {}); });
