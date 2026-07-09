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

/** Compose the image-model prompt for a brand SYMBOL. `direction` is Ava's
 *  authored concept (what the mark should evoke — "a rising arc, momentum");
 *  everything else is the locked frame that keeps it flat, single-subject and
 *  clean enough to matte + trace. `color` seeds the mark; kept a single solid
 *  colour so the mono/light-dark variants come out cleanly on recolour. */
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
