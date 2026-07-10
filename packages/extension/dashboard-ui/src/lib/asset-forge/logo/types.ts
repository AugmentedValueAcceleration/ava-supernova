// ─── Logo system types ───────────────────────────────────────────────────────
//
// A logo is a SYSTEM, not one picture (validated by research). Ava produces a
// generative symbol (Qwen → matte → vtracer → SVG), a real-font wordmark
// (typeset, never generated pixels), and composes them into the variants a real
// business needs — primary/stacked lockups, symbol-only, wordmark-only, mono,
// light/dark, favicon. See the logo build plan.

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
 *  couple of logo-specific choices (font + the mark's concept) on top. */
export interface LogoBrief {
  brandName: string;
  fontId: string;            // a WORDMARK_FONTS id
  /** The mark's armature — a Lucide shape id or subject ("star", "arc"). The
   *  symbol is reference-guided off this (like icons), not free-generated. */
  mark: string;
  /** Flat style id — solid | monoline | geometric (the logo-appropriate swap for
   *  the icon lane's glossy materials). */
  style?: string;
  symbolDirection: string;   // Ava's concept / rationale ("a rising arc — momentum")
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
  symbolSvg: string;   // the traced mark (single source, recoloured per variant)
  assets: LogoAsset[];
  rationale?: string;  // Ava's designer note — the "why", the trust layer
}
