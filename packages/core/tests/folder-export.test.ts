/**
 * Download a folder as a real folder (Phase 2). Finished files only, his
 * layout (each model its own folder with textures/), .fbx + .blend + .glb per
 * model, textures linked RELATIVELY so the pack works on anyone's machine, and
 * a zip written as it is made. Always in a scratch folder (AVA_CREATIVE_DIR).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unzipSync } from 'fflate';
import { safeName, exportFolder, previewFolderExport } from '../src/creative/folder-export.js';
import { createFolder, addToFolder } from '../src/creative/library-folders.js';
import { findBlender } from '../src/tools/blender/find-blender.js';

const blender = await findBlender();
let scratch: string;
const creative = () => process.env.AVA_CREATIVE_DIR!;
const ok = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => { if (!r.ok) throw new Error(r.error); return r.value; };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5b8b1f90000000049454e44ae426082', 'hex');

/** Every file under a folder, as "a/b.png", sorted. */
async function tree(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await tree(p, base));
    else out.push(p.slice(base.length + 1).replace(/\\/g, '/'));
  }
  return out.sort();
}

/** A model the way Ava's tools leave it: textures linked by FULL path into its folder. */
function makeModel(slug: string, baked: boolean) {
  const dir = join(creative(), 'blender', slug);
  const py = join(scratch, `${slug}.py`);
  const script = [
    'import bpy, os',
    `d = r"${dir}"`,
    'os.makedirs(os.path.join(d, "textures"), exist_ok=True)',
    'bpy.ops.wm.read_factory_settings(use_empty=True)',
    'bpy.ops.mesh.primitive_cube_add()',
    'm = bpy.data.materials.new("Crate"); m.use_nodes = True',
    'bsdf = m.node_tree.nodes["Principled BSDF"]',
    baked
      ? [
          'img = bpy.data.images.new("T_Crate_BaseColor", 8, 8)',
          `img.filepath_raw = os.path.join(d, "textures", "${slug}_basecolor.png"); img.file_format = "PNG"; img.save()`,
          'tex = m.node_tree.nodes.new("ShaderNodeTexImage"); tex.image = img',
          'm.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])',
          'm["ava_baked"] = True',
        ].join('\n')
      : [
          'n = m.node_tree.nodes.new("ShaderNodeTexNoise")',
          'm.node_tree.links.new(n.outputs["Color"], bsdf.inputs["Base Color"])',
        ].join('\n'),
    'bpy.context.object.data.materials.append(m)',
    `bpy.ops.wm.save_as_mainfile(filepath=os.path.join(d, "${slug}.blend"))`,
    `bpy.ops.export_scene.gltf(filepath=os.path.join(d, "${slug}.glb"), export_format="GLB")`,
  ].join('\n');
  return writeFile(py, script).then(() => {
    spawnSync(blender!.path, ['-b', '--factory-startup', '--python', py], { windowsHide: true });
    return dir;
  });
}

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'ava-export-'));
  process.env.AVA_CREATIVE_DIR = join(scratch, 'creative');
  await mkdir(creative(), { recursive: true });
});
afterAll(async () => {
  delete process.env.AVA_CREATIVE_DIR;
  await rm(scratch, { recursive: true, force: true }).catch(() => {});
});

describe('names', () => {
  it.each([
    ['Wooden Barrel', 'Wooden-Barrel'],
    ['Café crème (v2)!', 'Cafe-creme-v2'],
    ['  ..hidden  ', 'hidden'],
    ['???', 'Untitled'],
  ])('%s → %s', (a, b) => expect(safeName(a)).toBe(b));
});

