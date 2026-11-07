/**
 * Brand kits — one home on this computer, read by the extension, the IDE and
 * every tool, with or without the Design Studio open.
 *
 *   ~/.ava/brand-kits.json            the kits, and which one is active
 *   ~/.ava/brand-kits/<kit id>/       real files that belong to a kit (logos)
 *
 * Kits used to live in each app's localStorage, so the extension and the IDE
 * had separate kits, and Ava could only reach them through the open canvas.
 *
 * Moving across never removes anything. A kit an app still holds in its
 * localStorage is copied in the first time this store sees its id, and that
 * copy in the app is left alone. Ids stay in `seen` after a delete, so a kit
 * someone deleted can't return from an old copy.
 */

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AVA_HOME } from '../core/constants.js';
import { projectsHome } from '../projects/project-data.js';
import { MemoryManager } from '../memory/memory-manager.js';
import { creativeDir, metadataFile } from '../tools/blender/paths.js';
import { readImageFinals } from '../tools/gimp/build-image.js';

export interface BrandKitPalette {
  primary: string; secondary: string; accent: string; neutral: string; surface: string;
}
export type BrandLogoSlot = 'primary' | 'mark' | 'light' | 'dark';

/** What the project is. It decides which pieces a kit asks for. */
export type BrandKitKind = 'game' | 'app' | 'website' | 'business';
export const BRAND_KIT_KINDS: Array<{ id: BrandKitKind; label: string }> = [
  { id: 'game', label: 'Game' }, { id: 'app', label: 'App' }, { id: 'website', label: 'Website' }, { id: 'business', label: 'Business' },
];

/** Where a piece gets made. 'kit' means with Ava, right on the kit. */
export type BrandPieceRoom = 'gimp' | 'blender' | 'kit';
/** `slot`: this piece IS that logo, so it holds one picture. */
export interface BrandPieceDef { id: string; label: string; room: BrandPieceRoom; slot?: BrandLogoSlot }

/** Every kit has these, whatever the project. */
const CORE_PIECES: BrandPieceDef[] = [
  { id: 'colours', label: 'Colours and pairings', room: 'kit' },
  { id: 'fonts', label: 'Fonts', room: 'kit' },
  { id: 'image_style', label: 'Image style', room: 'kit' },
  { id: 'visual_rules', label: 'Visual dos and don\'ts', room: 'kit' },
  { id: 'voice', label: 'Written voice', room: 'kit' },
];

export const BRAND_KIT_PIECES: Record<BrandKitKind, BrandPieceDef[]> = {
  game: [
    { id: 'title_logo', label: 'Title logo', room: 'gimp', slot: 'primary' },
    { id: 'splash', label: 'Splash screen', room: 'gimp' },
    { id: 'hud_colours', label: 'HUD colours', room: 'kit' },
    { id: 'ui_fonts', label: 'UI fonts', room: 'kit' },
    { id: 'icon_style', label: 'Icon style', room: 'gimp' },
    { id: 'ui_frames', label: 'UI frames', room: 'gimp' },
    { id: 'world_references', label: 'Character and world references', room: 'kit' },
  ],
  app: [
    { id: 'app_icon', label: 'App icon', room: 'gimp' },
    { id: 'themes', label: 'Light and dark themes', room: 'kit' },
    { id: 'interface_type', label: 'Interface fonts', room: 'kit' },
    { id: 'store_images', label: 'Store images', room: 'gimp' },
  ],
  website: [
    { id: 'logo', label: 'Logo', room: 'gimp', slot: 'primary' },
    { id: 'favicon', label: 'Favicon', room: 'gimp' },
    { id: 'web_fonts', label: 'Web fonts', room: 'kit' },
    { id: 'hero_style', label: 'Hero image style', room: 'gimp' },
    { id: 'social_images', label: 'Social images', room: 'gimp' },
  ],
  business: [
    { id: 'logo_versions', label: 'Logo versions', room: 'gimp' },
    { id: 'social_look', label: 'Social look', room: 'gimp' },
    { id: 'document_style', label: 'Document style', room: 'kit' },
  ],
};

/** The pieces a kit asks for: its kind's, then the ones every kit has. */
export const kitPieceDefs = (kind?: BrandKitKind): BrandPieceDef[] => [...(kind ? BRAND_KIT_PIECES[kind] : []), ...CORE_PIECES];

export type BrandPieceState = 'not_made' | 'in_progress' | 'agreed';
export interface BrandKitPiece { state: BrandPieceState; note?: string; files?: string[] }
export interface BrandKitFonts { heading?: string; body?: string; ui?: string }
/** A colour on a colour, for one use. Roles ("primary") or hex. */
export interface BrandKitPairing { ink: string; on: string; use?: string }

