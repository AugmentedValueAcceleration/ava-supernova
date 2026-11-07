/**
 * Design Studio 2D — Ava makes images in GIMP with no window.
 *
 * The same shape as design_build_model (his call, 1 Nov 2026: GIMP is Phase 4,
 * the same pattern as Blender). A piece of work lives in its own folder under
 * ~/.ava/creative/gimp/<name>/: one layered .xcf per image, a PNG of each, and
 * anything exported at exact sizes in exports/. A set is several images in one
 * folder. Saved work is reopened, including what the person changed by hand in
 * GIMP; a run that fails saves nothing; the last 5 versions of each image are
 * kept; the brief is agreed on the card first.
 *
 * Generation is an aid here, never the maker (his direction, 3 Nov 2026): an
 * image from Open Canvas can be brought in as a layer with ava_place, and the
 * work stays in layers the person owns.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, readdir, stat, rm, cp, copyFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from '../types.js';
import type { FunctionSchema } from '../../providers/types.js';
import type { GenerationManager } from '../generation-manager.js';
import { designRunRefusal, recordDesignRun } from '../design-checkin.js';
import { creativeDir, imagesDir, metadataFile, modelSlug } from '../blender/paths.js';
import { kitForProject, kitForScripts, kitPieceStates } from '../../brand/brand-kits.js';
import { briefStore, type BriefRecord } from '../brief-store.js';
import { findGimp, GIMP_DOWNLOAD_URL } from './find-gimp.js';
import { GIMP_RUNNER_PY } from './runner-py.js';

const DEFAULT_TIMEOUT_S = 180;
const MAX_TIMEOUT_S = 600;
const MAX_OUTPUT = 400_000;

// ── The brief ────────────────────────────────────────────────────────────────

export const IMAGE_BRIEF_FIELDS: Array<[string, string, string]> = [
  ['what', 'What it is', 'e.g. "the stat icons for a sci-fi character screen"'],
  ['where', 'Where it is used', 'e.g. "the stat panel, on a dark teal UI, read at a glance"'],
  ['style', 'Style', 'the look — and why it suits where it lives'],
  ['sizes', 'Exact sizes', 'pixel sizes and formats, e.g. "64×64 and 128×128 PNG, transparent"'],
  ['set', 'The set', 'how many, and each item by name — or "just this one"'],
  ['palette', 'Palette', 'the colours, as hex, taken from what it sits beside'],
  ['references', 'References', 'what you found that shows how this kind of thing is done well'],
  ['aid', 'Generation aid', 'whether a generated image helps here and for what — or "none, GIMP alone"'],
  ['purpose', 'Purpose', 'their own project, or for sale'],
];

export interface ImageBrief extends BriefRecord { [field: string]: unknown }

const store = briefStore<ImageBrief>(imagesDir, () => IMAGE_BRIEF_FIELDS.map(([k]) => k));
export const readImageBrief = store.read;
export const agreeImageBrief = store.agree;
export const saveImageBriefEdits = store.saveEdits;

export const formatImageBrief = (b: ImageBrief) =>
  IMAGE_BRIEF_FIELDS.map(([k, label]) => `${label}: ${(b[k] as string) || '—'}`).join('\n');

export interface ImageOption { label: string; file: string; note?: string }
export interface ImageOptions {
  question: string;
  options: ImageOption[];
  status: 'waiting' | 'picked';
  picked?: number;
  proposedAt: string;
}

export interface ImageWorkSummary {
  slug: string; name: string; brief: ImageBrief | null; built: boolean; updatedAt: string;
  /** Versions waiting on the stage for them to choose between. */
  options: ImageOptions | null;
  /** Their own art, in references/, for her to test against. */
  references: string[];
  /** The finished files. Everything else in the folder is working material. */
  finals: string[];
  /** Every step so far, oldest first, so they can look back and return to one. */
  history: ImageStep[];
  /** The separate designs in this work, leaving out her tests, by image name. */
  versions: string[];
  /** The one they chose as the main design. */
  main: string | null;
}

/** One step of the work, saved so they can return to it. */
export interface ImageStep { number: number; label: string; at: string; preview: string | null }

const IMAGE_FILE = /\.(png|jpe?g|webp)$/i;
const MAX_ART_BYTES = 50 * 1024 * 1024;

/** A work makes dozens of tests and comparisons on the way to a few finished
 *  files. This list is what counts as the work, wherever it is offered. */
export async function readImageFinals(slug: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(join(imagesDir(), slug, 'finals.json'), 'utf-8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f): f is string => typeof f === 'string' && existsSync(join(imagesDir(), slug, f)));
  } catch { return []; }
}

const writeFinals = (slug: string, files: string[]) =>
  writeFile(join(imagesDir(), slug, 'finals.json'), JSON.stringify(files, null, 2), 'utf-8');

/** Their click on the stage: this file isn't final after all. */
export async function removeImageFinal(slug: string, file: string): Promise<void> {
  if (modelSlug(slug) !== slug) return;
  await writeFinals(slug, (await readImageFinals(slug)).filter((f) => f !== file));
}

export async function readImageOptions(slug: string): Promise<ImageOptions | null> {
  try { return JSON.parse(await readFile(join(imagesDir(), slug, 'options.json'), 'utf-8')) as ImageOptions; }
  catch { return null; }
}

/** Their click on the stage. Only they choose: her tool can only ask. */
export async function pickImageOption(slug: string, index: number): Promise<ImageOption | null> {
  if (modelSlug(slug) !== slug) return null;
  const current = await readImageOptions(slug);
  const option = current?.status === 'waiting' ? current.options[index] : undefined;
  if (!current || !option) return null;
  await writeFile(join(imagesDir(), slug, 'options.json'), JSON.stringify({ ...current, status: 'picked', picked: index }, null, 2), 'utf-8');
  return option;
}