describe('a folder of flat work', () => {
  it('finished files only, nested folders kept, clashes named apart', async () => {
    // An image, a GIMP set with two finals and its working files, a logo system.
    const img = join(creative(), 'images', 'hero.png');
    await mkdir(join(creative(), 'images'), { recursive: true });
    await writeFile(img, PNG);
    const gimp = join(creative(), 'gimp', 'stat-icons');
    await mkdir(join(gimp, 'final'), { recursive: true });
    await mkdir(join(gimp, 'scripts'), { recursive: true });
    for (const f of ['final/heart.png', 'final/star.png', 'heart.xcf', 'preview.png', 'scripts/a.py', 'brief.json']) await writeFile(join(gimp, f), PNG);
    await writeFile(join(gimp, 'finals.json'), JSON.stringify(['final/heart.png', 'final/star.png']));
    await mkdir(join(creative(), 'logos'), { recursive: true });
    for (const v of ['primary', 'favicon']) await writeFile(join(creative(), 'logos', `logo_7_${v}.svg`), '<svg/>');
    await writeFile(join(creative(), 'metadata.json'), JSON.stringify([
      { id: 'image_1', kind: 'image', title: 'Hero Banner', absolutePath: img },
      { id: 'image_2', kind: 'image', title: 'Hero Banner', absolutePath: img },
      { id: 'gimp_stat-icons', kind: 'gimp', title: 'Stat Icons', absoluteFolder: gimp },
      { id: 'logo_7_primary', kind: 'image', title: 'DawnSets — Primary', absolutePath: join(creative(), 'logos', 'logo_7_primary.svg') },
      { id: 'logo_7_favicon', kind: 'image', title: 'DawnSets — Favicon', absolutePath: join(creative(), 'logos', 'logo_7_favicon.svg') },
    ]));

    const pack = ok(await createFolder('Fantasy UI Pack'));
    const inner = ok(await createFolder('Brand', pack.id));
    ok(await addToFolder(pack.id, [{ ref: 'creative:image_1' }, { ref: 'creative:image_2' }, { ref: 'creative:gimp_stat-icons' }]));
    ok(await addToFolder(inner.id, [{ ref: 'logo:logo_7', pick: ['primary'] }, { ref: `file:${join(scratch, 'gone', 'x.png')}` }]));

    const preview = await previewFolderExport(pack.id);
    expect(preview).toMatchObject({ name: 'Fantasy UI Pack', items: 5, models: 0 });
    expect(preview!.warnings.map((w) => w.item)).toEqual(['x.png']);

    const out = join(scratch, 'downloads');
    const res = await exportFolder(pack.id, out);
    expect(res.ok, res.error).toBe(true);
    expect(res.path).toBe(join(out, 'Fantasy-UI-Pack'));
    expect(await tree(res.path!)).toEqual([
      'Brand/DawnSets-Logo/DawnSets-primary.svg',
      'Hero-Banner-2.png',
      'Hero-Banner.png',
      'How-this-was-made.txt',
      'Stat-Icons/heart.png',
      'Stat-Icons/star.png',
    ]);
    expect(res.warnings.some((w) => w.item === 'x.png')).toBe(true);

    // Never overwrites: a second download sits beside the first.
    expect((await exportFolder(pack.id, out)).path).toBe(join(out, 'Fantasy-UI-Pack-2'));
  });
});

