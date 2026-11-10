/**
 * Step history for 3D models: every step saved with its picture, going back
 * brings back the .blend, .glb, preview AND that step's textures, going back is
 * itself a step, and textures are stored only when they change. Real Blender,
 * scratch folder (AVA_CREATIVE_DIR) only.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DesignBuildModelTool, DesignRestoreModelTool } from '../src/tools/blender/build-model.js';
import { DesignProposeModelBriefTool, agreeModelBrief, BRIEF_FIELDS, listModels } from '../src/tools/blender/model-brief.js';
import { readModelHistory, restoreModelStep } from '../src/tools/blender/model-history.js';
import { readMaking } from '../src/tools/making-record.js';
import { findBlender } from '../src/tools/blender/find-blender.js';

const blender = await findBlender();
let scratch: string;
let turn = 0;
const ctx = () => ({ cwd: '.', sharedState: { designTurnId: `h${++turn}`, designModel: { id: 'qwen3.6-max' }, designAsk: 'go' } }) as never;
const dir = () => join(process.env.AVA_CREATIVE_DIR!, 'blender', 'history-crate');
const hash = async (p: string) => createHash('sha256').update(await readFile(p)).digest('hex');
const build = (script: string, description: string) =>
  new DesignBuildModelTool().execute({ name: 'History Crate', script, description }, ctx());

// A bake, as far as the history is concerned: a texture written into textures/.
const BAKE = (colour: number) =>
  `import os\nimg = bpy.data.images.new("T", 8, 8)\nimg.pixels = [${colour}, 0.0, 0.0, 1.0] * 64\n` +
  `os.makedirs(os.path.join(ASSET_DIR, "textures"), exist_ok=True)\nimg.filepath_raw = os.path.join(ASSET_DIR, "textures", "crate_basecolor.png"); img.file_format = "PNG"; img.save()`;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'ava-mhist-'));
  process.env.AVA_CREATIVE_DIR = join(scratch, 'creative');
  if (!blender) return;
  const brief = Object.fromEntries(BRIEF_FIELDS.map(([k]) => [k, `the ${k}`]));
  await new DesignProposeModelBriefTool().execute({ name: 'History Crate', ...brief, reasoning: 'because' }, ctx());
  await agreeModelBrief('history-crate');
});
afterAll(async () => {
  delete process.env.AVA_CREATIVE_DIR;
  await rm(scratch, { recursive: true, force: true }).catch(() => {});
});

describe.skipIf(!blender)('3D step history', () => {
  it('every step is saved with its picture; textures only when they change', async () => {
    expect((await build('bpy.ops.mesh.primitive_cube_add(size=1)', 'blockout')).output).toContain('Saved as step 1');
    expect((await build(BAKE(1.0), 'bake red')).output).toContain('Saved as step 2');
    expect((await build('bpy.data.objects["Cube"].scale.z = 1.4', 'taller')).output).toContain('Saved as step 3');
    const steps = await readModelHistory('history-crate');
    expect(steps.map((s) => [s.number, s.label, s.texturesIn])).toEqual([[1, 'blockout', null], [2, 'bake red', 2], [3, 'taller', 2]]);
    expect(steps.every((s) => s.preview && existsSync(join(dir(), s.preview)))).toBe(true);
    // Step 3 shares step 2's textures instead of copying them again.
    expect(existsSync(join(dir(), 'history', '3', 'textures'))).toBe(false);
    // The room's list carries the strip.
    expect((await listModels()).find((m) => m.slug === 'history-crate')!.history).toHaveLength(3);
  }, 300_000);

  it('going back brings back that step exactly — and is itself a step', async () => {
    const step2Blend = await hash(join(dir(), 'history', '2', 'history-crate.blend'));
    const res = await new DesignRestoreModelTool().execute({ name: 'History Crate', step: 1 }, ctx());
    expect(res.success, res.output).toBe(true);
    expect(existsSync(join(dir(), 'textures'))).toBe(false); // step 1 had no bake
    expect(await hash(join(dir(), 'history-crate.blend'))).toBe(await hash(join(dir(), 'history', '1', 'history-crate.blend')));

    // And forward again, by their click this time: step 2's textures come back too.
    await restoreModelStep('history-crate', 2);
    expect(await hash(join(dir(), 'history-crate.blend'))).toBe(step2Blend);
    expect(await readdir(join(dir(), 'textures'))).toEqual(['crate_basecolor.png']);

    const steps = await readModelHistory('history-crate');
    expect(steps.slice(-2).map((s) => [s.label, s.texturesIn])).toEqual([['Back to step 1', null], ['Back to step 2', 2]]);

    // The making record says who went back, and nothing reads as a hand edit.
    const record = await readMaking(dir());
    expect(record.filter((e) => e.event === 'restored').map((e) => [e.by, e.step])).toEqual([['ava', 1], ['person', 2]]);
    await build('bpy.data.objects["Cube"].scale.x = 1.1', 'wider');
    expect((await readMaking(dir())).some((e) => e.event === 'outside_change')).toBe(false);
  }, 300_000);
});
