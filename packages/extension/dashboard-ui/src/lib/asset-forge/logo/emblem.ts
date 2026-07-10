// ─── Emblem / badge form ─────────────────────────────────────────────────────
//
// A whole different logo ARCHETYPE from the combination mark: everything
// enclosed in a ring, the mark centred, the brand name curved on an arc over the
// top and an optional tagline / date curved under the bottom. Coffee brands,
// breweries, universities, motoring. The one form the combination-mark engine
// can't express, because it needs text set on a CIRCLE, not a line.
//
// Transforms verified by rendering (see the arc prototype): top text reads L→R
// over the top upright; bottom text reads L→R under the bottom upright. Glyphs
// are set individually, each rotated to sit tangent to the ring.

import type * as opentype from 'opentype.js';
import { glyphPath, measureCapHeight } from './wordmark';
import type { LogoAsset } from './types';

const r = (n: number) => Math.round(n * 100) / 100;

/** Set `text` along a circle centred at (cx,cy), radius R, upright and reading
 *  left→right. `position` puts it over the top or under the bottom. Returns SVG
 *  markup (one transformed <path> per glyph). */
function arcText(
  font: opentype.Font,
  text: string,
  cx: number,
  cy: number,
  R: number,
  fontSize: number,
  position: 'top' | 'bottom',
  tracking: number,
  color: string,
): string {
  const scale = fontSize / font.unitsPerEm;
  const glyphs = [...text].map((ch) => font.charToGlyph(ch));
  const adv = glyphs.map((g) => (g.advanceWidth ?? 0) * scale + tracking);
  const total = adv.reduce((a, b) => a + b, 0);
  let cum = 0;
  const parts: string[] = [];
  glyphs.forEach((g, i) => {
    const centreLen = cum + adv[i] / 2;
    cum += adv[i];
    const deg = ((centreLen - total / 2) / R) * 180 / Math.PI;   // signed angular position
    const d = glyphPath(g, -adv[i] / 2, 0, fontSize);            // safe serialiser (opentype's drops glyphs)
    if (!d) return;
    const xform = position === 'top'
      ? `translate(${r(cx)} ${r(cy)}) rotate(${r(deg)}) translate(0 ${r(-R)})`
      : `translate(${r(cx)} ${r(cy)}) rotate(${r(-deg)}) translate(0 ${r(R)})`;
    parts.push(`<path transform="${xform}" fill="${color}" d="${d}"/>`);
  });
  return parts.join('');
}

export interface EmblemOptions {
  font: opentype.Font;
  /** The brand name, curved over the top. */
  topText: string;
  /** Optional tagline / date / locale, curved under the bottom. */
  bottomText?: string;
  /** The centre mark, as SVG markup already sized to a 24×24 viewBox (what the
   *  primitive/lettermark engines emit). Scaled to fit the inner disc. */
  markSvg: string;
  /** Ring + text colour. */
  color: string;
  /** Mark colour (may differ — e.g. a gradient mark inside a solid ring). */
  markColor?: string;
}

const S = 400;                 // canvas
const C = S / 2;
const R_OUTER = 186;           // outer ring
const R_INNER = 150;           // inner hairline ring the text sits between
const MARK_BOX = 150;          // the centre mark's box

/** Pull the inner markup + viewBox out of a mark SVG (primitive/lettermark). */
function markInner(svg: string): { inner: string; vb: { x: number; y: number; w: number; h: number } } {
  const vbMatch = /viewBox\s*=\s*["']([\d.\-\s]+)["']/i.exec(svg);
  let vb = { x: 0, y: 0, w: 24, h: 24 };
  if (vbMatch) {
    const n = vbMatch[1].trim().split(/\s+/).map(Number);
    if (n.length === 4 && n.every(Number.isFinite)) vb = { x: n[0], y: n[1], w: n[2], h: n[3] };
  }
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '').trim();
  return { inner, vb };
}

