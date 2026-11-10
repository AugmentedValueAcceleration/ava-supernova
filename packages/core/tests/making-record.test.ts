/**
 * The making record (making-record.ts): how each piece of Design Studio work
 * was made, written by the tools as a side effect — never by Ava.
 *
 * Real GIMP and Blender runs happen only where they are installed, always in a
 * scratch folder (AVA_CREATIVE_DIR), never the real Library. Font licences are
 * cached in a scratch folder too (AVA_FONTS_DIR).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendMaking, beforeChange, fontLicences, fontStem, personsWords, readMaking, type MakingEvent,
} from '../src/tools/making-record.js';
import {
  DesignBuildImageTool, DesignProposeImageBriefTool, DesignShowOptionsTool, DesignRestoreImageTool, DesignDuplicateImageTool,
  agreeImageBrief, saveImageBriefEdits, pickImageOption, deleteImageVersion, IMAGE_BRIEF_FIELDS,
} from '../src/tools/gimp/build-image.js';
import { DesignBuildModelTool, DesignDuplicateModelTool } from '../src/tools/blender/build-model.js';
import { DesignProposeModelBriefTool, agreeModelBrief, BRIEF_FIELDS } from '../src/tools/blender/model-brief.js';
import { findGimp } from '../src/tools/gimp/find-gimp.js';
import { findBlender } from '../src/tools/blender/find-blender.js';

const AI = { id: 'qwen3.6-max', name: 'Qwen 3.6 Max', provider: 'qwen' };
let turn = 0;
/** A fresh turn each call, as the agent sets it: the model, and their words. */
const ctx = (ask: string) => ({ cwd: '.', sharedState: { designTurnId: `t${++turn}`, designModel: AI, designAsk: ask } }) as never;
const events = (e: MakingEvent[]) => e.map((x) => x.event);

let scratch: string;
beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'ava-making-'));
  process.env.AVA_CREATIVE_DIR = join(scratch, 'creative');
  process.env.AVA_FONTS_DIR = join(scratch, 'fonts');
});
afterAll(async () => {
  delete process.env.AVA_CREATIVE_DIR;
  delete process.env.AVA_FONTS_DIR;
  await rm(scratch, { recursive: true, force: true });
});

describe('their words, never the room\'s', () => {
  it('takes only what follows "## Their request"', () => {
    expect(personsWords('[Design Studio] You are Ava…\n\nlots of room text\n\n## Their request\nmake the crate older\n\nand darker')).toBe('make the crate older\n\nand darker');
  });
  it('records nothing for a room message without their words', () => {
    expect(personsWords('[Design Studio] You are Ava… no request heading')).toBeNull();
  });
  it('keeps a plain message as it is', () => {
    expect(personsWords('  make it blue  ')).toBe('make it blue');
    expect(personsWords(null)).toBeNull();
  });
});

describe('font names to Google Fonts folders', () => {
  it.each([
    ['Space Grotesk Bold', 'spacegrotesk'],
    ['Rajdhani Semi-Bold', 'rajdhani'],
    ['SpaceGrotesk-700.ttf', 'spacegrotesk'],
    ['Playfair Display Italic', 'playfairdisplay'],
  ])('%s → %s', (name, stem) => expect(fontStem(name)).toBe(stem));

  it('says what it cannot know instead of guessing', async () => {
    const out = await fontLicences(['Sans-serif Bold', 'Bfont Regular|builtin', '?']);
    expect(out.map((f) => f.licence)).toEqual(['alias', 'builtin', 'unread']);
  });
});

describe('font licences from Google\'s own repository', () => {
  it('OFL, Apache, UFL and not-Google are told apart', async () => {
    const out = await fontLicences(['Rajdhani Bold', 'Chewy', 'Ubuntu Mono', 'Comic Sans MS']);
    const got = Object.fromEntries(out.map((f) => [f.name, f.licence]));
    // 'unchecked' only if GitHub can't be reached; then nothing is cached.
    if (Object.values(got).includes('unchecked')) return;
    expect(got).toEqual({ 'Rajdhani Bold': 'OFL', Chewy: 'Apache-2.0', 'Ubuntu Mono': 'UFL', 'Comic Sans MS': 'not-google' });
  }, 30_000);
});

