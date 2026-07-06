/**
 * Brand Kit — the persistent design context every Forge tool reads
 * (Recraft/Canva pattern, locked in the Studio rework plan 2026-07-05).
 * Set once: name, palette, style tags. Icon colours default from it; the
 * designer persona will read AND propose updates to it (Phase E); kit-mode
 * composes with it.
 *
 * Storage: localStorage in the hub (operator tool). When this ships in the
 * extension/IDE it becomes a local file (and can read the project's real
 * design tokens). Multiple kits, one active — the designer conversation is
 * keyed per kit.
 */

export interface BrandKit {
  id: string;
  name: string;
  tagline?: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    neutral: string;
    surface: string;
  };
  /** Free-form direction words ("calm", "premium") — the persona's brief. */
  styleTags: string[];
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
