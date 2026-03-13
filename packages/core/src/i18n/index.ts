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
 * Common greetings/phrases mapped to language names.
 * Used for auto-detection when the user writes in another language.
 */
const GREETING_MAP: Record<string, string> = {
  // Chinese (Simplified)
  '你好': '中文（简体）', '您好': '中文（简体）', '早上好': '中文（简体）', '晚上好': '中文（简体）',
  // Chinese (Traditional)
  '早安': '中文（繁體）',
  // Japanese
  'こんにちは': '日本語', 'おはよう': '日本語', 'こんばんは': '日本語', 'おはようございます': '日本語',
  // Korean
  '안녕하세요': '한국어', '안녕': '한국어',
  // Spanish
  'hola': 'Español', 'buenos días': 'Español', 'buenas tardes': 'Español', 'buenas noches': 'Español',
  // Portuguese
  'olá': 'Português', 'oi': 'Português', 'bom dia': 'Português', 'boa tarde': 'Português', 'boa noite': 'Português',
  // French
  'bonjour': 'Français', 'bonsoir': 'Français', 'salut': 'Français',
  // German
  'hallo': 'Deutsch', 'guten morgen': 'Deutsch', 'guten tag': 'Deutsch', 'guten abend': 'Deutsch',
  // Russian
  'привет': 'Русский', 'здравствуйте': 'Русский', 'добрый день': 'Русский',
  // Arabic
  'مرحبا': 'العربية', 'السلام عليكم': 'العربية', 'أهلا': 'العربية',
  // Hindi
  'नमस्ते': 'हिन्दी', 'नमस्कार': 'हिन्दी',
  // Nepali (responds in Hindi — closest supported)
  'namaste': 'हिन्दी',
  // Vietnamese
  'xin chào': 'Tiếng Việt', 'chào': 'Tiếng Việt',
  // Thai
  'สวัสดี': 'ไทย', 'สวัสดีครับ': 'ไทย', 'สวัสดีค่ะ': 'ไทย',
  // Turkish
  'merhaba': 'Türkçe', 'selam': 'Türkçe', 'günaydın': 'Türkçe',
  // Italian
  'ciao': 'Italiano', 'buongiorno': 'Italiano', 'buonasera': 'Italiano',
  // Polish
  'cześć': 'Polski', 'dzień dobry': 'Polski',
  // Ukrainian
  'привіт': 'Українська', 'добрий день': 'Українська',
  // Dutch
  'hoi': 'Nederlands', 'goedemorgen': 'Nederlands', 'goedendag': 'Nederlands',
  // Indonesian
  'halo': 'Bahasa Indonesia', 'selamat pagi': 'Bahasa Indonesia', 'selamat siang': 'Bahasa Indonesia',
};

/**
 * Detect language from common greetings/phrases in user input.
 * Returns the native language name or null if no match.
 */
export function detectLanguageFromGreeting(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  // Check exact match first, then check if input starts with a greeting
  for (const [greeting, lang] of Object.entries(GREETING_MAP)) {
    if (trimmed === greeting.toLowerCase() || trimmed.startsWith(greeting.toLowerCase() + ' ')) {
      return lang;
    }
  }
  return null;
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
