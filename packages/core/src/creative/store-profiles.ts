/**
 * Store-ready downloads (Library folders and packs plan, Phase 5).
 *
 * Choose a store, and the download is PREPARED for it and CHECKED against its
 * rules — the rules read on the stores' own pages on 7 Nov 2026 (see the plan).
 * Checks report problems and let the person decide; nothing is hidden.
 *
 * Wording rules: "prepared for Fab", never "approved" — only the store
 * approves. Stores that ban this work are listed as blocked, with the reason,
 * so nobody finds out when their account is suspended. Declaring AI use is in
 * every open store's rules and is the person's to do; the making record is
 * what they write it from. We never choose their licence.
 */

import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, extname, join, relative } from 'node:path';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { decodeImage, type RawImage } from './image-local.js';
import { MAKING_RECORD_FILE, type ReportPiece } from './making-report.js';
import { readMaking, type MakingFont } from '../tools/making-record.js';

export type StoreId = 'unity' | 'fab' | 'itch' | 'gumroad' | 'superhive' | 'godot';

export interface StoreProfile {
  id: StoreId | 'turbosquid' | 'envato';
  name: string;
  /** ready: we prepare for it. blocked: the store bans this work. target: not a store (Godot). */
  status: 'ready' | 'blocked' | 'target';
  /** One line on what the download will be. */
  summary: string;
  /** Why a blocked store is blocked, or the disclosure rule for an open one. */
  note: string;
}

/** Every store we know about, ready or not. Shown in the Download panel exactly like this. */
export const STORE_PROFILES: StoreProfile[] = [
  { id: 'unity', name: 'Unity Asset Store', status: 'ready',
    summary: 'One root folder, .fbx and .png, the .blend files zipped as source, Third-Party Notices, and a checklist of what is left to do in Unity.',
    note: 'Unity requires AI-generated content to be disclosed in its "AI description" field, in plain terms. That is yours to write; How-this-was-made.txt has the facts.' },
  { id: 'fab', name: 'Fab (3D)', status: 'ready',
    summary: 'One zip per format (FBX, GLB, Blend), names with underscores, a scale check against a 1.92 m human, and a 1920 × 1080 gallery image.',
    note: 'Fab requires products to say whether generative AI tools were used. Treat scripted Blender work by an AI as yes, and declare it.' },
  { id: 'itch', name: 'itch.io', status: 'ready',
    summary: 'Your folders as they are, with a License.txt for you to fill in.',
    note: 'itch.io requires AI use to be declared on the page, and treats mass-produced AI pages as spam.' },
  { id: 'gumroad', name: 'Gumroad', status: 'ready',
    summary: 'Your folders as they are, zipped, with a License.txt for you to fill in.',
    note: 'Gumroad has no AI rule of its own, but you must hold the rights to what you sell. Saying how it was made is still the honest thing to do.' },
  { id: 'superhive', name: 'Superhive (Blender Market)', status: 'ready',
    summary: 'Each .blend packed with its textures inside, and a check that object names are in English.',
    note: 'Superhive does not take AI-only work or prompt-only models, but allows tools where a person decides — and may ask for evidence. How-this-was-made.txt is that evidence.' },
  { id: 'godot', name: 'Godot (for your own game)', status: 'target',
    summary: 'Just the .glb models and finished images, ready to drop into a Godot project.',
    note: 'Not a store: the Godot Asset Store has no paid assets yet.' },
  { id: 'turbosquid', name: 'TurboSquid', status: 'blocked',
    summary: '', note: 'TurboSquid bans AI-generated work: sellers promise none was used. This pack cannot be sold there.' },
  { id: 'envato', name: 'Envato (GraphicRiver, 3DOcean)', status: 'blocked',
    summary: '', note: 'Envato bans AI as the main part of an item, and new author accounts are closed.' },
];

export interface StoreContext {
  root: string;
  topName: string;
  pieces: ReportPiece[];
  models: Array<{ label: string; to: string; name: string; triangles?: number; sizeM?: number[] }>;
  blender: string | null;
  warn: (item: string, message: string) => void;
}

// ── Small helpers ────────────────────────────────────────────────────────────

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

const STORED = /\.(png|jpe?g|webp|gif|mp4|webm|mov|mp3|m4a|ogg|flac|zip|glb)$/i;

