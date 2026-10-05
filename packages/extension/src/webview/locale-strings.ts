/**
 * The webview's UI strings, held by the HOST so it can post the right language.
 *
 * ── Why the host holds these ──
 *
 * A webview cannot load a locale on demand. The chat webview tried, with a map
 * of `() => import('./locales/xx.js')`, and it was blocked twice over: Vite
 * emits a relative specifier, which in a classic script resolves against the
 * webview's document URL rather than the bundle's folder, and the CSP is
 * `script-src 'nonce-…'` with no 'strict-dynamic', so a dynamic import carries
 * no nonce. The failure was caught and fell through to English, so nineteen of
 * twenty languages silently showed English with nothing logged.
 *
 * The host has no such problem — it is Node. So it holds all twenty (556KB,
 * loaded once at activation, against a host bundle already 16MB) and sends the
 * webview only the language in use. The webview bundles English as its fallback
 * and nothing else.
 *
 * ── Why these are not core's locale files ──
 *
 * They overlap but are not the same set. Core's English has 4,117 keys and the
 * webview's has 408, of which **155 do not exist in core at all** — the mode
 * descriptions, the brand strings, the composer placeholders. Sending core's
 * strings instead would leave those 155 in English and look like a partial
 * translation. Measured 2026-10-05; re-measure before assuming they have
 * converged.
 *
 * Adding a locale means adding it here AND to webview-ui's own fallback list.
 * A missing entry here is not an error — it degrades to English, which is the
 * failure mode that hid the original bug, so check the log line in
 * localeStringsFor rather than trusting silence.
 */

import { enStrings } from './locales/en.js';
import { arStrings } from './locales/ar.js';
import { deStrings } from './locales/de.js';
import { esStrings } from './locales/es.js';
import { frStrings } from './locales/fr.js';
import { hiStrings } from './locales/hi.js';
import { idStrings } from './locales/id.js';
import { itStrings } from './locales/it.js';
import { jaStrings } from './locales/ja.js';
import { koStrings } from './locales/ko.js';
import { nlStrings } from './locales/nl.js';
import { plStrings } from './locales/pl.js';
import { ptStrings } from './locales/pt.js';
import { ruStrings } from './locales/ru.js';
import { thStrings } from './locales/th.js';
import { trStrings } from './locales/tr.js';
import { ukStrings } from './locales/uk.js';
import { viStrings } from './locales/vi.js';
import { zhCNStrings } from './locales/zh-CN.js';
import { zhTWStrings } from './locales/zh-TW.js';

const WEBVIEW_STRINGS: Record<string, Record<string, string>> = {
  en: enStrings,
  ar: arStrings,
  de: deStrings,
  es: esStrings,
  fr: frStrings,
  hi: hiStrings,
  id: idStrings,
  it: itStrings,
  ja: jaStrings,
  ko: koStrings,
  nl: nlStrings,
  pl: plStrings,
  pt: ptStrings,
  ru: ruStrings,
  th: thStrings,
  tr: trStrings,
  uk: ukStrings,
  vi: viStrings,
  'zh-CN': zhCNStrings,
  'zh-TW': zhTWStrings,
};

/**
 * The webview strings for a locale, or undefined for English and for anything
 * unrecognised — in both cases the webview's bundled English is already correct,
 * so there is nothing worth sending.
 */
export function localeStringsFor(locale: string | undefined): Record<string, string> | undefined {
  if (!locale || locale === 'en') return undefined;
  return WEBVIEW_STRINGS[locale];
}

/** Locales we can actually translate the UI into. Exported for diagnostics —
 *  if a user reports an English UI, compare this against their setting. */
export function translatableLocales(): string[] {
  return Object.keys(WEBVIEW_STRINGS);
}
