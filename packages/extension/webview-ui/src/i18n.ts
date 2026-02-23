/**
 * Lightweight i18n for the webview.
 * English strings are bundled inline; other locales are sent from the extension host.
 */

import { enStrings } from './locales/en.js';

let currentLocale = 'en';
const translations: Record<string, Record<string, string>> = {
  en: enStrings,
};

/** Set the active locale. Call loadStrings() first for non-English locales. */
export function setLocale(locale: string): void {
  currentLocale = locale;
}

/** Load translated strings for a locale (sent from extension host via postMessage). */
export function loadStrings(locale: string, strings: Record<string, string>): void {
  translations[locale] = strings;
}

/** Translate a key with optional interpolation. Falls back to English, then to key. */
export function t(key: string, params?: Record<string, string | number>): string {
  const str = translations[currentLocale]?.[key]
    ?? translations['en']?.[key]
    ?? key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k: string) => {
    const val = params[k];
    return val !== undefined ? String(val) : `{${k}}`;
  });
}
