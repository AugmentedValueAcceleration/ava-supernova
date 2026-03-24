/**
 * Dashboard i18n wrapper — loads locale strings from @ava/core at runtime.
 * Falls back to English if locale not found.
 */

let currentLocale = 'en';
let enStrings: Record<string, string> = {};
const translations: Record<string, Record<string, string>> = {};

/** Set locale and load English + target translation strings from core dist */
export async function initLocale(locale?: string): Promise<void> {
  // Always load English as fallback
  if (!translations['en']) {
    try {
      // @ts-ignore — dynamic import from core dist (relative path in monorepo)
      const mod: Record<string, unknown> = await import('../../../core/dist/i18n/locales/en.js');
      const exportName = Object.keys(mod).find((k: string) => k.endsWith('Strings'));
      if (exportName && mod[exportName]) {
        enStrings = mod[exportName] as Record<string, string>;
        translations['en'] = enStrings;
      }
    } catch {
      // Core not available — t() returns keys as-is
    }
  }

  const stored = locale || localStorage.getItem('ava-dashboard-language') || 'auto';
  const resolved = stored === 'auto' ? (navigator.language?.split('-')[0] || 'en') : stored;
  currentLocale = resolved;

  if (resolved !== 'en' && !translations[resolved]) {
    try {
      // @ts-ignore — dynamic import from core dist
      const mod = await import(`../../../core/dist/i18n/locales/${resolved}.js`);
      const exportName = Object.keys(mod).find((k) => k.endsWith('Strings'));
      if (exportName && mod[exportName]) {
        translations[resolved] = mod[exportName];
      }
    } catch {
      // Locale not found — falls back to English
    }
  }
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

/** Get current locale code */
export function getLocale(): string {
  return currentLocale;
}
