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
  { id: 'glass', label: 'Glass', prompt: 'frosted translucent glass with soft internal refraction and a subtle bright rim-light, clean bevelled edges, a premium glassmorphism app-icon look' },
  { id: 'clay', label: 'Clay 3D', prompt: 'soft matte 3D clay / plasticine, gently extruded rounded form, tactile surface, soft ambient occlusion, friendly Claymorphism app-icon look' },
  { id: 'glossy', label: 'Glossy 3D', prompt: 'glossy moulded plastic 3D render, smooth studio reflections and a soft highlight, vibrant candy-like modern app-icon look' },
  { id: 'metal', label: 'Metal', prompt: 'brushed metallic surface with realistic specular highlights and a premium chrome / stainless finish, sleek and industrial' },
  { id: 'neon3d', label: 'Neon Glow', prompt: 'luminous neon tube emitting a soft coloured bloom, dark-friendly, glowing edges, energetic cyber look' },
];

// Qwen-Image honours a negative prompt — the constraints that keep an icon an
// icon: one clean subject, no text, edges a matte can strip cleanly.
export const ICON_NEGATIVE = 'text, letters, numbers, words, watermark, multiple objects, collage, busy or textured background, scene, environment, drop shadow on the background, glow bleeding to the edges, photo of a real physical object, clutter, low quality, blurry';

/** The generation armature: the chosen shape as a solid dark silhouette on a
 *  flat white field — the stick-man the model paints flesh onto (white so the
 *  model reads the form and the server matte strips cleanly). */
export function armatureSvg(shape: ShapeHit): string {
  const body = buildShapeSvg(shape.elements, 'flat', ['#151515'], 2.6);
  return body.replace(/^(<svg[^>]*>)/, '$1<rect x="0" y="0" width="24" height="24" fill="#ffffff"/>');
}

/** Deterministic art-director prompt (no extra model call). The reference image
 *  carries the shape; this carries the finish, the brand colour, and the
 *  isolation rules the matte depends on. */
export function composeIconPrompt(label: string, mat: { label: string; prompt: string }, color: string): string {
  return `A single "${label}" icon, rendered as ${mat.prompt}. Keep the exact silhouette and proportions of the reference shape — only restyle its surface and lighting. Primary colour ${color}. One centered icon, filling most of the frame, on a completely flat solid pure-white #ffffff background, even shadowless studio lighting, crisp clean edges, no cast shadow or glow bleeding into the background, no text, no letters, no numbers.`;
}
