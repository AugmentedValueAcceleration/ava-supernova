// ─── Lettermark ──────────────────────────────────────────────────────────────
//
// Builds a mark from the brand's own INITIAL — in the same font as the wordmark —
// instead of a stock icon. Inherently brand-specific ("it's literally your
// letter"), clean vector for free (no model, no trace, no inconsistency), and it
// reduces to mono cleanly. Single-colour: compose recolours it to the brand.

import * as opentype from 'opentype.js';

const r = (n: number) => Math.round(n * 100) / 100;

/** A lettermark SVG (100×100 viewBox) — the initial, optionally inside a ring so
 *  it reads as an emblem. Carries its own paint (compose no longer repaints the
 *  mark); the ring keeps its evenodd rule so the letter sits in the hole. */
export function buildLettermark(opts: { font: opentype.Font; text: string; container?: 'none' | 'ring'; color?: string }): string {
  const initial = ((opts.text || 'A').trim()[0] || 'A').toUpperCase();
  const S = 100;
  const ring = opts.container === 'ring';
  const target = ring ? 44 : 66; // letter cap size within the box (smaller inside a ring)
  const path = opts.font.getPath(initial, 0, 0, 100);
  const bb = path.getBoundingBox();
  const w = (bb.x2 - bb.x1) || 1;
  const h = (bb.y2 - bb.y1) || 1;
  const k = Math.min(target / w, target / h);
  const tx = S / 2 - (bb.x1 + w / 2) * k;
  const ty = S / 2 - (bb.y1 + h / 2) * k;
  const letter = `<path transform="translate(${r(tx)} ${r(ty)}) scale(${r(k)})" d="${path.toPathData(2)}"/>`;
  // Filled donut (evenodd): outer circle minus inner, so the letter shows in the hole.
  const donut = ring
    ? `<path fill-rule="evenodd" d="M50 3 A47 47 0 1 0 50 97 A47 47 0 1 0 50 3 Z M50 15 A35 35 0 1 1 50 85 A35 35 0 1 1 50 15 Z"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><g fill="${opts.color ?? '#111111'}">${donut}${letter}</g></svg>`;
}
