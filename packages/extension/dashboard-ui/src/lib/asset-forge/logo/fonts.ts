// ─── Curated wordmark fonts ──────────────────────────────────────────────────
//
// Research-vetted set for typesetting brand names as REAL type (never generated
// pixels — the #1 AI-logo failure). Every family here is SIL Open Font License
// 1.1: genuinely free for commercial logos AND bundleable with the app. (We
// deliberately avoid Fontshare faces — Clash/General Sans etc. — which are a
// custom licence, not OFL.) The .ttf files ship under public/fonts/ with their
// OFL.txt; opentype.js reads them to convert a wordmark to paths so exported
// SVGs need no font installed.

export type FontCategory = 'geometric' | 'grotesque' | 'humanist' | 'serif' | 'slab' | 'display' | 'script' | 'mono';

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
  // Display, script and mono — the range the set was missing. Seven grotesques
  // is not a choice, it's the same choice seven times.
  { id: 'Anton',               label: 'Anton',               category: 'display',   weight: 400, file: 'Anton-Regular.ttf',             feel: 'heavy condensed poster type — loud, immovable; sport, music, news' },
  { id: 'Bebas Neue',          label: 'Bebas Neue',          category: 'display',   weight: 400, file: 'BebasNeue-Regular.ttf',         feel: 'tall condensed CAPS ONLY — confident and urban; streetwear, film, gyms' },
  { id: 'Righteous',           label: 'Righteous',           category: 'display',   weight: 400, file: 'Righteous-Regular.ttf',         feel: 'rounded art-deco geometry — retro-futurist, friendly, distinctive' },
  { id: 'Great Vibes',         label: 'Great Vibes',         category: 'script',    weight: 400, file: 'GreatVibes-Regular.ttf',        feel: 'formal flowing calligraphy — weddings, patisserie, luxury boutique' },
  { id: 'Lobster',             label: 'Lobster',             category: 'script',    weight: 400, file: 'Lobster-Regular.ttf',           feel: 'bold retro sign-painter script — diners, breweries, barbers' },
  { id: 'Pacifico',            label: 'Pacifico',            category: 'script',    weight: 400, file: 'Pacifico-Regular.ttf',          feel: 'relaxed surf-shop brush script — warm, casual, unserious' },
  { id: 'Sacramento',          label: 'Sacramento',          category: 'script',    weight: 400, file: 'Sacramento-Regular.ttf',        feel: 'delicate monoline handwriting — personal, feminine; NOTE: very light, weak at small sizes' },
  { id: 'Space Mono',          label: 'Space Mono',          category: 'mono',      weight: 700, file: 'SpaceMono-Bold.ttf',            feel: 'fixed-width machine type — dev tools, security, deliberately technical' },
];

export function fontById(id: string): WordmarkFont {
  return WORDMARK_FONTS.find((f) => f.id === id) ?? WORDMARK_FONTS[0];
}

/** Suggest a font from the brand's style words — a light heuristic Ava (or the
 *  user) can override. Falls back to Montserrat, the safe default. */
export function suggestFont(styleTags?: string[]): WordmarkFont {
  const tags = (styleTags ?? []).map((t) => t.toLowerCase());
  const has = (...words: string[]) => words.some((w) => tags.some((t) => t.includes(w)));
  // Most specific first — a script or a display face is a real commitment, so it
  // only wins on words that genuinely ask for one.
  if (has('script', 'cursive', 'handwritten', 'calligraph', 'signature')) return fontById('Great Vibes');
  if (has('retro', 'vintage', 'nostalgic', 'diner', 'brewery')) return fontById('Lobster');
  if (has('casual', 'surf', 'relaxed', 'fun', 'unserious')) return fontById('Pacifico');
  if (has('condensed', 'poster', 'loud', 'sport', 'urban', 'streetwear')) return fontById('Bebas Neue');
  if (has('deco', 'futurist', 'rounded')) return fontById('Righteous');
  if (has('mono', 'code', 'developer', 'terminal', 'security', 'hacker')) return fontById('Space Mono');
  if (has('luxury', 'elegant', 'premium', 'fashion', 'editorial')) return fontById('Playfair Display');
  if (has('warm', 'friendly', 'approachable', 'wellness', 'calm', 'gentle')) return fontById('DM Sans');
  if (has('tech', 'ai', 'engineer', 'precise', 'fintech', 'web3')) return fontById('Sora');
  if (has('bold', 'strong', 'sturdy', 'impact')) return fontById('Archivo');
  if (has('playful', 'creative', 'quirky', 'art')) return fontById('Bricolage Grotesque');
  if (has('corporate', 'trust', 'professional', 'enterprise')) return fontById('Inter');
  return fontById('Montserrat');
}