/** Zip a list of files (absolute) under names relative to `base`, written as it is made. */
async function zipFiles(files: string[], base: string, zipPath: string, prefix = ''): Promise<void> {
  const out = createWriteStream(zipPath);
  const failed = new Promise<never>((_, reject) => out.on('error', reject));
  failed.catch(() => {});
  let wait: Promise<void> = Promise.resolve();
  const zip = new Zip((err, chunk, final) => {
    if (err) { out.destroy(err); return; }
    if (!out.write(Buffer.from(chunk))) wait = new Promise((r) => out.once('drain', () => r()));
    if (final) out.end();
  });
  const done = new Promise<void>((resolve) => out.on('finish', () => resolve()));
  for (const f of files) {
    const name = prefix + relative(base, f).split(/[\\/]/).join('/');
    const entry = STORED.test(f) ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
    zip.add(entry);
    for await (const chunk of createReadStream(f)) { entry.push(chunk as Uint8Array); await Promise.race([wait, failed]); }
    entry.push(new Uint8Array(0), true);
    await Promise.race([wait, failed]);
  }
  zip.end();
  await Promise.race([done, failed]);
}

async function runBlender(exe: string, py: string, args: string[]): Promise<string> {
  const script = join(tmpdir(), `ava-store-${randomUUID()}.py`);
  await writeFile(script, py, 'utf-8');
  let stdout = '';
  try {
    await new Promise<void>((resolve) => {
      const child = spawn(exe, ['-b', '--factory-startup', '--disable-autoexec', '--python', script, '--', ...args], { windowsHide: true });
      const timer = setTimeout(() => child.kill(), 300_000);
      child.stdout.on('data', (d) => { if (stdout.length < 200_000) stdout += d; });
      child.on('close', () => { clearTimeout(timer); resolve(); });
      child.on('error', () => { clearTimeout(timer); resolve(); });
    });
  } finally { await rm(script, { force: true }).catch(() => {}); }
  return stdout;
}

/** PNG width × height from its header, without decoding it. */
async function pngSize(path: string): Promise<[number, number] | null> {
  try {
    const head = (await readFile(path)).subarray(0, 24);
    if (head[0] !== 0x89 || head.toString('latin1', 12, 16) !== 'IHDR') return null;
    return [head.readUInt32BE(16), head.readUInt32BE(20)];
  } catch { return null; }
}

/** Every font the pack's pieces were recorded using, with licences. */
async function packFonts(pieces: ReportPiece[]): Promise<MakingFont[]> {
  const fonts = new Map<string, MakingFont>();
  for (const p of pieces) {
    if (!p.item?.absoluteFolder) continue;
    for (const e of await readMaking(p.item.absoluteFolder)) {
      if (e.event !== 'step') continue;
      for (const f of (e.fonts as MakingFont[] ?? [])) fonts.set(f.name, f);
    }
  }
  return [...fonts.values()];
}

const PATH_LIMIT = { unity: 150, fab: 140 } as const;

function checkPathLengths(ctx: StoreContext, limit: number, store: string) {
  return walk(ctx.root).then((files) => {
    const long = files.map((f) => `${ctx.topName}/${relative(ctx.root, f).split(/[\\/]/).join('/')}`).filter((p) => p.length > limit);
    if (long.length) ctx.warn('Paths', `${long.length} path${long.length === 1 ? ' is' : 's are'} over ${store}'s ${limit}-character limit, e.g. ${long[0]}. Shorten the folder or piece names.`);
  });
}

/** Turn WebP/JPEG/GIF images into PNG with Blender (Unity takes lossless images only). */
const TO_PNG_PY = String.raw`
import bpy, sys, json
files = json.loads(open(sys.argv[sys.argv.index('--') + 1], encoding='utf-8').read())
done = []
for src, out in files:
    try:
        img = bpy.data.images.load(src)
        sc = bpy.context.scene
        sc.render.image_settings.file_format = 'PNG'
        sc.render.image_settings.color_mode = 'RGBA'
        img.save_render(out, scene=sc)
        done.append(src)
    except Exception as e:
        pass
print('@@AVA_PNG@@' + json.dumps(done))
`;

