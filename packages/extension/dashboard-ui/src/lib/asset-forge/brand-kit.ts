/**
 * Brand Kit — a full brand identity every tool reads: Identity + Look + Voice.
 * Multiple named kits, one active; switch the active kit and design AND posts
 * come out on that brand. See BRAND_KITS_PLAN.md.
 *
 * Storage: one local file, `~/.ava/brand-kits.json`, owned by core, so the
 * extension, the IDE and Ava's tools all see the same kits. Identical in the
 * extension and the IDE.
 */

export type PieceState = 'not_made' | 'in_progress' | 'agreed';
export interface PieceDef { id: string; label: string; room: string; slot?: string }
/** The kinds and their pieces, from the store, so there is one list. */
export interface KitShapes {
  kinds: Array<{ id: string; label: string }>;
  pieces: Record<string, PieceDef[]>;
  corePieces: PieceDef[];
  projects: Array<{ path: string; name: string }>;
}

export interface BrandKit {
  id: string;
  name: string;

  // ── Identity ──────────────────────────────────────────────────────────
  tagline?: string;
  /** One line: what the brand is + who it's for. Sharpens everything downstream. */
  positioning?: string;

  // ── Look (drives icons / images / graphics) ──────────────────────────
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    neutral: string;
    surface: string;
  };
  /** Free-form direction words ("calm", "premium") — the persona's brief. */
  styleTags: string[];
  /** Logo references — local file paths or data URIs. */
  logo?: {
    primary?: string;
    mark?: string;
    light?: string;
    dark?: string;
  };

  // ── Voice (drives posts / copy) ──────────────────────────────────────
  /** Tone — how this brand writes. Flows into the Social Media Manager. */
  voice?: string;
  /** Red lines — "always first person". */
  doRules?: string[];
  /** Red lines — "never 'excited to announce'". */
  dontRules?: string[];
  defaultHashtags?: string[];
  defaultLink?: string;

  // ── Audio (optional — only if they use voice/music) ──────────────────
  defaultVoiceId?: string;
  musicPrompt?: string;

  // ── Projects ──
  /** Project paths this kit belongs to. A project has one kit. */
  projects?: string[];

  // ── Its shape ──
  /** What the project is. It decides which pieces the kit asks for. */
  kind?: string;
  pieces?: Record<string, { state: PieceState; note?: string; files?: string[] }>;
  fonts?: { heading?: string; body?: string; ui?: string };
  pairings?: Array<{ ink: string; on: string; use?: string }>;
  imageStyle?: string;
  visualDo?: string[];
  visualDont?: string[];
  /** 'proposed' while it waits for them to agree it. */
  status?: 'proposed';
  reasoning?: string;
  proposedFor?: string;
  /** Sent by the host: a kit's saved files, by their path in the kit. */
  fileMap?: Record<string, string>;

  createdAt: number;
  updatedAt: number;
}

const STORE_KEY = 'ava-forge-brand-kits';
const ACTIVE_KEY = 'ava-forge-brand-kit-active';

export function defaultKit(): BrandKit {
  const now = Date.now();
  return {
    id: 'kit-' + now,
    name: 'My brand',
    palette: {
      primary: '#a855f7',
      secondary: '#89b4fa',
      accent: '#94e2d5',
      neutral: '#a6adc8',
      surface: '#110c1a',
    },
    styleTags: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ── The shared store ─────────────────────────────────────────────────────────
// The kits live in ~/.ava/brand-kits.json. This file is the app's live view of
// them. Reads stay synchronous for the Studio; changes go to the store, and the
// store's answer arrives through applyStoreKits. What was in localStorage is
// offered to the store once, then left untouched as a backup.
export type KitChange =
  | { op: 'save'; kit: BrandKit }
  | { op: 'delete'; id: string }
  | { op: 'set_active'; id: string };

let store: { kits: BrandKit[]; activeId: string | null } | null = null;
/** The open project, as the store compares it. */
let project: { key: string; path: string } | null = null;
export const kitProject = () => project;
let shapes: KitShapes = { kinds: [], pieces: {}, corePieces: [], projects: [] };
export const kitShapes = () => shapes;
/** The pieces a kit asks for: its kind's, then the ones every kit has. */
export const kitPieces = (kit: BrandKit): PieceDef[] => [...(kit.kind ? shapes.pieces[kit.kind] ?? [] : []), ...shapes.corePieces];
let send: ((change: KitChange) => void) | null = null;

function signalKitChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('ava-kit-changed'));
}

/** Last seen from the store, so the Studio opens on the truth. Without it, the
 *  first paint read the frozen localStorage backup: deleted kits appeared for a
 *  moment, until the store's answer arrived. */
const VIEW_KEY = 'ava-forge-brand-kits-view';

