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
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AVA_HOME } from '../core/constants.js';

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
export interface BrandPieceDef { id: string; label: string; room: BrandPieceRoom }

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
    { id: 'title_logo', label: 'Title logo', room: 'gimp' },
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
    { id: 'logo', label: 'Logo', room: 'gimp' },
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
export interface BrandKitPiece { state: BrandPieceState; note?: string }
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

/** A data URL becomes a file in the kit's folder. Anything else is left as it is. */
async function logoToFile(kitId: string, slot: string, value: string): Promise<string> {
  const m = /^data:([\w/+.-]+)(;base64)?,([\s\S]*)$/.exec(value);
  const ext = m && EXT_FOR_TYPE[m[1]];
  if (!m || !ext) return value;
  const bytes = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf-8');
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
    if (!kit.logo) return kit;
    const logo: BrandKitRecord['logo'] = {};
    for (const slot of Object.keys(kit.logo) as BrandLogoSlot[]) {
      const url = await logoAsDataUrl(kit, slot);
      if (url) logo[slot] = url;
    }
    return { ...kit, logo };
  }));
}

// ── Reading ──────────────────────────────────────────────────────────────────

export async function listBrandKits(): Promise<{ kits: BrandKitRecord[]; activeId: string | null }> {
  const { kits, activeId } = await readStore();
  const live = kits.filter((k) => k.status !== 'proposed');
  return { kits, activeId: live.some((k) => k.id === activeId) ? activeId : live[0]?.id ?? null };
}

/** Projects this computer has opened, newest first, once each. */
export async function knownProjects(open?: string | null): Promise<Array<{ path: string; name: string }>> {
  let saved: Array<{ path?: string; name?: string; lastUsed?: string }> = [];
  try {
    const parsed = JSON.parse(await readFile(join(brandKitsHome(), 'projects.json'), 'utf-8'));
    if (Array.isArray(parsed)) saved = parsed;
  } catch { /* none yet */ }
  const newest = [...saved].sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? ''));
  const out = new Map<string, { path: string; name: string }>();
  if (open) out.set(projectKey(open), { path: open, name: basename(open) });
  for (const p of newest) {
    if (p.path && !out.has(projectKey(p.path))) out.set(projectKey(p.path), { path: p.path, name: p.name || basename(p.path) });
  }
  return [...out.values()];
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
  if (project) {
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
  const key = project ? projectKey(project) : null;
  const linked = key ? kits.find((k) => belongsTo(k, key)) : undefined;
  return { kits: await forApps(kits), activeId: linked?.id ?? activeId, project: project && key ? { key, path: project } : null, kinds: BRAND_KIT_KINDS, pieces: BRAND_KIT_PIECES, corePieces: CORE_PIECES, projects: await knownProjects(project) };
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
  return kitPieceDefs(kit.kind).map((d) => ({ ...d, state: kit.pieces?.[d.id]?.state ?? 'not_made', note: kit.pieces?.[d.id]?.note }));
}

/** The kit in words, for Ava's context every turn. */
export function brandKitSummary(found: KitForProject): string {
  if (found.status === 'unlinked') {
    return `No brand kit is linked to this project, so there is no kit in use here. ` +
      `${found.others.length ? `Their other kits (${found.others.join(', ')}) belong to other work: never use one by default. ` : ''}` +
      `Before anything brand-bound, ask whether to link one of those or make a new one for this project; link with design_brand_kit once they say.`;
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
    k.kind ? `A ${k.kind} kit. Pieces: ${kitPieceStates(k).map((p) => `${p.label} (${p.state.replace('_', ' ')})`).join(', ')}.` : 'This kit has no kind yet: ask them whether it is for a game, an app, a website or a business. Never guess.',
    k.voice ? `Voice: ${k.voice}` : '',
    k.doRules?.length ? `Always: ${k.doRules.join('; ')}.` : '',
    k.dontRules?.length ? `Never: ${k.dontRules.join('; ')}.` : '',
    `Design from this. In Blender and GIMP scripts use KIT.colour("primary"), KIT.rgba("primary") in Blender, and KIT.logo("mark") rather than typing colours or paths.`,
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
    kit.pieces = { ...kit.pieces, [piece]: { state, ...(note ? { note } : {}) } };
    kit.updatedAt = Date.now();
    return kit;
  });
}

/** A whole kit from an app's editor, created if it is new. Logos become files. */
export function saveBrandKit(kit: BrandKitRecord): Promise<BrandKitRecord> {
  return change(async (store) => {
    const next = await withLogoFiles(kit);
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
export function linkBrandKit(id: string, project: string): Promise<BrandKitRecord | null> {
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
    store.kits[i] = { ...store.kits[i], logo: { ...store.kits[i].logo, [slot]: `logos/${slot}${ext}` }, updatedAt: Date.now() };
    return store.kits[i];
  });
}

/** Delete a kit and its files. Only after the person has asked for it. */
export function deleteBrandKit(id: string): Promise<boolean> {
  return change(async (store) => {
    if (!store.kits.some((k) => k.id === id)) return false;
    store.kits = store.kits.filter((k) => k.id !== id);
    if (store.activeId === id) store.activeId = store.kits[0]?.id ?? null;
    await rm(kitFolder(id), { recursive: true, force: true });
    return true;
  });
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