async function convertToPng(ctx: StoreContext, files: string[]): Promise<string[]> {
  if (!files.length) return [];
  if (!ctx.blender) {
    ctx.warn('Images', `${files.length} image${files.length === 1 ? ' is' : 's are'} not PNG, and Blender isn't installed to convert ${files.length === 1 ? 'it' : 'them'}: ${files.map((f) => basename(f)).join(', ')}. Unity takes PNG, TGA, PSB or PSD.`);
    return [];
  }
  const pairs = files.map((f) => [f, f.slice(0, -extname(f).length) + '.png']);
  const list = join(tmpdir(), `ava-png-${randomUUID()}.json`);
  await writeFile(list, JSON.stringify(pairs), 'utf-8');
  const out = await runBlender(ctx.blender, TO_PNG_PY, [list]).finally(() => rm(list, { force: true }).catch(() => {}));
  const at = out.lastIndexOf('@@AVA_PNG@@');
  const done: string[] = at >= 0 ? JSON.parse(out.slice(at + 11).split(/\r?\n/)[0]) : [];
  for (const f of done) await rm(f, { force: true });
  const failed = files.filter((f) => !done.includes(f));
  if (failed.length) ctx.warn('Images', `Couldn't convert to PNG: ${failed.map((f) => basename(f)).join(', ')}.`);
  return done;
}

// ── Unity ────────────────────────────────────────────────────────────────────

async function forUnity(ctx: StoreContext): Promise<void> {
  const files = await walk(ctx.root);
  // No .glb in a Unity package.
  for (const f of files.filter((f) => /\.glb$/i.test(f))) await rm(f, { force: true });
  // Lossless images only.
  await convertToPng(ctx, files.filter((f) => /\.(webp|jpe?g|gif)$/i.test(f) && !/[\\/]textures[\\/]/i.test(f)));
  // Source files zipped, with "source" in the name (2.2.b).
  const blends = (await walk(ctx.root)).filter((f) => /\.blend$/i.test(f));
  if (blends.length) {
    await zipFiles(blends, ctx.root, join(ctx.root, `${ctx.topName}-source.zip`));
    for (const b of blends) await rm(b, { force: true });
  }
  // Third-Party Notices (1.2): fonts and their licences.
  const fonts = await packFonts(ctx.pieces);
  const apache = fonts.filter((f) => f.licence === 'Apache-2.0');
  const unknownFonts = fonts.filter((f) => f.licence === 'not-google' || f.licence === 'unchecked' || f.licence === 'unread' || f.licence === 'alias');
  await writeFile(join(ctx.root, 'Third-Party Notices.txt'), [
    `Third-Party Notices — ${ctx.topName}`,
    '',
    fonts.length ? 'Fonts used in this package (text in images is part of the picture; no font file is included unless listed as a file below):' : 'No fonts or other third-party components were recorded for this package.',
    ...fonts.map((f) => `- ${f.name}: ${f.licence === 'OFL' ? 'SIL Open Font License 1.1' : f.licence === 'Apache-2.0' ? 'Apache License 2.0' : f.licence === 'UFL' ? 'Ubuntu Font Licence 1.0' : 'licence not known — check it'}`),
    '',
    'Check this list before you submit: add anything else you brought in.',
    '',
  ].join('\n'), 'utf-8');
  if (apache.length) ctx.warn('Fonts', `${apache.map((f) => f.name).join(', ')} ${apache.length === 1 ? 'is' : 'are'} Apache 2.0. Unity refuses Apache licences that require attribution: check with Unity before relying on it, or use an OFL font.`);
  if (unknownFonts.length) ctx.warn('Fonts', `The licence of ${unknownFonts.map((f) => f.name).join(', ')} isn't known. Check it before you submit.`);

  // What a listing needs, and what is left to do in Unity.
  const textures: string[] = [];
  for (const f of (await walk(ctx.root)).filter((f) => /[\\/]textures[\\/].+\.png$/i.test(f))) {
    const size = await pngSize(f);
    if (size) {
      textures.push(`${relative(ctx.root, f).split(/[\\/]/).join('/')}: ${size[0]} × ${size[1]}`);
      const pow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;
      if (!pow2(size[0]) || !pow2(size[1])) ctx.warn('Textures', `${basename(f)} is ${size[0]} × ${size[1]}; Unity asks for power-of-two textures.`);
    }
  }
  const total = (await Promise.all((await walk(ctx.root)).map((f) => stat(f).then((s) => s.size).catch(() => 0)))).reduce((a, b) => a + b, 0);
  if (total > 6 * 1024 ** 3) ctx.warn('Size', 'The package is over Unity\'s 6 GB limit.');
  await checkPathLengths(ctx, PATH_LIMIT.unity, 'Unity');
  await writeFile(join(ctx.root, 'Unity-checklist.txt'), [
    `Prepared for the Unity Asset Store — ${ctx.topName}`,
    'Only Unity decides whether it is accepted. This is what was prepared, and what is left for you.',
    '',
    'PREPARED',
    '- One root folder named after the package, sorted by relationship (each model in its own folder with its textures).',
    '- Models as .fbx, images as .png. No .glb.',
    blends.length ? `- The .blend source files are zipped in ${ctx.topName}-source.zip ("source" in the name, as Unity asks).` : '- No source files to include.',
    '- Third-Party Notices.txt lists the fonts recorded for this pack.',
    '',
    'FOR YOUR LISTING',
    ...(ctx.models.length ? ctx.models.map((m) => `- ${m.label}: ${m.triangles !== undefined ? `${m.triangles.toLocaleString('en')} triangles` : 'triangle count not recorded'}${m.sizeM?.length === 3 ? `, ${m.sizeM.map((n) => +n.toFixed(2)).join(' × ')} m` : ''}`) : ['- No 3D models.']),
    ...(textures.length ? ['Textures:', ...textures.map((t) => `- ${t}`)] : []),
    '',
    'LEFT TO DO IN UNITY (Ava can\'t do these: they are built inside the engine)',
    '- Import into Unity 2022.3 or newer.',
    '- Make prefabs, and add colliders to static models.',
    '- Check each model: 1 unit = 1 metre, pivot at the bottom centre, positive Z forward.',
    '- Build a demo scene that shows every asset (required for 3D and 2D).',
    '- Render your marketing images in the Unity Editor, or say which other software you used.',
    '- Upload with Unity\'s Asset Store Publishing Tools.',
    '',
    'AI DISCLOSURE',
    '- Unity requires AI-generated content to be disclosed in the "AI description" field: which AI tools, and what was generated, in plain terms, without marketing language.',
    '- How-this-was-made.txt has the facts to write it from. Do not use words like "hand drawn" or "painted" for AI-assisted work.',
    '- New publishers can submit 5 packages a month.',
    '',
  ].join('\n'), 'utf-8');
}

