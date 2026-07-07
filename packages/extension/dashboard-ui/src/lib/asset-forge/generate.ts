/**
 * Design Studio generate-lane logic (ported from the hub's Asset Forge). Pure /
 * browser-safe: builds the shape "armature" the model paints onto and the
 * art-director prompt. The actual model + matte run host-side (the webview
 * can't reach the platform) — see DashboardPanel.handleAssetForgeGenerate.
 */
import { buildShapeSvg } from './icon-svg';
import type { ShapeHit } from './shape-library';

/** Material finishes the deterministic vector engine can't produce — each
 *  carries real art-direction doctrine to ground Qwen-Image on the shape. */
export const MATERIALS: { id: string; label: string; prompt: string }[] = [
  // No "flat" — a flat icon is just the plain Lucide vector, which belongs in
  // the free Library, not a paid generation. Generation is for the finishes
  // that actually need the model: glass, clay, glossy, metal, neon.
  { id: 'glass', label: 'Glass', prompt: 'frosted translucent glass with soft internal refraction and a subtle bright rim-light, clean bevelled edges, a premium glassmorphism app-icon look' },
  { id: 'clay', label: 'Clay 3D', prompt: 'soft matte 3D clay / plasticine, gently extruded rounded form, tactile surface, soft ambient occlusion, friendly Claymorphism app-icon look' },
  { id: 'glossy', label: 'Glossy 3D', prompt: 'glossy moulded plastic 3D render, smooth studio reflections and a soft highlight, vibrant candy-like modern app-icon look' },
  { id: 'metal', label: 'Metal', prompt: 'brushed metallic surface with realistic specular highlights and a premium chrome / stainless finish, sleek and industrial' },
  { id: 'neon3d', label: 'Neon Glow', prompt: 'luminous neon tube emitting a soft coloured bloom, dark-friendly, glowing edges, energetic cyber look' },
];

// Qwen-Image honours a negative prompt — the constraints that keep an icon an
// icon: one clean subject, no text, edges a matte can strip cleanly.
export const ICON_NEGATIVE = 'text, letters, numbers, words, watermark, multiple objects, collage, busy or textured background, scene, environment, drop shadow on the background, glow bleeding to the edges, photo of a real physical object, clutter, low quality, blurry';

/** The generation armature on a flat white field — the stick-man the model
 *  paints flesh onto. DUOTONE, not a solid silhouette: a light fill conveys the
 *  mass while dark strokes preserve ALL internal structure. A solid silhouette
 *  ('flat') fills closed shapes — a UserCircle became a solid disc and the model
 *  rendered a blob with the person gone. Duotone keeps the person (and every
 *  inner detail) visible so the model has something real to restyle. */
export function armatureSvg(shape: ShapeHit): string {
  const body = buildShapeSvg(shape.elements, 'duotone', ['#151515'], 2.4);
  return body.replace(/^(<svg[^>]*>)/, '$1<rect x="0" y="0" width="24" height="24" fill="#ffffff"/>');
}

/** Compose the image-model prompt. TWO layers: `look` is Ava's AUTHORED art
 *  direction (material, finish, lighting, mood — the creative heart she writes
 *  from what she gauged); everything else is the LOCKED, matte-critical frame
 *  (silhouette-lock, isolation, white background, no text) she can't break, so
 *  transparency always works. The reference image carries the shape. */
export function composeIconPrompt(label: string, look: string, color: string): string {
  const art = look.trim() || 'clean, well-crafted icon finish';
  return `A single "${label}" icon — ${art}. Follow the reference drawing exactly: keep its shape, proportions and ALL internal detail — render every element it shows (never simplify it into a plain blob, never drop the inner parts). Restyle only its surface, material and lighting. Primary colour ${color}. One single centered icon filling most of the frame, isolated on a completely flat solid pure-white #ffffff background, crisp clean edges, no background scene, no cast shadow on the background, no glow bleeding to the edges, no text, no letters, no numbers.`;
}
