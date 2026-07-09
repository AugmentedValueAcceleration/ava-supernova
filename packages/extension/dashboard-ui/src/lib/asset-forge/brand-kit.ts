/**
 * Brand Kit — a full brand identity every tool reads: Identity + Look + Voice.
 * Multiple named kits, one active; switch the active kit and design AND posts
 * come out on that brand. See BRAND_KITS_PLAN.md.
 *
 * Storage: localStorage today (already local). Moving to a shared local file
 * `~/.ava/brand-kits.json` (host/Tauri) so the same kits are seen across the
 * extension, IDE, and hub on one machine — same home as memory. All local; the
 * cloud (Supabase) kit is being retired.
 */

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

export function loadKits(): BrandKit[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const kits = raw ? (JSON.parse(raw) as BrandKit[]) : [];
    return Array.isArray(kits) && kits.length ? kits : [defaultKit()];
  } catch {
    return [defaultKit()];
  }
}

export function saveKits(kits: BrandKit[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(kits));
}

export function activeKit(): BrandKit {
  const kits = loadKits();
  const id = localStorage.getItem(ACTIVE_KEY);
  return kits.find(k => k.id === id) ?? kits[0];
}

export function setActiveKit(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function upsertKit(kit: BrandKit): BrandKit[] {
  const kits = loadKits();
  const i = kits.findIndex(k => k.id === kit.id);
  const next = { ...kit, updatedAt: Date.now() };
  if (i >= 0) kits[i] = next; else kits.push(next);
  saveKits(kits);
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

/** Delete a kit. Never leaves zero kits (falls back to a fresh default). If the
 *  deleted kit was active, the first remaining kit becomes active. */
export function deleteKit(id: string): BrandKit[] {
  const remaining = loadKits().filter(k => k.id !== id);
  const next = remaining.length ? remaining : [defaultKit()];
  saveKits(next);
  if (localStorage.getItem(ACTIVE_KEY) === id) setActiveKit(next[0].id);
  return next;
}