async function listImageReferences(slug: string): Promise<string[]> {
  return (await readdir(join(imagesDir(), slug, 'references')).catch(() => [] as string[])).filter((f) => IMAGE_FILE.test(f)).sort();
}

/** A file they picked themselves in the Add your art dialog, copied into the
 *  work so her scripts can reach it. Her own tools have no way to do this. */
export async function addImageReference(slug: string, source: string): Promise<{ ok: true; file: string } | { ok: false; error: string }> {
  if (modelSlug(slug) !== slug || !existsSync(join(imagesDir(), slug))) return { ok: false, error: 'That work could not be found.' };
  if (!IMAGE_FILE.test(source)) return { ok: false, error: 'Use a PNG, JPEG or WebP image.' };
  const size = (await stat(source).catch(() => null))?.size;
  if (size === undefined) return { ok: false, error: 'That file could not be read.' };
  if (size > MAX_ART_BYTES) return { ok: false, error: 'That image is over 50 MB.' };
  const dir = join(imagesDir(), slug, 'references');
  await mkdir(dir, { recursive: true });
  const base = (basename(source).replace(/[^\w.-]+/g, '-').replace(/^[.-]+/, '')) || 'art.png';
  await copyFile(source, join(dir, base));
  return { ok: true, file: `references/${base}` };
}


// ── History ──────────────────────────────────────────────────────────────────
// Each step saves over the same .xcf, so without this "I preferred it before"
// means redoing it by hand. After every run the images and preview are copied to
// history/<number>/. Going back copies them home and counts as a step itself, so
// nothing later is lost and they can go forward again. Exports and finals are
// separate files and stay as they are.

const HISTORY_KEEP = 20;
const historyFile = (slug: string) => join(imagesDir(), slug, 'history.json');
const stepFolder = (slug: string, number: number) => join(imagesDir(), slug, 'history', String(number));