describe('hand edits are a fact, not a guess', () => {
  it('starts a new work plainly, and an older one says what is missing', async () => {
    const fresh = join(scratch, 'w-fresh');
    await mkdir(fresh, { recursive: true });
    await beforeChange(fresh, 'gimp');
    expect((await readMaking(fresh))[0]).toMatchObject({ event: 'record_started', earlier: false });

    const old = join(scratch, 'w-old');
    await mkdir(old, { recursive: true });
    await writeFile(join(old, 'logo.xcf'), 'made before the record');
    await beforeChange(old, 'gimp');
    const [first] = await readMaking(old);
    expect(first).toMatchObject({ event: 'record_started', earlier: true });
    expect(String(first.note)).toContain('not recorded');
  });

  it('records a change nothing explains, and nothing when nothing changed', async () => {
    const dir = join(scratch, 'w-edit');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'a.xcf'), 'one');
    await beforeChange(dir, 'gimp');
    await beforeChange(dir, 'gimp');
    expect(events(await readMaking(dir))).toEqual(['record_started']);

    await writeFile(join(dir, 'a.xcf'), 'two');
    await writeFile(join(dir, 'b.xcf'), 'new');
    await beforeChange(dir, 'gimp');
    const last = (await readMaking(dir)).at(-1)!;
    expect(last).toMatchObject({ event: 'outside_change', by: 'outside', changed: ['a.xcf'], added: ['b.xcf'], removed: [] });
  });

  it('lines are only ever added', async () => {
    const dir = join(scratch, 'w-append');
    await Promise.all([1, 2, 3, 4, 5].map((n) => appendMaking(dir, { event: 'main_chosen', by: 'person', name: `v${n}` })));
    expect((await readMaking(dir)).map((e) => e.name)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5']);
  });
});

describe('the brief', () => {
  it('her proposal names the AI model and their words; their edit and agreement are theirs', async () => {
    const brief = Object.fromEntries(IMAGE_BRIEF_FIELDS.map(([k]) => [k, `the ${k}`]));
    await new DesignProposeImageBriefTool().execute({ name: 'Brief Record', ...brief, reasoning: 'because' }, ctx('icons for my stat bar'));
    await saveImageBriefEdits('brief-record', { style: 'flat, two colours' });
    await agreeImageBrief('brief-record');
    const e = await readMaking(join(process.env.AVA_CREATIVE_DIR!, 'gimp', 'brief-record'));
    expect(events(e)).toEqual(['record_started', 'brief_proposed', 'brief_edited', 'brief_agreed']);
    expect(e[1]).toMatchObject({ by: 'ava', ai: AI, ask: 'icons for my stat bar' });
    expect((e[1].brief as Record<string, string>).style).toBe('the style');
    expect(e[2]).toMatchObject({ by: 'person', changed: { style: { from: 'the style', to: 'flat, two colours' } } });
    expect(e[3]).toMatchObject({ by: 'person' });
  });
});

describe('art they bring in', () => {
  it('says how a Library picture was made, and "unknown" for one saved before that was recorded', async () => {
    const creative = process.env.AVA_CREATIVE_DIR!;
    const pics = join(scratch, 'pics');
    await mkdir(pics, { recursive: true });
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    for (const f of ['gen.png', 'logo.png', 'old.png', 'mine.png']) await writeFile(join(pics, f), png);
    await mkdir(creative, { recursive: true });
    // Shaped exactly as the extension and the IDE write them.
    await writeFile(join(creative, 'metadata.json'), JSON.stringify([
      { id: 'a', kind: 'image', absolutePath: join(pics, 'gen.png'), title: 'Hero', prompt: 'a castle', origin: 'generated', aiModel: 'qwen-image-2.0', aiProvider: 'qwen' },
      { id: 'b', kind: 'image', absolutePath: join(pics, 'logo.png'), title: 'Logo', prompt: 'logo', origin: 'composed' },
      { id: 'c', kind: 'image', absolutePath: join(pics, 'old.png'), title: 'Old', prompt: 'old' },
    ]));
    const brief = Object.fromEntries(IMAGE_BRIEF_FIELDS.map(([k]) => [k, `the ${k}`]));
    await new DesignProposeImageBriefTool().execute({ name: 'Brought In', ...brief, reasoning: 'because' }, ctx('x'));
    const { addImageReference } = await import('../src/tools/gimp/build-image.js');
    for (const f of ['gen.png', 'logo.png', 'old.png', 'mine.png']) expect((await addImageReference('brought-in', join(pics, f))).ok).toBe(true);

    const lines = (await readMaking(join(creative, 'gimp', 'brought-in'))).filter((e) => e.event === 'brought_in');
    expect(lines.map((l) => [l.original, l.made ?? null, l.aiModel ?? null])).toEqual([
      ['gen.png', 'generated', 'qwen-image-2.0'],
      ['logo.png', 'composed', null],
      ['old.png', 'unknown', null],
      ['mine.png', null, null],
    ]);
    expect(lines.every((l) => l.by === 'person')).toBe(true);
    expect(lines[3].fromLibrary).toBe(false);
  });
});

