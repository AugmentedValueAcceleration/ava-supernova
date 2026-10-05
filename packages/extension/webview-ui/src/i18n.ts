/**
 * Lightweight i18n for the webview.
 *
 * English is bundled. Every other language is SENT BY THE HOST over postMessage
 * — see loadStrings below — because a webview cannot fetch one itself.
 *
 * It used to try. There was a map of `() => import('./locales/xx.js')` here and
 * it could not work for two independent reasons: Vite emits a relative
 * specifier, which in a classic script resolves against the webview's document
 * URL rather than the bundle's folder, and the CSP is `script-src 'nonce-…'`
 * with no 'strict-dynamic', so a dynamic import carries no nonce and is blocked.
 * setLocale caught the failure and fell back to English, so nineteen of twenty
 * languages silently showed English and nothing ever reported an error.
 *
 * The locale files now live in src/webview/locales (aliased as
 * @ava-extension/locales) so the HOST can read them too. The host holds all
 * twenty — it is Node, it can afford to — and posts only the one in use.
 */

import { useState, useEffect } from 'react';
import { enStrings } from '@ava-extension/locales/en.js';

let currentLocale = 'en';
let localeVersion = 0;
const translations: Record<string, Record<string, string>> = {
  en: enStrings,
};

/**
 * Set the active locale. Does NOT load anything — the strings arrive separately
 * via loadStrings, sent by the host. Kept synchronous and dumb on purpose: the
 * version that tried to fetch its own strings is what hid the bug.
 */
export function setLocale(locale: string): void {
  currentLocale = locale;
  localeVersion++;
  window.dispatchEvent(new CustomEvent('ava-locale-changed'));
}

/**
 * Take the active language's strings from the host and re-render.
 *
 * This is now the ONLY way a non-English UI happens. It existed before and the
 * webview called it correctly — the host simply never sent anything, and because
 * `localeStrings` is optional nothing complained. Half a mechanism, silent.
 */
export function loadStrings(locale: string, strings: Record<string, string>): void {
  translations[locale] = strings;
  localeVersion++;
  window.dispatchEvent(new CustomEvent('ava-locale-changed'));
}

/** React hook — forces re-render when locale changes */
export function useLocale(): string {
  const [, setVersion] = useState(localeVersion);
  useEffect(() => {
    const handler = () => setVersion(++localeVersion);
    window.addEventListener('ava-locale-changed', handler);
    return () => window.removeEventListener('ava-locale-changed', handler);
  }, []);
  return currentLocale;
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

/** Translate with a hardcoded fallback. Returns the fallback when t()
 *  returns the raw key (i.e. no locale has the key yet). Mirrors the
 *  helper in dashboard-ui/src/i18n.ts so new chat strings can land
 *  ahead of full locale coverage without showing raw keys to users. */
export function tt(key: string, fallback: string): string {
  const val = t(key);
  return val === key ? fallback : val;
}
