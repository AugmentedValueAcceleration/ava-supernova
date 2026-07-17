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
    migration: 355,
    version: '0.35.0',
    platform: 'ide',
    toolCount: 62,
    publishedAt: '2026-07-17 19:15:00+00',
    title: 'Kimi K3, and the right tools in the right rooms',
    body: `The desktop IDE catches up to everything the extension shipped this week, plus a full pass over which tools Ava can reach in which mode.

**Kimi K3.** Moonshot's new frontier model — 2.8-trillion-parameter sparse mix-of-experts, a one-million-token context window, native vision. Bring your own Moonshot key. On Moonshot's own published benchmarks it leads Claude Opus 4.8 across most agentic work at roughly 60% of the price, while trailing Claude Fable 5 on the hardest reasoning. K2.7 Code stays as the cheaper agentic coder.

**Aurora is led by the right model.** Aurora is meant to be led by Mistral Medium 3.5. It was quietly coordinating on Large 3 — the text-only heavy reserve — instead. Fixed. Aurora remains Mistral-only and EU-resident end to end.

**The right tools in the right rooms.** We checked, mode by mode, that the tools Ava is told she has are the ones she can actually reach:
- She can read the exact earlier conversation back in every mode now, instead of guessing or asking you to repeat yourself.
- Teach mode can fetch a scientific paper for "Read with Ava" again.
- Asking for an image in the Posts, Newsroom and Writing rooms points you to the Creative Studio, where all creation lives, instead of silently doing nothing.
- Putting a vault-granted API key into a project's ignored env file works end to end — Ava never sees the value, and asks before each write.

**Housekeeping.** DeepSeek's retiring model ids moved to V4, several price tables were corrected, and desktop automation moved onto a cleaner internal path — unchanged for you: the IDE ships the full agent, desktop automation included.`,
    highlights: [
      'Kimi K3 is here — Moonshot\'s frontier model, 1M context, native vision, ahead of Opus 4.8 on most agentic benchmarks at ~60% of the price (Moonshot-reported).',
      'Aurora is now led by Mistral Medium 3.5 as intended, not the text-only heavy reserve it had been coordinating on.',
      'A full mode-by-mode tool audit: exact-conversation recall works in every mode, "Read with Ava" fetches papers again, and the post rooms point to the Creative Studio for images.',
      'Ava can put a vault-granted API key into a project\'s ignored env file end to end — never seeing the value, asking before each write.',
    ],
  },
  {
    migration: 354,
    version: '0.87.2',
    platform: 'extension',
    toolCount: 62,
    publishedAt: '2026-07-17 18:00:00+00',
    title: 'The right tools in the right rooms',
    body: `We went through every one of Ava's tools and checked, mode by mode, that the ones she's told she has are the ones she can actually reach. Several couldn't, and a few pointed at nothing. This fixes all of them.

**She can read the conversation back — everywhere.** Ava has a tool for reading the exact earlier transcript instead of guessing at what you said. Her instructions told her to use it every turn, but it was quietly switched off in most rooms — so she'd guess or ask you to repeat yourself. It now works in every mode, chat included.

**"Read with Ava" works on papers again.** In Teach mode, picking a scientific paper to read together hands Ava the paper to explain. She couldn't actually fetch it — the one room that needed the tool was the one room without it. Fixed.

**Making things always points to the Creative Studio.** In the Posts, Newsroom and Writing rooms, asking for an image used to reach for a tool that no longer exists and silently do nothing. Now Ava sends you to the Creative Studio — where all creation lives — and can reuse what's already in your library.

**Putting an API key into a project works end to end.** When Ava sets up a project that needs a key, she can now take one you've granted from your vault and write it into the project's ignored env file — without ever seeing the value herself, and asking before every write. The steps were described but the tools weren't switched on anywhere; now they are.

Under the hood this is locked down with tests, so a tool can't quietly drift out of a room again.`,
    highlights: [
      'Ava can read the exact earlier conversation back in every mode now — including chat, where the tool had been switched off, so she stops guessing or asking you to repeat yourself.',
      '"Read with Ava" on a scientific paper works again — Teach mode was the one room missing the tool it needed to fetch the paper.',
      'Asking for an image in the Posts, Newsroom and Writing rooms now points you to the Creative Studio instead of silently doing nothing.',
      'Ava can put a vault-granted API key into a project\'s ignored env file end to end — never seeing the value, asking before each write — a flow that was described but never actually switched on.',
    ],
  },
  // NOTE on scope (operator decision, 2026-07-17): 0.87.1 is mostly a
  // marketplace-compliance fix — the desktop/browser tools MS requires the
  // extension not to ship were being bundled again. That story is deliberately
  // NOT in these notes. Users lost nothing (those tools were never usable in
  // the extension), so omitting it doesn't mislead anyone who reads this; and a
  // public changelog is not where you hand a gatekeeper a written admission.
  // The full account is in the commit message and the contract tests, which is
  // where it belongs. What's below is true, just not the whole diff.
  {
    migration: 353,
    version: '0.87.1',
    platform: 'extension',
    toolCount: 62,
    publishedAt: '2026-07-17 15:00:00+00',
    title: 'She stops reaching for tools she never had',
    body: `A short one, and it makes Ava more reliable rather than more capable.

**Three tools that never existed.** Ava was told, every single turn, that she could call \`generate_image\`, \`generate_video\` and \`generate_voice\`. None of them have ever been real — the actual tools are named differently, and have been for a long time. So when you asked for an image, she could reach for a name that wasn't there and have the call fail underneath her. She now knows the real names.

**A tidier toolkit.** We audited every tool she's told she has against every tool that actually gets built, and made the two agree. It's the same class of problem as last release's model labels: the code was fine, the description of the code had quietly rotted. Fewer confident wrong turns, less wasted work.

Nothing you were using has been taken away.`,
    highlights: [
      'Ava was told every turn that she had three image, video and voice tools that have never existed — so a request could fail on a name that was never real. Fixed.',
      'Every tool Ava is told she has is now checked against every tool actually built, so her toolkit and her description of it finally agree.',
      'Same class of problem as last release\'s model labels — the code was right, the notes about the code had rotted.',
    ],
  },
  {
    migration: 352,
    version: '0.87.0',
    platform: 'extension',
    toolCount: 62,
    publishedAt: '2026-07-17 09:00:00+00',
    title: 'Kimi K3 on day one — and every model tells you what it can see',
    body: `Moonshot released Kimi K3 yesterday. It is in this build, and you can point your own key at it today.

**Kimi K3, the day after it landed.** Moonshot's new frontier model — a 2.8-trillion-parameter sparse mix-of-experts with a one-million-token context window and native vision over text, images and video. On Moonshot's own published benchmarks it leads Claude Opus 4.8 across most agentic work at roughly 60% of the price, while trailing Claude Fable 5 on the hardest reasoning sets. Those are the lab's own numbers and nobody has replicated them yet, so treat them as a starting point rather than a verdict. K2.7 Code stays exactly where it was — K3 costs about three times as much, so it is the heavy option, not the replacement.

**Every model now shows whether it can see.** Each model in the picker carries a camera icon, and models that cannot read images carry a camera with a line through it. Attach a picture to a text-only model and Ava tells you before you send, instead of after the provider rejects it.

**And the marker now tells the truth.** GLM-5.2 was labelled as vision-capable in this app. It is not — Zhipu keeps vision in a separate model line we do not carry. If you use GLM with your own key and attached a screenshot, you got a raw provider error with no explanation. We checked every model in the catalogue against its provider's live API this time, rather than trusting our own notes.

**Your Creative Studio work can reach your projects.** Anything you make in the Studio is now visible to Ava, so she stops offering to generate things you already own. You can drop an asset straight into your project, and rename things in your library.

**Aurora is led by the right model.** Aurora is meant to be led by Mistral Medium 3.5. It was actually being coordinated by Large 3 — the heavy reserve — which is a text-only, non-reasoning model. Fixed on both the extension and the IDE. Aurora remains Mistral-only and EU-resident end to end.

**Housekeeping you would rather we did quietly.** DeepSeek retires its old model names on 24 July; anything still pointing at them has been moved to V4 so nothing breaks next week. MiniMax M2.7 joins the list with a fast tier alongside it. Several price tables were wrong — MiniMax M3 was quoted at double its real rate — so your cost estimates are now accurate.`,
    highlights: [
      'Kimi K3 is here the day after Moonshot shipped it — 1M context, native vision, and ahead of Claude Opus 4.8 on most agentic benchmarks at around 60% of the price (Moonshot-reported, not yet independently replicated).',
      'Every model shows whether it can read images — a camera icon, struck through when it cannot — so you find out before you send, not after the provider rejects it.',
      'GLM-5.2 was wrongly labelled vision-capable and would fail with a raw provider error on any image; every model in the catalogue has now been checked against its provider\'s live API.',
      'Creative Studio work is finally visible to Ava and can be dropped straight into your project, or renamed in your library.',
      'Aurora is now led by Mistral Medium 3.5 as intended, rather than the text-only heavy reserve it had quietly been coordinating on.',
    ],
  },
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
  {
    migration: 298,
    version: '0.65.0',
    platform: 'extension',
    toolCount: 62,
    publishedAt: '2026-05-30 21:00:00+00',
    title: 'She shows the receipts — costs, wins, and the losses too',
    body: `A benchmark number is easy to print and hard to verify. Ava's Models page does it the other way round — it shows you the work behind every score, so you can decide for yourself which model to trust on real coding.

**Real tasks, real receipts.** Each model is run against hand-curated coding tasks and scored by actually running the code — not by one AI grading another. Every score links to the exact prompt sent and the exact answer received, so you can open the transcript and check it yourself. Nothing to take on faith.

**No naked accuracy.** A pass-rate on its own hides the cost. Every score now carries the price per task and the time it took, right beside it — because a model that's right 90% of the time but slow and pricey is a different choice than one that's right 85% and instant. You see the trade, not a cherry-picked headline.

**Modes and models, never mixed.** Ava's orchestration modes are judged in their own table, never ranked against a single raw model — a mode runs several models and costs more by design, so a head-to-head would be a lie. And the page shows where the field loses, on purpose: the weakest results get their own panel, because publishing your losses is the part nobody fakes.`,
    highlights: [
      'Every benchmark score links to the exact prompt and answer behind it — open the transcript and check it yourself instead of trusting a number.',
      'Scores are decided by actually running the code, not by one AI grading another — so a model can\'t talk its way to a pass.',
      'Cost and speed sit beside every accuracy score, so you see the real trade-off rather than a cherry-picked headline.',
      'Where models lose is shown on purpose, in its own panel — because publishing your losses is the part nobody fakes.',
    ],
  },
  {
    migration: 300,
    version: '0.67.0',
    platform: 'extension',
    toolCount: 62,
    publishedAt: '2026-06-01 21:00:00+00',
    title: 'She shows her work, sees your screen, and signs you in clean',
    body: `The big features get the headlines, but trust is built in the small moments — the spinner that finally tells you what's happening, the image she can actually read, the sign-in that just works. This release is those moments, smoothed.

**No more staring at a blank spinner.** Send a prompt to a coordinator model and Ava used to go quiet for ten seconds while she classified the task and picked the right model — a silent wheel with nothing behind it. Now she tells you what she's doing in that window — reading your request, choosing the model — so you're never left wondering whether anything is happening.

**She can see your screen now.** Drop in a screenshot, a game viewport, a design mockup — and Ava actually reads it. Before, some modes would politely tell you they couldn't process images; now an attached image is handed straight to a vision-capable model, so "look at this" just works.

**The model list is current, and honestly priced.** Every provider's latest models are here for your own key — Claude Opus 4.8, Qwen 3.7 Max, the GLM-5 family, and Mistral's Large 3 / Medium 3.5 / Small 4 trio — each with pricing verified against the provider's own published rates, so the cost you see is the cost you pay.

**Sign-in that just works.** Connecting your account is faster and far harder to break. It now recovers from the things that used to fail it silently — a slow browser handoff, a reloaded window, a second editor open at the same time — instead of leaving you stuck on a screen that never finished.`,
    highlights: [
      'See what Ava is doing while she preps your request — the silent ten-second spinner now tells you she is reading and routing, not nothing.',
      'Attach an image and she actually reads it — screenshots, game viewports and mockups now go to a vision-capable model instead of "I can\'t see that".',
      'Every provider\'s latest models for your own key, with pricing verified against their published rates — Claude Opus 4.8, Qwen 3.7 Max, the GLM-5 family and Mistral\'s three-tier lineup.',
      'Sign-in is faster and far more reliable — it recovers from slow handoffs, reloaded windows and a second editor open, instead of failing silently.',
    ],
  },
  {
    migration: 314,
    version: '0.72.0',
    platform: 'extension',
    toolCount: 63,
    publishedAt: '2026-06-07 22:00:00+00',
    title: 'Choose how Ava thinks — Aurora and Supernova are live',
    body: `Since day one, Ava has run on Maestro — her Qwen-based brain. Now there are two more, each a different team of models tuned for a different kind of work, and both are live for everyone, on every plan.

**Aurora — a fully European stack.** Mistral, end to end, that never leaves EU infrastructure. Mistral Medium 3.5 leads — coordinator, Builder, vision and the deep specialists — with Small 4 carrying the high-volume work and Large 3 held in reserve. Built for GDPR-strict, public-sector and sovereignty-bound work where your data has to stay in Europe. If a Mistral model isn't reachable, Aurora stops rather than quietly routing elsewhere — that's the guarantee.

**Supernova — the best specialist for every step.** A polyglot ensemble: DeepSeek V4 Pro coordinates and hands each subtask to whichever model is best at it — Qwen builders for the agent loops, DeepSeek for deep reasoning and long context, the lighter tiers for the fast work. Frontier thinking where it counts, flash-tier economics on the rest.

**Free on every plan, or bring your own keys.** Both modes work on platform credits, free tier included. Prefer your own accounts? Add a Mistral key for Aurora, or DeepSeek + Qwen for Supernova — and bring-your-own-key now reaches every model in each fleet, on every surface.`,
    highlights: [
      'Aurora is live — a fully European, Mistral-only stack that never leaves EU infrastructure, led by Mistral\'s frontier Medium 3.5. Built for GDPR-strict and sovereign deployments.',
      'Supernova is live — a polyglot ensemble where DeepSeek V4 Pro coordinates and hands each subtask to its best-suited specialist, from Qwen builders to deep DeepSeek reasoning.',
      'Both modes run free on every plan, or with your own keys — add Mistral for Aurora, or DeepSeek + Qwen for Supernova.',
      'Bring-your-own-key now reaches every model in each fleet, on every surface — your key unlocks the whole lineup, not just part of it.',
    ],
  },
  {
    migration: 315,
    version: '0.73.0',
    platform: 'extension',
    toolCount: 63,
    publishedAt: '2026-06-08 14:00:00+00',
    title: 'Cook it From Scratch — a new way to browse the recipe library',
    body: `The recipe library has a new lens: **From Scratch**.

**Real food, nothing processed.** From Scratch recipes are made entirely from fresh ingredients — everything done by hand, no processed shortcuts. Open Health & Nutrition, hit the **From Scratch** toggle above the recipes, and the whole library narrows to just those. Look for the ✦ badge on a card and you know it qualifies, even while you're browsing everything.

**A free collection that keeps growing.** This isn't a fixed set — it fills out as more from-scratch recipes are added, so the library gets richer over time. Free for everyone, no account needed.`,
    highlights: [
      'New From Scratch filter in the recipe library — one tap narrows the whole collection to recipes made entirely from fresh ingredients, nothing processed.',
      'From Scratch recipes carry a ✦ badge, so they\'re easy to spot even when you\'re browsing everything.',
      'It composes with the course filters — From Scratch + Breakfast, From Scratch + Mains, and so on.',
      'A free, growing collection that fills out as more from-scratch recipes are added — no account needed.',
    ],
  },
  {
    migration: 350,
    version: '0.86.0',
    platform: 'extension',
    toolCount: 62,
    publishedAt: '2026-07-16 09:00:00+00',
    title: 'Your language, the whole way through — and live',
    body: `Ava has spoken 20 languages for a while, but the app around her didn't always keep up — pick a language and pockets of the interface stayed in English. This release closes that gap and makes the switch instant.

**The whole app, not just the chat.** Every page now speaks your language — Planner, Tasks, Memory, History, Design Studio, Learning, Settings, the lot. If it's text the app draws, it now reads in your tongue across 19 languages.

**Switch live — no restart.** Change your language once and the entire interface *and* Ava's replies follow on the spot. No reload, no losing your place.

**Pick your language from the first screen.** The welcome tour now opens with a language picker, so onboarding runs in your language from the very first step — and every language is shown both in your current language and its own, so yours is easy to find whichever way you came in.

**Settings that match across surfaces.** The extension's Settings are reorganised to mirror the IDE — General, Models, Behavior and Privacy — so the two feel like one product. The old Data tab is now Privacy, and you can replay the welcome tour any time from Settings → General.

**And a quiet fix that matters:** your tasks now travel with your exports and backups — they were being left behind before.`,
    highlights: [
      'The whole app is translated now, not just the chat — Planner, Tasks, Memory, History, Design Studio, Learning and Settings all switch with your language across 19 languages.',
      'Change your language and it applies live — the entire interface and Ava\'s replies both follow on the spot, with no restart.',
      'The welcome tour opens with a language picker, and every language is shown in both your current language and its own so yours is easy to find.',
      'Settings now mirror the IDE — General, Models, Behavior, Privacy — and your tasks are finally included in exports and backups.',
    ],
  },
  {
    migration: 351,
    version: '0.34.0',
    platform: 'ide',
    toolCount: 62,
    publishedAt: '2026-07-16 09:05:00+00',
    title: 'Your language, the whole way through — and live',
    body: `The IDE now speaks your language everywhere, and switches the moment you ask — no restart, no half-translated screens.

**The whole interface, not just the chat.** Every panel and page across the IDE now reads in your language, across 19 languages — the same depth the chat has always had.

**Switch live.** Change your language and the entire interface *and* Ava's replies follow immediately. Nothing to reload.

**From the first screen.** The welcome flow opens with a language picker, so onboarding runs in your language from step one — and each language is shown both in your current language and its own.

**Dates read the way your language writes them.** Day and date formatting now follows your locale throughout, instead of one fixed format.`,
    highlights: [
      'The whole IDE interface is translated now, not just the chat — every panel and page switches with your language across 19 languages.',
      'Change your language and it applies live — the interface and Ava\'s replies both follow immediately, with no restart.',
      'The welcome flow opens with a language picker, and each language is shown in both your current language and its own.',
      'Dates now format the way your language writes them, following your locale throughout.',
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