export interface BrandKitRecord {
  id: string;
  name: string;
  tagline?: string;
  positioning?: string;
  palette: BrandKitPalette;
  styleTags: string[];
  /** On disk: a path inside the kit's folder. To the apps: a data URL. */
  logo?: Partial<Record<BrandLogoSlot, string>>;
  voice?: string;
  doRules?: string[];
  dontRules?: string[];
  defaultHashtags?: string[];
  defaultLink?: string;
  defaultVoiceId?: string;
  musicPrompt?: string;
  /** The projects this kit belongs to. One kit can serve several; a project has one kit. */
  projects?: string[];
  /** What the project is. Asked, never guessed, for kits made before kinds. */
  kind?: BrandKitKind;
  /** Keyed by piece id. A piece with no entry is not made. */
  pieces?: Record<string, BrandKitPiece>;
  fonts?: BrandKitFonts;
  pairings?: BrandKitPairing[];
  imageStyle?: string;
  visualDo?: string[];
  visualDont?: string[];
  /** 'proposed' while it waits for the person: not in use anywhere until agreed. */
  status?: 'proposed';
  /** Ava's reasoning for a proposed kit. */
  reasoning?: string;
  /** The project a proposed kit will link to once agreed. */
  proposedFor?: string;
  /** To the apps only: a kit's saved files by their path in the kit. */
  fileMap?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

interface KitFile { version: 1; activeId: string | null; kits: BrandKitRecord[]; seen: string[] }

export const brandKitsHome = () => process.env.AVA_BRAND_KITS_DIR || AVA_HOME;
export const brandKitsFile = () => join(brandKitsHome(), 'brand-kits.json');
const kitFolder = (id: string) => join(brandKitsHome(), 'brand-kits', id.replace(/[^\w-]/g, '_'));

const DEFAULT_PALETTE: BrandKitPalette = { primary: '#a855f7', secondary: '#89b4fa', accent: '#94e2d5', neutral: '#a6adc8', surface: '#110c1a' };
const EMPTY = (): KitFile => ({ version: 1, activeId: null, kits: [], seen: [] });

async function readStore(): Promise<KitFile> {
  let raw: string;
  try { raw = await readFile(brandKitsFile(), 'utf-8'); } catch { return EMPTY(); }
  const parsed = JSON.parse(raw) as Partial<KitFile>;   // a damaged file must stop here, not be overwritten
  return { version: 1, activeId: parsed.activeId ?? null, kits: Array.isArray(parsed.kits) ? parsed.kits : [], seen: Array.isArray(parsed.seen) ? parsed.seen : [] };
}

async function writeStore(store: KitFile): Promise<void> {
  const file = brandKitsFile();
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2), 'utf-8');
  await rename(tmp, file);
}

/** One change at a time in this process, so a tool and a click can't lose each other's edit. */
let queue: Promise<unknown> = Promise.resolve();
function change<T>(fn: (store: KitFile) => Promise<T> | T): Promise<T> {
  const run = queue.then(async () => {
    const store = await readStore();
    const out = await fn(store);
    await writeStore(store);
    return out;
  });
  queue = run.catch(() => {});
  return run;
}

// ── Logos as real files ──────────────────────────────────────────────────────

