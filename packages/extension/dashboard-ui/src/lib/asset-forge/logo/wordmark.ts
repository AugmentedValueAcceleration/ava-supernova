// ─── Wordmark typesetting (opentype.js) ──────────────────────────────────────
//
// Turns a brand name into an SVG PATH using a real bundled font — never
// generated pixels (the #1 AI-logo failure) and never an SVG <text> that needs
// the font installed to render. The composer handles placement/scale/colour;
// here we just capture the glyph outlines + their bounding box.

import * as opentype from 'opentype.js';

export interface Wordmark {
  /** SVG path 'd' for the whole word, glyph baseline at y=0. */
  pathD: string;
  /** Tight bounding box of the outlines (SVG coords: y grows downward, so the
   *  ascender top is a negative y). */
  bbox: { x1: number; y1: number; x2: number; y2: number };
  width: number;
  height: number;
}

/** Parse a bundled font file (ArrayBuffer) into an opentype Font. Throws on a
 *  malformed/unsupported file — the caller falls back to another family. */
export function parseFont(buffer: ArrayBuffer): opentype.Font {
  return opentype.parse(buffer);
}

/** Typeset text to an SVG path at a reference size (layout is the composer's
 *  job — it scales the path by cap-height to pair with the symbol). */
export function typesetWordmark(font: opentype.Font, text: string, fontSize = 200): Wordmark {
  const path = font.getPath(text || 'Brand', 0, 0, fontSize);
  const bb = path.getBoundingBox();
  return {
    pathD: path.toPathData(2),
    bbox: { x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 },
    width: bb.x2 - bb.x1,
    height: bb.y2 - bb.y1,
  };
}
