#!/usr/bin/env node
/**
 * Generate release-notes migrations with 19-locale translations.
 *
 * Release notes live in the web platform's `public.release_notes` table and are
 * authored as Supabase migrations (see packages/web/supabase/migrations/
 * *_release_notes_*.sql). The English body stays English; only `title` and
 * `highlights` are translated into the 19 supported locales and stored in the
 * `translations` jsonb column.
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
    migration: 293,
    version: '0.63.0',
    platform: 'extension',
    toolCount: 61,
    publishedAt: '2026-05-24 12:00:00+00',
    title: 'Ava speaks your language — everywhere, not just the chat',
    body: `Ava has supported 20 languages for a while, but only the chat really spoke them — switch your language and half the interface stayed in English. This release closes that gap end to end.

**The whole interface, not just the chat.** Every panel, button, label, badge and empty-state across the dashboard and the chat sidebar now switches with your language. The audit was exhaustive — Creative Studio, the dataset cards, storage badges, the lot. If it's text Ava draws, it now speaks your language.

**The health catalogue translates too.** Exercise and recipe names, and their full detail bodies, are translated on demand and cached server-side — so the first view in a new language fills in, and every view after that is instant. Names included, not just descriptions.

**The documentation is localized.** The entire docs set — every page, every section — is now available in 19 languages, with per-block English fallback so nothing ever shows blank while a translation catches up. Learn how Ava works in the language you think in.

**Two new starter docs for people new to coding.** A plain-English "for non-coders" guide and a glossary, written for the wave of people arriving to learn rather than ship — concepts first, jargon explained, no assumed background.`,
    highlights: [
      'Full interface translation — every panel, button and label across the dashboard and chat sidebar now switches with your language, not just the chat itself.',
      'Exercise and recipe names plus their detail bodies translate on demand and cache server-side, so the catalogue is instant after the first view in a new language.',
      'The entire documentation set is localized into 19 languages with per-block English fallback — nothing shows blank while a translation catches up.',
      'Two new starter docs written for people new to coding — a plain-English guide and a glossary, concepts first with jargon explained.',
    ],
  },
  {
    migration: 294,
    version: '0.64.0',
    platform: 'extension',
    toolCount: 62,
    publishedAt: '2026-05-24 22:00:00+00',
    title: 'She keeps the thread, and checks it is really live',
    body: `Two things make an agent trustworthy on real work: it does not lose the thread on a long session, and it does not call something "done" until it actually is. This release hardens both.

**Context you cannot lose.** When a session runs long, Ava compresses older turns to stay fast and within budget — but compression used to mean fine detail could drift out of reach. Now the full conversation is always recoverable: Ava can read back exactly what you said, what was decided, a path or a value — instead of guessing or asking you to repeat yourself. Your own messages are kept word-for-word through compression, and the running summary now scales with how much there is to keep. On a long build, she stops half-remembering and starts re-reading the record.

**"Done" means proven, not assumed.** Ava now matches how hard she verifies to what is at stake — trivial edits pass on sight, shared-code changes get the whole thing rebuilt, and high-stakes paths like auth, payments and migrations always get the full check, every time. Multi-step builds are verified as an assembled whole, not just task by task. And for anything that has to reach a live surface, she can now confirm it is actually serving — not just committed — instead of telling you "it is live" on faith.`,
    highlights: [
      'Long sessions no longer lose context — Ava recalls the exact earlier conversation after compression instead of guessing or asking you to repeat yourself.',
      'Your own messages are kept word-for-word through compression, and the running summary scales with the session so dense work keeps its detail.',
      'Verification now matches the stakes — trivial changes pass on sight, while auth, payments and migrations always get the full check.',
      'Ava can confirm work is actually live on its surface, not just committed — closing the gap between "I pushed it" and "it works for you".',
    ],
  },
  {
    migration: 296,
    version: '0.2.0',
    platform: 'companion',
    toolCount: 10,
    publishedAt: '2026-05-28 19:00:00+00',
    title: 'She lifts with you, in your language, on your device',
    body: `The companion's wellbeing tab shipped functional last release — this one makes it real. A gym partner that actually times you. A whole interface that speaks your tongue, not just the chat. And a privacy default that finally matches what we said all along: your data stays on your phone unless you opt in.

**A gym partner, not a placeholder.** Tap the circle to start — that's your timer. Switch between stopwatch, countdown, sets and Tabata from the same screen, with the ring colour and pulse telling you which phase you are in. When you hit Finished, if there is a workout planned for today, an overlay drops in with the exercises and you tick off what you actually did. No setup, no menus to dig through, no waiting for a feature to land.

**The whole companion, not just the chat.** Wellbeing was the last surface still mostly English when you flipped your language — Today, Profile, Plans, the gym, the recipe library, even the More menu. Every label, badge, button and empty state now switches with your locale, in all 19 supported languages. And when you change language in Settings, the next message you send tells Ava — so she replies in your tongue on the very next turn, without you asking.

**Local by default, not local on opt-in.** Data Mode used to start in Cloud and offer three settings. It now starts in Local and offers two: Local (on-device only) and Cloud (local-first with sync). The wording matches what local-first actually means — your tasks, journal, memories and plans stay on this phone unless you turn sync on. Old "Both" preferences migrate to Cloud silently — same behaviour, cleaner choice.`,
    highlights: [
      'Gym tab is now a session partner you actually tap — start, pause and resume the timer with one touch, switch between Stopwatch, Countdown, Sets and Tabata, and tick off what you did when you finish.',
      'The entire companion surface is translated into 19 languages — every panel, button, menu and empty state, not just the chat.',
      'Ava replies in your chosen interface language on every chat turn — pick German in Settings and the very next message comes back in German.',
      'Data Mode now defaults to Local with two options instead of three — your data stays on your phone unless you opt into cloud sync.',
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
  ? 'https://ava-supernova.com/api/chat'
  : 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';

// ── Translate one release's title + highlights into one locale ───────────────
async function translateOne(locale, release, attempt = 1) {
  const targetLanguage = LANGUAGE_NAMES[locale] || locale;
  const input = { title: release.title };
  release.highlights.forEach((h, i) => { input[`highlight_${i}`] = h; });

  const system = [
    `You are a professional release-notes translator for Ava Supernova, an open-source AI coding assistant.`,
    `Translate the provided strings from English into ${targetLanguage}.`,
    `Rules (strict):`,
    `1. Return ONLY a single JSON object with exactly the same keys as the input. No prose, no markdown, no code fences.`,
    `2. Preserve inline markdown (**bold**, \`code\`, "quotes") and any placeholders.`,
    `3. Do NOT translate these exact tokens — return them byte-identical: ${DO_NOT_TRANSLATE.join(', ')}.`,
    `4. Prefer natural, idiomatic ${targetLanguage}. Keep the confident, plain-spoken product tone.`,
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
  return { title: parsed.title, highlights };
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
--      English body + ${LOCALES.length}-locale translations (title + highlights).
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
