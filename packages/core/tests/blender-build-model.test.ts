/**
 * design_build_model — Ava builds 3D models in Blender with no window.
 *
 * The script check runs everywhere. The Blender runs only where Blender is
 * installed, and always in a scratch folder (AVA_CREATIVE_DIR), never the real
 * Library. What they prove is what was decided on 3 Nov 2026: the model grows
 * (later runs open the saved file), a new canvas only when asked, a failed run
 * saves nothing, duplicate leaves the original alone, and the guard refuses
 * programs, network, native code and writes outside the model folder.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { checkBlenderScript, modelSlug, DesignBuildModelTool, DesignDuplicateModelTool } from '../src/tools/blender/build-model.js';
import { findBlender } from '../src/tools/blender/find-blender.js';
import { DesignProposeModelBriefTool, agreeModelBrief, saveModelBriefEdits, readModelBrief, BRIEF_FIELDS, listModels } from '../src/tools/blender/model-brief.js';

const BRIEF = Object.fromEntries(BRIEF_FIELDS.map(([k]) => [k, `the ${k}`]));
const proposeBrief = (name: string) => new DesignProposeModelBriefTool().execute({ name, ...BRIEF, reasoning: 'because' });

describe('the script check', () => {
  it('lets an ordinary build through', () => {
    expect(checkBlenderScript(`import bpy, os\nbpy.ops.mesh.primitive_cube_add()\nimg = os.path.join(ASSET_DIR, "icon.png")\nbpy.data.images.load("//textures/wood.png")`)).toBeNull();
  });

  it.each([
    ['import subprocess', 'starts other programs'],
    ['import os; os.system("calc")', 'starts other programs'],
    ['import urllib.request', 'uses the network'],
    ['import ctypes', 'native code'],
    ['bpy.ops.wm.save_as_mainfile(filepath="x.blend")', 'the tool saves the model for you'],
    ['bpy.ops.preferences.addon_install(filepath="x.zip")', 'Blender\'s own setup'],
    ['open(r"C:\\Users\\me\\x.txt", "w")', 'absolute path'],
    ['open("/home/me/x.txt", "w")', 'absolute path'],
    ['open("../../x.txt", "w")', '".."'],
    ['os.path.expanduser("~")', 'outside the model folder'],
  ])('refuses %s', (script, why) => {
    const res = checkBlenderScript(script);
    expect(res).not.toBeNull();
    expect(res).toContain(why);
  });

  it('names models the way folders need them', () => {
    expect(modelSlug('Worn Supply Crate — burnt!')).toBe('worn-supply-crate-burnt');
  });
});

const blender = await findBlender();

describe.skipIf(!blender)('in Blender', () => {
  let dir: string;
  const tool = new DesignBuildModelTool();
  const dup = new DesignDuplicateModelTool();
  const ctx = { cwd: '.' };
  const run = (args: Record<string, unknown>) => tool.execute(args, ctx);

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ava-blender-test-'));
    process.env.AVA_CREATIVE_DIR = dir;
  });
  afterAll(async () => {
    delete process.env.AVA_CREATIVE_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it('builds nothing until the person has agreed the brief', async () => {
    const none = await run({ name: 'Test Crate', script: 'import bpy' });
    expect(none.success).toBe(false);
    expect(none.output).toContain('has no brief yet');

    const missing = await new DesignProposeModelBriefTool().execute({ name: 'Test Crate', what: 'a crate', reasoning: 'x' });
    expect(missing.success).toBe(false);
    expect(missing.output).toContain('Real dimensions');

    expect((await proposeBrief('Test Crate')).success).toBe(true);
    const proposed = await run({ name: 'Test Crate', script: 'import bpy' });
    expect(proposed.success).toBe(false);
    expect(proposed.output).toContain('waiting for the person to agree');
    expect((await listModels())[0]).toMatchObject({ slug: 'test-crate', built: false });

    expect((await agreeModelBrief('test-crate'))?.status).toBe('agreed');
  });

  it('builds from an empty scene, saves, exports and returns the preview', async () => {
    const res = await run({
      name: 'Test Crate', description: 'a test crate', fbx: true,
      script: `import bpy\nbpy.ops.mesh.primitive_cube_add(location=(0,0,0.4))\no=bpy.context.object\no.name='Crate_Body'\no.scale=(0.6,0.4,0.4)\nprint('crate made')`,
    });
    expect(res.success, res.output).toBe(true);
    expect(res.output).toContain('from an empty scene');
    expect(res.output).toContain('1 mesh objects');        // the default cube/camera/light are gone
    expect(res.output).toContain('1.2 × 0.8 × 0.8 m');
    expect(res.output).toContain('crate made');
    expect(res.metadata?.base64_image).toBeTruthy();
    const folder = join(dir, 'blender', 'test-crate');
    for (const f of ['test-crate.blend', 'test-crate.glb', 'test-crate.fbx', 'preview.png', 'script.py']) {
      expect(existsSync(join(folder, f)), f).toBe(true);
    }
    const lib = JSON.parse(await readFile(join(dir, 'metadata.json'), 'utf-8'));
    expect(lib[0]).toMatchObject({ id: 'model_test-crate', kind: 'model', title: 'Test Crate', path: 'blender/test-crate/preview.png' });
    expect(lib[0].bytes).toBeGreaterThan(0);
  }, 120_000);

  it('a later run opens the saved model and adds to it', async () => {
    const res = await run({
      name: 'Test Crate',
      script: `import bpy\nassert 'Crate_Body' in bpy.data.objects\nbpy.ops.mesh.primitive_cube_add(location=(0,0,0.83))\nbpy.context.object.name='Crate_Lid'\nbpy.context.object.scale=(0.6,0.4,0.03)`,
    });
    expect(res.success, res.output).toBe(true);
    expect(res.output).toContain('on top of the saved model');
    expect(res.output).toContain('2 mesh objects');
    expect((await readdir(join(dir, 'blender', 'test-crate', 'versions'))).length).toBe(1);
  }, 120_000);

  it('a failed run saves nothing', async () => {
    const before = await readFile(join(dir, 'blender', 'test-crate', 'test-crate.blend'));
    const res = await run({ name: 'Test Crate', script: `import bpy\nbpy.data.objects['Crate_Lid'].location.z = 2\nraise ValueError('broken on purpose')` });
    expect(res.success).toBe(false);
    expect(res.output).toContain('Nothing was saved');
    expect(res.output).toContain('broken on purpose');
    expect((await readFile(join(dir, 'blender', 'test-crate', 'test-crate.blend'))).equals(before)).toBe(true);
  }, 120_000);

  it.each([
    // Disguised so the script check misses them — this is the guard INSIDE Blender.
    ['__import__("sub" + "process").run(["cmd"])', 'starting other programs'],
    ['__import__("so" + "cket").create_connection(("1.1.1.1", 80))', 'network access'],
    ['import os\nos.mkdir(os.path.join(os.path.dirname(ASSET_DIR), "escape"))', 'changing files outside the model folder'],
    // The system temp folder is NOT the model folder (it was allowed once; 3 Nov 2026).
    ['import os, tempfile\nopen(os.path.join(os.path.dirname(bpy.app.tempdir.rstrip(os.sep)), "ava-escape-test.txt"), "w")', 'writing outside the model folder'],
  ])('the guard inside Blender refuses %s', async (script, why) => {
    const res = await run({ name: 'Test Crate', script });
    expect(res.success).toBe(false);
    expect(res.output).toContain(`Blocked by the Design Studio guard: ${why}`);
    expect(existsSync(join(dir, 'blender', 'escape'))).toBe(false);
  }, 120_000);

  it('a changed brief has to be agreed again', async () => {
    await saveModelBriefEdits('test-crate', { condition: 'badly burnt' });
    const b = await readModelBrief('test-crate');
    expect(b).toMatchObject({ status: 'proposed', editedByPerson: true, condition: 'badly burnt' });
    const res = await run({ name: 'Test Crate', script: 'import bpy' });
    expect(res.output).toContain('they edited it');
    await agreeModelBrief('test-crate');
    // Saving with nothing changed keeps the agreement.
    await saveModelBriefEdits('test-crate', { condition: 'badly burnt' });
    expect((await readModelBrief('test-crate'))?.status).toBe('agreed');
  });

  it('duplicates without touching the original', async () => {
    const res = await dup.execute({ from: 'Test Crate', to: 'Test Crate Burnt' });
    expect(res.success, res.output).toBe(true);
    const copy = join(dir, 'blender', 'test-crate-burnt');
    expect(existsSync(join(copy, 'test-crate-burnt.blend'))).toBe(true);
    expect(existsSync(join(copy, 'versions'))).toBe(false);
    expect(await readModelBrief('test-crate-burnt')).toMatchObject({ name: 'Test Crate Burnt', status: 'agreed' });
    const built = await run({ name: 'Test Crate Burnt', script: `import bpy\nbpy.data.objects.remove(bpy.data.objects['Crate_Lid'])` });
    expect(built.output).toContain('1 mesh objects');
    const orig = await run({ name: 'Test Crate', script: `import bpy\nprint(len(bpy.data.objects))` });
    expect(orig.output).toContain('2 mesh objects');
  }, 240_000);

  it('a new canvas only when asked, and the old one is kept', async () => {
    const res = await run({ name: 'Test Crate', start_fresh: true, script: `import bpy\nbpy.ops.mesh.primitive_uv_sphere_add()` });
    expect(res.success, res.output).toBe(true);
    expect(res.output).toContain('on a new canvas');
    expect(res.output).toContain('1 mesh objects');
  }, 120_000);

  it('texturing: warns while the look is live, then unwrap + bake carry it into the export', async () => {
    expect((await proposeBrief('Tex Box')).success).toBe(true);
    await agreeModelBrief('tex-box');
    // A shader that READS its UVs — left half red, right half blue — the way
    // her barrel told wood from iron. A careless unwrap would scramble it.
    const live = await run({ name: 'Tex Box', script: [
      'import bpy',
      'bpy.ops.mesh.primitive_plane_add(size=1)',
      'o = bpy.context.object',
      'm = bpy.data.materials.new("Live"); m.use_nodes = True; nt = m.node_tree',
      'tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ")',
      'lt = nt.nodes.new("ShaderNodeMath"); lt.operation = "LESS_THAN"; lt.inputs[1].default_value = 0.5',
      'mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"',
      'mix.inputs[6].default_value = (0, 0, 1, 1); mix.inputs[7].default_value = (1, 0, 0, 1)',
      'nt.links.new(tc.outputs["UV"], sep.inputs[0]); nt.links.new(sep.outputs[0], lt.inputs[0])',
      'nt.links.new(lt.outputs[0], mix.inputs[0]); nt.links.new(mix.outputs[2], nt.nodes["Principled BSDF"].inputs["Base Color"])',
      'o.data.materials.append(m)',
    ].join('\n') });
    expect(live.success, live.output).toBe(true);
    expect(live.output).toContain('carries NONE of the live shader detail');

    const baked = await run({ name: 'Tex Box', timeout_seconds: 300, script: [
      'ava_unwrap()',
      'ava_bake(size=128, samples=1)',
      'img = bpy.data.images["tex-box_BaseColor"]; px = list(img.pixels)',
      'print("RED", round(sum(px[0::4]), 1), "BLUE", round(sum(px[2::4]), 1))',
      'print("UVS", [l.name for l in bpy.context.object.data.uv_layers])',
    ].join('\n') });
    expect(baked.success, baked.output).toBe(true);
    expect(baked.output).not.toContain('carries NONE');
    expect(baked.output).toContain('textures/tex-box_BaseColor.png');
    expect(baked.output).toContain("'LiveUV'");
    // Both halves survived the unwrap: plenty of red AND blue in the bake.
    const [, red, blue] = /RED ([\d.]+) BLUE ([\d.]+)/.exec(baked.output)!.map(Number);
    expect(red).toBeGreaterThan(500);
    expect(blue).toBeGreaterThan(500);
    // The textures travel inside the export.
    const glb = await readFile(join(dir, 'blender', 'tex-box', 'tex-box.glb'));
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf-8'));
    expect(json.images?.length ?? 0).toBeGreaterThan(0);

    // Re-bake from the kept live material.
    const again = await run({ name: 'Tex Box', timeout_seconds: 300, script: 'ava_bake(size=128, samples=1)' });
    expect(again.success, again.output).toBe(true);
  }, 300_000);

  it('shows in the Studio rail while Blender runs, but a refused run does not', async () => {
    const seen: string[] = [];
    const manager = {
      create: (j: { type: string; prompt: string }) => seen.push(`create ${j.type} ${j.prompt}`),
      update: (_: string, p: { status?: string }) => seen.push(`update ${p.status}`),
      complete: () => seen.push('complete'),
      fail: (_: string, e: string) => seen.push(`fail ${e}`),
    };
    const ctx2 = { cwd: '.', sharedState: { generationManager: manager } };
    await tool.execute({ name: 'No Brief Here', script: 'import bpy' }, ctx2);
    expect(seen).toEqual([]);

    await tool.execute({ name: 'Test Crate', script: 'print("ok")' }, ctx2);
    expect(seen).toEqual(['create blender Test Crate', 'update generating', 'complete']);

    seen.length = 0;
    await tool.execute({ name: 'Test Crate', script: 'raise ValueError("boom")' }, ctx2);
    expect(seen[0]).toBe('create blender Test Crate');
    expect(seen[2]).toMatch(/^fail Your script stopped/);
  }, 120_000);

  it('never wrote to the real Library', () => {
    expect(dir.startsWith(join(homedir(), '.ava'))).toBe(false);
  });
});

describe('choosing Blender in Settings', () => {
  // Only the refusals run here: they return before anything is written, so the
  // real ~/.ava/config.json is never touched by the tests.
  it('refuses a path with no file', async () => {
    const { setBlenderPath } = await import('../src/tools/blender/find-blender.js');
    expect(await setBlenderPath(join(tmpdir(), 'no-such-blender.exe'))).toMatchObject({ ok: false, error: 'There is no file at that path.' });
  });
  it('refuses a file that is not Blender', async () => {
    const { setBlenderPath } = await import('../src/tools/blender/find-blender.js');
    const res = await setBlenderPath(process.execPath);   // node itself: a real exe, not Blender
    expect(res.ok).toBe(false);
    expect(res.error).toContain('did not answer as Blender');
  });
});
