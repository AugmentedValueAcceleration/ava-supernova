// ─── Design Studio asset taxonomy (single source of truth) ───────────────────
//
// The nav groups (Open Canvas / Web / App / Game) and the specific asset types
// within them. BOTH the Design Studio left-nav AND the Library Assets filter
// derive from this list, so "sort the library by type" always mirrors exactly
// where the asset was made — one list to maintain, never two to keep in sync.

export type ViewId =
  | 'icon' | 'iconset' | 'appicon' | 'logo' | 'badge' | 'avatar' | 'banner' | 'hero' | 'ogimage' | 'illustration' | 'pattern'
  | 'game-concept' | 'game-character' | 'game-creature' | 'game-ability' | 'game-item' | 'game-card' | 'game-env' | 'game-keyart' | 'game-map' | 'game-emblem' | 'game-texture' | 'game-tileset' | 'game-sprite'
  | 'image' | 'video' | 'voice' | 'brandkit';

export interface DesignTypeItem { id: ViewId; label: string; badge?: string }
export interface DesignGroup { label: string; accent: string; items: DesignTypeItem[] }

// Left-nav group accent colours mirror the hub (Web/App purple, Game orange,
// Open Canvas blue).
export const DESIGN_GROUPS: DesignGroup[] = [
  { label: 'Open Canvas', accent: '#6aa9ff', items: [
    { id: 'video', label: 'Video' },
    { id: 'voice', label: 'Voiceover' },
    { id: 'image', label: 'Image' },
  ] },
  { label: 'Web / App', accent: 'var(--accent)', items: [
    { id: 'icon', label: 'Icon' },
    { id: 'appicon', label: 'App Icon / Favicon', badge: 'SOON' },
    { id: 'logo', label: 'Logo' },
    { id: 'badge', label: 'Badge / Mark', badge: 'SOON' },
    { id: 'avatar', label: 'Avatar', badge: 'SOON' },
    { id: 'banner', label: 'Banner', badge: 'SOON' },
    { id: 'hero', label: 'Hero', badge: 'SOON' },
    { id: 'ogimage', label: 'Social / OG Image', badge: 'SOON' },
    { id: 'illustration', label: 'Illustration', badge: 'SOON' },
    { id: 'pattern', label: 'Pattern / Background', badge: 'SOON' },
  ] },
  { label: 'Game Dev', accent: '#f0a24b', items: [
    { id: 'game-concept', label: 'Concept Art', badge: 'SOON' },
    { id: 'game-character', label: 'Character / Portrait', badge: 'SOON' },
    { id: 'game-creature', label: 'Creature / Enemy', badge: 'SOON' },
    { id: 'game-ability', label: 'Ability Icons', badge: 'SOON' },
    { id: 'game-item', label: 'Item / Prop', badge: 'SOON' },
    { id: 'game-card', label: 'Card', badge: 'SOON' },
    { id: 'game-env', label: 'Environment / Background', badge: 'SOON' },
    { id: 'game-keyart', label: 'Key Art / Splash', badge: 'SOON' },
    { id: 'game-map', label: 'World Map', badge: 'SOON' },
    { id: 'game-emblem', label: 'Emblem / Crest', badge: 'SOON' },
    { id: 'game-texture', label: 'Texture / Material', badge: 'SOON' },
    { id: 'game-tileset', label: 'Tileset', badge: 'SOON' },
    { id: 'game-sprite', label: 'Sprite', badge: 'SOON' },
  ] },
];

// Flat id → { label, group } lookup, built once from the groups above.
const TYPE_INDEX: Record<string, { label: string; group: string }> = (() => {
  const idx: Record<string, { label: string; group: string }> = {};
  for (const g of DESIGN_GROUPS) for (const it of g.items) idx[it.id] = { label: it.label, group: g.label };
  return idx;
})();

/** Group label + display label for a design type id, or null if it isn't a
 *  gallery type (e.g. 'brandkit', or an unknown/legacy value). */
export function designTypeMeta(id?: string | null): { label: string; group: string } | null {
  return id ? (TYPE_INDEX[id] ?? null) : null;
}

/** Map a coarse creative kind (image/video/voice/music) to the Open-Canvas type
 *  id used when an asset has no fine-grained designType (legacy / workspace
 *  files). Everything that isn't clearly video or audio is treated as an image. */
export function coarseKindToType(kind?: string | null): ViewId {
  const k = (kind ?? '').toLowerCase();
  if (k === 'video') return 'video';
  if (k === 'voice' || k === 'music' || k === 'audio' || k === 'sfx') return 'voice';
  return 'image';
}
