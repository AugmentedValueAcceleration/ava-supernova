#!/usr/bin/env node
/**
 * Auto-translate untranslated i18n strings via Qwen (OpenAI-compatible endpoint).
 *
 * Finds every key across the three locale surfaces whose non-en value equals the en
 * value AND is NOT in KEEP_ENGLISH, and fills the missing translation in place.
 *
 * Usage:
 *   pnpm i18n:translate                       # all surfaces, all locales
 *   pnpm i18n:translate --dry-run             # show what would change, don't write
 *   pnpm i18n:translate --locales=es,fr,de    # filter locales
 *   pnpm i18n:translate --surface=core        # core | webview | nls
 *   pnpm i18n:translate --model=qwen3.5-flash # override model
 *
 * Credential resolution order (auto-detects platform vs BYOK Qwen):
 *   1. --api-key=<...> flag (platform if starts with sk-ava-, else BYOK Qwen)
 *   2. $AVA_PLATFORM_KEY or $QWEN_API_KEY env var
 *   3. ~/.ava/config.json -> platformKey (preferred) or providers.qwen.apiKey
 *
 * When a platform key (sk-ava-*) is used, requests route through
 * https://ava-supernova.com/api/chat. Otherwise requests go direct to Qwen
 * (DashScope compatible-mode endpoint). Both accept the same OpenAI-compatible
 * JSON schema, so the prompt payload is identical.
 *
 * Safe to re-run — only targets keys still identical to en. Skips KEEP_ENGLISH keys.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

// ── Config ──────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) return [a.slice(2, eq), a.slice(eq + 1)];
    if (a.startsWith('--')) return [a.slice(2), 'true'];
    return [a, 'true'];
  })
);

const DRY_RUN = args['dry-run'] === 'true';
const LOCALE_FILTER = args.locales ? new Set(args.locales.split(',')) : null;
const SURFACE_FILTER = args.surface || null;
const MODEL = args.model || 'qwen3.5-flash';
const BATCH_SIZE = Number(args['batch-size'] || 40);
// Locales translated concurrently. The platform endpoint forces reasoning
// mode (~15-25s/call), so wall-time is dominated by call latency, not the
// model — running locales in parallel is the only real speed lever.
const CONCURRENCY = Math.max(1, Number(args['concurrency'] || 1));
const CRED = resolveCredential();

/** Run async fn over items with at most `limit` in flight. Preserves nothing
 *  about order; each task is independent (one locale's file write). */
async function pool(items, limit, fn) {
  const queue = [...items.entries()];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) break;
      await fn(next[1], next[0]);
    }
  });
  await Promise.all(workers);
}

if (!CRED && !DRY_RUN) {
  console.error('❌ No credential found for translation.');
  console.error('   Set AVA_PLATFORM_KEY (or QWEN_API_KEY) env var,');
  console.error('   or add platformKey (or providers.qwen.apiKey) to ~/.ava/config.json,');
  console.error('   or pass --api-key=<sk-ava-...> (platform) / --api-key=<other> (BYOK Qwen).');
  process.exit(1);
}