const EXT_FOR_TYPE: Record<string, string> = { 'image/svg+xml': '.svg', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const TYPE_FOR_EXT: Record<string, string> = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

/** The picture in a data URL, or null if it's anything else. */
function pictureFromDataUrl(value: string): { ext: string; bytes: Buffer } | null {
  const m = /^data:([\w/+.-]+)(;base64)?,([\s\S]*)$/.exec(value);
  const ext = m && EXT_FOR_TYPE[m[1]];
  if (!m || !ext) return null;
  return { ext, bytes: m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf-8') };
}

/** A data URL becomes a file in the kit's folder. Anything else is left as it is. */
async function logoToFile(kitId: string, slot: string, value: string): Promise<string> {
  const picture = pictureFromDataUrl(value);
  if (!picture) return value;
  const { ext, bytes } = picture;
  const dir = join(kitFolder(kitId), 'logos');
  await mkdir(dir, { recursive: true });
  const name = `${slot.replace(/\W/g, '')}${ext}`;
  for (const other of Object.values(EXT_FOR_TYPE)) {
    if (other !== ext) await rm(join(dir, `${slot.replace(/\W/g, '')}${other}`), { force: true });
  }
  await writeFile(join(dir, name), bytes);
  return `logos/${name}`;
}

async function withLogoFiles(kit: BrandKitRecord): Promise<BrandKitRecord> {
  if (!kit.logo) return kit;
  const logo: BrandKitRecord['logo'] = {};
  for (const [slot, value] of Object.entries(kit.logo)) {
    if (typeof value === 'string' && value) logo[slot as BrandLogoSlot] = await logoToFile(kit.id, slot, value);
  }
  return { ...kit, logo };
}

/** The absolute path of a kit's logo file, for tools that work with real files. */
export function brandLogoPath(kit: BrandKitRecord, slot: BrandLogoSlot): string | null {
  const value = kit.logo?.[slot];
  if (!value || /^(data:|https?:)/.test(value)) return null;
  const root = resolve(kitFolder(kit.id));
  const full = resolve(root, value);
  return full.startsWith(root + sep) && existsSync(full) ? full : null;
}

async function logoAsDataUrl(kit: BrandKitRecord, slot: BrandLogoSlot): Promise<string | undefined> {
  const value = kit.logo?.[slot];
  const path = brandLogoPath(kit, slot);
  if (!path) return value;
  const type = TYPE_FOR_EXT[extname(path).toLowerCase()];
  return `data:${type};base64,${(await readFile(path)).toString('base64')}`;
}

/** Kits as the apps want them: logos ready to show. */
async function forApps(kits: BrandKitRecord[]): Promise<BrandKitRecord[]> {
  return Promise.all(kits.map(async (kit) => {
    const fileMap: Record<string, string> = {};
    for (const piece of Object.values(kit.pieces ?? {})) {
      for (const file of piece.files ?? []) {
        const full = join(kitFolder(kit.id), file);
        if (existsSync(full)) fileMap[file] = full;
      }
    }
    if (!kit.logo) return { ...kit, fileMap };
    const logo: BrandKitRecord['logo'] = {};
    for (const slot of Object.keys(kit.logo) as BrandLogoSlot[]) {
      const url = await logoAsDataUrl(kit, slot);
      if (url) logo[slot] = url;
    }
    return { ...kit, logo, fileMap };
  }));
}

// ── Reading ──────────────────────────────────────────────────────────────────

export async function listBrandKits(): Promise<{ kits: BrandKitRecord[]; activeId: string | null }> {
  const { kits, activeId } = await readStore();
  const live = kits.filter((k) => k.status !== 'proposed');
  return { kits, activeId: live.some((k) => k.id === activeId) ? activeId : live[0]?.id ?? null };
}

/** Their projects folder. A kit links only to projects that live there. */
async function projectsFolder(): Promise<string> {
  if (process.env.AVA_PROJECTS_DIR) return process.env.AVA_PROJECTS_DIR;
  let configured: string | undefined;
  try {
    const settings = JSON.parse(await readFile(join(AVA_HOME, 'settings.json'), 'utf-8'));
    configured = settings?.preferences?.projectsHome;
  } catch { /* the default folder */ }
  return projectsHome(configured);
}

/** The projects a kit can link to: the folders in their projects folder. */
export async function knownProjects(): Promise<Array<{ path: string; name: string }>> {
  const root = await projectsFolder();
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => ({ path: join(root, e.name), name: e.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A project that a kit can belong to. Anything else isn't a project here, so
 *  the kit picked by hand applies, as it does with nothing open. */
async function inProjectsFolder(project: string): Promise<boolean> {
  const key = projectKey(project);
  return (await knownProjects()).some((p) => projectKey(p.path) === key);
}

const fontList = (k: BrandKitRecord) => Object.entries(k.fonts ?? {}).filter(([, f]) => f).map(([use, f]) => `${f} (${use})`).join(', ');

/** The same folder arrives with different capitals and slashes, so paths are
 *  compared in one form. The kit keeps the path as it was given, for showing. */
export function projectKey(path: string): string {
  const full = resolve(path).replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? full.toLowerCase() : full;
}

const belongsTo = (kit: BrandKitRecord, key: string) => (kit.projects ?? []).some((p) => projectKey(p) === key);

export type KitForProject =
  | { status: 'linked' | 'active'; kit: BrandKitRecord }
  | { status: 'unlinked'; kit: null; project: string; others: string[] }
  | { status: 'none'; kit: null };

/**
 * Which kit is in use. In a project, only the kit linked to it: a project with
 * none has no kit, rather than borrowing another brand's. With no project open,
 * the active kit.
 */
export async function kitForProject(project?: string | null): Promise<KitForProject> {
  const { kits, activeId } = await listBrandKits();
  if (project && await inProjectsFolder(project)) {
    const key = projectKey(project);
    const linked = kits.find((k) => belongsTo(k, key));
    if (linked) return { status: 'linked', kit: linked };
    return { status: 'unlinked', kit: null, project, others: kits.filter((k) => k.status !== 'proposed').map((k) => k.name) };
  }
  const active = kits.find((k) => k.id === activeId);
  return active ? { status: 'active', kit: active } : { status: 'none', kit: null };
}

/** What the apps show: in a linked project, its kit is the one in use. */
export async function brandKitsForApps(project?: string | null): Promise<{ kits: BrandKitRecord[]; activeId: string | null; project: { key: string; path: string } | null; kinds: typeof BRAND_KIT_KINDS; pieces: typeof BRAND_KIT_PIECES; corePieces: BrandPieceDef[]; projects: Array<{ path: string; name: string }> }> {
  const { kits, activeId } = await listBrandKits();
  const local = project && await inProjectsFolder(project) ? project : null;
  const key = local ? projectKey(local) : null;
  const linked = key ? kits.find((k) => belongsTo(k, key)) : undefined;
  return { kits: await forApps(kits), activeId: linked?.id ?? activeId, project: local && key ? { key, path: local } : null, kinds: BRAND_KIT_KINDS, pieces: BRAND_KIT_PIECES, corePieces: CORE_PIECES, projects: await knownProjects() };
}

/** The kit as it goes into a Blender or GIMP script, or null if there is none. */
export async function kitForScripts(project?: string | null): Promise<{ name: string; palette: BrandKitPalette; style: string[]; logos: Record<string, string>; fonts: BrandKitFonts } | null> {
  const { kit } = await kitForProject(project);
  if (!kit) return null;
  const logos: Record<string, string> = {};
  for (const slot of Object.keys(kit.logo ?? {}) as BrandLogoSlot[]) {
    const path = brandLogoPath(kit, slot);
    if (path) logos[slot] = path;
  }
  return { name: kit.name, palette: kit.palette, style: kit.styleTags ?? [], logos, fonts: kit.fonts ?? {} };
}

// ── Contrast ─────────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-f]{6}$/i;
const channel = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast between two #rrggbb colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Pairings with their real contrast: 4.5 is the floor for body text, 3 for large type and marks. */
export function checkPairings(kit: BrandKitRecord): Array<BrandKitPairing & { ratio: number | null; verdict: 'fine' | 'large only' | 'too low' | 'unknown' }> {
  const colour = (c: string) => (HEX.test(c) ? c : (kit.palette as unknown as Record<string, string>)[c]);
  return (kit.pairings ?? []).map((p) => {
    const ink = colour(p.ink);
    const on = colour(p.on);
    if (!ink || !on || !HEX.test(ink) || !HEX.test(on)) return { ...p, ratio: null, verdict: 'unknown' as const };
    const ratio = contrastRatio(ink, on);
    return { ...p, ratio, verdict: ratio >= 4.5 ? 'fine' as const : ratio >= 3 ? 'large only' as const : 'too low' as const };
  });
}

/** Where a kit stands: every piece it asks for, with its state. */
export function kitPieceStates(kit: BrandKitRecord): Array<BrandPieceDef & BrandKitPiece> {
  return kitPieceDefs(kit.kind).map((d) => ({ ...d, state: kit.pieces?.[d.id]?.state ?? 'not_made', note: kit.pieces?.[d.id]?.note, files: kit.pieces?.[d.id]?.files }));
}

/** The kit in words, for Ava's context every turn. */
export function brandKitSummary(found: KitForProject): string {
  if (found.status === 'unlinked') {
    return `No brand kit is linked to this project, so there is no kit in use here. ` +
      `${found.others.length ? `Their other kits (${found.others.join(', ')}) belong to other work: never use one by default. ` : ''}` +
      `Before anything brand-bound, ask whether to link one of those or make a new one for this project; link with design_brand_kit once they say. Any brand in your memory for this project is history, not a kit: don't design from it unless they bring it up.`;
  }
  if (found.status === 'none') return 'They have no brand kits yet. If this work needs one, offer to make it.';
  const k = found.kit;
  const lines = [
    `"${k.name}"${found.status === 'linked' ? ', linked to this project' : ''}.`,
    k.positioning ? `What it is: ${k.positioning}` : k.tagline ? `Tagline: ${k.tagline}` : '',
    `Colours: ${Object.entries(k.palette).map(([role, hex]) => `${role} ${hex}`).join(', ')}.`,
    k.styleTags?.length ? `Style: ${k.styleTags.join(', ')}.` : '',
    `Logos: ${Object.keys(k.logo ?? {}).join(', ') || 'none yet'}.`,
    fontList(k) ? `Fonts: ${fontList(k)}.` : '',
    k.imageStyle ? `Image style: ${k.imageStyle}` : '',
    k.visualDo?.length ? `Visually always: ${k.visualDo.join('; ')}.` : '',
    k.visualDont?.length ? `Visually never: ${k.visualDont.join('; ')}.` : '',
    ...checkPairings(k).map((p) => `Pairing: ${p.ink} on ${p.on}${p.use ? ` for ${p.use}` : ''} — ${p.ratio ?? '?'}:1, ${p.verdict}.`),
    k.kind ? `A ${k.kind} kit. Pieces: ${kitPieceStates(k).map((p) => `${p.label} (${p.state.replace('_', ' ')}; ${p.room === 'gimp' ? 'GIMP room' : p.room === 'blender' ? 'Blender room' : 'Brand Kits'})`).join(', ')}.` : 'This kit has no kind yet: ask them whether it is for a game, an app, a website or a business. Never guess.',
    ...kitPieceStates(k).filter((p) => p.note).map((p) => `Notes on ${p.label}: ${p.note}`),
    ...kitPieceStates(k).filter((p) => p.files?.length).map((p) => `${p.label} files: ${p.files!.map((f) => join(kitFolder(k.id), f)).join(', ')}`),
    k.voice ? `Voice: ${k.voice}` : '',
    k.doRules?.length ? `Always: ${k.doRules.join('; ')}.` : '',
    k.dontRules?.length ? `Never: ${k.dontRules.join('; ')}.` : '',
    `Design from this. The kit is the record, so never copy it into memory. In Blender and GIMP scripts use KIT.colour("primary"), KIT.rgba("primary") in Blender, and KIT.logo("mark") rather than typing colours or paths.`,
  ];
  return lines.filter(Boolean).join('\n');
}

export async function readBrandKit(id?: string): Promise<BrandKitRecord | null> {
  const { kits, activeId } = await listBrandKits();
  return kits.find((k) => k.id === (id || activeId)) ?? null;
}

// ── Changing ─────────────────────────────────────────────────────────────────

const newId = () => `kit-${Date.now()}-${randomUUID().slice(0, 5)}`;

export type BrandKitFields = Partial<Omit<BrandKitRecord, 'id' | 'createdAt' | 'updatedAt' | 'palette' | 'logo'>> & { palette?: Partial<BrandKitPalette> };

function foldFields(kit: BrandKitRecord, f: BrandKitFields): BrandKitRecord {
  const name = typeof f.name === 'string' && f.name.trim() ? f.name.trim() : kit.name;
  const given = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined));
  return { ...kit, ...given, name, palette: { ...kit.palette, ...(f.palette ?? {}) }, updatedAt: Date.now() };
}

/** A new kit. It does not become active: making a brand shouldn't switch the one
 *  you're working in. The very first kit is active, because something has to be. */
export function createBrandKit(fields: BrandKitFields): Promise<BrandKitRecord> {
  return change((store) => {
    const now = Date.now();
    const kit = foldFields({ id: newId(), name: 'New brand', palette: DEFAULT_PALETTE, styleTags: [], createdAt: now, updatedAt: now }, fields);
    store.kits.push(kit);
    store.seen.push(kit.id);
    store.activeId ??= kit.id;
    return kit;
  });
}

export function updateBrandKit(id: string | undefined, fields: BrandKitFields): Promise<BrandKitRecord | null> {
  return change((store) => {
    const target = id ?? store.activeId ?? store.kits[0]?.id;
    const i = store.kits.findIndex((k) => k.id === target);
    if (i < 0) return null;
    store.kits[i] = foldFields(store.kits[i], fields);
    return store.kits[i];
  });
}

/** Move one piece on: not made, in progress, agreed. */
export function setBrandPiece(id: string, piece: string, state: BrandPieceState, note?: string): Promise<BrandKitRecord | null> {
  return change((store) => {
    const kit = store.kits.find((k) => k.id === id);
    if (!kit) return null;
    kit.pieces = { ...kit.pieces, [piece]: { ...kit.pieces?.[piece], state, ...(note ? { note } : {}) } };
    kit.updatedAt = Date.now();
    return kit;
  });
}

/** A finished file joins the kit: a copy in the kit's own folder, so it survives
 *  the work being deleted. The piece is agreed; with a slot, it's that logo too. */
export function saveFileToKit(id: string, piece: string, source: string, slot?: BrandLogoSlot, byHand = false): Promise<BrandKitRecord | null> {
  return change(async (store) => {
    const kit = store.kits.find((k) => k.id === id);
    if (!kit || !existsSync(source)) return null;
    const dir = join(kitFolder(id), 'pieces', piece.replace(/\W/g, '_'));
    await mkdir(dir, { recursive: true });
    const before = kit.pieces?.[piece];
    // Someone choosing a logo is replacing the one there. Everything else
    // collects, and two files can share a name without one losing the other.
    const replaced = byHand && slot ? before?.files ?? [] : [];
    for (const old of replaced) await rm(join(kitFolder(id), old), { force: true });
    const name = byHand ? freeName(dir, basename(source)) : basename(source);
    await copyFile(source, join(dir, name));
    const file = `pieces/${piece.replace(/\W/g, '_')}/${name}`;
    const kept = (before?.files ?? []).filter((f) => f !== file && !replaced.includes(f));
    kit.pieces = { ...kit.pieces, [piece]: { ...before, state: 'agreed', files: [...kept, file] } };
    if (slot) {
      const ext = extname(source).toLowerCase().replace('.jpeg', '.jpg');
      if (TYPE_FOR_EXT[ext]) {
        const logos = join(kitFolder(id), 'logos');
        await mkdir(logos, { recursive: true });
        for (const other of Object.keys(TYPE_FOR_EXT)) if (other !== ext) await rm(join(logos, `${slot}${other}`), { force: true });
        await copyFile(source, join(logos, `${slot}${ext}`));
        kit.logo = { ...kit.logo, [slot]: `logos/${slot}${ext}` };
      }
    }
    kit.updatedAt = Date.now();
    return kit;
  });
}

/** A whole kit from an app's editor, created if it is new. Logos become files. */
export function saveBrandKit(kit: BrandKitRecord): Promise<BrandKitRecord> {
  return change(async (store) => {
    const { fileMap: _shownOnly, ...stored } = kit;
    const next = await withLogoFiles(stored);
    const i = store.kits.findIndex((k) => k.id === kit.id);
    if (i >= 0) store.kits[i] = next;
    else store.kits.push(next);
    if (!store.seen.includes(kit.id)) store.seen.push(kit.id);
    store.activeId ??= kit.id;
    return next;
  });
}

/** Ava's proposed kit, or a new version of one. It changes nothing in use until
 *  the person agrees it. A kit already agreed can't be proposed over. */
export function proposeBrandKit(id: string | undefined, fields: BrandKitFields, reasoning: string, project?: string | null): Promise<BrandKitRecord | { refused: string }> {
  return change((store) => {
    const now = Date.now();
    const i = id ? store.kits.findIndex((k) => k.id === id) : -1;
    if (id && i < 0) return { refused: 'There is no kit with that id.' };
    if (i >= 0 && store.kits[i].status !== 'proposed') return { refused: 'That kit is agreed. Change it with action "update", after talking it through with them.' };
    const base: BrandKitRecord = i >= 0 ? store.kits[i] : { id: newId(), name: 'New brand', palette: DEFAULT_PALETTE, styleTags: [], createdAt: now, updatedAt: now };
    const kit = { ...foldFields(base, fields), status: 'proposed' as const, reasoning, ...(project ? { proposedFor: project } : {}) };
    if (i >= 0) store.kits[i] = kit;
    else { store.kits.push(kit); store.seen.push(kit.id); }
    return kit;
  });
}

/** Their click. The only way a proposed kit goes live: it links to its project,
 *  and whatever it already holds counts as agreed. */
function freeName(dir: string, name: string): string {
  const ext = extname(name);
  const stem = basename(name, ext);
  let free = name;
  for (let n = 2; existsSync(join(dir, free)); n++) free = `${stem}-${n}${ext}`;
  return free;
}

/** The piece they're setting, if this kit has it and has been agreed. */
function pieceToSet(kit: BrandKitRecord | null | undefined, piece: string): BrandPieceDef | null {
  if (!kit || kit.status === 'proposed') return null;
  return kitPieceDefs(kit.kind).find((d) => d.id === piece) ?? null;
}

/** They chose a picture from their Library for a piece. */
export async function addPieceFromLibrary(id: string, piece: string, source: string): Promise<BrandKitRecord | null> {
  const def = pieceToSet(await readBrandKit(id), piece);
  const ext = extname(source).toLowerCase().replace('.jpeg', '.jpg');
  if (!def || !isLibraryFile(source) || !TYPE_FOR_EXT[ext]) return null;
  return saveFileToKit(id, piece, source, def.slot, true);
}

/** They uploaded a picture from their computer for a piece. */
export async function addPieceUpload(id: string, piece: string, name: string, dataUrl: string): Promise<BrandKitRecord | null> {
  const def = pieceToSet(await readBrandKit(id), piece);
  const picture = pictureFromDataUrl(dataUrl);
  if (!def || !picture) return null;
  const stem = basename(name, extname(name)).replace(/[^\w -]/g, '').trim() || 'upload';
  const holding = join(kitFolder(id), `incoming-${randomUUID().slice(0, 8)}`);
  await mkdir(holding, { recursive: true });
  try {
    const file = join(holding, `${stem}${picture.ext}`);
    await writeFile(file, picture.bytes);
    return await saveFileToKit(id, piece, file, def.slot, true);
  } finally {
    await rm(holding, { recursive: true, force: true });
  }
}

/** Takes a picture off a piece, or the logo off a logo piece. With nothing left
 *  on it the piece is not made. Only the kit's copy goes: the Library keeps its own. */
export function removePieceFile(id: string, piece: string, file?: string): Promise<BrandKitRecord | null> {
  return change(async (store) => {
    const kit = store.kits.find((k) => k.id === id);
    const def = pieceToSet(kit, piece);
    if (!kit || !def) return null;
    const before = kit.pieces?.[piece];
    const all = before?.files ?? [];
    const going = def.slot ? all : all.filter((f) => f === file);
    if (!def.slot && !going.length) return null;
    for (const old of going) await rm(join(kitFolder(id), old), { force: true });
    if (def.slot) {
      const logoFile = brandLogoPath(kit, def.slot);
      if (logoFile) await rm(logoFile, { force: true });
      if (kit.logo) delete kit.logo[def.slot];
    }
    const files = all.filter((f) => !going.includes(f));
    const state = files.length || before?.note ? before?.state ?? 'not_made' : 'not_made';
    kit.pieces = { ...kit.pieces, [piece]: { ...before, state, files } };
    kit.updatedAt = Date.now();
    return kit;
  });
}

export function agreeBrandKit(id: string): Promise<BrandKitRecord | null> {
  return change((store) => {
    const kit = store.kits.find((k) => k.id === id);
    if (!kit || kit.status !== 'proposed') return null;
    delete kit.status;
    const filled: Record<string, boolean> = {
      colours: !!kit.pairings?.length, fonts: !!(kit.fonts?.heading || kit.fonts?.body), image_style: !!kit.imageStyle,
      visual_rules: !!(kit.visualDo?.length || kit.visualDont?.length), voice: !!kit.voice,
    };
    kit.pieces = { ...kit.pieces };
    for (const [piece, done] of Object.entries(filled)) if (done) kit.pieces[piece] = { state: 'agreed' };
    if (kit.proposedFor) {
      const key = projectKey(kit.proposedFor);
      for (const other of store.kits) other.projects = other.projects?.filter((p) => projectKey(p) !== key);
      kit.projects = [...(kit.projects ?? []), kit.proposedFor];
      delete kit.proposedFor;
    }
    store.activeId ??= kit.id;
    kit.updatedAt = Date.now();
    return kit;
  });
}

/** Link a kit to a project. A project has one kit, so any other kit lets go of it. */
export async function linkBrandKit(id: string, project: string): Promise<BrandKitRecord | null> {
  if (!(await inProjectsFolder(project))) return null;
  return change((store) => {
    const key = projectKey(project);
    const target = store.kits.find((k) => k.id === id);
    if (!target) return null;
    for (const k of store.kits) {
      if (belongsTo(k, key)) { k.projects = (k.projects ?? []).filter((p) => projectKey(p) !== key); k.updatedAt = Date.now(); }
    }
    target.projects = [...(target.projects ?? []), project];
    target.updatedAt = Date.now();
    return target;
  });
}

export function unlinkBrandKit(id: string, project: string): Promise<BrandKitRecord | null> {
  return change((store) => {
    const key = projectKey(project);
    const target = store.kits.find((k) => k.id === id);
    if (!target) return null;
    target.projects = (target.projects ?? []).filter((p) => projectKey(p) !== key);
    target.updatedAt = Date.now();
    return target;
  });
}

export function setActiveBrandKit(id: string): Promise<BrandKitRecord | null> {
  return change((store) => {
    const kit = store.kits.find((k) => k.id === id) ?? null;
    if (kit) store.activeId = id;
    return kit;
  });
}

/** Pictures in the Library to choose from: what's marked final, or a work's main
 *  image if nothing is yet. `everything` adds its tests and comparisons. */
export async function kitLibraryChoices(everything = false): Promise<Array<{ key: string; title: string; path: string }>> {
  let items: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(await readFile(metadataFile(), 'utf-8'));
    if (Array.isArray(parsed)) items = parsed;
  } catch { return []; }
  const picture = /\.(png|jpe?g|webp|svg)$/i;
  const out: Array<{ key: string; title: string; path: string }> = [];
  for (const it of items) {
    const title = String(it.title || 'Untitled');
    const id = String(it.id ?? '');
    if (it.kind === 'gimp' && typeof it.absoluteFolder === 'string') {
      const folder = it.absoluteFolder;
      const finals = await readImageFinals(id.replace(/^gimp_/, ''));
      const all = Array.isArray(it.files) ? it.files.map(String) : [];
      const files = everything ? [...new Set([...finals, ...all])] : finals.length ? finals : all.filter((f) => !f.includes('/'));
      for (const file of files) {
        if (!picture.test(file) || file === 'preview.png') continue;
        out.push({ key: `${id}:${file}`, title: `${title} · ${file.split('/').pop()}`, path: join(folder, file) });
      }
    } else if (typeof it.absolutePath === 'string' && picture.test(it.absolutePath) && existsSync(it.absolutePath)) {
      out.push({ key: id, title, path: it.absolutePath });
    }
  }
  return out;
}

/** Only files in the Library, for a path that came through the app. */
export function isLibraryFile(path: string): boolean {
  const root = resolve(creativeDir());
  return resolve(path).startsWith(root + sep);
}

/** A file already on this computer becomes one of a kit's logos: a copy, so the
 *  kit keeps it even if the original is deleted from the Library. */
export function setBrandLogoFromFile(id: string, slot: BrandLogoSlot, source: string): Promise<BrandKitRecord | null> {
  return change(async (store) => {
    const i = store.kits.findIndex((k) => k.id === id);
    const ext = extname(source).toLowerCase().replace('.jpeg', '.jpg');
    if (i < 0 || !TYPE_FOR_EXT[ext] || !existsSync(source)) return null;
    const dir = join(kitFolder(id), 'logos');
    await mkdir(dir, { recursive: true });
    for (const other of Object.keys(TYPE_FOR_EXT)) {
      if (other !== ext) await rm(join(dir, `${slot}${other}`), { force: true });
    }
    await copyFile(source, join(dir, `${slot}${ext}`));
    const piece = kitPieceDefs(store.kits[i].kind).find((d) => d.slot === slot);
    const pieces = piece ? { ...store.kits[i].pieces, [piece.id]: { ...store.kits[i].pieces?.[piece.id], state: 'agreed' as const } } : store.kits[i].pieces;
    store.kits[i] = { ...store.kits[i], logo: { ...store.kits[i].logo, [slot]: `logos/${slot}${ext}` }, pieces, updatedAt: Date.now() };
    return store.kits[i];
  });
}

/** Delete a kit and its files. Only after the person has asked for it. */
export async function deleteBrandKit(id: string): Promise<boolean> {
  let gone: BrandKitRecord | undefined;
  const deleted = await change(async (store) => {
    gone = store.kits.find((k) => k.id === id);
    if (!gone) return false;
    store.kits = store.kits.filter((k) => k.id !== id);
    if (store.activeId === id) store.activeId = store.kits[0]?.id ?? null;
    await rm(kitFolder(id), { recursive: true, force: true });
    return true;
  });
  if (deleted && gone) await forgetBrandKit(gone);
  return deleted;
}

/**
 * A deleted kit is deleted so they can start again, so what its projects remember
 * about it is archived: still there, but never carried into the next design. The
 * kit is gone either way, so a failure here doesn't undo the delete.
 */
async function forgetBrandKit(kit: BrandKitRecord): Promise<void> {
  const name = kit.name.toLowerCase();
  const aboutKit = (content: string) => {
    const text = content.toLowerCase();
    return text.includes(kit.id.toLowerCase()) || (text.includes('brand kit') && text.includes(name));
  };
  for (const project of kit.projects ?? []) {
    await MemoryManager.archiveInProject(dirname(brandKitsFile()), project, aboutKit).catch(() => 0);
  }
}

/**
 * Bring in what an app still holds in localStorage. A kit whose id has been seen
 * is skipped: the store is the truth from then on. Returns how many came in.
 */
export function importBrandKits(kits: unknown, activeId?: string | null): Promise<number> {
  return change(async (store) => {
    if (!Array.isArray(kits)) return 0;
    let added = 0;
    for (const raw of kits as BrandKitRecord[]) {
      if (!raw || typeof raw.id !== 'string' || !raw.id || store.seen.includes(raw.id)) continue;
      store.kits.push(await withLogoFiles({ ...raw, styleTags: raw.styleTags ?? [], palette: { ...DEFAULT_PALETTE, ...raw.palette } }));
      store.seen.push(raw.id);
      added++;
    }
    if (!store.kits.some((k) => k.id === store.activeId)) {
      store.activeId = store.kits.find((k) => k.id === activeId)?.id ?? store.kits[0]?.id ?? null;
    }
    return added;
  });
}