describe.skipIf(!blender)('a folder with models', () => {
  it('each model in its own folder: .fbx, .blend, .glb, textures/ — linked relatively — and live shaders flagged', async () => {
    const crate = await makeModel('worn-crate', true);
    const rock = await makeModel('mossy-rock', false);
    // Their preview pictures, as every built model has (the Fab gallery is made from them).
    const { PNG: PngJs } = await import('pngjs');
    const pic = new PngJs({ width: 64, height: 64 }); pic.data.fill(160);
    await writeFile(join(crate, 'preview.png'), PngJs.sync.write(pic));
    await writeFile(join(rock, 'preview.png'), PngJs.sync.write(pic));
    const items = JSON.parse(await readFile(join(creative(), 'metadata.json'), 'utf-8'));
    items.push(
      { id: 'model_worn-crate', kind: 'model', title: 'Worn Crate', absoluteFolder: crate, absolutePath: join(crate, 'preview.png') },
      { id: 'model_mossy-rock', kind: 'model', title: 'Mossy Rock', absoluteFolder: rock, absolutePath: join(rock, 'preview.png') },
    );
    await writeFile(join(creative(), 'metadata.json'), JSON.stringify(items));
    const props = ok(await createFolder('Props'));
    ok(await addToFolder(props.id, [{ ref: 'creative:model_worn-crate' }, { ref: 'creative:model_mossy-rock' }]));

    const out = join(scratch, 'downloads-3d');
    const res = await exportFolder(props.id, out);
    expect(res.ok, res.error).toBe(true);
    const files = await tree(res.path!);
    expect(files.some((f) => /\.blend\d+$/.test(f))).toBe(false); // no Blender backups
    expect(files).toEqual(expect.arrayContaining([
      'Worn-Crate/Worn-Crate.blend', 'Worn-Crate/Worn-Crate.fbx', 'Worn-Crate/Worn-Crate.glb', 'Worn-Crate/textures/worn-crate_basecolor.png',
      'Mossy-Rock/Mossy-Rock.blend', 'Mossy-Rock/Mossy-Rock.fbx', 'Mossy-Rock/Mossy-Rock.glb',
    ]));

    // The downloaded .blend links its texture relatively — it works on anyone's machine.
    const check = join(scratch, 'check.py');
    await writeFile(check, 'import bpy\nfor i in bpy.data.images:\n    print("AVA_IMG", i.filepath)\n');
    const run = spawnSync(blender!.path, ['-b', join(res.path!, 'Worn-Crate', 'Worn-Crate.blend'), '--factory-startup', '--python', check], { windowsHide: true, encoding: 'utf-8' });
    const paths = run.stdout.split(/\r?\n/).filter((l) => l.startsWith('AVA_IMG')).map((l) => l.slice(8).replace(/\\/g, '/'));
    expect(paths).toEqual(['//textures/worn-crate_basecolor.png']);

    // The .fbx names the texture by relative path, not a path into ~/.ava.
    const fbx = await readFile(join(res.path!, 'Worn-Crate', 'Worn-Crate.fbx'));
    expect(fbx.includes(Buffer.from('textures'))).toBe(true);
    expect(fbx.includes(Buffer.from(creative().replace(/\\/g, '/')))).toBe(false);

    expect(res.warnings.find((w) => w.item === 'Mossy Rock')?.message).toContain('live shader');
    expect(res.warnings.find((w) => w.item === 'Worn Crate')).toBeUndefined();
  }, 300_000);

  it('a zip holds the same folder, under its name', async () => {
    const props = (await import('../src/creative/library-folders.js')).readFolders;
    const folder = (await props()).find((f) => f.name === 'Props')!;
    const res = await exportFolder(folder.id, join(scratch, 'zips'), { zip: true });
    expect(res.ok, res.error).toBe(true);
    expect(res.path).toBe(join(scratch, 'zips', 'Props.zip'));
    const names = Object.keys(unzipSync(await readFile(res.path!))).sort();
    expect(names).toEqual(expect.arrayContaining(['Props/Worn-Crate/Worn-Crate.fbx', 'Props/Worn-Crate/textures/worn-crate_basecolor.png']));
    expect(existsSync(join(scratch, 'zips', 'Props'))).toBe(false);
  }, 300_000);
});