// ── Fab ──────────────────────────────────────────────────────────────────────

/** Fab's names: English letters, numbers and underscores. */
const fabName = (n: string) => n.replace(/-/g, '_').replace(/[^A-Za-z0-9_.]/g, '_');

async function renameTree(dir: string, rename_: (n: string) => string): Promise<void> {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const from = join(dir, e.name);
    // The making record keeps its name: it is how anyone finds it. Textures keep
    // theirs too: the .fbx and .blend link them BY NAME, so a renamed texture is
    // a missing one (caught by test, 9 Nov).
    const keep = e.name === MAKING_RECORD_FILE || (e.isFile() && basename(dir).toLowerCase() === 'textures');
    const to = keep ? from : join(dir, rename_(e.name));
    if (e.isDirectory()) await renameTree(from, rename_);
    if (to !== from && !existsSync(to)) await rename(from, to);
  }
}

async function forFab(ctx: StoreContext): Promise<void> {
  const twoD = ctx.pieces.filter((p) => !(p.item?.kind === 'model'));
  if (twoD.length) ctx.warn('2D pieces', `Fab's file formats are 3D and engine formats; whether it takes loose 2D files (${twoD.map((p) => p.label).join(', ')}) is not confirmed. They are in the 2D zip; check with Fab before relying on it.`);
  for (const m of ctx.models) {
    const size = m.sizeM?.length === 3 ? Math.max(...m.sizeM) : undefined;
    if (size !== undefined && (size > 1.92 * 50 || size < 0.01)) ctx.warn(m.label, `It is ${size.toFixed(2)} m at its largest. Fab asks for assets scaled to a 1.92 m human: check that this is its real size.`);
  }
  await renameTree(ctx.root, fabName);

  // One zip per format (Fab: only FBX files in the FBX upload, and so on).
  const files = await walk(ctx.root);
  const textures = files.filter((f) => /[\\/]textures[\\/]/i.test(f));
  const formats: Array<[string, RegExp, boolean]> = [['FBX', /\.fbx$/i, true], ['GLB', /\.glb$/i, false], ['Blend', /\.blend$/i, true]];
  const made: string[] = [];
  for (const [label, re, withTextures] of formats) {
    const set = files.filter((f) => re.test(f));
    if (!set.length) continue;
    const name = `${fabName(ctx.topName)}_${label}.zip`;
    await zipFiles([...set, ...(withTextures ? textures : [])], ctx.root, join(ctx.root, name), `${fabName(ctx.topName)}/`);
    made.push(name);
  }
  const isRecord = (f: string) => basename(f) === MAKING_RECORD_FILE;
  const flat = files.filter((f) => !/\.(fbx|glb|blend)$/i.test(f) && !/[\\/]textures[\\/]/i.test(f) && !isRecord(f));
  if (flat.length) {
    const name = `${fabName(ctx.topName)}_2D.zip`;
    await zipFiles(flat, ctx.root, join(ctx.root, name), `${fabName(ctx.topName)}/`);
    made.push(name);
  }
  // The loose copies are now inside the zips.
  for (const f of files) if (!isRecord(f)) await rm(f, { force: true });
  for (const e of await readdir(ctx.root, { withFileTypes: true })) if (e.isDirectory()) await rm(join(ctx.root, e.name), { recursive: true, force: true });

  await galleryImage(ctx, join(ctx.root, `${fabName(ctx.topName)}_gallery.jpg`));
  await writeFile(join(ctx.root, 'Fab-checklist.txt'), [
    `Prepared for Fab — ${ctx.topName}`,
    'Only Fab decides whether it is accepted. This is what was prepared, and what is left for you.',
    '',
    'PREPARED',
    ...made.map((z) => `- ${z}: upload this one under its own file type on Fab.`),
    `- ${fabName(ctx.topName)}_gallery.jpg: every piece in a grid on a plain background, 1920 × 1080.`,
    '- Folder and file names use English letters, numbers and underscores. Texture files keep their names, because the models link them by name.',
    '',
    'SCALE (Fab: relative to a 1.92 m human)',
    ...(ctx.models.length ? ctx.models.map((m) => `- ${m.label}: ${m.sizeM?.length === 3 ? `${m.sizeM.map((n) => +n.toFixed(2)).join(' × ')} m` : 'size not recorded'}`) : ['- No 3D models.']),
    '',
    'LEFT FOR YOU',
    '- Make sure there are no visual defects in any model.',
    '- Write the listing in your own words, and add more gallery images if you want them.',
    '- Payouts start at $100, and you must provide and watch a support channel.',
    '',
    'AI DISCLOSURE',
    '- Fab requires products to say whether generative AI tools were used. Ava Supernova scripted this work, so declare it. How-this-was-made.txt has the facts.',
    '',
  ].join('\n'), 'utf-8');
}

