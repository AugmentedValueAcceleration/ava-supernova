/**
 * "Use in project" (11 Nov 2026): finished files only, filed where the
 * project's engine looks — never Ava's brief, scripts, history or tests — and
 * uploads that bring their side files with them. Always in scratch folders.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectEngine, projectAssetDir, copyWorkToProject } from '../src/creative/project-copy.js';
import { uploadToLibrary } from '../src/creative/library-upload.js';

let scratch: string;
const creative = () => process.env.AVA_CREATIVE_DIR!;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'ava-projcopy-'));
  process.env.AVA_CREATIVE_DIR = join(scratch, 'creative');
  await mkdir(creative(), { recursive: true });
});
afterAll(() => { delete process.env.AVA_CREATIVE_DIR; });

async function project(kind: 'unity' | 'unreal' | 'godot' | 'web'): Promise<string> {
  const root = join(scratch, `proj-${kind}`);
  await mkdir(root, { recursive: true });
  if (kind === 'unity') { await mkdir(join(root, 'ProjectSettings'), { recursive: true }); await writeFile(join(root, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.0'); await mkdir(join(root, 'Assets')); }
  if (kind === 'unreal') await writeFile(join(root, 'MyGame.uproject'), '{}');
  if (kind === 'godot') await writeFile(join(root, 'project.godot'), '');
  if (kind === 'web') await mkdir(join(root, 'public'));
  return root;
}

describe('where work goes', () => {
  it('knows Unity, Unreal and Godot projects, and everything else is not an engine', async () => {
    expect(detectEngine(await project('unity'))).toBe('unity');
    expect(detectEngine(await project('unreal'))).toBe('unreal');
    expect(detectEngine(await project('godot'))).toBe('godot');
    expect(detectEngine(await project('web'))).toBeNull();
  });

  it('files into Assets/, Content/, assets/, or the project\'s own folder', async () => {
    expect((await projectAssetDir(await project('unity'))).dir).toMatch(/Assets$/);
    expect((await projectAssetDir(await project('unreal'))).dir).toMatch(/Content$/);
    expect((await projectAssetDir(await project('godot'))).dir).toMatch(/assets$/);
    expect((await projectAssetDir(await project('web'))).dir).toMatch(/public$/);
  });
});

describe('GIMP work', () => {
  async function gimpWork(finals: string[]): Promise<string> {
    const folder = join(creative(), 'gimp', 'stat-icons');
    await mkdir(join(folder, 'final'), { recursive: true });
    await mkdir(join(folder, 'exports'), { recursive: true });
    await mkdir(join(folder, 'history', '1'), { recursive: true });
    for (const f of finals) await writeFile(join(folder, f), 'png');
    await writeFile(join(folder, 'brief.json'), '{}');
    await writeFile(join(folder, 'script.py'), '# Ava');
    await writeFile(join(folder, 'heart.xcf'), 'xcf');
    await writeFile(join(folder, 'exports', 'test-compare.png'), 'png');
    await writeFile(join(folder, 'finals.json'), JSON.stringify(finals));
    return folder;
  }

  it('copies the finals only — no brief, script, layered file, history or tests', async () => {
    const folder = await gimpWork(['final/heart.png', 'final/star.png']);
    const root = await project('web');
    const r = await copyWorkToProject({ id: 'gimp_stat-icons', kind: 'gimp', title: 'Stat Icons', absoluteFolder: folder }, root);
    expect(r.ok).toBe(true);
    expect(r.relPath).toBe('public/Stat-Icons');
    expect((await readdir(join(root, 'public', 'Stat-Icons'))).sort()).toEqual(['heart.png', 'star.png']);
  });

  it('a single final lands as one file', async () => {
    const folder = await gimpWork(['final/heart.png']);
    const root = await project('unity');
    const r = await copyWorkToProject({ id: 'gimp_stat-icons', kind: 'gimp', title: 'Heart', absoluteFolder: folder }, root);
    expect(r.relPath).toBe('Assets/Heart.png');
  });

  it('refuses work with no final, and says why', async () => {
    const folder = await gimpWork([]);
    const r = await copyWorkToProject({ id: 'gimp_stat-icons', kind: 'gimp', title: 'Stat Icons', absoluteFolder: folder }, await project('web'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Mark a final/);
  });

  it('never overwrites what is already there', async () => {
    const folder = await gimpWork(['final/heart.png']);
    const root = await project('web');
    await copyWorkToProject({ id: 'g', kind: 'gimp', title: 'Heart', absoluteFolder: folder }, root);
    const second = await copyWorkToProject({ id: 'g', kind: 'gimp', title: 'Heart', absoluteFolder: folder }, root);
    expect(second.relPath).toBe('public/Heart-2.png');
  });
});

describe('uploads bring what they name', () => {
  it('a .gltf comes with its .bin and textures, keeping their places', async () => {
    const src = join(scratch, 'src');
    await mkdir(join(src, 'tex'), { recursive: true });
    await writeFile(join(src, 'crate.bin'), 'bin');
    await writeFile(join(src, 'tex', 'wood base.png'), 'png');
    await writeFile(join(src, 'crate.gltf'), JSON.stringify({ buffers: [{ uri: 'crate.bin' }], images: [{ uri: 'tex/wood%20base.png' }, { uri: 'data:image/png;base64,AAAA' }] }));
    const [r] = await uploadToLibrary([join(src, 'crate.gltf')]);
    expect(r.ok).toBe(true);
    expect(r.note).toBeUndefined();
    const folder = join(creative(), 'uploads', 'crate');
    expect(existsSync(join(folder, 'crate.bin'))).toBe(true);
    expect(existsSync(join(folder, 'tex', 'wood base.png'))).toBe(true);
  });

  it('an .obj comes with its .mtl and the textures the .mtl names', async () => {
    const src = join(scratch, 'src');
    await mkdir(src, { recursive: true });
    await writeFile(join(src, 'rock.obj'), 'mtllib rock.mtl\nv 0 0 0\n');
    await writeFile(join(src, 'rock.mtl'), 'newmtl Rock\nmap_Kd -bm 1 rock_diffuse.png\nmap_Bump rock_normal.png\n');
    await writeFile(join(src, 'rock_diffuse.png'), 'png');
    const [r] = await uploadToLibrary([join(src, 'rock.obj')]);
    expect(r.ok).toBe(true);
    const folder = join(creative(), 'uploads', 'rock');
    expect(existsSync(join(folder, 'rock.mtl'))).toBe(true);
    expect(existsSync(join(folder, 'rock_diffuse.png'))).toBe(true);
    // Named but not there: said, not hidden.
    expect(r.note).toMatch(/rock_normal\.png/);
  });

  it('a reference outside the model\'s folder is reported, never followed', async () => {
    const src = join(scratch, 'src', 'models');
    await mkdir(src, { recursive: true });
    await writeFile(join(scratch, 'src', 'shared.bin'), 'bin');
    await writeFile(join(src, 'ship.gltf'), JSON.stringify({ buffers: [{ uri: '../shared.bin' }] }));
    const [r] = await uploadToLibrary([join(src, 'ship.gltf')]);
    expect(r.ok).toBe(true);
    expect(r.note).toMatch(/shared\.bin/);
    expect(existsSync(join(creative(), 'uploads', 'shared.bin'))).toBe(false);
  });

  it('copying an uploaded model into a project keeps every side file\'s name', async () => {
    const src = join(scratch, 'src');
    await mkdir(src, { recursive: true });
    await writeFile(join(src, 'crate.bin'), 'bin');
    await writeFile(join(src, 'crate.gltf'), JSON.stringify({ buffers: [{ uri: 'crate.bin' }] }));
    await uploadToLibrary([join(src, 'crate.gltf')]);
    const root = await project('godot');
    const r = await copyWorkToProject({ id: 'upload_crate', kind: 'model', title: 'Crate', absoluteFolder: join(creative(), 'uploads', 'crate') }, root);
    expect(r.ok).toBe(true);
    expect((await readdir(join(root, 'assets', 'Crate'))).filter((n) => n !== 'preview.png').sort()).toEqual(['crate.bin', 'crate.gltf']);
  });
});
