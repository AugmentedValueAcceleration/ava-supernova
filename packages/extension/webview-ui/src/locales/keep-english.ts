import type { StringKey } from './en.js';

/**
 * Keys whose English value is intentionally preserved across all locales.
 *
 * Only add a key here if there is a clear reason the English form is correct
 * everywhere (brand names, universally-recognised technical tokens, strings
 * that are purely placeholders). Everything else must be translated.
 *
 * Used by `scripts/i18n-check.mjs` to skip English-leak warnings on these keys.
 */
export const KEEP_ENGLISH: ReadonlySet<StringKey> = new Set<StringKey>([
  // Brand / product names
  'welcome.title',
  'brand.supernova',
  'brand.supernova_caps',
  // Proper nouns
  'tasks.ava',
  // Placeholder-only strings
  'tool.git',
  'tool.http',
  // auto-classified invariants (brand/units/loanwords)
  'dash.chat.ava',
] as StringKey[]);