const gimp = await findGimp();

describe.skipIf(!gimp)('in GIMP', () => {
  const work = () => join(process.env.AVA_CREATIVE_DIR!, 'gimp', 'record-icons');
  // One retry, ONLY for GIMP not having its fonts loaded yet: it happens when
  // several GIMP test files start GIMP at once (seen 9 Nov), not in the code.
  const build = async (script: string, ask: string, description = 'a step') => {
    const once = () => new DesignBuildImageTool().execute({ name: 'Record Icons', script, description }, ctx(ask));
    const res = await once();
    return !res.success && /No font called/.test(res.output) ? once() : res;
  };

  beforeAll(async () => {
    const brief = Object.fromEntries(IMAGE_BRIEF_FIELDS.map(([k]) => [k, `the ${k}`]));
    await new DesignProposeImageBriefTool().execute({ name: 'Record Icons', ...brief, reasoning: 'because' }, ctx('stat icons'));
    await agreeImageBrief('record-icons');
  }, 30_000);

  it('a step records the model, their words, the script, the fonts and the files', async () => {
    const res = await build(
      'img = ava_image("heart", 128, 128)\nava_layer(img, "Base", fill="#aa2233")\nava_text(img, "HP", font="Sans-serif Bold", size=40)',
      'make a red heart with HP on it', 'red heart with HP');
    expect(res.success, res.output).toBe(true);
    const step = (await readMaking(work())).find((e) => e.event === 'step')!;
    expect(step).toMatchObject({ by: 'ava', ai: AI, ask: 'make a red heart with HP on it', description: 'red heart with HP', images: ['heart'] });
    expect(String(step.app)).toMatch(/^GIMP 3/);
    expect(existsSync(join(work(), String(step.script)))).toBe(true);
    expect(step.fontsByImage).toEqual({ heart: ['Sans-serif Bold'] });
    expect(step.fonts).toEqual([{ name: 'Sans-serif Bold', licence: 'alias' }]);
    expect(Object.keys(step.sources as object)).toEqual(['heart.xcf']);
  }, 180_000);

  it('a file changed outside Ava is recorded before the next step, and a failed run is not recorded', async () => {
    await build('img = ava_image("heart")\nava_layer(img, "Shine", fill="#ffffff")', 'add a shine');
    // Their "hand edit": an older save of the image put back in place.
    await copyFile(join(work(), 'history', '1', 'heart.xcf'), join(work(), 'heart.xcf'));
    const before = (await readMaking(work())).length;
    const failed = await build('raise ValueError("no")', 'try this');
    expect(failed.success).toBe(false);
    await build('img = ava_image("heart")\nava_layer(img, "Rim", fill="#000000")', 'add a rim');
    const after = (await readMaking(work())).slice(before);
    expect(events(after)).toEqual(['outside_change', 'step']);
    expect(after[0]).toMatchObject({ changed: ['heart.xcf'] });
    expect(after[1]).toMatchObject({ ask: 'add a rim' });
  }, 300_000);

  it('going back, choosing, keeping and copying are each recorded, so none reads as a hand edit', async () => {
    await new DesignRestoreImageTool().execute({ name: 'Record Icons', step: 1 }, ctx('I preferred the first one'));
    await build('img = ava_image("star", 64, 64)\nava_layer(img, "Base", fill="#ffcc00")\nava_export(img, "a.png")\nava_export(img, "b.png")', 'and a star');
    await new DesignShowOptionsTool().execute({ name: 'Record Icons', question: 'Which?', options: [{ label: 'A', file: 'exports/a.png' }, { label: 'B', file: 'exports/b.png' }] }, ctx('show me two'));
    await pickImageOption('record-icons', 1);
    await deleteImageVersion('record-icons', 'star');
    await new DesignDuplicateImageTool().execute({ from: 'Record Icons', to: 'Record Icons Copy' }, ctx('try a copy'));
    await build('img = ava_image("heart")\nava_layer(img, "Tint", fill="#330000")', 'darker');

    const e = await readMaking(work());
    expect(e.filter((x) => x.event === 'outside_change')).toHaveLength(1); // only the real one, above
    expect(e.find((x) => x.event === 'restored')).toMatchObject({ by: 'ava', ai: AI, step: 1 });
    expect(e.find((x) => x.event === 'options_shown')).toMatchObject({ by: 'ava', question: 'Which?' });
    expect(e.find((x) => x.event === 'option_picked')).toMatchObject({ by: 'person', label: 'B' });
    expect(e.find((x) => x.event === 'version_deleted')).toMatchObject({ by: 'person', name: 'star' });

    const copy = await readMaking(join(process.env.AVA_CREATIVE_DIR!, 'gimp', 'record-icons-copy'));
    expect(copy.at(-1)).toMatchObject({ event: 'copied_from', from: 'Record Icons', by: 'ava' });
    expect(copy.some((x) => x.event === 'step')).toBe(true); // the original's history came with it
  }, 600_000);
});