export async function readImageHistory(slug: string): Promise<ImageStep[]> {
  try {
    const parsed = JSON.parse(await readFile(historyFile(slug), 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

const imagesIn = async (dir: string) =>
  (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isFile() && e.name.endsWith('.xcf')).map((e) => e.name);

export async function recordImageStep(slug: string, label: string): Promise<ImageStep | null> {
  const dir = join(imagesDir(), slug);
  const images = await imagesIn(dir);
  if (images.length === 0) return null;
  const steps = await readImageHistory(slug);
  const number = (steps.at(-1)?.number ?? 0) + 1;
  const folder = stepFolder(slug, number);
  await mkdir(folder, { recursive: true });
  for (const file of images) await copyFile(join(dir, file), join(folder, file));
  const hasPreview = existsSync(join(dir, 'preview.png'));
  if (hasPreview) await copyFile(join(dir, 'preview.png'), join(folder, 'preview.png'));
  const step: ImageStep = {
    number, label: label.trim().slice(0, 80) || `Step ${number}`, at: new Date().toISOString(),
    preview: hasPreview ? `history/${number}/preview.png` : null,
  };
  steps.push(step);
  while (steps.length > HISTORY_KEEP) {
    const oldest = steps.shift()!;
    await rm(stepFolder(slug, oldest.number), { recursive: true, force: true });
  }
  await writeFile(historyFile(slug), JSON.stringify(steps, null, 2), 'utf-8');
  return step;
}

/** Put the work back as it was at a step. Null if there is no such step. */
export async function restoreImageStep(slug: string, number: number): Promise<ImageStep | null> {
  const step = (await readImageHistory(slug)).find((s) => s.number === number);
  if (!step) return null;
  const dir = join(imagesDir(), slug);
  const folder = stepFolder(slug, number);
  const saved = await imagesIn(folder);
  if (saved.length === 0) return null;
  for (const file of await imagesIn(dir)) {
    if (!saved.includes(file)) await rm(join(dir, file), { force: true });
  }
  for (const file of saved) await copyFile(join(folder, file), join(dir, file));
  if (existsSync(join(folder, 'preview.png'))) await copyFile(join(folder, 'preview.png'), join(dir, 'preview.png'));
  await recordImageStep(slug, `Back to step ${number}`);
  return step;
}

// ── Versions ─────────────────────────────────────────────────────────────────
// When she makes several designs, what happens to each is theirs to decide, by
// clicking the design itself: on a sheet of unlabelled pictures, "the one on the
// right" meant a different file to her than it did to them, and the wrong one
// went into the kit.

const TEST_IMAGE = /^(test|compare|comparison|thumb|proof|tmp|temp|scratch|draft|check|trial)([-_ ]|$)/i;
const mainFile = (slug: string) => join(imagesDir(), slug, 'main.json');

export async function listImageVersions(slug: string): Promise<string[]> {
  const dir = join(imagesDir(), slug);
  return (await imagesIn(dir)).map((f) => f.slice(0, -4)).filter((n) => !TEST_IMAGE.test(n) && existsSync(join(dir, `${n}.png`))).sort();
}

export async function readImageMain(slug: string): Promise<string | null> {
  try {
    const name = JSON.parse(await readFile(mainFile(slug), 'utf-8'));
    return typeof name === 'string' && (await listImageVersions(slug)).includes(name) ? name : null;
  } catch { return null; }
}

/** Their choice of main design. It goes on the stage and stays there. */
export async function chooseImageMain(slug: string, name: string): Promise<boolean> {
  if (!(await listImageVersions(slug)).includes(name)) return false;
  const dir = join(imagesDir(), slug);
  await writeFile(mainFile(slug), JSON.stringify(name), 'utf-8');
  if (!(await readImageFinals(slug)).length) await copyFile(join(dir, `${name}.png`), join(dir, 'preview.png'));
  return true;
}

/**
 * Keep a design for later: it becomes its own piece of work, with the same brief,
 * so it shows in the Library and can be opened and carried on with. It leaves
 * this work, so what is left here is what they're deciding between.
 */
export async function keepImageVersion(slug: string, name: string): Promise<string | null> {
  if (!(await listImageVersions(slug)).includes(name)) return null;
  const title = name.replace(/[-_]+/g, ' ').trim();
  let kept = title;
  for (let n = 2; existsSync(join(imagesDir(), modelSlug(kept))); n++) kept = `${title} ${n}`;
  const to = modelSlug(kept);
  const from = join(imagesDir(), slug);
  const dir = join(imagesDir(), to);
  await mkdir(dir, { recursive: true });
  await copyFile(join(from, `${name}.xcf`), join(dir, `${name}.xcf`));
  await copyFile(join(from, `${name}.png`), join(dir, `${name}.png`));
  await copyFile(join(from, `${name}.png`), join(dir, 'preview.png'));
  await writeFile(join(dir, 'finals.json'), JSON.stringify([`${name}.png`]), 'utf-8');
  const brief = await readImageBrief(slug);
  if (brief) await store.write(to, { ...brief, name: kept });
  await upsertLibraryEntry({ slug: to, name: kept, files: [`${name}.xcf`, `${name}.png`, 'preview.png'], gimpVersion: '', imageCount: 1 });
  await deleteImageVersion(slug, name);
  return kept;
}

export async function deleteImageVersion(slug: string, name: string): Promise<boolean> {
  if (!(await listImageVersions(slug)).includes(name)) return false;
  const dir = join(imagesDir(), slug);
  const wasMain = (await readImageMain(slug)) === name;
  await rm(join(dir, `${name}.xcf`), { force: true });
  await rm(join(dir, `${name}.png`), { force: true });
  if (wasMain) await rm(mainFile(slug), { force: true });
  return true;
}

/** Every piece of work — including one with a brief and nothing made yet. */
export async function listImageWork(): Promise<ImageWorkSummary[]> {
  const out: ImageWorkSummary[] = [];
  for (const e of await readdir(imagesDir(), { withFileTypes: true }).catch(() => [])) {
    if (!e.isDirectory()) continue;
    const dir = join(imagesDir(), e.name);
    const brief = await readImageBrief(e.name);
    const preview = join(dir, 'preview.png');
    const built = existsSync(preview);
    const mtime = (await stat(built ? preview : dir).catch(() => null))?.mtime ?? new Date(0);
    const briefTime = brief?.agreedAt || brief?.proposedAt;
    const updatedAt = briefTime && new Date(briefTime) > mtime ? briefTime : mtime.toISOString();
    const options = await readImageOptions(e.name);
    out.push({
      slug: e.name, name: brief?.name || e.name, brief, built, updatedAt,
      options: options?.status === 'waiting' ? options : null,
      references: await listImageReferences(e.name),
      finals: await readImageFinals(e.name),
      history: await readImageHistory(e.name),
      versions: await listImageVersions(e.name),
      main: await readImageMain(e.name),
    });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export class DesignProposeImageBriefTool implements Tool {
  readonly name = 'design_propose_image_brief';
  readonly description =
    'Propose the brief for an image or a set in GIMP — what it is, where it is used, style, exact sizes, the set, palette, references, generation aid, purpose — for the person to question and agree BEFORE anything is made.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_propose_image_brief',
    description:
      'Put the BRIEF for an image or set on the card in the room, before anything is made. Research first, then propose YOUR point of view on every field with your reasoning — never hand the questions back to them. ' +
      'They question it, may edit it on the card, and agree it there; design_build_image will not run until they have. Call again with the full brief when the discussion changes it; a changed brief has to be agreed again. You cannot agree it yourself.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name of the work, e.g. "Stat Icons". The same name is used for design_build_image.' },
        ...Object.fromEntries(IMAGE_BRIEF_FIELDS.map(([k, label, hint]) => [k, { type: 'string', description: `${label} — ${hint}.` }])),
        reasoning: { type: 'string', description: 'Why this brief: what you found, what you weighed and rejected. This is the part they learn from.' },
      },
      required: ['name', ...IMAGE_BRIEF_FIELDS.map(([k]) => k), 'reasoning'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string).trim() : '');
    const name = str('name');
    const slug = modelSlug(name);
    if (!slug) return { success: false, output: 'Missing `name` — the name of the work.' };
    const missing = IMAGE_BRIEF_FIELDS.filter(([k]) => !str(k)).map(([, label]) => label);
    if (!str('reasoning')) missing.push('your reasoning');
    if (missing.length) return { success: false, output: `The brief is missing: ${missing.join(', ')}. A hole here is filled by guesswork when it is made.` };

    const wasAgreed = (await readImageBrief(slug))?.status === 'agreed';
    await store.write(slug, {
      name,
      ...Object.fromEntries(IMAGE_BRIEF_FIELDS.map(([k]) => [k, str(k)])),
      reasoning: str('reasoning'),
      status: 'proposed',
      proposedAt: new Date().toISOString(),
    } as ImageBrief);
    return {
      success: true,
      output: `Brief for "${name}" is on the card${wasAgreed ? ' — it changed, so it needs agreeing again before the next step' : ''}. Talk them through your reasoning, change it where they have a point. They agree it on the card; nothing is made until they do.`,
      metadata: { work: slug },
    };
  }
}

// ── The script check ─────────────────────────────────────────────────────────

const SCRIPT_RULES: Array<{ re: RegExp; why: string }> = [
  { re: /\bsubprocess\b|\bos\.(system|popen|exec\w*|spawn\w*|startfile|kill)\b/, why: 'it starts other programs' },
  { re: /\b(socket|urllib|requests|http\.client|ftplib|smtplib)\b/, why: 'it uses the network' },
  { re: /\b(ctypes|cffi|winreg|_winapi|msvcrt)\b/, why: 'it reaches native code or the registry' },
  { re: /\bGimp\.(file_save|quit)\b/, why: 'it saves or closes GIMP itself — the tool saves your images after your script; use ava_export for exact sizes' },
  { re: /\bexpanduser\b|Path\.home\b|\bos\.environ\b|\bgetenv\b/, why: 'it builds a path outside the work\'s folder' },
  { re: /["'](?:[A-Za-z]:[\\/]|\\\\|~[\\/]|\/(?:Users|home|etc|tmp|var|Applications|mnt|opt)\b)/, why: 'it contains an absolute path — build every path from ASSET_DIR' },
  { re: /\.\.[\\/]/, why: 'it climbs out of the folder with ".." — build every path from ASSET_DIR' },
];

export function checkGimpScript(script: string): string | null {
  for (const rule of SCRIPT_RULES) {
    const m = rule.re.exec(script);
    if (m) return `The script was not run: ${rule.why} (found "${m[0]}"). Scripts here only make the image and write inside its own folder.`;
  }
  return null;
}

// ── What a GIMP 2 habit means in GIMP 3 ─────────────────────────────────────
// A traceback says what broke, not what to write instead. Each of these cost a
// run on the first logo (4 Nov 2026).
const API_HINTS: Array<[RegExp, string]> = [
  [/select_(ellipse|rectangle)\(\) takes exactly/, 'GIMP 3 takes separate numbers, not a tuple: image.select_ellipse(op, x, y, w, h). Easier: ava_fill(layer, dict(ellipse=(x,y,w,h)), "#hex").'],
  [/has no attribute 'select_all'/, 'Select all is Gimp.Selection.all(image), on Gimp.Selection, not on the image.'],
  [/has no attribute 'ADD_EXCLUDE'/, 'ChannelOps is only ADD, SUBTRACT, REPLACE, INTERSECT. To cut a shape out, use ava_cut(layer, shape).'],
  [/'Layer' object has no attribute 'name'/, 'Use layer.get_name() and layer.set_name("...").'],
  [/has no attribute 'width'|has no attribute 'height'/, 'Use image.get_width() and image.get_height(); the same on a layer.'],
  [/has no attribute 'layers'/, 'Use image.get_layers().'],
  [/has no attribute 'duplicate'/, 'To copy a layer: ava_copy_layer(layer, "name"). Between images: ava_copy_layer(layer, into=other).'],
  [/to wrong image/, 'A layer belongs to its image. Move one across with ava_copy_layer(layer, into=other), or derive it in place with ava_merged(image, layers, "name").'],
  [/has no attribute '(lower_layer|raise_layer|reorder_layer|lower|raise)'/, 'To change the order: ava_move(layer, to="top"), to="bottom", above=other or below=other.'],
  [/'Layer' object has no attribute 'remove'/, 'To delete a layer: ava_remove(layer).'],
  [/'Layer' object has no attribute 'get_layers'/, 'A layer has no layers of its own. image.get_layers() lists them, top first, and they are not nested unless you made a group.'],
  [/has no attribute 'get_children'/, 'Use image.get_layers().'],
  [/has no attribute 'get_app'|has no attribute 'get_images'|'NoneType' object has no attribute 'get_layer/, 'Each run is a brand new GIMP with nothing open. Reach saved work with ava_image("name"); print(ava_images()) lists it.'],
  [/flatten an image without any visible layer|Nothing is visible in this image/, 'Every layer is hidden there. Check set_visible on your copy; at least one must be on.'],
  [/get_pixel|getv\(\)|get_components/, 'To read a colour, ava_pixel(image, x, y) gives the "#RRGGBB" you would really see. get_pixel reads one layer, in that layer\'s own coordinates and linear colour, which is rarely what you want.'],
  [/too many values to unpack/, 'Several GIMP calls also return a success flag: ok, x, y = layer.get_offsets().'],
  [/instances of a subclass Color/, 'Make a colour with Gegl.Color.new("#3FE8FF").'],
  [/Unsupported|No such property|property .* not found|object has no property/i, 'That filter does not have that setting. Look up the GEGL operation\'s property names for this version; dashes in names become underscores in ava_filter.'],
];

export function gimpApiHint(error: string): string | null {
  const hit = API_HINTS.find(([re]) => re.test(error));
  return hit ? hit[1] : null;
}

// ── Library entry (one asset, one folder) ────────────────────────────────────

async function folderBytes(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += await folderBytes(p);
    else total += (await stat(p).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

async function upsertLibraryEntry(m: { slug: string; name: string; description?: string; files: string[]; gimpVersion: string; imageCount: number }): Promise<void> {
  let items: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(await readFile(metadataFile(), 'utf-8'));
    if (Array.isArray(parsed)) items = parsed;
  } catch { /* none yet */ }
  const id = `gimp_${m.slug}`;
  const existing = items.find((i) => i.id === id);
  const folder = join(imagesDir(), m.slug);
  const now = new Date().toISOString();
  const entry: Record<string, unknown> = {
    ...(existing ?? {}),
    id, kind: 'gimp', designType: 'gimp',
    path: `gimp/${m.slug}/preview.png`,
    absolutePath: join(folder, 'preview.png'),
    folder: `gimp/${m.slug}`,
    absoluteFolder: folder,
    files: m.files,
    imageCount: m.imageCount,
    prompt: m.description ?? (existing?.prompt as string | undefined) ?? '',
    title: m.name,
    gimpVersion: m.gimpVersion,
    createdAt: (existing?.createdAt as string | undefined) ?? now,
    updatedAt: now,
    bytes: await folderBytes(folder),
  };
  await mkdir(creativeDir(), { recursive: true });
  await writeFile(metadataFile(), JSON.stringify([entry, ...items.filter((i) => i.id !== id)], null, 2), 'utf-8');
}

// ── Running GIMP ─────────────────────────────────────────────────────────────

interface RunnerResult {
  ok: boolean; files: string[]; warnings: string[]; error?: string; seconds?: number;
  images: Array<{ name: string; width: number; height: number; layers: number }>;
  report?: string[]; looks?: Array<{ file: string; label: string }>; newFinals?: string[];
}

function runGimp(exe: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number, signal?: AbortSignal):
  Promise<{ out: string; timedOut: boolean; aborted: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { cwd, env, windowsHide: true });
    let out = '', timedOut = false, aborted = false;
    const take = (d: Buffer) => { if (out.length < MAX_OUTPUT) out += d; };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    const onAbort = () => { aborted = true; child.kill(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ out, timedOut, aborted });
    };
    child.on('close', done);
    child.on('error', (err) => { out += String(err); done(); });
  });
}

/** Her own print() lines, without GIMP's start-up chatter. */
export function scriptOutput(out: string): string {
  const noise = /^(INFO:|GIMP-Message|GIMP-Warning|A new version|It is recommended|batch command|Welcome to GIMP|@@AVA_RESULT@@|\s*$|\(.*:\d+\): )/;
  // GIMP says this every time the batch Python ends, on a good run too. It is
  // not a crash, and reading it as one sent her after problems that weren't
  // there. A real crash names another plug-in, and that line stays.
  const ending = /gimp_wire_read\(\): unexpected EOF|Plug-in crashed: "python-eval|python-eval\.py\)\s*$|The dying plug-in may have messed up|GeglBuffer|EEEEeEeek/;
  return out.split(/\r?\n/).filter((l) => !noise.test(l) && !ending.test(l)).slice(-30).join('\n').slice(-3000);
}

// ── design_build_image ───────────────────────────────────────────────────────

export class DesignBuildImageTool implements Tool {
  readonly name = 'design_build_image';
  readonly description =
    'Make or change an image or a set in GIMP with no window: run your Python on it, save the layered source, export it and see a preview. Free — GIMP runs on their own computer.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_build_image',
    description:
      'Run YOUR GIMP 3 Python on a piece of work and get back a preview image. Gimp, Gegl, Gio and ASSET_DIR are predefined, plus these helpers: ' +
      'ava_image(name, width, height) opens that image — its saved .xcf, INCLUDING anything the person changed by hand in GIMP — or makes a new transparent one the first time. A SET is several names in the same work. ' +
      'ava_layer(image, name, fill="#hex") adds a layer. ava_place(image, path, name) brings a file in as a layer (a Blender render, a generated reference; path relative to ASSET_DIR). ' +
      'ava_filter(layer, "gegl:dropshadow", x=0.0, y=6.0, radius=14.0) runs a GEGL filter and keeps the result. ava_export(image, "name-64.png", size=(64, 64)) writes an exact size into exports/. ' +
      'DRAWING — use these, they are the verified GIMP 3.2 calls: ava_fill(layer, shape, "#hex") and ava_cut(layer, shape) (real transparency, for negative space). A shape is a flat point list [x1,y1,x2,y2,...], dict(rect=(x,y,w,h), radius=12), dict(ellipse=(x,y,w,h)), or dict(svg="M 10 10 C 40 0, 60 0, 90 10 Z") for SMOOTH CURVES; several shapes in a tuple act together. ava_gradient(layer, shape, "#top", "#bottom", y0, y1) fills with a vertical gradient. ' +
      'LOOK: ava_show(image_or_file, crop=(x,y,w,h), on="#hex" or a picture, label="...") brings it back to you at up to 1024px, up to 4 per run; with none, you see the images this run touched. ava_proof(image_or_file, on=("#f4f4f4","#101014"), widths=(256,120,64)) makes the proof sheet: large on each background, plus its real small sizes. Use these and judge by eye; never measure pixels to find out whether something shows. ' +
      'LAYERS: ava_copy_layer(layer, "name", into=other_image), ava_remove(layer), ava_move(layer, to="top"|"bottom", above=other, below=other). ava_merged(image, layers, "name") is a merged copy as one new layer in the same image, originals untouched. ava_glow(image, layers, radius=24.0, opacity=50.0, colour="#hex", name="Glow") is a real switchable glow; call twice for bloom plus halo. ava_pixel(image, x, y) reads the true "#RRGGBB" there. ava_images() lists the saved images. os is predefined. ' +
      'Layer OPACITY IS 0-100: set_opacity(55.0), never 0.55. ' +
      'BRAND: KIT is the brand kit for this project: KIT.colour("primary"), KIT.font("heading") for ava_text, KIT.logo("mark") for a real file to ava_place, KIT.name. If (not KIT) there is none: ask them. ' +
      'FINISH: ava_final(image, "name.png", size=(w, h)) makes the finished file in final/: the real thing, shown on the stage and in the Library, and what brand kits offer. Exports are working files; every piece ends with at least one final, once they are happy. ' +
      'TEXT: ava_text(image, "Words", font="Sans-serif Bold", size=96, colour="#hex", x=0, y=0, spacing=0.0) makes a real editable text layer; print(ava_fonts("match")) lists installed fonts (hundreds are available). ' +
      'After your script the tool saves every image you touched as layered .xcf, writes a PNG of each, renders preview.png, and reports every layer with anything that looks wrong. Each run is a new GIMP with nothing open: ava_image is the only way to reach saved work, and ava_image() with no name opens the main image. Write ONLY this step: saved work is reopened, never rebuild it. Keep layers named and separate: the person owns this file and may open it. ' +
      'If you go below the helpers, this is GIMP 3, not 2: image.select_ellipse(op, x, y, w, h) takes separate numbers, not a tuple; ChannelOps is ADD, SUBTRACT, REPLACE, INTERSECT; select all is Gimp.Selection.all(image); a layer\'s name is layer.get_name(). ava_layer layers already have transparency, so never add_alpha. ' +
      'Absolute paths, "..", other programs, network and native code are refused. If the script errors, nothing is saved and you get the traceback. The GIMP Python API differs from 2.10; the result tells you the version, check its docs when unsure.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name of the work, e.g. "Stat Icons". The same name continues the same work.' },
        script: { type: 'string', description: 'GIMP 3 Python for THIS step only.' },
        description: { type: 'string', description: 'One line for the Library card.' },
        timeout_seconds: { type: 'number', description: `How long GIMP may run. Default ${DEFAULT_TIMEOUT_S}, most ${MAX_TIMEOUT_S}.` },
      },
      required: ['name', 'script'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const wait = designRunRefusal(context);
    if (wait) return { success: false, output: wait };
    const jobs = context.sharedState?.generationManager as GenerationManager | undefined;
    let jobId: string | undefined;
    const started = (name: string, slug: string, assetDir: string) => {
      jobId = `gimp_${randomUUID()}`;
      jobs?.create({ id: jobId, type: 'gimp', prompt: name, filename: slug, targetPath: assetDir });
      jobs?.update(jobId, { status: 'generating' });
    };
    try {
      const res = await this.step(args, context, started);
      if (jobId) {
        if (res.success) jobs?.complete(jobId);
        else jobs?.fail(jobId, res.output.split('\n')[0]);
        // Runs Blender/GIMP actually made. A refusal is not a run.
        const checkIn = recordDesignRun(context, res.success);
        if (checkIn) res.output += `\n\n${checkIn}`;
      }
      return res;
    } catch (err) {
      if (jobId) jobs?.fail(jobId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  private async step(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
    started: (name: string, slug: string, assetDir: string) => void,
  ): Promise<ToolResult> {
    const name = String(args.name ?? '').trim();
    const script = String(args.script ?? '');
    const slug = modelSlug(name);
    if (!slug) return { success: false, output: 'Missing `name` — the name of the work.' };
    if (!script.trim()) return { success: false, output: 'Missing `script` — the GIMP Python for this step.' };

    const brief = await readImageBrief(slug);
    if (!brief) {
      return { success: false, output: `Nothing was made: "${name}" has no brief yet. Research it, then propose the brief with design_propose_image_brief — the person agrees it on the card first.` };
    }
    if (brief.status !== 'agreed') {
      return {
        success: false,
        output: `Nothing was made: the brief for "${name}" is still waiting for the person to agree it on the card` +
          `${brief.editedByPerson ? ' (they edited it — read their changes in the room context and talk them through)' : ''}.`,
      };
    }

    const refused = checkGimpScript(script);
    if (refused) return { success: false, output: refused };

    const gimp = await findGimp();
    if (!gimp) {
      return { success: false, output: `GIMP 3 isn't installed on this computer, or I can't find it. It's free from ${GIMP_DOWNLOAD_URL} — if it's somewhere unusual, its path can be set in Settings.` };
    }

    const assetDir = join(imagesDir(), slug);
    await mkdir(join(assetDir, 'scripts'), { recursive: true });
    await writeFile(join(assetDir, 'script.py'), script, 'utf-8');
    await writeFile(join(assetDir, 'scripts', `${new Date().toISOString().replace(/[:.]/g, '-')}.py`), script, 'utf-8');

    const runId = randomUUID();
    const runnerPath = join(tmpdir(), `ava-gimp-runner-${runId}.py`);
    const jobPath = join(tmpdir(), `ava-gimp-job-${runId}.json`);
    await writeFile(runnerPath, GIMP_RUNNER_PY, 'utf-8');
    await writeFile(jobPath, JSON.stringify({ assetDir, name, kit: await kitForScripts((context.sharedState?.designProject as (() => string | null | undefined) | undefined)?.()) }), 'utf-8');

    const timeoutS = Math.min(MAX_TIMEOUT_S, Math.max(30, Number(args.timeout_seconds) || DEFAULT_TIMEOUT_S));
    // -n: a GIMP the person has open must not swallow the batch. JSON.stringify
    // gives a valid Python string for any path, whatever it contains.
    const gimpArgs = ['-n', '-i', '--batch-interpreter', 'python-fu-eval', '-b', `exec(open(${JSON.stringify(runnerPath)}, encoding='utf-8').read())`, '--quit'];

    started(name, slug, assetDir);
    let run;
    try {
      run = await runGimp(gimp.path, gimpArgs, assetDir, { ...process.env, AVA_GIMP_JOB: jobPath }, timeoutS * 1000, context.signal);
    } finally {
      await rm(runnerPath, { force: true }).catch(() => {});
      await rm(jobPath, { force: true }).catch(() => {});
    }

    if (run.aborted) return { success: false, output: 'Stopped before GIMP finished. Nothing new was saved.' };
    if (run.timedOut) return { success: false, output: `GIMP was stopped after ${timeoutS}s and nothing new was saved. The very first run on a machine can take about 35 seconds while GIMP sets itself up. Make the step smaller, or raise timeout_seconds.` };

    const marker = run.out.lastIndexOf('@@AVA_RESULT@@');
    if (marker < 0) {
      return { success: false, output: `GIMP closed without finishing the run, so nothing new was saved. Its last output:\n${run.out.split(/\r?\n/).slice(-25).join('\n')}` };
    }
    let result: RunnerResult;
    try {
      result = JSON.parse(run.out.slice(marker + '@@AVA_RESULT@@'.length).split(/\r?\n/)[0]);
    } catch {
      return { success: false, output: 'GIMP finished, but its report could not be read.' };
    }

    const printed = scriptOutput(run.out);
    if (!result.ok) {
      return {
        success: false,
        output: `Your script stopped with an error in GIMP ${gimp.version}. Nothing was saved — "${name}" is exactly as it was before this run.\n\n${(result.error ?? '').trim()}` +
          (gimpApiHint(`${result.error ?? ''}\n${printed}`) ? `\n\nHint: ${gimpApiHint(`${result.error ?? ''}\n${printed}`)}` : '') +
          (printed ? `\n\nWhat the script printed:\n${printed}` : '') + '\n\nFix it and run the step again.',
      };
    }

    const xcfCount = result.files.filter((f) => f.endsWith('.xcf')).length;
    await upsertLibraryEntry({
      slug, name, description: typeof args.description === 'string' ? args.description : undefined,
      files: result.files, gimpVersion: gimp.version, imageCount: xcfCount,
    }).catch(() => { /* the work is saved either way */ });

    const saved = await recordImageStep(slug, typeof args.description === 'string' ? args.description : '').catch(() => null);
    const lines = [
      `Done on "${name}" in ${result.seconds ?? '?'}s with GIMP ${gimp.version}. ${xcfCount} image${xcfCount === 1 ? '' : 's'} in this work.${saved ? ` Saved as step ${saved.number}.` : ''}`,
      `This step: ${result.images.map((i) => `${i.name} ${i.width}×${i.height} (${i.layers} layer${i.layers === 1 ? '' : 's'})`).join(', ')}.`,
      `Files in ${assetDir}: ${result.files.join(', ')}.`,
    ];
    if (!(await readImageFinals(slug)).length) {
      lines.push('NO FINAL YET: this work has working files but no finished one, and only a final counts as the work. Keep going until it is right; when they are happy, make it with ava_final(image, "name.png", size=(w, h)). Don\'t leave a piece without one.');
    }
    if (result.newFinals?.length) {
      const inUse = await kitForProject((context.sharedState?.designProject as (() => string | null | undefined) | undefined)?.());
      const open = inUse.kit ? kitPieceStates(inUse.kit).filter((p) => p.state !== 'agreed' && p.room !== 'kit') : [];
      if (inUse.kit && open.length) lines.push(`KIT: if this is one of "${inUse.kit.name}"'s pieces (${open.map((p) => `${p.label} [${p.id}]`).join(', ')}), ask whether to save it to the kit, then call design_save_to_kit once they say yes.`);
    }
    if (result.report?.length) lines.push(`The file now:\n${result.report.join('\n')}`);
    if (result.warnings?.length) lines.push(`CHECK THESE:\n${result.warnings.map((w) => `- ${w}`).join('\n')}`);
    if (printed) lines.push(`What the script printed:\n${printed}`);

    // What she sees: what she asked for with ava_show or ava_proof, else what
    // this run touched. preview.png stays the sheet for the Library and stage.
    const looks: string[] = [];
    for (const look of result.looks ?? []) {
      try { looks.push((await readFile(join(assetDir, '.look', look.file))).toString('base64')); } catch { /* the next one may be there */ }
    }
    if (!looks.length && result.files.includes('preview.png')) {
      try { looks.push((await readFile(join(assetDir, 'preview.png'))).toString('base64')); } catch { /* none */ }
    }
    lines.push(`The agreed brief:\n${formatImageBrief(brief)}`);
    if (result.looks?.length) lines.push(`You are looking at, in order: ${result.looks.map((l) => l.label).join('; ')}.`);
    lines.push(looks.length
      ? 'LOOK at it now and check it against the brief: does it read at its real size, does it sit with the rest of the set, is the style right? Believe your eyes over your reasoning; to see anything else, ava_show or ava_proof it. Say plainly what is off and fix it in the next step; saved work is reopened, so write only the change.'
      : 'There is no image to look at this time — say so rather than describing what you think it looks like.');

    return {
      success: true,
      output: lines.join('\n'),
      metadata: {
        work: slug, folder: assetDir, files: result.files, gimpVersion: gimp.version,
        ...(looks.length ? { base64_image: looks[0], mime_type: 'image/png', more_images: looks.slice(1) } : {}),
      },
    };
  }
}

// ── design_restore_image ─────────────────────────────────────────────────────

export class DesignRestoreImageTool implements Tool {
  readonly name = 'design_restore_image';
  readonly description = 'Put a piece of GIMP work back as it was at an earlier step, when they ask.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;
  readonly schema: FunctionSchema = {
    name: 'design_restore_image',
    description:
      'Put a piece of work back to an earlier step, when they say they preferred it. The steps are numbered in each ' +
      'run\'s report and on the strip in the room. Later steps stay in the history, so they can go forward again. ' +
      'Exports and finals are not changed.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name of the work.' },
        step: { type: 'number', description: 'The step to go back to.' },
      },
      required: ['name', 'step'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const slug = modelSlug(String(args.name ?? ''));
    const number = Number(args.step);
    const steps = slug ? await readImageHistory(slug) : [];
    const step = await restoreImageStep(slug, number).catch(() => null);
    if (!step) {
      return { success: false, output: `There is no step ${args.step} on "${args.name}". Steps here: ${steps.map((s) => s.number).join(', ') || 'none yet'}.` };
    }
    const preview = await readFile(join(imagesDir(), slug, 'preview.png')).catch(() => null);
    return {
      success: true,
      output: `"${args.name}" is back as it was at step ${number} (${step.label}). Later steps are still in the history. LOOK at it and carry on from here.`,
      metadata: { work: slug, ...(preview ? { base64_image: preview.toString('base64'), mime_type: 'image/png' } : {}) },
    };
  }
}

// ── design_mark_final ────────────────────────────────────────────────────────

export class DesignMarkFinalTool implements Tool {
  readonly name = 'design_mark_final';
  readonly description = 'Mark which files in a piece of work are the finished ones, after asking the person.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_mark_final',
    description:
      'Mark files as FINAL: the finished pieces the person will use, which is what the Library and brand kits offer. Tests, comparisons and proof sheets are never final. ' +
      'ALWAYS ask them first, and only call this once they have said yes. It adds to the list; they can remove any from the stage.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name of the work.' },
        files: { type: 'array', items: { type: 'string' }, description: 'The images, relative to the work, e.g. ["exports/logo-2x.png"].' },
      },
      required: ['name', 'files'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const name = String(args.name ?? '').trim();
    const slug = modelSlug(name);
    const files = Array.isArray(args.files) ? args.files.map(String) : [];
    if (!slug || !existsSync(join(imagesDir(), slug))) return { success: false, output: `There is no work called "${name}".` };
    if (!files.length) return { success: false, output: 'Name the files to mark in `files`.' };
    const root = resolve(imagesDir(), slug);
    const clean: string[] = [];
    for (const raw of files) {
      const file = raw.replace(/\\/g, '/').replace(/^\.\//, '');
      const full = resolve(root, file);
      if (!full.startsWith(root + sep) || !IMAGE_FILE.test(file)) return { success: false, output: `"${file}" is not an image inside this work.` };
      if (!existsSync(full)) return { success: false, output: `There is no file at ${file}. The files are listed in your last run.` };
      clean.push(file);
    }
    const all = [...new Set([...(await readImageFinals(slug)), ...clean])];
    await writeFinals(slug, all);
    return { success: true, output: `Marked final: ${clean.join(', ')}. "${name}" now has ${all.length} final file${all.length === 1 ? '' : 's'}.` };
  }
}

// ── design_show_options ──────────────────────────────────────────────────────

export class DesignShowOptionsTool implements Tool {
  readonly name = 'design_show_options';
  readonly description = 'Put two to four versions on the stage for the person to choose between by eye.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_show_options',
    description:
      'Put 2 to 4 versions of a piece on the stage, side by side, for the person to pick by clicking one. For real DESIGN choices that are best judged by eye: a typeface, a composition, a colour direction. Export each version first (ava_export), then point at the files. ' +
      'Then STOP and wait: their pick comes back as their next message. Never use it for technical choices; those are yours to solve.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name of the work.' },
        question: { type: 'string', description: 'What they are choosing, in plain words.' },
        options: {
          type: 'array',
          description: '2 to 4 versions.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'A short name, e.g. "Geometric".' },
              file: { type: 'string', description: 'The image, relative to the work, e.g. "exports/option-a.png".' },
              note: { type: 'string', description: 'One line on what this version does.' },
            },
            required: ['label', 'file'],
          },
        },
      },
      required: ['name', 'question', 'options'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const name = String(args.name ?? '').trim();
    const slug = modelSlug(name);
    const question = String(args.question ?? '').trim();
    const raw = Array.isArray(args.options) ? args.options as Array<Record<string, unknown>> : [];
    if (!slug || !existsSync(join(imagesDir(), slug))) return { success: false, output: `There is no work called "${name}".` };
    if (!question) return { success: false, output: 'Say what they are choosing, in `question`.' };
    if (raw.length < 2 || raw.length > 4) return { success: false, output: 'Show 2 to 4 options.' };
    const root = resolve(imagesDir(), slug);
    const options: ImageOption[] = [];
    for (const o of raw) {
      const file = String(o.file ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
      const full = resolve(root, file);
      if (!full.startsWith(root + sep) || !IMAGE_FILE.test(file)) return { success: false, output: `"${file}" is not an image inside this work. Use a path like exports/option-a.png.` };
      if (!existsSync(full)) return { success: false, output: `There is no file at ${file}. Export it first with ava_export; the files are listed in your last run.` };
      options.push({ label: String(o.label ?? '').trim() || `Option ${options.length + 1}`, file, ...(o.note ? { note: String(o.note).trim() } : {}) });
    }
    const record: ImageOptions = { question, options, status: 'waiting', proposedAt: new Date().toISOString() };
    await writeFile(join(root, 'options.json'), JSON.stringify(record, null, 2), 'utf-8');
    return { success: true, output: `${options.length} options are on the stage for "${name}". Stop here and wait: tell them in a line or two what you'd pick and why, then end your turn. Their click comes back as their next message.` };
  }
}

