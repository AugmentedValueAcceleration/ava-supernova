/**
 * Dashboard i18n wrapper — English loaded synchronously,
 * other locales lazy-loaded. Dispatches event for React re-renders.
 */
import { useState, useEffect } from 'react';

// @ts-ignore — direct path import (Vite resolves in monorepo)
import { enStrings } from '../../../core/dist/i18n/locales/en.js';

let currentLocale = 'en';
let localeVersion = 0;
const translations: Record<string, Record<string, string>> = {
  en: enStrings as Record<string, string>,
};

/** Load a non-English locale. Call on startup or language switch. */
export async function initLocale(locale?: string): Promise<void> {
  const stored = locale || localStorage.getItem('ava-dashboard-language') || 'auto';
  const resolved = stored === 'auto' ? (navigator.language?.split('-')[0] || 'en') : stored;
  currentLocale = resolved;

  if (resolved !== 'en' && !translations[resolved]) {
    try {
      // @ts-ignore — dynamic import from core dist
      const mod = await import(`../../../core/dist/i18n/locales/${resolved}.js`);
      const exportName = Object.keys(mod).find((k: string) => k.endsWith('Strings'));
      if (exportName && mod[exportName]) {
        translations[resolved] = mod[exportName];
      }
    } catch {
      // Locale not found — falls back to English
    }
  }

  localeVersion++;
  window.dispatchEvent(new CustomEvent('ava-locale-changed'));
}

/** Translate a key with optional interpolation */
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

/** Get current locale code */
export function getLocale(): string {
  return currentLocale;
}
