/**
 * design_build_image — Ava makes images in GIMP with no window.
 *
 * The GIMP runs happen only where GIMP 3 is installed, always in a scratch
 * folder (AVA_CREATIVE_DIR), never the real Library. They prove the same rules
 * as Blender: nothing before an agreed brief, saved work is reopened, a failed
 * run saves nothing, duplicate leaves the original alone, and the guard refuses
 * programs, network, native code and writes outside the folder.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PNG } from 'pngjs';
import {
  checkGimpScript, gimpApiHint, DesignBuildImageTool, DesignDuplicateImageTool, DesignProposeImageBriefTool,
  agreeImageBrief, saveImageBriefEdits, readImageBrief, listImageWork, IMAGE_BRIEF_FIELDS,
  DesignShowOptionsTool, DesignMarkFinalTool, pickImageOption, addImageReference, readImageFinals, removeImageFinal, scriptOutput,
} from '../src/tools/gimp/build-image.js';
import { findGimp, setGimpPath } from '../src/tools/gimp/find-gimp.js';
import { deleteDesignWork } from '../src/tools/blender/paths.js';
import { createBrandKit, linkBrandKit } from '../src/brand/brand-kits.js';
import { recordDesignRun } from '../src/tools/design-checkin.js';

const BRIEF = Object.fromEntries(IMAGE_BRIEF_FIELDS.map(([k]) => [k, `the ${k}`]));
const proposeBrief = (name: string) => new DesignProposeImageBriefTool().execute({ name, ...BRIEF, reasoning: 'because' });

describe('the GIMP script check', () => {
  it('lets an ordinary step through', () => {
    expect(checkGimpScript('img = ava_image("a", 64, 64)\nava_layer(img, "Base", fill="#112233")')).toBeNull();
  });
  it.each([
    ['import subprocess', 'starts other programs'],
    ['import urllib.request', 'uses the network'],
    ['import ctypes', 'native code'],
    ['Gimp.file_save(1, img, f, None)', 'the tool saves your images'],
    ['open(r"C:\\Users\\me\\x.txt", "w")', 'absolute path'],
    ['open("../../x.txt", "w")', '".."'],
  ])('refuses %s', (script, why) => {
    expect(checkGimpScript(script)).toContain(why);
  });
});

describe('GIMP 2 habits get a plain hint', () => {
  it.each([
    ["TypeError: Gimp.Image.select_ellipse() takes exactly 6 arguments (3 given)", 'separate numbers'],
    ["AttributeError: type object 'ChannelOps' has no attribute 'ADD_EXCLUDE'", 'ava_cut'],
    ["AttributeError: 'Layer' object has no attribute 'name'", 'get_name'],
  ])('%s', (error, want) => {
    expect(gimpApiHint(error)).toContain(want);
  });
  it.each([
    ["AttributeError: 'Layer' object has no attribute 'duplicate'", 'ava_copy_layer'],
    ["AttributeError: 'Image' object has no attribute 'lower_layer'", 'ava_move'],
    ["AttributeError: 'Layer' object has no attribute 'remove'", 'ava_remove'],
    ["AttributeError: 'Image' object has no attribute 'get_children'", 'get_layers'],
    ["AttributeError: 'gi.repository.Gimp' object has no attribute 'get_app'", 'brand new GIMP'],
    ["ValueError: too many values to unpack (expected 2)", 'ok, x, y'],
    ["TypeError: Object constructor cannot be used to create instances of a subclass Color", 'Gegl.Color.new'],
    ["Trying to add item 'x' (24) to wrong image", 'ava_copy_layer'],
    ["Cannot flatten an image without any visible layer.", 'hidden'],
  ])('%s', (error, want) => {
    expect(gimpApiHint(error)).toContain(want);
  });
  it('stays quiet on anything else', () => {
    expect(gimpApiHint('ValueError: broken on purpose')).toBeNull();
  });
  it('the end of every batch is not reported as a crash; a real one still is', () => {
    const out = [
      'my line',
      'C:\\GIMP\\gimp-console.exe: LibGimpBase-WARNING: gimp: gimp_wire_read(): unexpected EOF',
      'GIMP-Error: Plug-in crashed: "python-eval.py"',
      '(C:\\GIMP\\plug-ins\\python-eval\\python-eval.py)',
      'The dying plug-in may have messed up GIMP\'s internal state.',
      'EEEEeEeek! 1 GeglBuffers leaked',
      'GIMP-Error: Plug-in crashed: "file-png.exe"',
    ].join('\n');
    expect(scriptOutput(out)).toBe('my line\nGIMP-Error: Plug-in crashed: "file-png.exe"');
  });
});

describe('when to check in', () => {
  const ctx = (turn: string) => ({ cwd: '.', sharedState: { designTurnId: turn } });

  it('nudges after six runs with no word from them, and a new message resets it', () => {
    for (let i = 1; i <= 5; i++) expect(recordDesignRun(ctx('t1'), 'w1', true)).toBeNull();
    expect(recordDesignRun(ctx('t1'), 'w1', true)).toContain('6 runs since they last said anything');
    expect(recordDesignRun(ctx('t2'), 'w1', true)).toBeNull();
  });

  it('says stop after three failures in a row; a success clears it', () => {
    recordDesignRun(ctx('t3'), 'w2', false);
    recordDesignRun(ctx('t3'), 'w2', false);
    expect(recordDesignRun(ctx('t3'), 'w2', true)).toBeNull();
    recordDesignRun(ctx('t3'), 'w2', false);
    recordDesignRun(ctx('t3'), 'w2', false);
    expect(recordDesignRun(ctx('t3'), 'w2', false)).toContain("don't try a fourth time");
  });

  it('counts each piece of work on its own', () => {
    for (let i = 1; i <= 5; i++) recordDesignRun(ctx('t4'), 'a', true);
    expect(recordDesignRun(ctx('t4'), 'b', true)).toBeNull();
  });
});

describe('choosing GIMP in Settings', () => {
  it('refuses a path with no file, and a program that is not GIMP 3', async () => {
    expect(await setGimpPath(join(tmpdir(), 'no-such-gimp.exe'))).toMatchObject({ ok: false, error: 'There is no file at that path.' });
    expect((await setGimpPath(process.execPath)).error).toContain('did not answer as GIMP 3');
  }, 60_000);
});

const gimp = await findGimp();

describe.skipIf(!gimp)('in GIMP', () => {
  let dir: string;
  const tool = new DesignBuildImageTool();
  const ctx = { cwd: '.' };
  const run = (args: Record<string, unknown>) => tool.execute(args, ctx);

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ava-gimp-test-'));
    process.env.AVA_CREATIVE_DIR = dir;
  });
  afterAll(async () => {
    delete process.env.AVA_CREATIVE_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it('makes nothing until the person has agreed the brief', async () => {
    expect((await run({ name: 'Stat Icons', script: 'pass' })).output).toContain('has no brief yet');
    const missing = await new DesignProposeImageBriefTool().execute({ name: 'Stat Icons', what: 'x', reasoning: 'y' });
    expect(missing.output).toContain('Exact sizes');
    expect((await proposeBrief('Stat Icons')).success).toBe(true);
    expect((await run({ name: 'Stat Icons', script: 'pass' })).output).toContain('waiting for the person to agree');
    expect((await listImageWork())[0]).toMatchObject({ slug: 'stat-icons', built: false });
    expect((await agreeImageBrief('stat-icons'))?.status).toBe('agreed');
  });

  it('makes an image, saves the layered source, exports an exact size and returns the preview', async () => {
    const res = await run({
      name: 'Stat Icons', description: 'stat icons', timeout_seconds: 120,
      script: `img = ava_image("integrity", 128, 128)\nava_layer(img, "Plate", fill="#12343b")\nava_export(img, "integrity-64.png", size=(64, 64))\nprint("made it")`,
    });
    expect(res.success, res.output).toBe(true);
    expect(res.output).toContain('integrity 128×128 (1 layer)');
    expect(res.output).toContain('made it');
    expect(res.metadata?.base64_image).toBeTruthy();
    const folder = join(dir, 'gimp', 'stat-icons');
    for (const f of ['integrity.xcf', 'integrity.png', 'preview.png', 'script.py', 'exports/integrity-64.png']) {
      expect(existsSync(join(folder, f)), f).toBe(true);
    }
    expect(existsSync(join(folder, '.tmp'))).toBe(false);
    const lib = JSON.parse(await readFile(join(dir, 'metadata.json'), 'utf-8'));
    expect(lib[0]).toMatchObject({ id: 'gimp_stat-icons', kind: 'gimp', title: 'Stat Icons', imageCount: 1 });
  }, 120_000);

  it('a later run reopens the saved image and adds to it; a set is more names', async () => {
    const res = await run({ name: 'Stat Icons', script: `img = ava_image("integrity")\nava_layer(img, "Rim")\nb = ava_image("plating", 128, 128)\nava_layer(b, "Plate", fill="#334455")` });
    expect(res.success, res.output).toBe(true);
    expect(res.output).toContain('integrity 128×128 (2 layers)');
    expect(res.output).toContain('2 images in this work');
    expect((await readdir(join(dir, 'gimp', 'stat-icons', 'versions'))).length).toBe(1);
  }, 120_000);

  it('a failed run saves nothing', async () => {
    const xcf = join(dir, 'gimp', 'stat-icons', 'integrity.xcf');
    const before = await readFile(xcf);
    const res = await run({ name: 'Stat Icons', script: `img = ava_image("integrity")\nava_layer(img, "Oops")\nraise ValueError("broken on purpose")` });
    expect(res.success).toBe(false);
    expect(res.output).toContain('Nothing was saved');
    expect(res.output).toContain('broken on purpose');
    expect((await readFile(xcf)).equals(before)).toBe(true);
  }, 120_000);

  it.each([
    // Disguised so the script check misses them — this is the guard INSIDE GIMP.
    ['__import__("sub" + "process").run(["cmd"])', 'starting other programs'],
    ['__import__("so" + "cket").create_connection(("1.1.1.1", 80))', 'network access'],
    ['import os\nos.mkdir(os.path.join(os.path.dirname(ASSET_DIR), "escape"))', 'changing files outside the folder'],
  ])('the guard inside GIMP refuses %s', async (script, why) => {
    const res = await run({ name: 'Stat Icons', script });
    expect(res.success).toBe(false);
    expect(res.output).toContain(`Blocked by the Design Studio guard: ${why}`);
    expect(existsSync(join(dir, 'gimp', 'escape'))).toBe(false);
  }, 120_000);

  it('draws with the helpers: curves, cuts, gradient, editable text, filters', async () => {
    const res = await run({ name: 'Stat Icons', script: [
      'img = ava_image("helpers", 256, 256)',
      'a = ava_layer(img, "Curve")',
      'ava_gradient(a, dict(svg="M 128 20 C 170 80, 170 140, 128 200 C 86 140, 86 80, 128 20 Z"), "#ffffff", "#3fe8ff", 20, 200)',
      'b = ava_layer(img, "Ring")',
      'ava_fill(b, dict(ellipse=(40, 40, 176, 176)), "#3fe8ff")',
      'ava_cut(b, dict(ellipse=(56, 56, 144, 144)))',
      'c = ava_layer(img, "Plate")',
      'ava_fill(c, (dict(rect=(10, 10, 60, 60), radius=8), [100, 10, 160, 10, 130, 60]), "#112233")',
      't = ava_text(img, "DS", size=48, colour="#ffffff", x=10, y=180, spacing=2.0)',
      'ava_filter(a, "gegl:dropshadow", x=0.0, y=0.0, radius=8.0, opacity=0.8)',
      'print("KIND", type(t).__name__, len(ava_fonts()) > 0)',
    ].join('\n') });
    expect(res.success, res.output).toBe(true);
    expect(res.output).toContain('KIND TextLayer True');
    expect(res.output).toContain('helpers 256×256 (4 layers)');
  }, 120_000);

  it('a bad shape, a missing font and a GIMP 2 habit each say what to do', async () => {
    const shape = await run({ name: 'Stat Icons', script: 'img = ava_image("helpers")\nava_fill(ava_layer(img, "X"), [1, 2, 3], "#fff")' });
    expect(shape.output).toContain('flat list');
    const font = await run({ name: 'Stat Icons', script: 'img = ava_image("helpers")\nava_text(img, "x", font="Sans Nope Bold")' });
    expect(font.output).toContain('No font called');
    const old = await run({ name: 'Stat Icons', script: 'img = ava_image("helpers")\nimg.select_all()' });
    expect(old.output).toContain('Hint: Select all is Gimp.Selection.all(image)');
  }, 200_000);

  it('a changed brief has to be agreed again', async () => {
    await saveImageBriefEdits('stat-icons', { palette: '#000000' });
    expect(await readImageBrief('stat-icons')).toMatchObject({ status: 'proposed', editedByPerson: true, palette: '#000000' });
    expect((await run({ name: 'Stat Icons', script: 'pass' })).output).toContain('they edited it');
    await agreeImageBrief('stat-icons');
  });

  it('duplicates without touching the original', async () => {
    const res = await new DesignDuplicateImageTool().execute({ from: 'Stat Icons', to: 'Stat Icons Gold' });
    expect(res.success, res.output).toBe(true);
    const copy = join(dir, 'gimp', 'stat-icons-gold');
    expect(existsSync(join(copy, 'integrity.xcf'))).toBe(true);
    expect(existsSync(join(copy, 'versions'))).toBe(false);
    expect(await readImageBrief('stat-icons-gold')).toMatchObject({ name: 'Stat Icons Gold', status: 'agreed' });
  });

  it('shows in the Studio rail while GIMP runs, but a refused run does not', async () => {
    const seen: string[] = [];
    const manager = {
      create: (j: { type: string; prompt: string }) => seen.push(`create ${j.type} ${j.prompt}`),
      update: (_: string, p: { status?: string }) => seen.push(`update ${p.status}`),
      complete: () => seen.push('complete'),
      fail: () => seen.push('fail'),
    };
    const ctx2 = { cwd: '.', sharedState: { generationManager: manager } };
    await tool.execute({ name: 'No Brief', script: 'pass' }, ctx2);
    expect(seen).toEqual([]);
    await tool.execute({ name: 'Stat Icons', script: 'img = ava_image("integrity")' }, ctx2);
    expect(seen).toEqual(['create gimp Stat Icons', 'update generating', 'complete']);
  }, 120_000);

  it('the report shows what the file really is, and says what looks wrong', async () => {
    await proposeBrief('Report');
    await agreeImageBrief('report');
    const res = await tool.execute({ name: 'Report', script: `
img = ava_image("r", 200, 100)
a = ava_layer(img, "Faint"); ava_fill(a, dict(rect=(0, 0, 50, 50)), "#ff0000"); a.set_opacity(0.55)
ava_layer(img, "Nothing here")
b = ava_layer(img, "Away"); ava_fill(b, dict(rect=(0, 0, 50, 50)), "#00ff00"); b.set_offsets(500, 0)
s = ava_image("s", 100, 100)
ava_fill(ava_layer(s, "Under"), dict(rect=(0, 0, 9, 9)), "#00ff00")
ava_layer(s, "Lid", fill="#112233")
` }, { cwd: '.' });
    expect(res.success, res.output).toBe(true);
    expect(res.output).toContain('"Faint" opacity is 0.55, and the scale is 0-100');
    expect(res.output).toContain('Did you mean 55?');
    expect(res.output).toContain('"Nothing here" is empty');
    expect(res.output).toContain('"Away" is completely off the canvas');
    expect(res.output).toContain('"Under" cannot be seen: "Lid"');
  }, 120_000);

  it('an empty image is not saved, and a near name is the same image', async () => {
    await proposeBrief('Names');
    await agreeImageBrief('names');
    const empty = await tool.execute({ name: 'Names', script: 'img = ava_image("Blank", 64, 64)' }, { cwd: '.' });
    expect(empty.success).toBe(false);
    expect(empty.output).toContain('Nothing to save');
    await tool.execute({ name: 'Names', script: 'ava_layer(ava_image("Title Logo", 64, 64), "A", fill="#ffffff")' }, { cwd: '.' });
    const near = await tool.execute({ name: 'Names', script: 'print(len(ava_image("title-logo").get_layers()), len(ava_image().get_layers()))' }, { cwd: '.' });
    expect(near.output).toContain('1 1');
    expect(near.output).not.toContain('started a NEW image');
    const other = await tool.execute({ name: 'Names', script: 'ava_layer(ava_image("Second", 64, 64), "A", fill="#ffffff")' }, { cwd: '.' });
    expect(other.output).toContain('started a NEW image');
  }, 120_000);

  it('copies, moves and removes layers, reads true colours, and makes a real glow', async () => {
    await proposeBrief('Layers');
    await agreeImageBrief('layers');
    const res = await tool.execute({ name: 'Layers', script: `
img = ava_image("l", 200, 200)
base = ava_layer(img, "Base", fill="#07262C")
mark = ava_layer(img, "Mark"); ava_fill(mark, dict(rect=(80, 80, 40, 40)), "#3FE8FF")
copy = ava_copy_layer(mark, "Copy"); ava_move(copy, below="Base")
print("order", [l.get_name() for l in img.get_layers()])
ava_remove(copy)
print("true", ava_pixel(img, 100, 100), ava_pixel(img, 10, 10))
before = ava_pixel(img, 70, 100)
ava_glow(img, ["Mark"], radius=10.0, opacity=80.0, name="Glow")
print("glow lifted", before != ava_pixel(img, 70, 100))
print("names", [l.get_name() for l in img.get_layers()])
` }, { cwd: '.' });
    expect(res.success, res.output).toBe(true);
    expect(res.output).toContain("order ['Mark', 'Base', 'Copy']");
    expect(res.output).toContain('true #3FE8FF #07262C');
    expect(res.output).toContain('glow lifted True');
    expect(res.output).toContain("names ['Glow', 'Mark', 'Base']");
    const bad = await tool.execute({ name: 'Layers', script: 'ava_glow(ava_image("l"), None, opacity=0.5)' }, { cwd: '.' });
    expect(bad.output).toContain('Did you mean 50?');
  }, 120_000);

  it('she sees what she asks to see: exports, close-ups, and the proof sheet', async () => {
    await proposeBrief('Looks');
    await agreeImageBrief('looks');
    const res = await tool.execute({ name: 'Looks', script: `
img = ava_image("logo", 800, 400)
ava_fill(ava_layer(img, "Mark"), dict(ellipse=(300, 100, 200, 200)), "#3FE8FF")
ava_export(img, "logo.png")
ava_show("exports/logo.png", label="the export")
ava_show(img, crop=(300, 100, 100, 100), on="#101014", label="close-up")
ava_proof(img, on=("#ffffff", "#000000"), widths=(64, 32))
` }, { cwd: '.' });
    expect(res.success, res.output).toBe(true);
    expect(res.output).toContain('You are looking at, in order: the export; close-up; proof sheet');
    expect(res.metadata?.base64_image).toBeTruthy();
    expect(res.metadata?.more_images).toHaveLength(2);
    expect(existsSync(join(dir, 'gimp', 'looks', 'exports', 'proof.png'))).toBe(true);
    const auto = await tool.execute({ name: 'Looks', script: 'ava_image("logo")' }, { cwd: '.' });
    expect(auto.output).toContain('You are looking at, in order: logo.');
    expect(auto.metadata?.more_images).toHaveLength(0);
  }, 120_000);

  it('options go on the stage, and only their pick closes them', async () => {
    await proposeBrief('Choice');
    await agreeImageBrief('choice');
    await tool.execute({ name: 'Choice', script: `
img = ava_image("c", 64, 64)
ava_layer(img, "A", fill="#ffffff")
ava_export(img, "a.png"); ava_export(img, "b.png")
` }, { cwd: '.' });
    const show = new DesignShowOptionsTool();
    const two = [{ label: 'A', file: 'exports/a.png', note: 'One' }, { label: 'B', file: 'exports/b.png' }];
    expect((await show.execute({ name: 'Choice', question: 'Which?', options: two.slice(0, 1) })).success).toBe(false);
    expect((await show.execute({ name: 'Choice', question: 'Which?', options: [two[0], { label: 'X', file: '../looks/logo.png' }] })).output).toContain('not an image inside this work');
    expect((await show.execute({ name: 'Choice', question: 'Which?', options: [two[0], { label: 'X', file: 'exports/none.png' }] })).output).toContain('Export it first');
    const ok = await show.execute({ name: 'Choice', question: 'Which?', options: two });
    expect(ok.output).toContain('Stop here and wait');
    const find = async () => (await listImageWork()).find((w) => w.slug === 'choice')!;
    expect((await find()).options?.options).toHaveLength(2);
    expect(await pickImageOption('choice', 9)).toBeNull();
    expect((await pickImageOption('choice', 1))?.label).toBe('B');
    expect((await find()).options).toBeNull();
    expect(await pickImageOption('choice', 0)).toBeNull();
  }, 120_000);

  it('delete removes a brief with nothing made, and made work with its Library entry', async () => {
    await proposeBrief('Never Made');
    expect((await listImageWork()).some((w) => w.slug === 'never-made')).toBe(true);
    expect(await deleteDesignWork('gimp', 'never-made')).toBe(true);
    expect((await listImageWork()).some((w) => w.slug === 'never-made')).toBe(false);

    await proposeBrief('Made');
    await agreeImageBrief('made');
    await tool.execute({ name: 'Made', script: 'ava_layer(ava_image("m", 64, 64), "A", fill="#ffffff")' }, { cwd: '.' });
    const library = async () => JSON.parse(await readFile(join(dir, 'metadata.json'), 'utf-8')) as Array<{ id: string }>;
    expect((await library()).some((i) => i.id === 'gimp_made')).toBe(true);
    const others = (await library()).length;
    await deleteDesignWork('gimp', 'made');
    expect(existsSync(join(dir, 'gimp', 'made'))).toBe(false);
    expect((await library()).some((i) => i.id === 'gimp_made')).toBe(false);
    expect((await library()).length).toBe(others - 1);
  }, 120_000);

  it('delete refuses anything that is not one piece of work', async () => {
    expect(await deleteDesignWork('gimp', '..')).toBe(false);
    expect(await deleteDesignWork('gimp', '../gimp')).toBe(false);
    expect(await deleteDesignWork('gimp', '')).toBe(false);
    expect(existsSync(join(dir, 'gimp'))).toBe(true);
  });

  it('only marked files are final, and they can take one back off', async () => {
    await proposeBrief('Finals');
    await agreeImageBrief('finals');
    await tool.execute({ name: 'Finals', script: `
img = ava_image("f", 64, 64)
ava_layer(img, "A", fill="#ffffff")
ava_export(img, "logo.png"); ava_export(img, "test.png")
` }, { cwd: '.' });
    const mark = new DesignMarkFinalTool();
    expect(await readImageFinals('finals')).toEqual([]);
    expect((await mark.execute({ name: 'Finals', files: ['../art/a.png'] })).output).toContain('not an image inside this work');
    expect((await mark.execute({ name: 'Finals', files: ['exports/none.png'] })).output).toContain('no file at');
    expect((await mark.execute({ name: 'Finals', files: [] })).success).toBe(false);
    await mark.execute({ name: 'Finals', files: ['exports/logo.png'] });
    await mark.execute({ name: 'Finals', files: ['exports/test.png', 'exports/logo.png'] });
    expect((await listImageWork()).find((w) => w.slug === 'finals')?.finals).toEqual(['exports/logo.png', 'exports/test.png']);
    await removeImageFinal('finals', 'exports/test.png');
    expect(await readImageFinals('finals')).toEqual(['exports/logo.png']);
    await rm(join(dir, 'gimp', 'finals', 'exports', 'logo.png'));
    expect(await readImageFinals('finals')).toEqual([]);
  }, 120_000);

  it('a piece is nudged until it has a final, and then the preview shows the final', async () => {
    await proposeBrief('Ending');
    await agreeImageBrief('ending');
    const first = await tool.execute({ name: 'Ending', script: `
img = ava_image("logo", 64, 64)
ava_fill(ava_layer(img, "A"), dict(rect=(0, 0, 64, 64)), "#ff0000")
ava_export(img, "test.png")
` }, { cwd: '.' });
    expect(first.output).toContain('NO FINAL YET');
    const folder = join(dir, 'gimp', 'ending');
    const before = await readFile(join(folder, 'preview.png'));

    const failed = await tool.execute({ name: 'Ending', script: 'ava_final(ava_image("logo"), "lost.png")\nraise ValueError("no")' }, { cwd: '.' });
    expect(failed.success).toBe(false);
    expect(await readImageFinals('ending')).toEqual([]);

    const done = await tool.execute({ name: 'Ending', script: `
img = ava_image("logo")
ava_fill(ava_layer(img, "B"), dict(rect=(0, 0, 64, 64)), "#00ff00")
ava_final(img, "logo.png", size=(32, 32))
ava_export(img, "later-test.png")
` }, { cwd: '.' });
    expect(done.success, done.output).toBe(true);
    expect(done.output).not.toContain('NO FINAL YET');
    expect(await readImageFinals('ending')).toEqual(['final/logo.png']);
    expect(existsSync(join(folder, 'final', 'logo.png'))).toBe(true);
    expect((await readFile(join(folder, 'preview.png'))).equals(before)).toBe(false);
    const again = await tool.execute({ name: 'Ending', script: 'ava_final(ava_image("logo"), "logo.png")' }, { cwd: '.' });
    expect(again.success, again.output).toBe(true);
    expect(await readImageFinals('ending')).toEqual(['final/logo.png']);
  }, 120_000);

  it('the preview keeps real transparency, so the room can show it', async () => {
    await proposeBrief('Clear');
    await agreeImageBrief('clear');
    const res = await tool.execute({ name: 'Clear', script: `
img = ava_image("c", 64, 64)
ava_fill(ava_layer(img, "A"), dict(rect=(20, 20, 24, 24)), "#ff0000")
` }, { cwd: '.' });
    expect(res.success, res.output).toBe(true);
    const png = PNG.sync.read(await readFile(join(dir, 'gimp', 'clear', 'preview.png')));
    const alpha = (x: number, y: number) => png.data[(png.width * y + x) * 4 + 3];
    expect(alpha(2, 2)).toBe(0);
    expect(alpha(png.width >> 1, png.height >> 1)).toBe(255);
  }, 120_000);

  it('scripts reach the kit for this project, and are told when there is none', async () => {
    await proposeBrief('Kitted');
    await agreeImageBrief('kitted');
    process.env.AVA_BRAND_KITS_DIR = dir;
    const project = join(dir, 'Some Game');
    const kit = await createBrandKit({ name: 'Dawn', palette: { primary: '#3D52D8' } });
    const ctx = { cwd: '.', sharedState: { designProject: () => project } };
    const script = `
img = ava_image("k", 32, 32)
ava_layer(img, "A", fill="#ffffff")
print("kit", bool(KIT), KIT.name)
if KIT:
    print("colour", KIT.colour("primary"))
    ava_fill(ava_layer(img, "B"), dict(rect=(0, 0, 32, 32)), KIT.colour("primary"))
    print("reads", ava_pixel(img, 5, 5))
`;
    const none = await tool.execute({ name: 'Kitted', script }, ctx);
    expect(none.output).toContain('kit False None');
    await linkBrandKit(kit.id, project);
    const linked = await tool.execute({ name: 'Kitted', script }, ctx);
    expect(linked.output).toContain('kit True Dawn');
    expect(linked.output).toContain('reads #3D52D8');
    const missing = await tool.execute({ name: 'Kitted', script: 'ava_image("k"); KIT.logo("mark")' }, ctx);
    expect(missing.output).toContain('no "mark" logo');
    delete process.env.AVA_BRAND_KITS_DIR;
  }, 120_000);

  it('their art comes in by their own pick, and only images', async () => {
    await proposeBrief('Art');
    await agreeImageBrief('art');
    await tool.execute({ name: 'Art', script: `
img = ava_image("a", 64, 64)
ava_layer(img, "A", fill="#ffffff")
ava_export(img, "src.png")
` }, { cwd: '.' });
    const src = join(dir, 'gimp', 'art', 'exports', 'src.png');
    const added = await addImageReference('art', src);
    expect(added).toEqual({ ok: true, file: 'references/src.png' });
    expect((await listImageWork()).find((w) => w.slug === 'art')?.references).toEqual(['src.png']);
    expect((await addImageReference('art', join(dir, 'metadata.json'))).ok).toBe(false);
    expect((await addImageReference('../art', src)).ok).toBe(false);
    const used = await tool.execute({ name: 'Art', script: 'ava_show(ava_image("a"), on="references/src.png", label="on their art")' }, { cwd: '.' });
    expect(used.success, used.output).toBe(true);
  }, 120_000);
});
