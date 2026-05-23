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

/**
 * Dashboard-specific English overrides — keys that also exist in core but
 * carry different copy in the dashboard than in the CLI/chat surfaces. Every
 * other dashboard string now lives in the core locale files (and translates);
 * this map only holds the genuine wording divergences. For en these win; for
 * other locales the core (translated) value is used.
 */
const chatStrings: Record<string, string> = {
  'dash.learning_library.search': 'Search learning paths...',
  'dash.learning_library.back': 'Back to library',
  'dash.learning_library.curated': 'Curated',
  'dash.learning_library.start_learning': 'Start learning',
  'dash.nav.history': 'Usage & History',
  'welcome.subtitle': 'Your open-source agentic coding assistant.',
  'error.auth': 'Authentication',
  'error.credits': 'Billing',
  'error.rate_limit': 'Rate Limited',
  'error.model_not_found': 'Model Error',
  'error.bad_request': 'Bad Request',
  'error.server_error': 'Server Error',
  'error.timeout': 'Timeout',
  'error.stream_stall': 'Stream Stalled',
  'error.network': 'Network Error',
  'error.setup': 'Setup Required',
  'error.iterations_exceeded': 'Iteration Limit',
  'error.context_truncated': 'Context Truncated',
  'error.provider_error': 'Provider Error',
  'error.unknown': 'Error',
  'error.continue': 'Continue',
  'feedback.didnt_understand': "Didn't understand me",
  'input.mode.code': 'Work',
};

const translations: Record<string, Record<string, string>> = {
  en: { ...enStrings, ...chatStrings }, ar: arStrings, de: deStrings, es: esStrings, fr: frStrings,
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

/** Translate with a hardcoded fallback. Returns the fallback when t()
 *  returns the raw key (i.e. the locale doesn't have the key yet).
 *  Use this for new strings being introduced ahead of full locale
 *  coverage so non-English users don't see raw keys. */
export function tt(key: string, fallback: string): string {
  const val = t(key);
  return val === key ? fallback : val;
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

/** Format time in 24-hour format (HH:mm) */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Format date as DD/MM/YYYY */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Format date as "31 Mar 2026" */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Format date as "31 Mar" (no year) */
export function formatDateCompact(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Set locale directly (used by chat init) */
export function setLocale(locale: string): void {
  const resolved = translations[locale] ? locale : 'en';
  currentLocale = resolved;
  localeVersion++;
  window.dispatchEvent(new CustomEvent('ava-locale-changed'));
}

/** Load additional strings for a locale (used by chat init) */
export function loadStrings(locale: string, strings: Record<string, string>): void {
  if (translations[locale]) {
    translations[locale] = { ...translations[locale], ...strings };
  } else {
    translations[locale] = strings;
  }
}
