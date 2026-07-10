// ─── Logo system types ───────────────────────────────────────────────────────
//
// A logo is a SYSTEM, not one picture. Ava CONSTRUCTS the mark — parametric
// vector geometry she composes herself (see mark-primitives) — pairs it with a
// real-font wordmark (typeset, never generated pixels), and composes them into
// the variants a real business needs: primary/stacked lockups, symbol-only,
// wordmark-only, mono light/dark, favicon.
//
// No image model touches the mark. It was tried: an image model can render a
// surface but cannot design a shape, and the logo lane asked it to do exactly
// the wrong one of those while forbidding the right one. Construction is exact,
// instant, free, and vector from birth — nothing to matte, nothing to trace.

import type { MarkSpec, MarkStyle } from './mark-primitives';

/** The variants a complete logo system ships. */
export type LogoVariant =
  | 'primary'    // symbol + wordmark, horizontal lockup — the default
  | 'stacked'    // symbol above wordmark, vertical lockup
  | 'symbol'     // the mark alone (brandmark)
  | 'wordmark'   // the name alone, typeset
  | 'mono-dark'  // one-colour black — the one-colour test, for light grounds
  | 'mono-light' // one-colour white — for dark grounds
  | 'favicon';   // symbol optimised/cropped for tiny sizes (16px legible)

/** The brief Ava designs from — pulled from the active brand kit, with the
 *  logo-specific choices (how the mark is made, its style, the font) on top. */
export interface LogoBrief {
  brandName: string;
  fontId: string;            // a WORDMARK_FONTS id
  /** The logo's FORM — its overall archetype:
   *  - 'combination' the mark beside/above the wordmark (the default)
   *  - 'emblem'      everything enclosed in a ring, name curved on top, tagline
   *                  curved on the bottom, mark centred (a badge/crest) */
  form?: 'combination' | 'emblem';
  /** Emblem only — the small curved text under the bottom (a tagline, a date,
   *  a locale): "ROASTERS", "EST 2026", "LONDON". Optional. */
  tagline?: string;
  /** How the mark is made:
   *  - 'letter'   the brand initial, set in the wordmark's own font
   *  - 'geometry' Ava constructs it from primitives — where distinctiveness lives
   *  - 'icon'     a Lucide shape, for when a literal object genuinely fits */
  markType: 'letter' | 'geometry' | 'icon';
  /** Lettermark container: 'none' (letter alone) or 'ring' (emblem). */
  container?: 'none' | 'ring';
  /** For markType 'icon' — the Lucide shape id. */
  mark?: string;
  /** For markType 'geometry' — the construction Ava authored. */
  markSpec?: MarkSpec;
  /** How the mark is painted. Every one is true vector — a gradient logo never
   *  goes near an image model. */
  style: MarkStyle;
  /** The wordmark's colour: 'ink' (a deep tint of the brand hue), 'brand' (the
   *  brand colour itself) or an explicit #rrggbb. */
  wordmarkColor: 'ink' | 'brand' | string;
  /** Ava's concept, in words — the rationale shown to the user. */
  symbolDirection: string;
  palette: { primary: string; secondary?: string; accent?: string };
  styleTags?: string[];
}

/** One rendered variant — SVG is the scalable source; png is a rasterised
 *  preview/quick-use copy. */
export interface LogoAsset {
  variant: LogoVariant;
  label: string;
  svg: string;
  png?: string;
}

/** The full delivered system. */
export interface LogoSystem {
  brandName: string;
  fontId: string;
  symbolSvg: string;      // the constructed mark, as designed
  markType: LogoBrief['markType'];
  form: NonNullable<LogoBrief['form']>;
  style: MarkStyle;
  markSpec?: MarkSpec;    // kept so a mark can be re-styled or re-coloured without redesigning it
  assets: LogoAsset[];
  rationale?: string;     // Ava's designer note — the "why", the trust layer
}
