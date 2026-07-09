// ─── Curated wordmark fonts ──────────────────────────────────────────────────
//
// Research-vetted set for typesetting brand names as REAL type (never generated
// pixels — the #1 AI-logo failure). Every family here is SIL Open Font License
// 1.1: genuinely free for commercial logos AND bundleable with the app. (We
// deliberately avoid Fontshare faces — Clash/General Sans etc. — which are a
// custom licence, not OFL.) The .ttf files ship under public/fonts/ with their
// OFL.txt; opentype.js reads them to convert a wordmark to paths so exported
// SVGs need no font installed.

export type FontCategory = 'geometric' | 'grotesque' | 'humanist' | 'serif' | 'slab' | 'display';

export interface WordmarkFont {
  /** CSS family name AND registry id. */
  id: string;
  label: string;
  category: FontCategory;
  /** One-line brand feel — guides Ava's pick and the user's. */
  feel: string;
  /** The weight a wordmark is typeset at (logos want presence). */
  weight: number;
  /** Bundled font file under public/fonts/. */
  file: string;
}

export const WORDMARK_FONTS: WordmarkFont[] = [
  { id: 'Montserrat',          label: 'Montserrat',          category: 'geometric', weight: 700, file: 'Montserrat-Bold.ttf',           feel: 'confident, geometric with warmth — the safe modern default' },
  { id: 'Sora',                label: 'Sora',                category: 'geometric', weight: 700, file: 'Sora-Bold.ttf',                 feel: 'engineered, precise — web3 / fintech / SaaS' },
  { id: 'Inter',               label: 'Inter',               category: 'grotesque', weight: 700, file: 'Inter-Bold.ttf',                feel: 'neutral, trustworthy, screen-native — the corporate workhorse' },
  { id: 'Space Grotesk',       label: 'Space Grotesk',       category: 'grotesque', weight: 600, file: 'SpaceGrotesk-SemiBold.ttf',     feel: 'retro-technical with character — dev tools, AI, creative-tech' },
  { id: 'Archivo',             label: 'Archivo',             category: 'grotesque', weight: 700, file: 'Archivo-Bold.ttf',              feel: 'sturdy, editorial, high-impact — bold statement wordmarks' },
  { id: 'Work Sans',           label: 'Work Sans',           category: 'humanist',  weight: 600, file: 'WorkSans-SemiBold.ttf',         feel: 'warm, legible, unpretentious — services, healthcare, community' },
  { id: 'DM Sans',             label: 'DM Sans',             category: 'humanist',  weight: 700, file: 'DMSans-Bold.ttf',               feel: 'soft-geometric, gentle — wellness, lifestyle, calm consumer' },
  { id: 'Fraunces',            label: 'Fraunces',            category: 'serif',     weight: 600, file: 'Fraunces-SemiBold.ttf',         feel: 'characterful old-style serif — premium yet playful; editorial, food, boutique' },
  { id: 'Playfair Display',    label: 'Playfair Display',    category: 'serif',     weight: 700, file: 'PlayfairDisplay-Bold.ttf',      feel: 'high-contrast luxury — fashion, beauty, hospitality' },
  { id: 'Zilla Slab',          label: 'Zilla Slab',          category: 'slab',      weight: 600, file: 'ZillaSlab-SemiBold.ttf',        feel: 'sturdy, modern, confident — weight without shouting' },
  { id: 'Bitter',              label: 'Bitter',              category: 'slab',      weight: 600, file: 'Bitter-SemiBold.ttf',           feel: 'warm slab, friendly but solid — craft, coffee, blogs' },
  { id: 'Bricolage Grotesque', label: 'Bricolage Grotesque', category: 'display',   weight: 700, file: 'BricolageGrotesque-Bold.ttf',   feel: 'contemporary, art-directed, slightly imperfect — personality-forward creative' },
];

export function fontById(id: string): WordmarkFont {
  return WORDMARK_FONTS.find((f) => f.id === id) ?? WORDMARK_FONTS[0];
}

/** Suggest a font from the brand's style words — a light heuristic Ava (or the
 *  user) can override. Falls back to Montserrat, the safe default. */
export function suggestFont(styleTags?: string[]): WordmarkFont {
  const tags = (styleTags ?? []).map((t) => t.toLowerCase());
  const has = (...words: string[]) => words.some((w) => tags.some((t) => t.includes(w)));
  if (has('luxury', 'elegant', 'premium', 'fashion', 'editorial')) return fontById('Playfair Display');
  if (has('warm', 'friendly', 'approachable', 'wellness', 'calm', 'gentle')) return fontById('DM Sans');
  if (has('tech', 'ai', 'engineer', 'precise', 'fintech', 'web3')) return fontById('Sora');
  if (has('bold', 'strong', 'sturdy', 'impact')) return fontById('Archivo');
  if (has('playful', 'creative', 'quirky', 'art')) return fontById('Bricolage Grotesque');
  if (has('corporate', 'trust', 'professional', 'enterprise')) return fontById('Inter');
  return fontById('Montserrat');
}