const blender = await findBlender();

describe.skipIf(!blender)('in Blender', () => {
  const work = () => join(process.env.AVA_CREATIVE_DIR!, 'blender', 'record-crate');
  const build = (script: string, ask: string) =>
    new DesignBuildModelTool().execute({ name: 'Record Crate', script, description: 'a crate' }, ctx(ask));

  beforeAll(async () => {
    const brief = Object.fromEntries(BRIEF_FIELDS.map(([k]) => [k, `the ${k}`]));
    await new DesignProposeModelBriefTool().execute({ name: 'Record Crate', ...brief, reasoning: 'because' }, ctx('a supply crate'));
    await agreeModelBrief('record-crate');
  });

  it('a step records the model, their words, Blender\'s version and the fonts in the file', async () => {
    const res = await build(
      'bpy.ops.mesh.primitive_cube_add(size=1)\n' +
      'c = bpy.data.curves.new("Label", "FONT"); c.body = "AMMO"\n' +
      'bpy.context.scene.collection.objects.link(bpy.data.objects.new("Label", c))',
      'a crate with AMMO written on it');
    expect(res.success, res.output).toBe(true);
    const step = (await readMaking(work())).find((e) => e.event === 'step')!;
    expect(step).toMatchObject({ by: 'ava', ai: AI, ask: 'a crate with AMMO written on it', start: 'empty_scene' });
    expect(String(step.app)).toMatch(/^Blender \d/);
    expect((step.fonts as Array<{ licence: string }>).map((f) => f.licence)).toEqual(['builtin']);
    expect(Object.keys(step.sources as object)).toEqual(['record-crate.blend']);
  }, 300_000);

  it('a .blend changed outside Ava is recorded; a copy carries the record', async () => {
    await build('bpy.data.objects["Cube"].scale.z = 1.5', 'taller');
    const old = (await readdir(join(work(), 'versions')))[0];
    await copyFile(join(work(), 'versions', old), join(work(), 'record-crate.blend'));
    await build('bpy.data.objects["Cube"].scale.x = 1.2', 'wider');
    const e = await readMaking(work());
    expect(events(e).slice(-2)).toEqual(['outside_change', 'step']);

    await new DesignDuplicateModelTool().execute({ from: 'Record Crate', to: 'Record Crate Burnt' }, ctx('try a burnt one'));
    await new DesignBuildModelTool().execute({ name: 'Record Crate Burnt', script: 'pass', description: 'x' }, ctx('nothing yet'));
    const copy = await readMaking(join(process.env.AVA_CREATIVE_DIR!, 'blender', 'record-crate-burnt'));
    // The renamed .blend is explained by the copy line, so it is not a hand edit.
    expect(events(copy).slice(-2)).toEqual(['copied_from', 'step']);
  }, 600_000);
});