const COMPLETION_URL = args['base-url']
  ? `${args['base-url'].replace(/\/$/, '')}/chat/completions`
  : (CRED?.kind === 'platform'
      ? 'https://ava-supernova.com/api/chat'
      : 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');

/**
 * Resolve a credential. Platform key (sk-ava-*) is preferred when present —
 * it's what the user's Ava install actually uses day-to-day, so we inherit
 * any enterprise pricing / routing their account has set up.
 */
function resolveCredential() {
  const classify = (raw) => raw
    ? { kind: raw.startsWith('sk-ava-') ? 'platform' : 'qwen', key: raw }
    : null;

  if (args['api-key']) return classify(args['api-key']);
  if (process.env.AVA_PLATFORM_KEY) return { kind: 'platform', key: process.env.AVA_PLATFORM_KEY };
  if (process.env.QWEN_API_KEY) return { kind: 'qwen', key: process.env.QWEN_API_KEY };
  try {
    const cfgPath = path.join(os.homedir(), '.ava', 'config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg?.platformKey) return { kind: 'platform', key: cfg.platformKey };
      if (cfg?.providers?.qwen?.apiKey) return { kind: 'qwen', key: cfg.providers.qwen.apiKey };
    }
  } catch { /* ignore */ }
  return null;
}

// ── Language metadata ───────────────────────────────────────────────────────

/**
 * Mirrors packages/core/src/i18n/types.ts LANGUAGE_NAMES.
 * Used to tell the translation model what target language to produce.
 */
const LANGUAGE_NAMES = {
  'en': 'English',
  'zh-CN': 'Simplified Chinese (中文简体)',
  'zh-TW': 'Traditional Chinese (中文繁體)',
  'zh-cn': 'Simplified Chinese (中文简体)',
  'zh-tw': 'Traditional Chinese (中文繁體)',
  'ja': 'Japanese (日本語)',
  'ko': 'Korean (한국어)',
  'es': 'Spanish (Español)',
  'pt': 'Portuguese (Português)',
  'fr': 'French (Français)',
  'de': 'German (Deutsch)',
  'ru': 'Russian (Русский)',
  'ar': 'Arabic (العربية)',
  'hi': 'Hindi (हिन्दी)',
  'vi': 'Vietnamese (Tiếng Việt)',
  'th': 'Thai (ไทย)',
  'tr': 'Turkish (Türkçe)',
  'it': 'Italian (Italiano)',
  'pl': 'Polish (Polski)',
  'uk': 'Ukrainian (Українська)',
  'nl': 'Dutch (Nederlands)',
  'id': 'Indonesian (Bahasa Indonesia)',
};

// Glossary — terms that stay English regardless of locale.
// The check script reads per-surface KEEP_ENGLISH for its own rule;
// this glossary is passed to the translation model so it doesn't touch brands.
const DO_NOT_TRANSLATE = [
  'Ava', 'Supernova', 'Ava Supernova', 'JARVIS',
  'Qwen', 'DeepSeek', 'Kimi', 'Mistral', 'MiniMax', 'Anthropic', 'Claude', 'GLM', 'Zhipu',
  'GitHub', 'Slack', 'Discord', 'Git',
  'IDE', 'CLI', 'API', 'URL', 'HTTP', 'HTTPS', 'JSON', 'YAML', 'SQL',
  'Pro', 'Ultra', 'Enterprise', 'Admin', 'Free',
  'OWASP', 'CVE',
  'OK',
];

// ── Surface definitions ─────────────────────────────────────────────────────

const SURFACES = [
  {
    name: 'core',
    dir: path.join(repoRoot, 'packages/core/src/i18n/locales'),
    kind: 'ts',
    enFile: 'en.ts',
    keepEnglishFile: path.join(repoRoot, 'packages/core/src/i18n/keep-english.ts'),
    localeCodeFromFile: (f) => f.replace(/\.ts$/, ''),
    listLocaleFiles() {
      return fs.readdirSync(this.dir).filter(f => f.endsWith('.ts') && f !== 'keep-english.ts' && f !== 'en.ts');
    },
  },
  {
    name: 'webview',
    dir: path.join(repoRoot, 'packages/extension/webview-ui/src/locales'),
    kind: 'ts',
    enFile: 'en.ts',
    keepEnglishFile: path.join(repoRoot, 'packages/extension/webview-ui/src/locales/keep-english.ts'),
    localeCodeFromFile: (f) => f.replace(/\.ts$/, ''),
    listLocaleFiles() {
      return fs.readdirSync(this.dir).filter(f => f.endsWith('.ts') && f !== 'keep-english.ts' && f !== 'en.ts');
    },
  },
  {
    // Companion — registered 2026-07-18, completing the seed -> translate ->
    // check pipeline for this surface. It was absent from all three scripts,
    // so companion strings could be neither seeded nor translated nor
    // verified, despite having its own locales and keep-english.ts.
    name: 'companion',
    dir: path.join(repoRoot, 'packages/mobile/src/locales'),
    kind: 'ts',
    enFile: 'en.ts',
    keepEnglishFile: path.join(repoRoot, 'packages/mobile/src/locales/keep-english.ts'),
    localeCodeFromFile: (f) => f.replace(/\.ts$/, ''),
    listLocaleFiles() {
      return fs.readdirSync(this.dir).filter(f => f.endsWith('.ts') && f !== 'keep-english.ts' && f !== 'en.ts');
    },
  },
  {
    name: 'nls',
    dir: path.join(repoRoot, 'packages/extension'),
    kind: 'nls',
    enFile: 'package.nls.json',
    keepEnglishFile: null,
    localeCodeFromFile: (f) => {
      const m = f.match(/^package\.nls(?:\.([a-z-]+))?\.json$/i);
      return m && m[1] ? m[1].toLowerCase() : null;
    },
    listLocaleFiles() {
      return fs.readdirSync(this.dir).filter(f => /^package\.nls\.[a-z-]+\.json$/i.test(f));
    },
  },
];

// ── Parsing / writing ───────────────────────────────────────────────────────

const tsPat = /^(\s*)(['"])([^'"]+)\2\s*:\s*(['"`])((?:\\[\s\S]|(?!\4)[\s\S])*)\4(,?)(\s*)$/gm;

/** Parse TS locale file into { key -> decoded value }. */
function parseTs(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const map = {};
  for (const m of text.matchAll(tsPat)) {
    try {
      map[m[3]] = new Function('return "' + m[5].replace(/"/g, '\\"') + '"')();
    } catch {
      map[m[3]] = m[5];
    }
  }
  return map;
}

/** Parse KEEP_ENGLISH set from a TS file (reads the string literals inside `new Set([...])`). */
function parseKeepEnglish(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return new Set();
  const text = fs.readFileSync(filePath, 'utf8');
  const keys = new Set();
  const setMatch = text.match(/new Set<\s*StringKey\s*>\(\s*\[([\s\S]*?)\]/);
  if (!setMatch) return keys;
  for (const m of setMatch[1].matchAll(/['"]([^'"]+)['"]/g)) keys.add(m[1]);
  return keys;
}

/** Escape a string for safe insertion inside a single-quoted JS/TS literal. */
function escapeTs(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

/** Replace a specific key's value in a TS locale file, preserving all other structure. */
function replaceTsValue(text, key, newValue) {
  const keyPat = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match the whole key/value line (supports ' " ` quote styles for the value)
  const re = new RegExp(`(^\\s*['"]${keyPat}['"]\\s*:\\s*)(['"\`])((?:\\\\[\\s\\S]|(?!\\2)[\\s\\S])*)\\2`, 'm');
  const escaped = escapeTs(newValue);
  // Function replacement — a literal `$` in `escaped` would otherwise be
  // interpreted as a replacement pattern ($&, $1, $') and corrupt the line.
  return text.replace(re, (_m, p1) => `${p1}'${escaped}'`);
}

// ── Translation prompt ──────────────────────────────────────────────────────

function buildSystemPrompt(targetLanguage, glossary) {
  return [
    `You are a professional UI-string translator for Ava Supernova, an open-source AI coding assistant.`,
    `Translate the provided strings from English into ${targetLanguage}.`,
    ``,
    `Rules (strict):`,
    `1. Return ONLY a single JSON object. No prose, no markdown, no code fences. Format: {"key": "translation", ...}`,
    `2. The JSON MUST contain exactly the same keys as the input, in any order.`,
    `3. Preserve placeholders like {name}, {model}, {count} — do not translate or rename them.`,
    `4. Preserve inline markdown (**bold**, \`code\`, [links](url)) and escape sequences (\\n, \\u00e9).`,
    `5. Keep the tone concise and UI-appropriate. Do not add punctuation that wasn't present.`,
    `6. **Translate every string by default.** Short single-word UI labels like "Chat", "Plan", "Error", "Output", "Mode", "Global", "Project", "Model", "Tokens", "Pause", "Terminal" are NOT brand names — they MUST be translated into the natural ${targetLanguage} equivalent.`,
    `7. Do NOT translate ONLY these exact tokens (return them byte-identical): ${glossary.join(', ')}.`,
    `   A string is exempt ONLY if it consists entirely of glossary tokens and punctuation/placeholders. "Git {command}" stays English (Git is a glossary token + placeholder). "Start Learning" does NOT — translate it.`,
    `8. If you are tempted to return an English string unchanged, check rule 7 first. If it's not strictly a glossary-only string, you MUST translate.`,
    `9. Prefer natural, idiomatic ${targetLanguage} over literal translation.`,
  ].join('\n');
}

async function translateBatch({ targetLanguage, entries, attempt = 1 }) {
  const systemPrompt = buildSystemPrompt(targetLanguage, DO_NOT_TRANSLATE);
  const userPayload = JSON.stringify(Object.fromEntries(entries), null, 2);

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Translate these UI strings to ${targetLanguage}:\n\n${userPayload}` },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 150_000);
  let res;
  try {
    res = await fetch(COMPLETION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CRED.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError' && attempt < 3) {
      console.log(`    retry ${attempt}/3 after 5000ms (timeout)`);
      await new Promise(r => setTimeout(r, 5000));
      return translateBatch({ targetLanguage, entries, attempt: attempt + 1 });
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
      const delay = 2 ** attempt * 1000;
      console.log(`    retry ${attempt}/3 after ${delay}ms (status ${res.status})`);
      await new Promise(r => setTimeout(r, delay));
      return translateBatch({ targetLanguage, entries, attempt: attempt + 1 });
    }
    throw new Error(`Qwen API ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from Qwen');

  // Strip code fences if the model ignored the instruction
  const cleaned = content.replace(/^```json\s*|\s*```$/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse translation JSON: ${err.message}. Got: ${cleaned.slice(0, 200)}`);
  }

  return parsed;
}

// ── Main processing ─────────────────────────────────────────────────────────

/** @typedef {{key: string, enValue: string}} UntranslatedEntry */

function collectUntranslated(surface) {
  const enPath = path.join(surface.dir, surface.enFile);
  const parse = surface.kind === 'ts' ? parseTs : (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
  const en = parse(enPath);
  const keepEnglish = parseKeepEnglish(surface.keepEnglishFile);

  const perLocale = {};
  for (const f of surface.listLocaleFiles()) {
    const locale = surface.localeCodeFromFile(f);
    if (!locale) continue;
    if (LOCALE_FILTER && !LOCALE_FILTER.has(locale) && !LOCALE_FILTER.has(locale.toLowerCase())) continue;
    const filePath = path.join(surface.dir, f);
    const other = parse(filePath);
    /** @type {UntranslatedEntry[]} */
    const items = [];
    for (const [k, v] of Object.entries(other)) {
      if (!(k in en)) continue;
      if (keepEnglish.has(k)) continue;
      if (v === en[k]) items.push({ key: k, enValue: en[k] });
    }
    if (items.length > 0) {
      perLocale[locale] = { file: f, filePath, entries: items };
    }
  }
  return { en, perLocale };
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function processSurface(surface) {
  if (SURFACE_FILTER && surface.name !== SURFACE_FILTER) return { translated: 0, skipped: true };
  console.log(`\n=== Surface: ${surface.name} ===`);
  const { perLocale } = collectUntranslated(surface);
  const localeList = Object.keys(perLocale);
  if (localeList.length === 0) {
    console.log('  nothing to translate.');
    return { translated: 0, skipped: false };
  }

  let translated = 0;
  await pool(localeList, CONCURRENCY, async (locale) => {
    const { file, filePath, entries } = perLocale[locale];
    const lookupKey = LANGUAGE_NAMES[locale] || LANGUAGE_NAMES[locale.toLowerCase()];
    const targetLanguage = lookupKey || locale;
    console.log(`\n  [${surface.name}/${locale}] ${entries.length} strings to ${targetLanguage}`);

    const batches = chunkArray(entries, BATCH_SIZE);
    /** @type {Record<string, string>} */
    const translations = {};
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const payload = batch.map(e => [e.key, e.enValue]);
      process.stdout.write(`    batch ${i + 1}/${batches.length} (${batch.length} strings) ... `);
      if (DRY_RUN) {
        console.log('dry-run');
        continue;
      }
      try {
        const result = await translateBatch({ targetLanguage, entries: payload });
        let added = 0;
        for (const e of batch) {
          const t = result[e.key];
          if (typeof t === 'string' && t.length > 0 && t !== e.enValue) {
            translations[e.key] = t;
            added++;
          }
        }
        console.log(`ok (${added} accepted)`);
      } catch (err) {
        console.log(`FAILED: ${err.message}`);
      }
    }

    if (DRY_RUN) return;
    if (Object.keys(translations).length === 0) {
      console.log(`    no accepted translations — leaving ${file} unchanged.`);
      return;
    }

    // Write back in place
    if (surface.kind === 'ts') {
      let text = fs.readFileSync(filePath, 'utf8');
      for (const [k, v] of Object.entries(translations)) {
        text = replaceTsValue(text, k, v);
      }
      fs.writeFileSync(filePath, text, 'utf8');
    } else {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const [k, v] of Object.entries(translations)) data[k] = v;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    }
    translated += Object.keys(translations).length;
    console.log(`    wrote ${Object.keys(translations).length} translations to ${file}`);
  });

  return { translated, skipped: false };
}

// ── Entrypoint ──────────────────────────────────────────────────────────────

(async () => {
  console.log(`i18n-translate — model=${MODEL}${DRY_RUN ? ' (dry-run)' : ''}`);
  if (CRED) console.log(`  auth: ${CRED.kind} → ${COMPLETION_URL}`);
  if (LOCALE_FILTER) console.log(`  locales: ${[...LOCALE_FILTER].join(', ')}`);
  if (SURFACE_FILTER) console.log(`  surface: ${SURFACE_FILTER}`);

  let total = 0;
  for (const surface of SURFACES) {
    const { translated, skipped } = await processSurface(surface);
    if (!skipped) total += translated;
  }

  console.log(`\n${DRY_RUN ? '[dry-run] ' : ''}Done. Translated ${total} strings.`);
  console.log(`Run \`pnpm i18n:check\` to verify the result.`);
})();
