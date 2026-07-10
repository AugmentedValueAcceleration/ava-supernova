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
  /** Cap height at the same scale as bbox — the distance from the baseline up
   *  to the top of a capital. CONSTANT for a font, unlike `height` which shrinks
   *  and grows with the string's ascenders/descenders. Lockups scale by THIS so
   *  the caps are a consistent visual size regardless of the word. */
  capHeight: number;
}

/** Parse a bundled font file (ArrayBuffer) into an opentype Font. Throws on a
 *  malformed/unsupported file — the caller falls back to another family. */
export function parseFont(buffer: ArrayBuffer): opentype.Font {
  return opentype.parse(buffer);
}

type Cmd = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };

/**
 * Serialise path commands to SVG path data.
 *
 * We do NOT use opentype's `Path.toPathData()`. Given a path assembled by
 * merging several glyph paths, it emits a literal "NaN" into the middle of the
 * `d` string — every renderer then stops drawing at that point, which showed up
 * as a wordmark reading "Ver" instead of "Verdant". Every individual command is
 * finite; only the serialiser is broken. This one is dumb on purpose.
 */
export function pathCommandsToData(commands: Cmd[], dp = 2): string {
  return toPathData(commands, dp);
}

/** One glyph's outline as SVG path data at (x, baseline), safely serialised
 *  (opentype's own toPathData writes NaN for some glyphs — see above). */
export function glyphPath(glyph: opentype.Glyph, x: number, baselineY: number, fontSize: number): string {
  return toPathData(glyph.getPath(x, baselineY, fontSize).commands as Cmd[], 2);
}

function toPathData(commands: Cmd[], dp = 2): string {
  const n = (v: number | undefined) => (Number.isFinite(v) ? Number(v!.toFixed(dp)) : 0);
  return commands
    .map((c) => {
      switch (c.type) {
        case 'M': return `M${n(c.x)} ${n(c.y)}`;
        case 'L': return `L${n(c.x)} ${n(c.y)}`;
        case 'Q': return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
        case 'C': return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        case 'Z': return 'Z';
        default: return '';
      }
    })
    .join('');
}

/**
 * Typeset text to an SVG path at a reference size (layout is the composer's
 * job — it scales the path by cap-height to pair with the symbol).
 *
 * Laid out glyph by glyph rather than via `font.getPath`, which routes through
 * opentype's Bidi/GSUB feature pipeline and THROWS on lookupType 6 / substFormat 2
 * ("substitutionType : 62 … not yet supported"). Four of our twelve bundled
 * fonts — Inter, DM Sans, Archivo, Bricolage Grotesque — use exactly that, so
 * picking any of them killed the whole logo. Walking the glyphs ourselves keeps
 * kerning (which a wordmark needs) and skips the substitutions (which it doesn't).
 */
export function typesetWordmark(font: opentype.Font, text: string, fontSize = 200): Wordmark {
  const str = text || 'Brand';
  const scale = fontSize / font.unitsPerEm;
  const full = new opentype.Path();
  let x = 0;
  let prev: opentype.Glyph | undefined;
  for (const ch of str) {
    const glyph = font.charToGlyph(ch);
    if (prev) x += font.getKerningValue(prev, glyph) * scale;
    full.extend(glyph.getPath(x, 0, fontSize));
    x += (glyph.advanceWidth ?? 0) * scale;
    prev = glyph;
  }
  const bb = full.getBoundingBox();
  return {
    pathD: toPathData(full.commands as Cmd[], 2),
    bbox: { x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 },
    width: bb.x2 - bb.x1,
    height: bb.y2 - bb.y1,
    capHeight: measureCapHeight(font, fontSize),
  };
}

/** The cap height at `fontSize`, measured from the outline of a reference
 *  capital (flat-topped, so no overshoot) rather than trusting the OS/2 table,
 *  which some of the bundled display and script faces leave at 0 or wrong.
 *  Falls back through a few letters, then to a sane fraction of the em. */
export function measureCapHeight(font: opentype.Font, fontSize: number): number {
  for (const ch of ['H', 'E', 'T', 'I', 'A', 'M']) {
    const bb = font.charToGlyph(ch).getPath(0, 0, fontSize).getBoundingBox();
    const h = bb.y2 - bb.y1;
    if (Number.isFinite(h) && h > 0) return h;
  }
  return fontSize * 0.7;
}
