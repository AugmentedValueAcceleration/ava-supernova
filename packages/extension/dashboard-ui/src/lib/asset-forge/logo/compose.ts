// ─── Logo compose engine ─────────────────────────────────────────────────────
//
// Assembles the full logo SYSTEM from two inputs — a traced symbol SVG (the
// generative mark) and a typeset wordmark path (real font) — plus the palette.
// Pure string/geometry: produces each variant as a standalone SVG. Rasterising
// to PNG is the caller's job (needs canvas). The mark is forced to a single
// colour per variant so mono / light-dark come out clean — v1 targets
// single-colour marks (the symbol prompt asks for exactly that).
//
// Heuristic by nature (traced SVGs vary); expect a tuning pass on real output.

import type { LogoAsset, LogoVariant } from './types';
import type { Wordmark } from './wordmark';

const INK = '#14121a'; // near-black wordmark ink for colour lockups (on light/transparent)

interface SymbolSvg {
  inner: string;
  vb: { x: number; y: number; w: number; h: number };
}

/** Pull the inner markup + viewBox out of a symbol SVG string. */
function parseSymbol(svg: string): SymbolSvg {
  const vbMatch = /viewBox\s*=\s*["']([\d.\-\s]+)["']/i.exec(svg);
  const nums = vbMatch ? vbMatch[1].trim().split(/\s+/).map(Number) : [0, 0, 100, 100];
  const [x, y, w, h] = nums.length === 4 && nums.every((n) => Number.isFinite(n)) ? nums : [0, 0, 100, 100];
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '').trim();
  return { inner, vb: { x, y, w, h } };
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

/** Place the symbol into a `size`×`size` box at (x,y), recoloured to `color`. */
function symbolGroup(sym: SymbolSvg, x: number, y: number, size: number, color: string): string {
  const scale = size / Math.max(sym.vb.w, sym.vb.h || 1);
  const ox = x + (size - sym.vb.w * scale) / 2 - sym.vb.x * scale;
  const oy = y + (size - sym.vb.h * scale) / 2 - sym.vb.y * scale;
  return `<g transform="translate(${r(ox)} ${r(oy)}) scale(${r(scale)})" fill="${color}">${stripPaint(sym.inner)}</g>`;
}

/** Place the wordmark so its bbox top-left sits at (x, topY), scaled to a cap
 *  height of `targetHeight`, in `color`. */
function wordmarkGroup(wm: Wordmark, x: number, topY: number, targetHeight: number, color: string): { g: string; width: number } {
  const k = targetHeight / (wm.height || 1);
  const tx = x - wm.bbox.x1 * k;
  const ty = topY - wm.bbox.y1 * k;
  return {
    g: `<path transform="translate(${r(tx)} ${r(ty)}) scale(${r(k)})" fill="${color}" d="${wm.pathD}"/>`,
    width: wm.width * k,
  };
}

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(w)} ${r(h)}" width="${r(w)}" height="${r(h)}">${body}</svg>`;
}

export interface ComposeOptions {
  symbolSvg: string;
  wordmark: Wordmark;
  primary: string;      // brand colour for the mark
}

/** Build the full variant set. Returns SVGs; the caller rasterises to PNG. */
export function composeLogoSystem(opts: ComposeOptions): LogoAsset[] {
  const sym = parseSymbol(opts.symbolSvg);
  const wm = opts.wordmark;

  const S = 100;                 // symbol box size (the layout unit)
  const CAP = S * 0.72;          // wordmark visual height paired to the mark
  const GAP = S * 0.3;           // space between mark and word
  const PAD = S * 0.12;          // outer padding for square/favicon crops

  // Horizontal lockup at a given pair of colours.
  const horizontal = (symColor: string, wordColor: string): string => {
    const word = wordmarkGroup(wm, S + GAP, (S - CAP) / 2, CAP, wordColor);
    const totalW = S + GAP + word.width;
    return svg(totalW, S, symbolGroup(sym, 0, 0, S, symColor) + word.g);
  };
  // Vertical (stacked) lockup: mark centred over centred word.
  const stacked = (symColor: string, wordColor: string): string => {
    const word = wordmarkGroup(wm, 0, S + GAP, CAP, wordColor);
    const totalW = Math.max(S, word.width);
    const symX = (totalW - S) / 2;
    const wordX = (totalW - word.width) / 2;
    const sg = symbolGroup(sym, symX, 0, S, symColor);
    const wg = wordmarkGroup(wm, wordX, S + GAP, CAP, wordColor);
    return svg(totalW, S + GAP + CAP, sg + wg.g);
  };
  // Symbol alone in a padded square.
  const symbolOnly = (color: string): string =>
    svg(S + PAD * 2, S + PAD * 2, symbolGroup(sym, PAD, PAD, S, color));
  // Wordmark alone.
  const wordOnly = (color: string): string => {
    const word = wordmarkGroup(wm, 0, 0, CAP, color);
    return svg(word.width, CAP, word.g);
  };

  return [
    { variant: 'primary',    label: 'Primary lockup',   svg: horizontal(opts.primary, INK) },
    { variant: 'stacked',    label: 'Stacked lockup',   svg: stacked(opts.primary, INK) },
    { variant: 'symbol',     label: 'Symbol',           svg: symbolOnly(opts.primary) },
    { variant: 'wordmark',   label: 'Wordmark',         svg: wordOnly(INK) },
    { variant: 'mono-dark',  label: 'Mono (on light)',  svg: horizontal('#111111', '#111111') },
    { variant: 'mono-light', label: 'Mono (on dark)',   svg: horizontal('#ffffff', '#ffffff') },
    { variant: 'favicon',    label: 'Favicon',          svg: symbolOnly(opts.primary) },
  ] satisfies { variant: LogoVariant; label: string; svg: string }[];
}
