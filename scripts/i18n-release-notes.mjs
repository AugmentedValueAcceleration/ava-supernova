#!/usr/bin/env node
/**
 * Generate release-notes migrations with 19-locale translations.
 *
 * Release notes live in the web platform's `public.release_notes` table and are
 * authored as Supabase migrations (see packages/web/supabase/migrations/
 * *_release_notes_*.sql). `title`, `highlights` AND `body` are translated into
 * the 19 supported locales and stored in the `translations` jsonb column.
 *
 * Body translation added 2026-08-05. Until then only title and highlights were
 * sent, so every release rendered a translated heading and translated bullets
 * above English paragraphs — which reads worse than plain English would, because
 * it looks broken rather than untranslated. Existing releases keep English
 * bodies until they are backfilled; the renderer falls back per field.
 *
 * There was no script for this — the translation blocks were produced ad-hoc.
 * This is the proper, reusable pipeline: define the English content in RELEASES
 * below, run the script, and it translates via the same platform/qwen-flash
 * endpoint the rest of our i18n uses, then writes the migration .sql files.
 *
 * Usage:
 *   node scripts/i18n-release-notes.mjs                 # generate all RELEASES
 *   node scripts/i18n-release-notes.mjs --dry-run       # translate, print, don't write
 *   node scripts/i18n-release-notes.mjs --concurrency=6 # parallel locales
 *
 * Credential: same resolution as i18n-translate.mjs — AVA_PLATFORM_KEY /
 * QWEN_API_KEY env, or ~/.ava/config.json platformKey.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(repoRoot, 'packages/web/supabase/migrations');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) return [a.slice(2, eq), a.slice(eq + 1)];
    if (a.startsWith('--')) return [a.slice(2), 'true'];
    return [a, 'true'];
  }),
);
const DRY_RUN = args['dry-run'] === 'true';
const CONCURRENCY = Math.max(1, Number(args.concurrency || 5));
const MODEL = args.model || 'qwen3.5-flash';

// ── Locales + glossary (mirrors i18n-translate.mjs) ──────────────────────────
const LOCALES = ['es', 'fr', 'de', 'ja', 'ko', 'zh-CN', 'zh-TW', 'pt', 'ru', 'it', 'nl', 'tr', 'ar', 'hi', 'vi', 'th', 'pl', 'uk', 'id'];
const LANGUAGE_NAMES = {
  'zh-CN': 'Simplified Chinese (中文简体)', 'zh-TW': 'Traditional Chinese (中文繁體)',
  ja: 'Japanese (日本語)', ko: 'Korean (한국어)', es: 'Spanish (Español)', pt: 'Portuguese (Português)',
  fr: 'French (Français)', de: 'German (Deutsch)', ru: 'Russian (Русский)', ar: 'Arabic (العربية)',
  hi: 'Hindi (हिन्दी)', vi: 'Vietnamese (Tiếng Việt)', th: 'Thai (ไทย)', tr: 'Turkish (Türkçe)',
  it: 'Italian (Italiano)', pl: 'Polish (Polski)', uk: 'Ukrainian (Українська)',
  nl: 'Dutch (Nederlands)', id: 'Indonesian (Bahasa Indonesia)',
};
// Kept byte-identical: brands + literal tool/identifier names + standard acronyms.
const DO_NOT_TRANSLATE = [
  'Ava', 'Supernova', 'Ava Supernova', 'Qwen', 'DeepSeek', 'Mistral',
  'conversation_recall', 'deploy_state', 'verify_change',
  'IDE', 'CLI', 'API', 'UI', 'URL', 'HTTP', 'JSON', 'SQL', 'Git', 'GitHub', 'OWASP', 'CVE', 'RLHF',
];

// ── Release content (English) ────────────────────────────────────────────────
// Add a new entry here for each future release, then re-run the script.
const RELEASES = [
  {
    migration: 406,
    version: '0.95.0',
    platform: 'extension',
    toolCount: null,
    publishedAt: '2026-08-13 21:00:00+00',
    title: `The shop stops arguing with you`,
    body: `A plan only works if the app believes what you told it. This release is mostly about the app listening.

**Skip a meal and the shop stops buying for it.** Tick a dinner as skipped, or as something you ate instead, and its ingredients come off the list. Until now the shopping list read the plan as written and never looked at what actually happened, so a dinner you had already decided against came back every single week.

**And the food you did buy stops disappearing.** Anything shopped for and never cooked is now shown beside the list as what is already in your kitchen, merged and scaled exactly like the list itself, so two skipped meals sharing an onion read as one line. Nothing knew about that food before, so Ava would happily suggest buying more of it while a bag of spinach went off.

**The list says what it left out.** Meals it skipped on purpose are named, with why. A shorter list that does not explain itself reads as a bug, and this one is short deliberately.

**Unrecorded still gets shopped for.** A meal with no log has not happened yet, which is a different thing from one you skipped. Treating them the same would send you home without dinner, and a spare ingredient is the cheaper mistake.

**Ava can find food you will actually eat.** She can now search the recipe library by diet, so a vegetarian or vegan week is built from dishes that genuinely qualify rather than ones whose names sound about right. Halloumi is not vegan, and a title cannot tell you there is fish sauce in it.

**Security mode knows what day it is.** It was the one room without a clock, so anything time-sensitive in a security review was guesswork.

**Anthropic models have been removed.** Ava is built to show that open source is not a security risk when the work is done properly, and a closed frontier vendor in the model picker undercuts that every time you open it. If you had a key saved it has been left exactly where you put it. Ava simply no longer offers the provider, and says so plainly rather than pretending it never existed.`,
    highlights: [
      `Skip a meal and its ingredients come off the shopping list, and the food you already bought but never cooked is shown as what is in your kitchen.`,
      `The list names the meals it deliberately left off, so a short list reads as a decision rather than a bug.`,
      `Ava can search recipes by diet, so a vegan or vegetarian week is built from dishes that genuinely qualify.`,
      `Anthropic models are gone, on open-source grounds. Any key you saved is untouched.`,
    ],
  },
  {
    migration: 407,
    version: '0.41.0',
    platform: 'ide',
    toolCount: null,
    publishedAt: '2026-08-13 21:00:00+00',
    title: `The shop stops arguing with you`,
    body: `A plan only works if the app believes what you told it. This release is mostly about the app listening.

**Skip a meal and the shop stops buying for it.** Tick a dinner as skipped, or as something you ate instead, and its ingredients come off the list. Until now the shopping list read the plan as written and never looked at what actually happened, so a dinner you had already decided against came back every single week.

**And the food you did buy stops disappearing.** Anything shopped for and never cooked is now shown beside the list as what is already in your kitchen, merged and scaled exactly like the list itself, so two skipped meals sharing an onion read as one line.

**The list says what it left out.** Meals it skipped on purpose are named, with why. A shorter list that does not explain itself reads as a bug, and this one is short deliberately.

**Unrecorded still gets shopped for.** A meal with no log has not happened yet, which is a different thing from one you skipped. Treating them the same would send you home without dinner.

**Ava can find food you will actually eat.** She can now search the recipe library by diet, so a vegetarian or vegan week is built from dishes that genuinely qualify rather than ones whose names sound about right.

**Security mode knows what day it is.** It was the one room without a clock, so anything time-sensitive in a security review was guesswork.

**Anthropic models have been removed.** Ava is built to show that open source is not a security risk when the work is done properly, and a closed frontier vendor in the model picker undercuts that every time you open it. If you had a key saved it has been left exactly where you put it.`,
    highlights: [
      `Skip a meal and its ingredients come off the shopping list, and the food you already bought but never cooked is shown as what is in your kitchen.`,
      `The list names the meals it deliberately left off, so a short list reads as a decision rather than a bug.`,
      `Ava can search recipes by diet, so a vegan or vegetarian week is built from dishes that genuinely qualify.`,
      `Anthropic models are gone, on open-source grounds. Any key you saved is untouched.`,
    ],
  },
  {
    migration: 408,
    version: '0.9.0',
    platform: 'companion',
    toolCount: null,
    publishedAt: '2026-08-13 21:00:00+00',
    title: `It remembers what you actually ate`,
    body: `Logging a meal used to be a record and nothing more. Now it changes what happens next.

**Skip a meal and the shop stops buying for it.** Its ingredients come off the list, and the list names what it left off, so a short list reads as a decision rather than a fault. A meal you have not logged either way still gets shopped for, because that has not happened yet, which is a different thing from a skip.

**What you bought and never cooked is shown as surplus.** Right beside the shop, because the moment you are deciding what to buy is the moment it matters that you already have three onions.

**Repeating a plan now listens to the food, not just the training.** A dish you turned down more often than you ate, or rated two stars, is flagged for swapping instead of being served to you again. Ratings count for movements too, because adding weight to a lift you told us you hated is the fastest way to prove the plan is not listening.

**It never rewrites your food.** A swap is a suggestion about which dish to replace, and choosing the replacement is yours. It never acts on silence either: with nothing logged and nothing rated, a repeat behaves exactly as it always did. You should not have to rate your week for the next one to be built.

**Fixed: recipe filters were quietly lying.** Combining diets, such as vegetarian and vegan together, returned a short list and sometimes nothing at all, while reporting a total that agreed with it. Nearly a thousand matching rows were being dropped before you ever saw them. Every filter combination has been re-checked against real counts.

**Anthropic models have been removed.** Ava exists to show that open source is not a security risk when the work is done properly. Any key you saved is untouched. The provider is simply no longer offered.`,
    highlights: [
      `Skipping a meal now takes its ingredients off the shopping list, and what you bought but never cooked is shown as surplus beside it.`,
      `Repeating a plan drops the meals you kept turning down or rated badly, instead of serving them again.`,
      `It never swaps food for you and never acts on silence: with nothing logged, a repeat works exactly as before.`,
      `Fixed a recipe filter fault that silently dropped hundreds of matching dishes when diets were combined.`,
    ],
  },
];

// ── Credential ───────────────────────────────────────────────────────────────
function resolveCredential() {
  const classify = (raw) => (raw ? { kind: raw.startsWith('sk-ava-') ? 'platform' : 'qwen', key: raw } : null);
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
const CRED = resolveCredential();
if (!CRED) {
  console.error('❌ No credential — set AVA_PLATFORM_KEY/QWEN_API_KEY or add platformKey to ~/.ava/config.json');
  process.exit(1);
}
const COMPLETION_URL = CRED.kind === 'platform'
  ? 'https://avasupernova.com/api/chat'
  : 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';

// ── Translate one release's title + highlights into one locale ───────────────
async function translateOne(locale, release, attempt = 1) {
  const targetLanguage = LANGUAGE_NAMES[locale] || locale;
  const input = { title: release.title, body: release.body };
  release.highlights.forEach((h, i) => { input[`highlight_${i}`] = h; });

  const system = [
    `You are a professional release-notes translator for Ava Supernova, an open-source AI coding assistant.`,
    `Translate the provided strings from English into ${targetLanguage}.`,
    `Rules (strict):`,
    `1. Return ONLY a single JSON object with exactly the same keys as the input. No prose, no markdown, no code fences.`,
    `2. Preserve inline markdown (**bold**, \`code\`, "quotes") and any placeholders.`,
    `3. Do NOT translate these exact tokens — return them byte-identical: ${DO_NOT_TRANSLATE.join(', ')}.`,
    `4. Prefer natural, idiomatic ${targetLanguage}. Keep the confident, plain-spoken product tone.`,
    `5. \`body\` is multi-paragraph markdown. Keep every paragraph break, every **bold** lead-in and every list marker exactly where they are — translate the prose inside them, nothing else.`,
    `6. Never shorten or summarise. A release note that loses a paragraph is worse than one left in English.`,
  ].join('\n');

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Translate these release-note strings to ${targetLanguage}:\n\n${JSON.stringify(input, null, 2)}` },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 150_000);
  let res;
  try {
    res = await fetch(COMPLETION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CRED.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError' && attempt < 3) {
      await new Promise((r) => setTimeout(r, 5000));
      return translateOne(locale, release, attempt + 1);
    }
    throw err;
  }
  clearTimeout(timer);
  if (!res.ok) {
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      return translateOne(locale, release, attempt + 1);
    }
    throw new Error(`API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('empty response');
  const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, '').trim());

  const highlights = release.highlights.map((_, i) => parsed[`highlight_${i}`]).filter((s) => typeof s === 'string' && s.length);
  if (typeof parsed.title !== 'string' || highlights.length !== release.highlights.length) {
    throw new Error(`incomplete translation (title=${typeof parsed.title}, highlights=${highlights.length}/${release.highlights.length})`);
  }

  // Bodies are the one field long enough for a model to quietly truncate, and a
  // half-translated release note is worse than an English one. Reject anything
  // that lost a paragraph or came back suspiciously short, and let the retry
  // handle it — silent partial output is the failure mode worth designing out.
  const paras = (t) => t.split(/\n\s*\n/).filter((p) => p.trim()).length;
  if (typeof parsed.body !== 'string' || !parsed.body.trim()) {
    throw new Error('body missing from translation');
  }
  if (paras(parsed.body) < paras(release.body)) {
    throw new Error(`body lost paragraphs (${paras(parsed.body)} vs ${paras(release.body)})`);
  }
  // Language-aware floor: CJK compresses hard (a good Chinese body is ~27% of
  // the English source), so a flat ratio rejects every valid zh/ja/ko result.
  const floor = /^(zh|ja|ko)/.test(locale) ? 0.15 : 0.45;
  if (parsed.body.length < release.body.length * floor) {
    throw new Error(`body suspiciously short (${parsed.body.length} vs ${release.body.length} chars, floor ${floor})`);
  }

  return { title: parsed.title, highlights, body: parsed.body };
}

async function pool(items, limit, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) { const it = queue.shift(); if (it !== undefined) await fn(it); }
  }));
}

// ── SQL emission ─────────────────────────────────────────────────────────────
const sqlQuote = (s) => s.replace(/'/g, "''"); // single-quoted literal escape

function buildMigration(release, translations) {
  const highlightsSql = release.highlights.map((h) => `   '${sqlQuote(h)}'`).join(',\n');
  const transJson = JSON.stringify(translations, null, 2);
  return `-- ============================================================
-- ${release.migration}: Release notes — ${release.platform} v${release.version}
--      ${release.title}
--      ${LOCALES.length}-locale translations (title + highlights + body).
--      Locale coverage: ${LOCALES.join(', ')}.
--      Generated by scripts/i18n-release-notes.mjs.
-- ============================================================

INSERT INTO public.release_notes (version, platform, title, body, highlights, tool_count, visible, published_at, translations) VALUES
('${release.version}', '${release.platform}',
 '${sqlQuote(release.title)}',
 $body$${release.body}$body$,
 ARRAY[
${highlightsSql}
 ],
 ${release.toolCount}, true, '${release.publishedAt}',
 $trans$${transJson}$trans$
)
ON CONFLICT (version, platform) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  highlights = EXCLUDED.highlights,
  tool_count = EXCLUDED.tool_count,
  visible = EXCLUDED.visible,
  published_at = EXCLUDED.published_at,
  translations = EXCLUDED.translations;
`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`i18n-release-notes — model=${MODEL}, auth=${CRED.kind}${DRY_RUN ? ' (dry-run)' : ''}`);
  for (const release of RELEASES) {
    // Don't re-translate / clobber migrations that already exist (they may be
    // applied + committed). Only generate new entries. Use --force to override.
    const existing = path.join(MIGRATIONS_DIR, `${release.migration}_release_notes_v${release.version.replace(/\./g, '_')}.sql`);
    if (!DRY_RUN && args.force !== 'true' && fs.existsSync(existing)) {
      console.log(`\n=== v${release.version} — already written, skipping (use --force to regenerate) ===`);
      continue;
    }
    console.log(`\n=== v${release.version} (${LOCALES.length} locales) ===`);
    const translations = {};
    let done = 0;
    await pool(LOCALES, CONCURRENCY, async (locale) => {
      try {
        translations[locale] = await translateOne(locale, release);
        console.log(`  ✓ ${locale} (${++done}/${LOCALES.length})`);
      } catch (err) {
        console.log(`  ✗ ${locale}: ${err.message}`);
      }
    });
    const missing = LOCALES.filter((l) => !translations[l]);
    if (missing.length) {
      console.log(`  ⚠ missing locales: ${missing.join(', ')} — NOT writing migration ${release.migration}. Re-run to fill.`);
      continue;
    }
    // Order locales deterministically for a stable diff.
    const ordered = {};
    for (const l of LOCALES) ordered[l] = translations[l];
    const sql = buildMigration(release, ordered);
    const file = path.join(MIGRATIONS_DIR, `${release.migration}_release_notes_v${release.version.replace(/\./g, '_')}.sql`);
    if (DRY_RUN) {
      console.log(`  [dry-run] would write ${path.basename(file)} (${sql.length} bytes)`);
    } else {
      fs.writeFileSync(file, sql, 'utf8');
      console.log(`  wrote ${path.basename(file)}`);
    }
  }
  console.log('\nDone.');
})();
