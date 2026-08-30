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
    migration: 417,
    version: '0.97.0',
    platform: 'extension',
    toolCount: 122,
    publishedAt: '2026-08-29 12:00:00+00',
    title: `Every mode can do its job, and a render finishes without you`,
    body: `The biggest release in a while, and most of it is things that looked like they were working.

**No mode could open a file.** The file tools were renamed — file_read became read — and the lists saying which tools each mode may use kept the old names. A name that does not exist does not error; it matches nothing, so the tool is silently withheld. Plan mode could search a codebase and then not read what it found. Teach, Security, Write and all four rooms the same: seventeen dead entries across seven modes.

**And the builder could not write code.** The same rename in the persona lists — twenty of my twenty-four specialists could not open a file, including the one whose entire job is writing code. Every orchestrated build ran that way. There are guards over all of it now, each written to fail against the real bug rather than a guess at it.

**Coding turns get their context back.** Every turn in code mode was handed every tool I have — the health room, the recipe desk, the newsroom, the gym — around 25,000 tokens of it, spent describing how to log a meal to someone writing TypeScript. Code mode gets the tools that belong to the work now, and that space is your files instead: more of the real thing in front of me before anything has to be summarised away. Code mode also has a briefing of its own for the first time; it was the default you got without choosing, running on the generic prompt.

**Plan mode really only plans.** It never held write tools itself, but it could dispatch builders that were not bound by that — so a plan could quietly become eleven tasks and an edited project. It checks before dispatching now. An accepted plan is written into your Decisions folder with the approaches not taken, and Plan reads that folder before proposing anything: contradicting something settled has to be said out loud.

**A plan arrives as a card, not as JSON.** Some models write the tool call out as text instead of calling it, and you got a wall of markup where a plan belongs. It is recovered and rendered properly now — narrowly, so ordinary prose can never be mistaken for a call — and held back while it streams rather than painted on screen and then replaced.

**Video runs from 2 to 30 seconds,** priced by the second, so a five-second clip costs half what it did and every length shows its price before you choose. It offered 5 or 10 before: a limit belonging to a model replaced twice over. Length is decided before the writing now rather than derived from however much I happened to write, with a beat of air before the voice starts and after it stops.

**A render you walk away from still finishes.** A Studio panel above the calendar shows what is generating, with a live clock — go anywhere, the work carries on. Clips and voiceovers always reach your Library now, with the words I actually spoke rather than a shortened title; they could play on screen and quietly never save.

**Documents open beside the conversation.** A pane next to the chat, freely editable, saving as you type, with export to Word, PDF or ODF — the open format needs no extra software at all. The Library groups a document and its exports into one card instead of three unrelated files, and deleting one takes its exports with it instead of orphaning them.

**And the honest small things.** The thinking line says only what I actually know, with a timer, instead of rotating four invented phrases. Ticking a subtask, editing a task and loading your secrets had all been silently doing nothing here. My working notes are out of your task list — they were never your commitments. Over 120 tools, counted rather than claimed, in twenty languages.`,
    highlights: [
      'No mode could open a file, and the builder could not write code — a rename left the tool lists pointing at names that no longer existed, so they were withheld in silence.',
      'Coding turns no longer carry every tool I have. Around 25,000 tokens a turn went on describing recipe and health tools to someone writing TypeScript; that space is your files now.',
      'Plan mode really only plans — it could dispatch builders that were not bound by its own read-only rule — and an accepted plan is written into your Decisions folder.',
      'Video runs 2 to 30 seconds priced by the second, and a render you walk away from still finishes and always reaches your Library.',
      'Documents open beside the chat with export to Word, PDF or ODF, and the Library shows one card per document instead of three files.',
    ],
  },
  {
    migration: 418,
    version: '0.44.0',
    platform: 'ide',
    toolCount: 122,
    publishedAt: '2026-08-29 12:00:00+00',
    title: `Picking a mode now gives you the mode`,
    body: `This release closes most of the gap between the IDE and the extension, and the first item is the one that explains why this surface has felt less sharp.

**Choosing a mode sent me its label and nothing else.** That label is what my tools are filtered by — so picking Plan or Brainstorm took my toolbox away and never gave me the brief that justifies it. Fewer tools, no instructions, and no way for either of us to see why. Every mode now arrives with its own briefing, the way it always has in the extension.

**Seven of the nine voices did not exist.** Only two names in the picker were real, and the one selected by default was not among them, so choosing almost any voice failed outright. Every voice offered now is one the model actually has, checked name by name against it.

**No mode could open a file, and the builder could not write code.** A rename left the tool lists pointing at names that no longer existed, and a name that does not exist is withheld silently rather than reported. Twenty of my twenty-four specialists could not read a file, including the one whose job is writing code.

**Coding turns get their context back.** Every turn in code mode carried every tool I have — around 25,000 tokens of it, describing the recipe desk to someone writing TypeScript. Code mode gets the tools that belong to the work now, and has a briefing of its own for the first time.

**The Library could never show a document.** It read the project folder from a setting nothing writes, so the scan returned before it started and the tab stayed permanently empty. A signed-out window also drew "connect your account" over files sitting on your own disk.

**Documents open beside the conversation,** freely editable and saving as you type, with export to Word, PDF or ODF. Deleting a document removes its exports rather than orphaning them, and asks properly first.

**Video runs from 2 to 30 seconds,** priced by the second, and a render you walk away from still finishes — a Studio panel above the calendar shows what is generating. Clips and voiceovers always reach your Library with the words I actually spoke, and a voiceover shows a waveform there so a read looks like audio at a glance.

**A plan is a card you can answer.** There was no plan card here at all, so when I offered a choice between approaches it rendered as a generic permission banner and the question was never really put to you. Your project's decision records now have their own tab, read from disk.

**A home for your projects,** at ~/Ava Projects by default — visible, not buried in hidden application data where backup tools skip it. The storage bar counts project data as its own line instead of folding it into "Other".`,
    highlights: [
      'Picking a mode used to send only its label — which is what filters my tools. A mode took the toolbox away without giving me the brief. Now it gives you both.',
      'Seven of the nine voices in the picker did not exist, including the default, so choosing almost any voice failed.',
      'Coding turns no longer carry every tool I have — around 25,000 tokens a turn that is now your files instead.',
      'The Library could never show a document: it read the project folder from a setting nothing writes.',
      'Documents open beside the chat with export to Word, PDF or ODF, and video runs 2 to 30 seconds with renders that finish without you.',
    ],
  },
  {
    migration: 419,
    version: '0.2.78',
    platform: 'core',
    toolCount: 122,
    publishedAt: '2026-08-29 12:00:00+00',
    title: `The lists that decide what I can do were pointing at nothing`,
    body: `Core is the engine every surface runs on. Most of this release is one fault in different clothes: a fact kept by hand in several places, drifting quietly, because a list that is merely SHORT never fails — it just does less than it claims.

**The tool lists named tools that no longer exist.** A rename left seventeen dead entries across seven modes, and twenty of twenty-four personas holding names that match nothing. A name that matches nothing is withheld silently and never reported. Plan mode could search a codebase and not read it; the builder could not write code. Guards now read every list and fail on a name that is not real.

**Code mode was carrying every tool I have.** A list restricting it to what coding actually needs had existed for months and never once run — code mode is the untagged default, so the filter took its fallback path every time and shipped all of them. Measured, that is around 25,000 tokens a turn of context, not billing, spent describing the recipe desk to someone writing TypeScript.

**Every mode carries its own brief.** Code mode had none at all: nothing wrapped the message, so there was nowhere for a prompt to go. Brainstorm could not open a file, which made half of what it exists for impossible — it was asked where a codebase should go while forbidden from looking at it. Security could find vulnerabilities and had no way to propose a plan for fixing them. Write had no team of its own, and five specialists could not use memory at all.

**A question gets an answer.** Asked about something I had just made, I would make another one — two minutes of rendering and no reply. A question about something just made is asking for an explanation, never for a second attempt.

**Length is decided before the writing.** Video was sized from however much I happened to write, which sounds right and inverts the instruction: I write at hook length by habit, so every clip came out short. The subject picks the format and the script is written to fill it, enforced at both ends, with a beat of air before the voice starts and after it stops. A recipe is verified before anything is spent, rather than after.

**A journal day that could not be read was being replaced with an empty one.** On any read error at all — a scanner holding the file open is enough — the day was overwritten with nothing, and the write reported success. It retries now, and if it still cannot read it fails loudly instead. A corrupt file is preserved under a new name before anything else happens.

**A Windows path arriving on a Linux machine** was creating a strangely-named file inside your project instead of being refused. Nothing escaped the project on either platform, but one input behaved two different ways depending on the machine.`,
    highlights: [
      'The lists deciding which tools each mode and persona may use named tools that no longer existed — withheld in silence, never reported.',
      'Code mode was carrying every tool I have: around 25,000 tokens a turn describing the recipe desk to someone writing TypeScript.',
      'Every mode carries its own brief now. Code mode had none, Brainstorm could not open a file, and Security could not propose a plan.',
      'A journal day that could not be read was being overwritten with an empty one, and the write reported success.',
    ],
  },

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
        const t = await translateOne(locale, release);
        // A locale that comes back IDENTICAL to the English is not translated,
        // it is a failed call wearing a success. translateOne falls back to the
        // English value per field when the model omits a key, so a partial or
        // malformed reply arrives looking complete — Korean shipped exactly
        // that way on the first run of these notes: title, body and every
        // highlight in English, and nothing reported it.
        //
        // The missing-locale guard below cannot see this, because the locale is
        // present. Treat it as the failure it is so the migration is not
        // written and a re-run fills it.
        if (t && t.title === release.title && t.body === release.body) {
          throw new Error('came back identical to English — treating as a failed translation');
        }
        translations[locale] = t;
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