function rememberView(): void {
  if (!store) return;
  const write = (kits: BrandKit[]) => localStorage.setItem(VIEW_KEY, JSON.stringify({ kits, activeId: store!.activeId }));
  try { write(store.kits); } catch {
    // Logos can be too big for localStorage; the store's answer brings them back.
    try { write(store.kits.map(k => ({ ...k, logo: undefined }))); } catch { /* the store's answer still arrives */ }
  }
}

function remembered(): { kits: BrandKit[]; activeId: string | null } | null {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function localKits(): BrandKit[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const kits = raw ? (JSON.parse(raw) as BrandKit[]) : [];
    return Array.isArray(kits) ? kits : [];
  } catch {
    return [];
  }
}

/** Connect to the store: offers what localStorage holds, and routes changes. */
export function connectKitStore(connect: (kits: BrandKit[], activeId: string | null) => void, onChange: (change: KitChange) => void): void {
  send = onChange;
  let activeId: string | null = null;
  try { activeId = localStorage.getItem(ACTIVE_KEY); } catch { /* none */ }
  connect(localKits(), activeId);
}

/** The store's kits arrived. A kit edited here more recently keeps that edit:
 *  a store reply can land after the next keystroke. */
export function applyStoreKits(kits: BrandKit[], activeId: string | null, openProject: { key: string; path: string } | null = null, kitShapes: KitShapes | null = null): void {
  project = openProject;
  if (kitShapes) shapes = kitShapes;
  const mine = store?.kits ?? [];
  store = {
    kits: kits.map(k => {
      const local = mine.find(m => m.id === k.id);
      return local && local.updatedAt > k.updatedAt ? local : k;
    }),
    activeId,
  };
  rememberView();
  signalKitChange();
}

/** The real kits, or null until the store has answered. For showing a list:
 *  loadKits fills in a default so a generator always has colours to use, which
 *  must never appear as a kit, and nothing older than the store may either. */
export const storeKits = (): BrandKit[] | null => store?.kits ?? null;

/** WCAG contrast between two #rrggbb colours, 1 to 21. */
export function contrastOf(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, b2] = [1, 3, 5].map((i) => {
      const s = parseInt(hex.slice(i, i + 2), 16) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10;
}

/** Whether a kit belongs to the open project. */
export function linkedHere(kit: BrandKit): boolean {
  if (!project) return false;
  const key = project.key;
  return (kit.projects ?? []).some(p => {
    const full = p.replace(/\\/g, '/').replace(/\/+$/, '');
    return full === key || full.toLowerCase() === key;
  });
}

export function loadKits(): BrandKit[] {
  if (store) return store.kits.length ? store.kits : [defaultKit()];
  const seen = remembered();
  if (seen) return seen.kits.length ? seen.kits : [defaultKit()];
  const kits = localKits();
  return kits.length ? kits : [defaultKit()];
}

export function activeKit(): BrandKit {
  const kits = loadKits();
  let id = store?.activeId ?? remembered()?.activeId ?? null;
  if (!store && !id) {
    try { id = localStorage.getItem(ACTIVE_KEY); } catch { /* none */ }
  }
  return kits.find(k => k.id === id) ?? kits[0];
}

export function setActiveKit(id: string): void {
  if (store) store = { ...store, activeId: id };
  else localStorage.setItem(ACTIVE_KEY, id);
  send?.({ op: 'set_active', id });
  signalKitChange();
}

export function upsertKit(kit: BrandKit): BrandKit[] {
  const kits = [...loadKits()];
  const i = kits.findIndex(k => k.id === kit.id);
  const next = { ...kit, updatedAt: Date.now() };
  if (i >= 0) kits[i] = next; else kits.push(next);
  if (store) store = { ...store, kits };
  else localStorage.setItem(STORE_KEY, JSON.stringify(kits));
  send?.({ op: 'save', kit: next });
  signalKitChange();
  return kits;
}

/** Create a new kit (seeded from the default look) and save it. Does NOT change
 *  the active kit — creating a brand shouldn't switch the one you're working in;
 *  activate explicitly with setActiveKit. */
export function createKit(name: string): BrandKit {
  const now = Date.now();
  const kit: BrandKit = {
    ...defaultKit(),
    id: 'kit-' + now + '-' + Math.random().toString(36).slice(2, 7),
    name: name.trim() || 'New brand',
    createdAt: now,
    updatedAt: now,
  };
  upsertKit(kit);
  return kit;
}

/** Delete a kit. If it was active, the first remaining kit becomes active. */
export function deleteKit(id: string): BrandKit[] {
  const remaining = loadKits().filter(k => k.id !== id);
  if (store) {
    store = { kits: remaining, activeId: store.activeId === id ? remaining[0]?.id ?? null : store.activeId };
  } else {
    localStorage.setItem(STORE_KEY, JSON.stringify(remaining));
  }
  send?.({ op: 'delete', id });
  signalKitChange();
  return remaining.length ? remaining : [defaultKit()];
}