describe('the making record in a download', () => {
  it('says how each piece was made, from what was recorded — and never guesses', async () => {
    const { appendMaking } = await import('../src/tools/making-record.js');
    const work = join(creative(), 'gimp', 'shield-icon');
    await mkdir(join(work, 'final'), { recursive: true });
    await writeFile(join(work, 'final', 'shield.png'), PNG);
    await writeFile(join(work, 'finals.json'), JSON.stringify(['final/shield.png']));
    const ai = { id: 'qwen3.6-max', name: 'Qwen 3.6 Max', provider: 'qwen' };
    await appendMaking(work, { event: 'record_started', by: 'system', tool: 'gimp', earlier: false });
    await appendMaking(work, { event: 'brief_proposed', by: 'ava', ai, ask: 'a shield icon for my stat bar', tool: 'gimp', brief: {} });
    await appendMaking(work, { event: 'brief_edited', by: 'person', tool: 'gimp', changed: { style: { from: 'a', to: 'b' } } });
    await appendMaking(work, { event: 'brief_agreed', by: 'person', tool: 'gimp' });
    await appendMaking(work, { event: 'step', by: 'ava', ai, ask: 'make it chunkier', tool: 'gimp', app: 'GIMP 3.0.4', fonts: [{ name: 'Chewy', licence: 'Apache-2.0' }] });
    await appendMaking(work, { event: 'outside_change', by: 'outside', tool: 'gimp', changed: ['shield.xcf'], added: [], removed: [] });
    await appendMaking(work, { event: 'option_picked', by: 'person', tool: 'gimp', question: 'Which rim?', label: 'Gold' });

    const up = join(creative(), 'uploads', 'sword.png');
    await mkdir(join(creative(), 'uploads'), { recursive: true });
    await writeFile(up, PNG);
    const gen = join(creative(), 'images', 'sky.png');
    await writeFile(gen, PNG);
    const items = JSON.parse(await readFile(join(creative(), 'metadata.json'), 'utf-8'));
    items.push(
      { id: 'gimp_shield-icon', kind: 'gimp', title: 'Shield Icon', absoluteFolder: work },
      { id: 'upload_1', kind: 'image', title: 'Sword', absolutePath: up, origin: 'uploaded', originalName: 'sword_v3.png', createdAt: '2026-11-09T10:00:00Z' },
      { id: 'image_77', kind: 'image', title: 'Sky', absolutePath: gen, origin: 'generated', aiModel: 'qwen-image-2.0', aiProvider: 'qwen', prompt: 'a dawn sky' },
    );
    await writeFile(join(creative(), 'metadata.json'), JSON.stringify(items));
    const pack = ok(await createFolder('Record Pack'));
    ok(await addToFolder(pack.id, [{ ref: 'creative:gimp_shield-icon' }, { ref: 'creative:upload_1' }, { ref: 'creative:image_77' }, { ref: 'creative:image_1' }]));

    const res = await exportFolder(pack.id, join(scratch, 'record-out'));
    expect(res.ok, res.error).toBe(true);
    const text = await readFile(join(res.path!, 'How-this-was-made.txt'), 'utf-8');
    expect(text).toContain('HOW THIS WAS MADE — Record Pack');
    expect(text).toContain('Made in GIMP 3.0.4 by Ava Supernova, an AI design assistant');
    expect(text).toContain('Qwen 3.6 Max (Qwen, Alibaba Cloud)');
    expect(text).toContain('the person changed style; agreed by the person');
    expect(text).toContain('"make it chunkier"');
    expect(text).toContain('Changed outside Ava Supernova 1 time: shield.xcf');
    expect(text).toContain('picked "Gold"');
    expect(text).toContain('Chewy (Apache License 2.0');
    expect(text).toContain('Their own file (sword_v3.png)');
    expect(text).toContain('Generated by AI (qwen-image-2.0, Qwen, Alibaba Cloud) in Open Canvas');
    expect(text).toContain('Whether and how AI made it is not recorded'); // image_1, saved with no origin
    expect(text).toMatch(/Not fully recorded: 1 piece/);
    // Never words that claim craft it can't vouch for (Unity 1.6.c).
    expect(text).not.toMatch(/\b(hand[- ]?drawn|hand[- ]?made|drawn|painted)\b/i);

    // And it can be left out.
    const bare = await exportFolder(pack.id, join(scratch, 'record-out-bare'), { record: false });
    expect(existsSync(join(bare.path!, 'How-this-was-made.txt'))).toBe(false);
  });
});