// ── design_duplicate_image ───────────────────────────────────────────────────

export class DesignDuplicateImageTool implements Tool {
  readonly name = 'design_duplicate_image';
  readonly description = 'Copy a piece of GIMP work to a new name, so an idea can be tried on the copy while the original stays untouched.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_duplicate_image',
    description: 'Duplicate work made with design_build_image under a new name, for trying something without touching the original. Then continue on the copy with the NEW name.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'The existing work\'s name.' },
        to: { type: 'string', description: 'The new name.' },
      },
      required: ['from', 'to'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const fromName = String(args.from ?? '').trim();
    const toName = String(args.to ?? '').trim();
    const from = modelSlug(fromName);
    const to = modelSlug(toName);
    if (!from || !to) return { success: false, output: 'Give both names: `from` and `to`.' };
    if (from === to) return { success: false, output: 'The new name must be different from the original.' };
    const src = join(imagesDir(), from);
    const dst = join(imagesDir(), to);
    if (!existsSync(src)) return { success: false, output: `There is no work called "${fromName}".` };
    if (existsSync(dst)) return { success: false, output: `Work called "${toName}" already exists. Pick another name.` };

    await cp(src, dst, { recursive: true, filter: (p) => !/[\\/](versions|scripts)([\\/]|$)/.test(p.slice(src.length)) });
    const brief = await readImageBrief(to);
    if (brief) {
      brief.name = toName;
      await store.write(to, brief);
    }
    const files = (await readdir(dst, { withFileTypes: true })).filter((e) => e.isFile() && e.name !== 'brief.json').map((e) => e.name);
    if (existsSync(join(dst, 'preview.png'))) {
      await upsertLibraryEntry({ slug: to, name: toName, files, gimpVersion: '', imageCount: files.filter((f) => f.endsWith('.xcf')).length }).catch(() => {});
    }
    return { success: true, output: `Copied "${fromName}" to "${toName}". The original is untouched. Continue on the copy with design_build_image, name "${toName}".`, metadata: { work: to, folder: dst } };
  }
}
