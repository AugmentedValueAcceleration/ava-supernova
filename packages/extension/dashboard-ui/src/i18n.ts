/**
 * Dashboard i18n.
 *
 * English is bundled. Every other language is REQUESTED FROM THE HOST, which
 * reads dist/locales/<locale>.json and posts it back.
 *
 * ── Why, since the previous comment here said the opposite ──
 *
 * It used to statically import all twenty of core's locale files, under a note
 * saying "No dynamic imports — VS Code webview can't resolve them at runtime".
 * That note was correct, and the workaround was the problem: twenty locales is
 * 5.79MB of a 9.97MB bundle, 58% of it, fetched and parsed before the dashboard
 * painted anything, for nineteen languages the reader does not want. It is the
 * single largest reason opening the dashboard took seconds.
 *
 * The host has no such limit. It reads one JSON file and sends it. The webview
 * carries English, which is every other locale's fallback anyway, so there is
 * never a frame with no strings at all — just a brief one in English while the
 * real language is in flight.
 */

import { useState, useEffect } from 'react';
// @ts-ignore — core ships .js without .d.ts for locale modules
import { enStrings } from '../../../core/dist/i18n/locales/en.js';

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
  'input.mode.code': 'Code',
};

// English only at build time. Other languages are added by loadStrings when the
// host answers, so this map grows at runtime rather than shipping full.
const translations: Record<string, Record<string, string>> = {
  en: { ...enStrings, ...chatStrings },
};

/** Languages the host can serve. Used to decide whether to ASK — not whether we
 *  already hold the strings, which we never do at boot. Must stay in step with
 *  the files emit-locales.mjs writes, i.e. with core's locale directory. */
const AVAILABLE = new Set([
  'en', 'ar', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko',
  'nl', 'pl', 'pt', 'ru', 'th', 'tr', 'uk', 'vi', 'zh-CN', 'zh-TW',
]);

/** Which language we want but have not been sent yet, so App can ask for it. */
let awaiting: string | null = null;

/** The locale the dashboard wants strings for, or null when English is correct
 *  or the request is already out. App polls this immediately after initLocale. */
export function pendingLocaleRequest(): string | null {
  const want = awaiting;
  awaiting = null;
  return want;
}


/** Set locale. Call on startup or language switch. */
export async function initLocale(locale?: string): Promise<void> {
  const stored = locale || localStorage.getItem('ava-dashboard-language') || 'auto';
  const resolved = stored === 'auto' ? (navigator.language?.split('-')[0] || 'en') : stored;
  // Gate on what the host CAN serve, not on what we already hold. The old test
  // was `translations[resolved]`, which was true for all twenty because all
  // twenty were bundled; now only English is, so that test would pin every user
  // to English forever.
  currentLocale = AVAILABLE.has(resolved) ? resolved : 'en';

  // Ask for anything other than English we do not already have in hand.
  awaiting = currentLocale !== 'en' && !translations[currentLocale] ? currentLocale : null;

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

// Language-picker codes (native fallback used only if Intl.DisplayNames is
// unavailable — the VS Code webview is Chromium, which has it).
const LANGUAGE_CODES = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'pt', 'fr', 'de', 'ru', 'ar', 'hi', 'vi', 'th', 'tr', 'it', 'pl', 'uk', 'nl', 'id'];
const NATIVE_FALLBACK: Record<string, string> = {
  en: 'English', 'zh-CN': '中文（简体）', 'zh-TW': '中文（繁體）', ja: '日本語', ko: '한국어',
  es: 'Español', pt: 'Português', fr: 'Français', de: 'Deutsch', ru: 'Русский', ar: 'العربية',
  hi: 'हिन्दी', vi: 'Tiếng Việt', th: 'ภาษาไทย', tr: 'Türkçe', it: 'Italiano', pl: 'Polski',
  uk: 'Українська', nl: 'Nederlands', id: 'Bahasa Indonesia',
};
const capitalise = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Each language shown in the current UI language AND its native form ("Japonés ·
 * 日本語" when the UI is Spanish). Mirrors the IDE. Uses Intl.DisplayNames, so it
 * needs no translation keys and follows the current locale.
 */
export function languageOptions(): { value: string; label: string }[] {
  const named = (code: string): string => {
    let inCurrent = '', native = '';
    try { inCurrent = capitalise(new Intl.DisplayNames([currentLocale], { type: 'language' }).of(code) || ''); } catch { /* no Intl */ }
    try { native = capitalise(new Intl.DisplayNames([code], { type: 'language' }).of(code) || ''); } catch { /* no Intl */ }
    native = native || NATIVE_FALLBACK[code] || code;
    if (!inCurrent || inCurrent === native) return native;
    return `${inCurrent} · ${native}`;
  };
  return [
    { value: 'auto', label: t('dash.settings.auto_detect') },
    ...LANGUAGE_CODES.map(code => ({ value: code, label: named(code) })),
  ];
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
  // Gate on what the host can SERVE, not on what is already loaded. This read
  // `translations[locale]`, which was true for all twenty while all twenty were
  // bundled; with only English bundled that test would pin every user to English
  // and look exactly like the bug this change exists to fix.
  const resolved = AVAILABLE.has(locale) ? locale : 'en';
  currentLocale = resolved;
  if (resolved !== 'en' && !translations[resolved]) awaiting = resolved;
  localeVersion++;
  window.dispatchEvent(new CustomEvent('ava-locale-changed'));
}

/**
 * Take strings for a locale — from the host's locale_strings reply, or from chat
 * init, which also used this.
 *
 * Two changes on 2026-10-05. It now accepts null, because the host answers
 * explicitly when it has no file for a language rather than staying quiet, and
 * "looked and found nothing" has to be distinguishable from "no answer yet".
 * And it now fires ava-locale-changed: strings arriving AFTER first paint is the
 * normal case since the dashboard stopped bundling all twenty, and without the
 * event the UI stayed in English until something else happened to re-render it.
 */
export function loadStrings(locale: string, strings: Record<string, string> | null): void {
  if (strings) {
    translations[locale] = translations[locale]
      ? { ...translations[locale], ...strings }
      : strings;
  }
  localeVersion++;
  window.dispatchEvent(new CustomEvent('ava-locale-changed'));
}