describe.skipIf(!blender)('prepared for a store', () => {
  const props = async () => (await (await import('../src/creative/library-folders.js')).readFolders()).find((f) => f.name === 'Props')!;
  const out = (name: string) => join(scratch, 'stores', name);

  it('Unity: .fbx and .png, no .glb, source zipped, notices and a checklist', async () => {
    const res = await exportFolder((await props()).id, out('unity'), { store: 'unity' });
    expect(res.ok, res.error).toBe(true);
    const files = await tree(res.path!);
    expect(files.some((f) => f.endsWith('.glb'))).toBe(false);
    expect(files.some((f) => f.endsWith('.blend'))).toBe(false);
    expect(files).toEqual(expect.arrayContaining(['Props-source.zip', 'Third-Party Notices.txt', 'Unity-checklist.txt', 'Worn-Crate/Worn-Crate.fbx', 'How-this-was-made.txt']));
    const zipped = Object.keys(unzipSync(await readFile(join(res.path!, 'Props-source.zip')))).sort();
    expect(zipped).toEqual(['Mossy-Rock/Mossy-Rock.blend', 'Worn-Crate/Worn-Crate.blend']);
    const checklist = await readFile(join(res.path!, 'Unity-checklist.txt'), 'utf-8');
    expect(checklist).toContain('Prepared for the Unity Asset Store');
    expect(checklist).toContain('Only Unity decides');
    expect(checklist).not.toMatch(/\bapproved\b/i);
  }, 300_000);

  it('Fab: one zip per format, underscores, and a gallery image under 3 MB', async () => {
    const res = await exportFolder((await props()).id, out('fab'), { store: 'fab' });
    expect(res.ok, res.error).toBe(true);
    const files = await tree(res.path!);
    expect(files.sort()).toEqual(['Fab-checklist.txt', 'How-this-was-made.txt', 'Props_Blend.zip', 'Props_FBX.zip', 'Props_GLB.zip', 'Props_gallery.jpg']);
    const fbx = Object.keys(unzipSync(await readFile(join(res.path!, 'Props_FBX.zip'))));
    expect(fbx).toEqual(expect.arrayContaining(['Props/Worn_Crate/Worn_Crate.fbx', 'Props/Worn_Crate/textures/worn-crate_basecolor.png']));
    expect(fbx.some((f) => f.endsWith('.glb') || f.endsWith('.blend'))).toBe(false);
    const gallery = await readFile(join(res.path!, 'Props_gallery.jpg'));
    expect(gallery.length).toBeLessThan(3 * 1024 * 1024);
    const jpeg = await import('jpeg-js');
    const g = (jpeg.default ?? jpeg).decode(gallery);
    expect([g.width, g.height]).toEqual([1920, 1080]);
  }, 300_000);

  it('Godot: just the .glb', async () => {
    const res = await exportFolder((await props()).id, out('godot'), { store: 'godot' });
    expect((await tree(res.path!)).filter((f) => f !== 'How-this-was-made.txt')).toEqual(['Mossy-Rock/Mossy-Rock.glb', 'Worn-Crate/Worn-Crate.glb']);
  }, 300_000);

  it('Superhive packs the .blend; itch gets a licence template; Gumroad a zip; blocked stores say why', async () => {
    const s = await exportFolder((await props()).id, out('superhive'), { store: 'superhive' });
    expect(s.warnings.some((w) => /couldn't pack/i.test(w.message))).toBe(false);
    const itch = await exportFolder((await props()).id, out('itch'), { store: 'itch' });
    expect(await readFile(join(itch.path!, 'License.txt'), 'utf-8')).toContain('[Write your licence here]');
    expect(itch.warnings.some((w) => w.item === 'Licence')).toBe(true);
    const gum = await exportFolder((await props()).id, out('gumroad'), { store: 'gumroad' });
    expect(gum.path!.endsWith('.zip')).toBe(true);
    const blocked = await exportFolder((await props()).id, out('ts'), { store: 'turbosquid' as never });
    expect(blocked).toMatchObject({ ok: false, error: expect.stringContaining('does not permit models developed using AI tools') });
  }, 300_000);
});

describe('Use in project (11 Nov): a built model, the way the engine wants it', () => {
  it.skipIf(!blender)('Unity gets .fbx + textures only; Godot just the .glb; working files never', async () => {
    const { copyWorkToProject } = await import('../src/creative/project-copy.js');
    const dir = await makeModel('cart', true);
    await mkdir(join(dir, 'scripts'), { recursive: true });
    await writeFile(join(dir, 'scripts', 'step.py'), '# Ava');
    await writeFile(join(dir, 'brief.json'), '{}');
    const item = { id: 'model_cart', kind: 'model', title: 'Hand Cart', absoluteFolder: dir };

    const unity = join(scratch, 'UnityGame');
    await mkdir(join(unity, 'ProjectSettings'), { recursive: true });
    await writeFile(join(unity, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.0');
    await mkdir(join(unity, 'Assets'));
    const u = await copyWorkToProject(item, unity);
    expect(u.ok).toBe(true);
    expect(u.relPath).toBe('Assets/Hand-Cart');
    expect(await tree(join(unity, 'Assets', 'Hand-Cart'))).toEqual(['Hand-Cart.fbx', 'textures/cart_basecolor.png']);

    const godot = join(scratch, 'GodotGame');
    await mkdir(godot, { recursive: true });
    await writeFile(join(godot, 'project.godot'), '');
    const g = await copyWorkToProject(item, godot);
    expect(g.relPath).toBe('assets/Hand-Cart');
    expect(await tree(join(godot, 'assets', 'Hand-Cart'))).toEqual(['Hand-Cart.glb']);
  }, 120_000);
});
