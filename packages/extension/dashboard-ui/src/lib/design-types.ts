// ─── Design Studio asset taxonomy (single source of truth) ───────────────────
//
// The nav groups (Open Canvas / Web / App / Game) and the specific asset types
// within them. BOTH the Design Studio left-nav AND the Library Assets filter
// derive from this list, so "sort the library by type" always mirrors exactly
// where the asset was made — one list to maintain, never two to keep in sync.

export type ViewId =
  | 'icon' | 'logo' | 'model'
  | 'image' | 'video' | 'voice' | 'brandkit';

export interface DesignTypeItem { id: ViewId; label: string; badge?: string }
export interface DesignGroup { labelKey: string; label: string; accent: string; items: DesignTypeItem[] }

// The groups (his call, 3 Nov 2026): Open Canvas · Brand & Web · 2D · 3D. No
// "Game Dev" — a 3D model is as much for a product shot or a 3D print as for a
// game; rooms that really are game-specific say so in their own description.
//
// ONLY rooms that work are listed. The SOON placeholders are gone: thirteen
// greyed-out promises read as things we had not done. A room is added here the
// day its pipeline is real, and a group with no live room is not shown at all,
// so 2D and 3D appear with their first room. Planned rooms: see
// Decisions/plans/2026-10-28-design-studio-3d-headless.md (decision 6).
//
// Accents: Open Canvas blue, Brand & Web purple (as Web / App was), 2D and 3D
// the orange Game Dev had.
/** Every group, empty or not — the Library always shows all four (his call,
 *  3 Nov 2026), so where a thing will live is visible before it exists. */
export const ALL_DESIGN_GROUPS: DesignGroup[] = [
  { labelKey: 'dash.studio.group.open_canvas', label: 'Open Canvas', accent: '#6aa9ff', items: [
    { id: 'video', label: 'Video' },
    { id: 'voice', label: 'Voiceover' },
    { id: 'image', label: 'Image' },
  ] },
  { labelKey: 'dash.studio.group.brand_web', label: 'Brand & Web', accent: 'var(--accent)', items: [
    { id: 'icon', label: 'Icon' },
    { id: 'logo', label: 'Logo' },
  ] },
  { labelKey: 'dash.studio.group.2d', label: '2D', accent: '#f0a24b', items: [] },
  { labelKey: 'dash.studio.group.3d', label: '3D', accent: '#f0a24b', items: [
    { id: 'model', label: 'Blender (Headless)' },
  ] },
];

/** The Design Studio sidebar: only groups with a working room. */
export const DESIGN_GROUPS: DesignGroup[] = ALL_DESIGN_GROUPS.filter((g) => g.items.length > 0);

/** The lanes that generate on the user's Qwen key (image, video, voice, and
 *  the icon lane's Qwen-Image). Without that key they are greyed out; Logo is
 *  drawn on the user's computer and Brand Kit generates nothing. */
export const QWEN_VIEWS: readonly ViewId[] = ['video', 'voice', 'image', 'icon'];

// Flat id → { label, group } lookup, built once from the groups above.
const TYPE_INDEX: Record<string, { label: string; group: string }> = (() => {
  const idx: Record<string, { label: string; group: string }> = {
    // Made by Ava's tools before their room is in the sidebar — still sorted
    // into the group they belong to. 3D models come from design_build_model.
  };
  for (const g of ALL_DESIGN_GROUPS) for (const it of g.items) idx[it.id] = { label: it.label, group: g.label };
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