/** Every piece's picture in a grid, 1920 × 1080 on a plain background, JPEG under 3 MB. */
async function galleryImage(ctx: StoreContext, out: string): Promise<void> {
  const pictures: RawImage[] = [];
  for (const p of ctx.pieces) {
    const folder = p.item?.absoluteFolder;
    const candidates = folder ? [join(folder, 'preview.png')] : [];
    if (p.item && !folder && (p.item as { absolutePath?: string }).absolutePath) candidates.push((p.item as { absolutePath?: string }).absolutePath!);
    for (const c of candidates) {
      if (!existsSync(c) || !/\.(png|jpe?g)$/i.test(c)) continue;
      try { pictures.push(await decodeImage(await readFile(c))); break; } catch { /* next */ }
    }
  }
  if (!pictures.length) { ctx.warn('Gallery', 'No pictures to put in the gallery image.'); return; }
  const W = 1920, H = 1080, BG = [238, 238, 240];
  const cols = Math.ceil(Math.sqrt(pictures.length * (W / H)));
  const rows = Math.ceil(pictures.length / cols);
  const cell = Math.floor(Math.min(W / cols, H / rows));
  const ox = Math.floor((W - cell * cols) / 2), oy = Math.floor((H - cell * rows) / 2);
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { data[i * 4] = BG[0]; data[i * 4 + 1] = BG[1]; data[i * 4 + 2] = BG[2]; data[i * 4 + 3] = 255; }
  pictures.forEach((img, n) => {
    const pad = Math.floor(cell * 0.08), box = cell - pad * 2;
    const scale = Math.min(box / img.width, box / img.height);
    const w = Math.max(1, Math.floor(img.width * scale)), h = Math.max(1, Math.floor(img.height * scale));
    const x0 = ox + (n % cols) * cell + pad + Math.floor((box - w) / 2), y0 = oy + Math.floor(n / cols) * cell + pad + Math.floor((box - h) / 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = (Math.min(img.height - 1, Math.floor(y / scale)) * img.width + Math.min(img.width - 1, Math.floor(x / scale))) * 4;
      const d = ((y0 + y) * W + (x0 + x)) * 4, a = img.data[s + 3] / 255;
      for (let c = 0; c < 3; c++) data[d + c] = Math.round(img.data[s + c] * a + data[d + c] * (1 - a));
    }
  });
  const jpeg = await import('jpeg-js');
  let quality = 88;
  let bytes = (jpeg.default ?? jpeg).encode({ data, width: W, height: H }, quality).data;
  while (bytes.length > 3 * 1024 * 1024 && quality > 50) { quality -= 10; bytes = (jpeg.default ?? jpeg).encode({ data, width: W, height: H }, quality).data; }
  await writeFile(out, bytes);
}

