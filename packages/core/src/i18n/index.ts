import { SUPPORTED_LOCALES, LANGUAGE_NAMES } from './types.js';
import type { SupportedLocale } from './types.js';
import { enStrings } from './locales/en.js';

let currentLocale: string = 'en';
const translations: Record<string, Record<string, string>> = {
  en: enStrings,
};

/**
 * Set the active locale and auto-load its translation strings.
 * Falls back to 'en' if the locale is unsupported.
 */
export async function setLocale(locale: string): Promise<void> {
  const resolved = resolveLocale(locale);
  currentLocale = resolved;

  // Auto-load translation strings if not already loaded
  if (resolved !== 'en' && !translations[resolved]) {
    try {
      const mod = await import(`./locales/${resolved}.js`);
      // Convention: export name is `{camelCase}Strings`
      const exportName = Object.keys(mod).find((k) => k.endsWith('Strings'));
      if (exportName && mod[exportName]) {
        translations[resolved] = mod[exportName];
      }
    } catch {
      // Locale file not found — will fall back to English
    }
  }
}

/**
 * Set the active locale synchronously (without loading translations).
 * Use when translations have already been loaded via loadLocaleStrings().
 */
export function setLocaleSync(locale: string): void {
  currentLocale = resolveLocale(locale);
}

/**
 * Register a set of translated strings for a locale.
 * Call this before `setLocale()` for non-English locales.
 */
export function loadLocaleStrings(locale: string, strings: Record<string, string>): void {
  translations[resolveLocale(locale)] = strings;
}

/** Get the current active locale code. */
export function getLocale(): string {
  return currentLocale;
}

/** Get the list of supported locale codes. */
export function getSupportedLocales(): readonly string[] {
  return SUPPORTED_LOCALES;
}

/** Get the native language name for a locale code. */
export function getLanguageName(locale: string): string {
  return LANGUAGE_NAMES[locale as SupportedLocale] ?? locale;
}

/**
 * Translate a key with optional interpolation.
 *
 * @example
 * t('error.msg.auth', { provider: 'DeepSeek' })
 * // → "Invalid API key for DeepSeek. Check your key in ~/.ava/config.json"
 */
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

/**
 * Resolve a locale string to a supported locale code.
 * Handles 'auto' detection, partial matches (e.g. 'zh' → 'zh-CN'),
 * and falls back to 'en'.
 */
export function resolveLocale(locale: string): string {
  if (!locale || locale === 'auto') {
    return detectSystemLocale();
  }

  // Exact match
  if ((SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    return locale;
  }

  // Partial match: 'zh' → 'zh-CN', 'pt-BR' → 'pt'
  const prefix = locale.split('-')[0].toLowerCase();
  for (const supported of SUPPORTED_LOCALES) {
    if (supported.toLowerCase().startsWith(prefix)) {
      return supported;
    }
  }

  return 'en';
}

function detectSystemLocale(): string {
  // Node.js environment
  if (typeof process !== 'undefined' && process.env) {
    const envLang = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL || '';
    if (envLang) {
      const code = envLang.split('.')[0].replace('_', '-');
      return resolveLocaleCode(code);
    }
  }

  // Browser / webview environment
  if (typeof navigator !== 'undefined' && navigator.language) {
    return resolveLocaleCode(navigator.language);
  }

  return 'en';
}

function resolveLocaleCode(code: string): string {
  if ((SUPPORTED_LOCALES as readonly string[]).includes(code)) {
    return code;
  }

  const lower = code.toLowerCase();
  for (const supported of SUPPORTED_LOCALES) {
    if (supported.toLowerCase() === lower) {
      return supported;
    }
  }

  const prefix = code.split('-')[0].toLowerCase();
  for (const supported of SUPPORTED_LOCALES) {
    if (supported.toLowerCase().startsWith(prefix)) {
      return supported;
    }
  }

  return 'en';
}
