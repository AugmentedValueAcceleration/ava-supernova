// ─── Logo compose engine ─────────────────────────────────────────────────────
//
// Assembles the full logo SYSTEM from a constructed mark (SVG, exact by birth)
// and a typeset wordmark path (real font), plus the palette. Pure string/geometry:
// each variant is a standalone SVG. Rasterising to PNG is the caller's job.
//
// The mark keeps the paint it was DESIGNED with — a gradient stays a gradient.
// Earlier this engine stripped every fill and refilled the whole mark one flat
// colour for every variant, which deleted the design and made the "mono test"
// something that could never fail. Mono is now a separate render of the same
// geometry, so it tells us something true.

import type { LogoAsset, LogoVariant } from './types';
import type { Wordmark } from './wordmark';

/** A deep ink DERIVED from the brand colour — scaling the channels keeps the hue
 *  and saturation and only drops the lightness, so the wordmark reads as ink but
 *  on-palette. At 0.16 the tint was so dark it read as flat black; 0.24 lets the
 *  hue actually show while staying subordinate to the mark. */
export function brandInk(primary: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(primary.trim());
  if (!m) return '#14121a';
  const n = parseInt(m[1], 16);
  const k = 0.24;
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

interface SymbolSvg {
  inner: string;
  vb: { x: number; y: number; w: number; h: number };
}

/** Pull the inner markup + coordinate box out of a symbol SVG string. Prefers
 *  viewBox; falls back to width/height (vtracer emits those, no viewBox). */
function parseSymbol(svg: string): SymbolSvg {
  const vbMatch = /viewBox\s*=\s*["']([\d.\-\s]+)["']/i.exec(svg);
  let vb = { x: 0, y: 0, w: 100, h: 100 };
  if (vbMatch) {
    const nums = vbMatch[1].trim().split(/\s+/).map(Number);
    if (nums.length === 4 && nums.every((n) => Number.isFinite(n))) vb = { x: nums[0], y: nums[1], w: nums[2], h: nums[3] };
  } else {
    const wM = /\bwidth\s*=\s*["']?([\d.]+)/i.exec(svg);
    const hM = /\bheight\s*=\s*["']?([\d.]+)/i.exec(svg);
    vb = { x: 0, y: 0, w: wM ? Number(wM[1]) : 100, h: hM ? Number(hM[1]) : 100 };
  }
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '').trim();
  return { inner, vb };
}

/** Remove per-element fills/strokes so a parent <g fill> colours the whole mark
 *  a single flat colour — the basis for mono/light-dark and a consistent brand
 *  mark from a possibly-noisy trace. */
function stripPaint(inner: string): string {
  return inner
    .replace(/\s(fill|stroke)\s*=\s*["'][^"']*["']/gi, '')
    .replace(/(fill|stroke)\s*:\s*[^;"']+;?/gi, '');
}

const r = (n: number) => Math.round(n * 100) / 100;

/** The transform that fits a symbol's coordinate box into a `size`×`size` box at (x,y). */
function fit(sym: SymbolSvg, x: number, y: number, size: number): string {
  const scale = size / Math.max(sym.vb.w, sym.vb.h || 1);
  const ox = x + (size - sym.vb.w * scale) / 2 - sym.vb.x * scale;
  const oy = y + (size - sym.vb.h * scale) / 2 - sym.vb.y * scale;
  return `translate(${r(ox)} ${r(oy)}) scale(${r(scale)})`;
}

/** Place the symbol AS DESIGNED — its own paint survives, so a gradient stays a
 *  gradient and a duotone stays two-tone. */
function symbolGroup(sym: SymbolSvg, x: number, y: number, size: number): string {
  return `<g transform="${fit(sym, x, y, size)}">${sym.inner}</g>`;
}

/** Place the symbol forced to ONE colour — the genuine one-colour test. Fed the
 *  mono render of the same geometry, so `fill-rule` (and therefore every
 *  negative-space cut) survives while the paint is replaced. */
function symbolGroupMono(sym: SymbolSvg, x: number, y: number, size: number, color: string): string {
  return `<g transform="${fit(sym, x, y, size)}" fill="${color}">${stripPaint(sym.inner)}</g>`;
}

/** Place the wordmark with its LEFT edge at `x` and BASELINE at `baselineY`,
 *  scaled so its CAP HEIGHT is `capTarget`. Scaling by cap height (not the bbox
 *  height, which grows and shrinks with ascenders/descenders) keeps the caps a
 *  constant visual size across any word. Returns the outline's true top/bottom
 *  so the caller can compute a tight, clip-free canvas. */
function wordmarkGroup(wm: Wordmark, x: number, baselineY: number, capTarget: number, color: string): { g: string; width: number; top: number; bottom: number } {
  const k = capTarget / (wm.capHeight || wm.height || 1);
  const tx = x - wm.bbox.x1 * k;      // outline's left edge → x
  return {
    g: `<path transform="translate(${r(tx)} ${r(baselineY)}) scale(${r(k)})" fill="${color}" d="${wm.pathD}"/>`,
    width: wm.width * k,
    top: baselineY + wm.bbox.y1 * k,   // y1 is negative (above baseline)
    bottom: baselineY + wm.bbox.y2 * k,
  };
}

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(w)} ${r(h)}" width="${r(w)}" height="${r(h)}">${body}</svg>`;
}

/** Wrap markup in a translation — used to drop the whole lockup so its top edge
 *  sits at y=0 after the pieces were laid out around a shared baseline. */
function shift(markup: string, dx: number, dy: number): string {
  return `<g transform="translate(${r(dx)} ${r(dy)})">${markup}</g>`;
}

export interface ComposeOptions {
  /** The mark AS DESIGNED — keeps its own paint (gradient, duotone, line). */
  symbolSvg: string;
  /** The SAME geometry rendered single-colour. Drives the mono lockups, which
   *  are a real test the mark can fail — not a repaint of the coloured one. */
  symbolMonoSvg: string;
  wordmark: Wordmark;
  primary: string;      // brand colour — the mark's, and the favicon/symbol crops
  /** The wordmark's own colour. Its own decision: ink, the brand colour, or a
   *  chosen one. Not derivable from the mark — a gradient mark has no single hue
   *  a word could borrow. */
  wordmarkColor: string;
}

/** Build the full variant set. Returns SVGs; the caller rasterises to PNG. */
export function composeLogoSystem(opts: ComposeOptions): LogoAsset[] {
  const sym = parseSymbol(opts.symbolSvg);
  const mono = parseSymbol(opts.symbolMonoSvg);
  const wm = opts.wordmark;
  const INK = opts.wordmarkColor;

  // Everything is expressed in CAP-HEIGHT units so the type sets the scale and
  // the mark is sized RELATIVE to it — the way a designer pairs them.
  const CAP = 100;
  const MARK_H = CAP * 1.58;      // mark taller than the caps in a row — reads as the lead element
  const MARK_V = CAP * 1.92;      // taller still when stacked, to hold its own above a wide word
  const GAP_H = CAP * 0.5;        // optical space between mark and word (horizontal)
  const GAP_V = CAP * 0.42;       // space between mark and word (stacked)
  const PAD = CAP * 0.16;         // clearspace around the symbol crop
  const FAV = CAP * 0.05;         // favicon crops tight — at 16px, padding is wasted pixels

  // placeMark: (x, y, size) => markup for the mark in that box (colour baked in).
  type PlaceMark = (x: number, y: number, size: number) => string;

  // Horizontal lockup: mark left, word right, the mark's optical centre aligned
  // to the cap-band centre (baseline−CAP/2) so the row reads on one axis.
  const horizontal = (placeMark: PlaceMark, wordColor: string): string => {
    const markCentreY = MARK_H / 2;
    const baselineY = markCentreY + CAP / 2;
    const word = wordmarkGroup(wm, MARK_H + GAP_H, baselineY, CAP, wordColor);
    const top = Math.min(0, word.top);
    const bottom = Math.max(MARK_H, word.bottom);
    const body = placeMark(0, -top, MARK_H) + shift(word.g, 0, -top);
    return svg(MARK_H + GAP_H + word.width, bottom - top, body);
  };
  // Stacked lockup: mark centred over the centred word.
  const stacked = (placeMark: PlaceMark, wordColor: string): string => {
    const capTop = MARK_V + GAP_V;          // caps start below the mark
    const baselineY = capTop + CAP;
    const wordProbe = wordmarkGroup(wm, 0, baselineY, CAP, wordColor);
    const totalW = Math.max(MARK_V, wordProbe.width);
    const word = wordmarkGroup(wm, (totalW - wordProbe.width) / 2, baselineY, CAP, wordColor);
    const bottom = Math.max(MARK_V, word.bottom);
    return svg(totalW, bottom, placeMark((totalW - MARK_V) / 2, 0, MARK_V) + word.g);
  };
  // Wordmark alone — trimmed to the real ink box (ascender top to descender bottom).
  const wordOnly = (color: string): string => {
    const word = wordmarkGroup(wm, 0, -wm.bbox.y1 * (CAP / (wm.capHeight || 1)), CAP, color);
    return svg(word.width, word.bottom - word.top, word.g);
  };

  const inkMark: PlaceMark = (x, y, size) => symbolGroup(sym, x, y, size);
  const monoMark = (color: string): PlaceMark => (x, y, size) => symbolGroupMono(mono, x, y, size, color);

  return [
    { variant: 'primary',    label: 'Primary lockup',   svg: horizontal(inkMark, INK) },
    { variant: 'stacked',    label: 'Stacked lockup',   svg: stacked(inkMark, INK) },
    { variant: 'symbol',     label: 'Symbol',           svg: svg(MARK_H + PAD * 2, MARK_H + PAD * 2, symbolGroup(sym, PAD, PAD, MARK_H)) },
    { variant: 'wordmark',   label: 'Wordmark',         svg: wordOnly(INK) },
    { variant: 'mono-dark',  label: 'Mono (on light)',  svg: horizontal(monoMark('#111111'), '#111111') },
    { variant: 'mono-light', label: 'Mono (on dark)',   svg: horizontal(monoMark('#ffffff'), '#ffffff') },
    { variant: 'favicon',    label: 'Favicon',          svg: svg(MARK_H + FAV * 2, MARK_H + FAV * 2, symbolGroup(sym, FAV, FAV, MARK_H)) },
  ] satisfies { variant: LogoVariant; label: string; svg: string }[];
}