/** Build the emblem as a single square SVG. */
export function buildEmblem(opts: EmblemOptions): string {
  const { font, topText, bottomText, markSvg, color } = opts;

  const ring =
    `<circle cx="${C}" cy="${C}" r="${R_OUTER}" fill="none" stroke="${color}" stroke-width="7"/>` +
    `<circle cx="${C}" cy="${C}" r="${R_INNER}" fill="none" stroke="${color}" stroke-width="2"/>`;

  const m = markInner(markSvg);
  const k = MARK_BOX / Math.max(m.vb.w, m.vb.h || 1);
  const mx = C - (m.vb.w * k) / 2 - m.vb.x * k;
  const my = C - (m.vb.h * k) / 2 - m.vb.y * k;
  const mark = `<g transform="translate(${r(mx)} ${r(my)}) scale(${r(k)})">${m.inner}</g>`;

  // Fit the type to the ring BAND so it never crosses a ring. The band runs
  // between the inner and outer strokes; caps are sized to a target height and
  // the baseline radius is placed so those caps sit centred in the band. All-caps
  // (no descenders), so cap height is the only vertical extent to budget.
  const bandLo = R_INNER + 1;         // inner stroke half-width
  const bandHi = R_OUTER - 3.5;       // outer stroke half-width
  const band = bandHi - bandLo;
  const capTop = Math.min(20, band - 8);
  const capBot = Math.min(15, band - 12);
  const fs = (target: number) => (target * 200) / measureCapHeight(font, 200);
  // Top text: baseline at the LOW edge, caps grow outward → centre the caps in the band.
  const rTop = bandLo + (band - capTop) / 2;
  // Bottom text: baseline at the HIGH edge, caps grow inward → centre the caps in the band.
  const rBot = bandHi - (band - capBot) / 2;

  const top = arcText(font, topText.toUpperCase(), C, C, rTop, fs(capTop), 'top', 3, color);
  const bottom = bottomText
    ? arcText(font, bottomText.toUpperCase(), C, C, rBot, fs(capBot), 'bottom', 4, color)
    : '';
  // Two small separator dots at 3 and 9 o'clock, on the band centreline.
  const rDot = (bandLo + bandHi) / 2;
  const dots = bottomText
    ? `<circle cx="${r(C - rDot)}" cy="${C}" r="3" fill="${color}"/><circle cx="${r(C + rDot)}" cy="${C}" r="3" fill="${color}"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${ring}${mark}${top}${bottom}${dots}</svg>`;
}

/** Recolour a single-colour mark SVG (the mono render, fill #111111). */
const recolour = (svg: string, to: string) => svg.replace(/#111111/gi, to);

/**
 * Turn a combination-mark variant set into an EMBLEM set. The enclosed lockups
 * (primary, stacked, mono light/dark) become the badge; the derived pieces
 * (symbol, wordmark, favicon) are kept from the base set as-is — a brand with an
 * emblem still needs its mark and name on their own.
 */
export function emblemVariants(base: LogoAsset[], opts: {
  font: opentype.Font;
  brandName: string;
  tagline?: string;
  markSvg: string;       // mark as designed (colour/gradient)
  markMonoSvg: string;   // same geometry, single colour (#111111)
  color: string;         // ring + text colour for the primary emblem
}): LogoAsset[] {
  const primary = buildEmblem({ font: opts.font, topText: opts.brandName, bottomText: opts.tagline, markSvg: opts.markSvg, color: opts.color });
  const monoDark = buildEmblem({ font: opts.font, topText: opts.brandName, bottomText: opts.tagline, markSvg: recolour(opts.markMonoSvg, '#111111'), color: '#111111' });
  const monoLight = buildEmblem({ font: opts.font, topText: opts.brandName, bottomText: opts.tagline, markSvg: recolour(opts.markMonoSvg, '#ffffff'), color: '#ffffff' });
  return base
    .filter((a) => a.variant !== 'stacked')   // the badge IS the enclosed form; no separate stack
    .map((a) =>
      a.variant === 'primary' ? { ...a, label: 'Emblem', svg: primary }
      : a.variant === 'mono-dark' ? { ...a, svg: monoDark }
      : a.variant === 'mono-light' ? { ...a, svg: monoLight }
      : a,
    );
}
