/**
 * Dashboard i18n — ALL locales loaded statically.
 * No dynamic imports — VS Code webview can't resolve them at runtime.
 * Dispatches 'ava-locale-changed' event to trigger React re-renders.
 */
import { useState, useEffect } from 'react';

// @ts-ignore
import { enStrings } from '../../../core/dist/i18n/locales/en.js';
// @ts-ignore
import { arStrings } from '../../../core/dist/i18n/locales/ar.js';
// @ts-ignore
import { deStrings } from '../../../core/dist/i18n/locales/de.js';
// @ts-ignore
import { esStrings } from '../../../core/dist/i18n/locales/es.js';
// @ts-ignore
import { frStrings } from '../../../core/dist/i18n/locales/fr.js';
// @ts-ignore
import { hiStrings } from '../../../core/dist/i18n/locales/hi.js';
// @ts-ignore
import { idStrings } from '../../../core/dist/i18n/locales/id.js';
// @ts-ignore
import { itStrings } from '../../../core/dist/i18n/locales/it.js';
// @ts-ignore
import { jaStrings } from '../../../core/dist/i18n/locales/ja.js';
// @ts-ignore
import { koStrings } from '../../../core/dist/i18n/locales/ko.js';
// @ts-ignore
import { nlStrings } from '../../../core/dist/i18n/locales/nl.js';
// @ts-ignore
import { plStrings } from '../../../core/dist/i18n/locales/pl.js';
// @ts-ignore
import { ptStrings } from '../../../core/dist/i18n/locales/pt.js';
// @ts-ignore
import { ruStrings } from '../../../core/dist/i18n/locales/ru.js';
// @ts-ignore
import { thStrings } from '../../../core/dist/i18n/locales/th.js';
// @ts-ignore
import { trStrings } from '../../../core/dist/i18n/locales/tr.js';
// @ts-ignore
import { ukStrings } from '../../../core/dist/i18n/locales/uk.js';
// @ts-ignore
import { viStrings } from '../../../core/dist/i18n/locales/vi.js';
// @ts-ignore
import { zhCNStrings } from '../../../core/dist/i18n/locales/zh-CN.js';
// @ts-ignore
import { zhTWStrings } from '../../../core/dist/i18n/locales/zh-TW.js';

let currentLocale = 'en';
let localeVersion = 0;

const translations: Record<string, Record<string, string>> = {
  en: enStrings, ar: arStrings, de: deStrings, es: esStrings, fr: frStrings,
  hi: hiStrings, id: idStrings, it: itStrings, ja: jaStrings, ko: koStrings,
  nl: nlStrings, pl: plStrings, pt: ptStrings, ru: ruStrings, th: thStrings,
  tr: trStrings, uk: ukStrings, vi: viStrings, 'zh-CN': zhCNStrings, 'zh-TW': zhTWStrings,
};

/** Set locale. Call on startup or language switch. */
export async function initLocale(locale?: string): Promise<void> {
  const stored = locale || localStorage.getItem('ava-dashboard-language') || 'auto';
  const resolved = stored === 'auto' ? (navigator.language?.split('-')[0] || 'en') : stored;
  currentLocale = translations[resolved] ? resolved : 'en';

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
