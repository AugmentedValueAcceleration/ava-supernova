/**
 * Lightweight i18n for the webview.
 * English strings are bundled inline; other locales are auto-loaded from bundled files.
 */

import { useState, useEffect } from 'react';
import { enStrings } from './locales/en.js';

let currentLocale = 'en';
let localeVersion = 0;
const translations: Record<string, Record<string, string>> = {
  en: enStrings,
};

/** Locale file import map — Vite bundles these as dynamic imports. */
const localeImports: Record<string, () => Promise<Record<string, Record<string, string>>>> = {
  ar: () => import('./locales/ar.js'),
  de: () => import('./locales/de.js'),
  es: () => import('./locales/es.js'),
  fr: () => import('./locales/fr.js'),
  hi: () => import('./locales/hi.js'),
  id: () => import('./locales/id.js'),
  it: () => import('./locales/it.js'),
  ja: () => import('./locales/ja.js'),
  ko: () => import('./locales/ko.js'),
  nl: () => import('./locales/nl.js'),
  pl: () => import('./locales/pl.js'),
  pt: () => import('./locales/pt.js'),
  ru: () => import('./locales/ru.js'),
  th: () => import('./locales/th.js'),
  tr: () => import('./locales/tr.js'),
  uk: () => import('./locales/uk.js'),
  vi: () => import('./locales/vi.js'),
  'zh-CN': () => import('./locales/zh-CN.js'),
  'zh-TW': () => import('./locales/zh-TW.js'),
};

/**
 * Set the active locale and auto-load its translations from bundled files.
 * Falls back to English if locale is not available.
 */
export async function setLocale(locale: string): Promise<void> {
  currentLocale = locale;

  if (locale !== 'en' && !translations[locale] && localeImports[locale]) {
    try {
      const mod = await localeImports[locale]();
      const exportName = Object.keys(mod).find(k => k.endsWith('Strings'));
      if (exportName && mod[exportName]) {
        translations[locale] = mod[exportName] as unknown as Record<string, string>;
      }
    } catch {
      // Locale file not found — will fall back to English
    }
  }

  localeVersion++;
  window.dispatchEvent(new CustomEvent('ava-locale-changed'));
}

/** Load translated strings for a locale (sent from extension host via postMessage). */
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
