// ─── Logo symbol prompt ──────────────────────────────────────────────────────
//
// Encodes the research-vetted pattern for a flat, radically simple, VECTORIZABLE
// brand MARK — no text (the wordmark is typeset separately in a real font). The
// pattern: subject → style → constraints, with hard negatives against the raster
// slop (gradients, shadows, 3D, texture) that makes an AI logo read cheap and
// traces badly. The mark generates on white so our matte can isolate it and
// vtracer can trace a crisp silhouette.

/** Negative prompt — the constraints that keep a mark a mark: one clean flat
 *  subject with edges vtracer can trace, and NO text (typeset separately). */
export const LOGO_SYMBOL_NEGATIVE =
  'text, letters, words, numbers, typography, wordmark, gradient, gradients, drop shadow, 3D, bevel, realistic shading, photorealistic, texture, grain, noise, busy detail, fine detail, multiple objects, collage, scene, environment, background pattern, frame, border, mockup, low quality, blurry';

/** Reference-GUIDED mark prompt — the logo equivalent of composeIconPrompt. A
 *  clean Lucide vector (rendered to an armature) anchors the geometry, exactly
 *  like the icon lane; qwen-image-edit REFINES it into a bold, FLAT logomark
 *  (no glossy/3D material — a logo must stay flat, single-colour and scalable).
 *  This is the fix for "generic sparkle": the shape is real, not invented. */
export function composeLogoMarkPrompt(opts: { label: string; styleTags?: string[]; color?: string; styleHint?: string }): string {
  const feel = (opts.styleTags ?? []).map((t) => t.trim()).filter(Boolean);
  const feelClause = feel.length ? ` Brand feel: ${feel.join(', ')}.` : '';
  const colorClause = opts.color ? ` Single solid colour ${opts.color}.` : ' Single solid colour.';
  const styleClause = opts.styleHint ? ` Style: ${opts.styleHint}.` : ' Solid filled flat shapes.';
  return (
    `A single minimal FLAT vector logo mark, refined from the reference drawing of "${opts.label}" into a bold, iconic brand symbol.${feelClause}${styleClause}` +
    ` Keep the reference's core geometry but SIMPLIFY and STRENGTHEN it into a clean logomark: even confident weight, deliberate negative space, crisp edges, perfectly flat (SVG-like), radically simple and memorable as a silhouette.${colorClause}` +
    ` One centered mark filling most of the frame, isolated on a flat pure-white #ffffff background.` +
    ` No text, no gradient, no shadow, no 3D, no bevel, no texture, no fine detail, no background scene.`
  );
}

/** Free-form (no reference) symbol prompt — kept for fallback / experimentation.
 *  `direction` is Ava's concept. Reference-guided (composeLogoMarkPrompt) is the
 *  primary path now. */
export function composeSymbolPrompt(opts: { direction: string; styleTags?: string[]; color?: string }): string {
  const concept = opts.direction.trim() || 'a simple, distinctive abstract brand mark';
  const feel = (opts.styleTags ?? []).map((t) => t.trim()).filter(Boolean);
  const feelClause = feel.length ? ` Brand feel: ${feel.join(', ')}.` : '';
  const colorClause = opts.color ? ` Single solid colour ${opts.color}.` : ' Single solid colour.';
  return (
    `A single minimal flat vector logo symbol — ${concept}.${feelClause}` +
    ` Clean bold geometric shapes, solid fill or even monoline, crisp flat edges, SVG-like flatness,` +
    ` radically simple and memorable as a silhouette (the kind a child could sketch from memory).${colorClause}` +
    ` One centered mark filling most of the frame, isolated on a plain pure-white #ffffff background.` +
    ` No text, no letters, no gradient, no shadow, no 3D, no texture, no background scene.`
  );
}