// ── itch.io and Gumroad ──────────────────────────────────────────────────────

async function licenceTemplate(ctx: StoreContext, store: string): Promise<void> {
  await writeFile(join(ctx.root, 'License.txt'), [
    `${ctx.topName}`,
    '',
    'LICENCE — yours to choose and write here. Ava Supernova does not choose a licence for you',
    'and does not give legal advice. Say what buyers may do with these files (for example, use them',
    'in their own games, commercial or not) and what they may not (for example, resell them as they are).',
    '',
    '[Write your licence here]',
    '',
    'Fonts and anything you brought in keep their own licences: see How-this-was-made.txt.',
    `${store} asks sellers to be clear about how their work was made; How-this-was-made.txt has the facts.`,
    '',
  ].join('\n'), 'utf-8');
  ctx.warn('Licence', 'License.txt is a template: write your licence in it before you upload.');
}

// ── Superhive ────────────────────────────────────────────────────────────────

const PACK_PY = String.raw`
import bpy, sys, json
blend = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.open_mainfile(filepath=blend)
bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backup left in the download
bad = [o.name for o in bpy.data.objects if any(ord(c) > 127 for c in o.name)]
try:
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_mainfile(compress=True)
    ok = True
except Exception as e:
    ok = False
print('@@AVA_PACK@@' + json.dumps({'ok': ok, 'bad': bad}))
`;

async function forSuperhive(ctx: StoreContext): Promise<void> {
  const blends = (await walk(ctx.root)).filter((f) => /\.blend$/i.test(f));
  if (!blends.length) { ctx.warn('Superhive', 'There are no .blend files in this pack; Superhive is a Blender marketplace.'); return; }
  if (!ctx.blender) { ctx.warn('Superhive', 'Blender isn\'t installed, so the .blend files couldn\'t be packed with their textures.'); return; }
  for (const b of blends) {
    const out = await runBlender(ctx.blender, PACK_PY, [b]);
    const at = out.lastIndexOf('@@AVA_PACK@@');
    const r = at >= 0 ? JSON.parse(out.slice(at + 12).split(/\r?\n/)[0]) as { ok: boolean; bad: string[] } : { ok: false, bad: [] };
    if (!r.ok) ctx.warn(basename(b), 'Couldn\'t pack its textures into the .blend.');
    if (r.bad.length) ctx.warn(basename(b), `Object names that aren't in English letters: ${r.bad.join(', ')}. Superhive asks for English object names.`);
  }
}

// ── Godot ────────────────────────────────────────────────────────────────────

async function forGodot(ctx: StoreContext): Promise<void> {
  // .glb carries its textures inside; nothing else is needed for Godot.
  for (const f of await walk(ctx.root)) {
    if (/\.(fbx|blend)$/i.test(f) || /[\\/]textures[\\/]/i.test(f)) await rm(f, { force: true });
  }
  // Remove the now-empty textures folders.
  const prune = async (dir: string): Promise<boolean> => {
    let empty = true;
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.isDirectory()) { if (await prune(join(dir, e.name))) await rm(join(dir, e.name), { recursive: true, force: true }); else empty = false; }
      else empty = false;
    }
    return empty;
  };
  await prune(ctx.root);
}

/** Prepare the downloaded folder for a store, in place. */
export async function prepareForStore(store: StoreId, ctx: StoreContext): Promise<void> {
  if (store === 'unity') return forUnity(ctx);
  if (store === 'fab') return forFab(ctx);
  if (store === 'itch') return licenceTemplate(ctx, 'itch.io');
  if (store === 'gumroad') return licenceTemplate(ctx, 'Gumroad');
  if (store === 'superhive') return forSuperhive(ctx);
  if (store === 'godot') return forGodot(ctx);
}

/** Gumroad is sold as one zip. */
export const STORE_WANTS_ZIP: Partial<Record<StoreId, boolean>> = { gumroad: true };

