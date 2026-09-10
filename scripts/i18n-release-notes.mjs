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
    migration: 431,
    version: '0.100.1',
    platform: 'extension',
    toolCount: 121,
    publishedAt: '2026-09-10 17:00:00+00',
    title: `You can see what I am doing while I am doing it`,
    body: `One fix, in the line that tells you what I am working on.

**It went quiet exactly when I got busy.** You would send a message, see something sensible like "Qwen 3.7 Plus is working", and then — the moment I actually started doing the job — nothing. The line vanished. Meanwhile the bar at the bottom carried on saying I was busy, so the two disagreed, and the one you were watching was the one that had gone dark. The longest, quietest stretch of a turn was the stretch with no explanation attached to it.

**Now it keeps up, and it says the real thing.** "Reading package.json", "Editing src/player.ts", "Running npm test", "Searching for /useState/" — the actual file, the actual command. When a step finishes it hands back to the model until the next one starts, so the gaps say something true rather than something left over.

That is worth more than knowing I am alive. If you are newer to this, the sequence IS the job: read the thing, change the thing, run the tests, read what broke. Watching it happen is how the shape of the work becomes obvious, and a spinner teaches nobody anything.

The desktop IDE gets the same detail. It had been keeping its line alive all along, but it only said what KIND of thing was happening — "Reading file..." — while the name of the file sat right there unused.`,
    highlights: [
      'The "what I am doing" line used to disappear the moment I started using a tool \u2014 the longest part of a turn \u2014 while the bottom bar still said I was working.',
      'It now names the actual file, command or search: "Editing src/player.ts", "Running npm test", and hands back to the model between steps.',
      'The desktop IDE gets the same detail \u2014 it kept its line alive already, but only said "Reading file..." while the filename sat unused on the same event.',
    ],
  },
  {
    migration: 430,
    version: '0.100.0',
    platform: 'extension',
    toolCount: 121,
    publishedAt: '2026-09-10 16:00:00+00',
    title: `Your fleets got cheaper and sharper on the same day`,
    body: `A fleet evaluation, which is something we mean to do regularly now — the point being that a fleet is defined by the LABS it may draw from, so whenever one of those labs ships something better, the fleet should get it without you doing anything.

**Qwen 3.8 Flash is a newer generation than the model it replaces, and costs a third.** That is not the usual trade. It is the production build of Flash-Next, Alibaba's preview of the Qwen4 architecture, so it arrived in the flash line before anywhere else: it beats Qwen 3.7 Plus on the agentic coding benchmarks, reads video as well as images, and prices at $0.15 against $0.40. Both vision seats move to it — attach a screenshot in Supernova or Longxiang and the model that looks at it is newer, sees more, and costs you about a third of what it did. Longxiang's long-context and teaching work moves with it.

**Longxiang's intent gate stops overpaying.** Before every turn, a small model reads what you asked and decides whether the job needs a full specialist team. Longxiang was running that on DeepSeek at three times the price of the model the other fleets use for the same job, for a call whose entire output is one word. It uses the same gate as everything else now.

**And both Qwen flash models are actually pickable.** Qwen 3.7 Flash has been in the catalogue since July with a note saying it was offered — and it was not, because the list that decides what appears in your picker had no entry for it. It does now, alongside 3.8 Flash. They are different tools: 3.8 is newer and stronger on agentic work, 3.7 has cheaper short prompts and reasons by default. Which suits your job is yours to decide; ours was making both reachable.

**DeepSeek is called by its name now.** It was showing as "DeepSeek Flash" because that is the id their API uses — but the id has no version in it, and the display name is what you read when choosing between models. It is DeepSeek V4.1 Flash. The companion and the credits page were each listing it twice; the model picker was offering it twice too.

**The model list stops offering two models that no longer exist.** Codestral and Devstral were retired in July and left the catalogue, but stayed in the settings dropdown — pick either and you selected something that could not run.

**Something slow in front of every turn, for anyone on an account.** That intent-gate call was supposed to skip the model's reasoning pass — it is a classifier, the thinking before the answer is pure waiting — and it does, on your own API key. Through a platform account the instruction was being dropped before the request went out, so every turn spent time and tokens reasoning about a one-word answer first. Only accounts were affected, which is why it went unseen for so long: the two paths disagreed and only one of them was wrong.

**Prices you are quoted now match prices you are charged.** The documentation listed five credit multipliers that no longer matched the biller — including DeepSeek at three times its real rate, and Qwen 3.8 Max at nearly double. Those figures are also what I read from when you ask what something costs, so I have been answering confidently and wrongly. They are corrected, and a test now fails the build if the two ever disagree again.

**And the models page shows benchmark scores** for the Qwen models, on their own row rather than mixed in with a different exam's numbers. Where a score has not been published, the space stays empty rather than borrowing a retired model's.`,
    highlights: [
      'Both vision seats move to Qwen 3.8 Flash: a newer generation than the model it replaces, reads video as well as images, and costs about a third.',
      'Longxiang\u2019s intent gate stops running on a model three times the price of the one every other fleet uses for the same one-word job.',
      'Qwen 3.7 Flash is finally pickable \u2014 it has been in the catalogue since July marked as offered, while missing from the list that decides what your picker shows.',
      'DeepSeek is named properly as DeepSeek V4.1 Flash, and no longer appears twice in the picker, the companion or the credits page.',
      'The settings dropdown stops offering Codestral and Devstral, retired in July \u2014 picking either selected a model that could not run.',
      'On an account, every turn was preceded by a hidden reasoning pass on a call that returns one word. The instruction to skip it was being dropped; BYOK was never affected.',
      'Five credit multipliers in the docs disagreed with what the biller charges, including DeepSeek at three times its real rate. Fixed, with a test that fails the build if they drift again.',
    ],
  },
  {
    migration: 428,
    version: '0.45.0',
    platform: 'ide',
    toolCount: 121,
    publishedAt: '2026-09-10 13:00:00+00',
    title: `Nothing you look at leaves this machine`,
    body: `Four changes, and the first one is the reason for the title.

**Desktop vision is on-device or it is off.** There was a cloud lane — a hosted model that looked at your screen for you — and it is gone: the call, the key field, the Fast option, the provider row, and the plumbing under all of it. There is now no setting under which a screenshot leaves this machine. That is a deliberate absence rather than a default, because "we have no cloud option" is a claim you can check, and "local unless you add a key" is an invitation to ask whether it CAN send your screen somewhere. Your screen is the most sensitive surface you own — the banking tab, the client email, the thing behind the thing you asked about. If you had chosen the fast cloud option, you move to on-device rather than to off: you wanted me to be able to see, and this keeps that while making it more private than the setting you picked.

The description of that lane used to state how long a look takes — half a minute on a laptop, a couple of seconds on a gaming PC. Nobody had measured it. Those numbers are out until they exist, and you are no longer told to download a model you already have.

**I can see a picture whichever lab you buy from.** Attaching an image needed a model that reads images, and the chain that found one knew about exactly two Qwen models. If your only key was Zhipu, Moonshot, Mistral, Xiaomi or MiniMax you got no answer at all — while holding GLM-5.3 Flash, K3, Mistral Medium, MiMo or M3, every one of which reads images perfectly well. It now asks the catalogue who can actually see rather than reciting names, picks the cheapest one you hold a key for, and uses a managed model first so you are not spending your own key describing a picture.

**The storage bar stops counting your own code as mine.** Projects moved under the Ava folder, so the scan that measures my footprint found your source trees sitting there and reported them as my data — then counted them again as your half of the same bar. It skips them now, by a rule kept in one place, because the app and its helper walk your disk separately and a rule written twice is a rule that gets fixed once.

**DeepSeek is one model now.** They retired V4 Pro into V4.1 Flash on the 10th of September, and every DeepSeek seat here runs the one model. It costs roughly a third of what the old lead seat did, it reads images, and it can write about forty-seven times more in a single answer than the ceiling we had recorded — which was set too low, and a limit set too low truncates rather than fails. If you had a retired model picked, it still works: the old name is rewritten here before the request goes out, rather than trusting a vendor redirect whose start date DeepSeek's own notice and documentation disagree about.`,
    highlights: [
      'Desktop vision is on-device or it is off. The cloud lane is gone entirely — there is now no setting under which a screenshot leaves this machine.',
      'Images work whichever lab you buy from: the describer asks the catalogue who can see rather than knowing about two Qwen models, so a Zhipu, Moonshot, Mistral, Xiaomi or MiniMax key is no longer a blank answer.',
      'The storage bar stops reporting your own source as my data and counting it twice.',
      'DeepSeek is a single model: about a third the cost of the old lead seat, it reads images, writes far longer answers without truncating, and saved settings pointing at a retired name still work.',
    ],
  },
  {
    migration: 427,
    version: '0.99.0',
    platform: 'extension',
    toolCount: 121,
    publishedAt: '2026-09-10 12:00:00+00',
    title: `DeepSeek is one model now, and it costs a fraction of what it did`,
    body: `DeepSeek retired V4 Pro on the 10th of September and replaced it with V4.1 Flash, which their own notice says surpasses it across every key metric. So there is no longer a big DeepSeek and a cheap one. There is one, and every place I used either of them now uses it.

**It costs a third of what it did.** Supernova's lead seat was the expensive one — it ran the coordinator, planning, security, long-context work and the deep specialists, and it carried the price to match. On the same measured traffic that seat now costs about a third per turn. If you run Supernova on credits, that is the whole change in one sentence; nothing about the routing got cheaper, the model underneath it did. On your own DeepSeek key you simply pay DeepSeek less.

**And it can see.** Both of the old models were blind at the API level, so when you attached a screenshot to a Supernova turn I had to run a second model just to describe the picture to myself, then work from the description. V4.1 Flash reads the image itself. That bridge was already written to step aside for a coordinator that can see, so it does — you get the picture looked at directly instead of relayed through someone else's words.

**Long answers stop being cut off.** The old entry said I could write 8,192 tokens in a single response. The real ceiling is 384,000 — a difference of about forty-seven times, and the wrong kind of wrong, because a limit that is too low does not fail. It truncates. Long files, long plans and long reviews were being quietly clipped at the end rather than refused at the start.

**Your saved settings keep working.** If you had V4 Pro or V4 Flash picked, or one of the older \`deepseek-chat\` / \`deepseek-reasoner\` ids in a config somewhere, it still runs — I rewrite the retired name to the live one before the request leaves your machine. DeepSeek offer a redirect of their own, but their notice and their documentation disagree by four days about when it starts, and a request that leaves here carrying a dead model id is a request whose price somebody else decides. So we do it ourselves.

**The models page was showing you the same model twice.** Both cards said DeepSeek Flash, one priced at $0.66 and the other at $0.22, and neither was what DeepSeek charges. It is one card now at the real rate — $0.15 in and $0.60 out per million off-peak, exactly double during DeepSeek's peak window, which is quoted as a range because if you are working outside European hours you genuinely pay the top of it. The benchmark bars on that card are empty on purpose: the scores that were there belong to V4 Pro, and I would rather show you nothing than show you a retired model's numbers with a new model's name on them.

**And a pricing claim that was never true.** The credits FAQ said premium reasoning costs more and gave V4 Pro at six times the base rate as the example. V4 Pro was not six times the base — Kimi K3 is. The sentence had been describing the right idea with the wrong model's name attached, so it names K3 now. DeepSeek, meanwhile, has gone the other way entirely and is one of the cheap ones.`,
    highlights: [
      "DeepSeek retired V4 Pro into V4.1 Flash, so there is one DeepSeek model instead of two — and Supernova's most expensive seat now costs about a third per turn.",
      'It reads images. Both predecessors were blind, so a screenshot on a Supernova turn had to be described to me by a second model first; now it is looked at directly.',
      'Long answers stop being clipped: the output ceiling was recorded as 8,192 tokens against a real 384,000, and a limit set too low truncates rather than fails.',
      'Saved settings keep working — retired model ids are rewritten here before the request goes out, rather than relying on a vendor redirect whose start date their own notice and docs disagree about.',
      'The models page listed the same model twice at two different wrong prices. One card now, at the real rate, with benchmark bars left empty rather than showing a retired model\u2019s scores.',
      'The credits FAQ said V4 Pro cost six times the base rate. It never did — Kimi K3 does — so it names the right model, and DeepSeek is now one of the cheap ones.',
    ],
  },
  {
    migration: 417,
    version: '0.97.0',
    platform: 'extension',
    toolCount: 122,
    publishedAt: '2026-08-29 12:00:00+00',
    title: `Ava works without an account, and every mode can do its job`,
    body: `The biggest release in a while, and most of it is things that looked like they were working.

**Signing out was hiding your own files.** Your data is stored per account, under a folder named for it. Sign out and the name went, the folder went with it, and the Library, journal, tasks, health and learning all read an empty directory instead — while the storage bar in the same window went on counting the gigabyte that was still there. Nothing had been deleted; I was looking in the wrong place. Signed out I now go and find that folder on disk rather than needing to have been told where it is, which matters because the people this hurt were already signed out before the fix existed.

**And signing out replaced the whole dashboard with a sign-in page.** It did that while you held working API keys, because a stored "use the platform" preference outranked the check for whether you had any keys — a preference outliving the thing it was a preference about. Signing in is a page you choose from the sidebar now, not a wall you are held behind. Ava is local-first; an account adds credits and support, and never decides whether the app opens.

**Your own spend, without an account.** The usage view could only ever describe platform credits, which is the one number that means nothing if you are paying a provider directly — so for BYOK users it was blank. It shows your tokens, your per-model split and an estimated cost now, this month or all time, from counters on your machine. Completed months used to be thrown away at the turn of the month; they are kept, so there is something to compare against.

**The model list follows the switch beside it.** Platform mode listed every model in the catalogue including ones no plan can reach — rows you could only fail at. It offers what your plan actually serves now, and on API Key the whole catalogue, selectable, with the composer saying which key a model needs before you have typed anything rather than after.

**No mode could open a file.** The file tools were renamed — file_read became read — and the lists saying which tools each mode may use kept the old names. A name that does not exist does not error; it matches nothing, so the tool is silently withheld. Plan mode could search a codebase and then not read what it found. Teach, Security, Write and all four rooms the same: seventeen dead entries across seven modes.

**And the builder could not write code.** The same rename in the persona lists — twenty of my twenty-four specialists could not open a file, including the one whose entire job is writing code. Every orchestrated build ran that way. There are guards over all of it now, each written to fail against the real bug rather than a guess at it.

**Coding turns get their context back.** Every turn in code mode was handed every tool I have — the health room, the recipe desk, the newsroom, the gym — around 25,000 tokens of it, spent describing how to log a meal to someone writing TypeScript. Code mode gets the tools that belong to the work now, and that space is your files instead: more of the real thing in front of me before anything has to be summarised away. Code mode also has a briefing of its own for the first time; it was the default you got without choosing, running on the generic prompt.

**Plan mode really only plans.** It never held write tools itself, but it could dispatch builders that were not bound by that — so a plan could quietly become eleven tasks and an edited project. It checks before dispatching now. An accepted plan is written into your Decisions folder with the approaches not taken, and Plan reads that folder before proposing anything: contradicting something settled has to be said out loud.

**A plan arrives as a card, not as JSON.** Some models write the tool call out as text instead of calling it, and you got a wall of markup where a plan belongs. It is recovered and rendered properly now — narrowly, so ordinary prose can never be mistaken for a call — and held back while it streams rather than painted on screen and then replaced.

**Video runs from 2 to 30 seconds,** priced by the second, so a five-second clip costs half what it did and every length shows its price before you choose. It offered 5 or 10 before: a limit belonging to a model replaced twice over. Length is decided before the writing now rather than derived from however much I happened to write, with a beat of air before the voice starts and after it stops.

**A render you walk away from still finishes.** A Studio panel above the calendar shows what is generating, with a live clock — go anywhere, the work carries on. Clips and voiceovers always reach your Library now, with the words I actually spoke rather than a shortened title; they could play on screen and quietly never save.

**Documents open beside the conversation.** A pane next to the chat, freely editable, saving as you type, with export to Word, PDF or ODF — the open format needs no extra software at all. The Library groups a document and its exports into one card instead of three unrelated files, and deleting one takes its exports with it instead of orphaning them.

**Starting a new project actually starts one.** Asked for a new app while another project was open, I could only build it INSIDE that one — every file tool I have is confined to the project you have open, which is right, and left me nowhere to put a new thing. So a fresh app landed inside somebody's existing repo, one a commit-all away from a commit they never wanted. I can now create a folder in your projects home (~/Ava Projects unless you have moved it), and it arrives with its Decisions folder already in it. That is the only place outside your open project I can write, it makes one empty directory, and it will not touch a folder that already exists.

**Stop means stop — including when I am only talking.** Told to stop I would acknowledge it and then carry on out loud: still diagnosing, still laying out the fix. From where you are sitting there is no difference between that and ignoring you, and the pull to add one more useful thing is strongest in the seconds after something has gone wrong. A stop now gets one line — what I was mid-way through and what state it is in — and then I wait.

**And I stop looping.** Nothing told me when to give up on an approach, so a failure would get tried again with the same idea in different words. The third attempt never feels like the third; it feels like finally understanding the error. So the test is no longer a count: it is whether I can say what is actually different about this attempt, and if I cannot then it is the same attempt. On the third failure I stop and show you the error itself, what I tried, and what needs deciding — that is the finding, not me giving up.

**And "fixed" now means I watched it work.** Reading the code and finding every piece in place tells you it LOOKS right, which is not the same as seeing it run — the value can die at the one line I did not open while everything I checked stays correct. When I have only read it, I say so.

**And the honest small things.** The thinking line says only what I actually know, with a timer, instead of rotating four invented phrases. Ticking a subtask, editing a task and loading your secrets had all been silently doing nothing here. My working notes are out of your task list — they were never your commitments. Over 120 tools, counted rather than claimed, in twenty languages.`,
    highlights: [
      'Signing out hid your own files. Data is stored per account; without the account name I read an empty folder while the storage bar counted the gigabyte still sitting there.',
      'Signing out also replaced the dashboard with a sign-in page — while you held working keys. Ava is local-first: an account adds credits and support, never access.',
      'Usage works without an account: your tokens, your per-model spend and an estimated cost, from counters on your machine. Completed months are kept instead of discarded.',
      'Starting a new project creates one in your projects home, with its Decisions folder ready — instead of building inside whatever project happened to be open.',
      'Stop now means stop, including in prose — and a failed approach gets three attempts, then the error and a question, instead of the same idea tried again in different words.',
      'No mode could open a file, and the builder could not write code — a rename left the tool lists pointing at names that no longer existed, so they were withheld in silence.',
    ],
  },
  {
    migration: 418,
    version: '0.44.0',
    platform: 'ide',
    toolCount: 122,
    publishedAt: '2026-08-29 12:00:00+00',
    title: `No account, no lost work — and picking a mode gives you the mode`,
    body: `This release closes most of the gap between the IDE and the extension, and the first item is the one that explains why this surface has felt less sharp.

**Signing out was hiding your own files.** Your data lives under a folder named for your account. Sign out and I read a different, empty one — an empty Library, no journal, no tasks — while the storage bar at the top of the same window went on counting the gigabyte still there. Nothing was deleted. Signed out I now look for that folder on disk instead of needing to have been told where it is.

**And the Command Centre asked you to connect to see data already on your machine.** Tasks, journal, memory and learning are all read from your own disk and always were — the code that fetched them said so — and then the screen threw the result away and printed "connect your account" instead. Your plans had the same shape of problem for a different reason: they are Markdown files in your project, but they were fetched through the agent, so no key meant no plans. They are read straight from the folder now.

**Your own spend, without an account.** The usage view could only describe platform credits, which means nothing if you are paying a provider directly. It shows your tokens, your per-model split and an estimated cost, this month or all time. The cost was also being counted twice — once at each model's real price, once at a default rate — so if you were using that figure to judge what you were spending, it was too high.

**The model list follows the switch beside it,** offering what your plan serves on Platform and the whole catalogue on API Key, with the composer naming the key a model needs before you type. And "Local model off" — which meant "there is no key for me to run on" — now says which, and takes you to where you add it.

**Choosing a mode sent me its label and nothing else.** That label is what my tools are filtered by — so picking Plan or Brainstorm took my toolbox away and never gave me the brief that justifies it. Fewer tools, no instructions, and no way for either of us to see why. Every mode now arrives with its own briefing, the way it always has in the extension.

**Seven of the nine voices did not exist.** Only two names in the picker were real, and the one selected by default was not among them, so choosing almost any voice failed outright. Every voice offered now is one the model actually has, checked name by name against it.

**No mode could open a file, and the builder could not write code.** A rename left the tool lists pointing at names that no longer existed, and a name that does not exist is withheld silently rather than reported. Twenty of my twenty-four specialists could not read a file, including the one whose job is writing code.

**Coding turns get their context back.** Every turn in code mode carried every tool I have — around 25,000 tokens of it, describing the recipe desk to someone writing TypeScript. Code mode gets the tools that belong to the work now, and has a briefing of its own for the first time.

**The Library could never show a document.** It read the project folder from a setting nothing writes, so the scan returned before it started and the tab stayed permanently empty. A signed-out window also drew "connect your account" over files sitting on your own disk.

**Documents open beside the conversation,** freely editable and saving as you type, with export to Word, PDF or ODF. Deleting a document removes its exports rather than orphaning them, and asks properly first.

**Video runs from 2 to 30 seconds,** priced by the second, and a render you walk away from still finishes — a Studio panel above the calendar shows what is generating. Clips and voiceovers always reach your Library with the words I actually spoke, and a voiceover shows a waveform there so a read looks like audio at a glance.

**A plan is a card you can answer.** There was no plan card here at all, so when I offered a choice between approaches it rendered as a generic permission banner and the question was never really put to you. Your project's decision records now have their own tab, read from disk.

**Starting a new project actually starts one.** Asked for a new app while another project was open, I could only build it INSIDE that one — every file tool I have is confined to the project you have open, which is right, and left me nowhere to put a new thing. So a fresh app landed inside somebody's existing repo, one a commit-all away from a commit they never wanted. I can now create a folder in your projects home (~/Ava Projects unless you have moved it), and it arrives with its Decisions folder already in it. That is the only place outside your open project I can write, it makes one empty directory, and it will not touch a folder that already exists.

**Stop means stop — including when I am only talking.** Told to stop I would acknowledge it and then carry on out loud: still diagnosing, still laying out the fix. From where you are sitting there is no difference between that and ignoring you, and the pull to add one more useful thing is strongest in the seconds after something has gone wrong. A stop now gets one line — what I was mid-way through and what state it is in — and then I wait.

**And I stop looping.** Nothing told me when to give up on an approach, so a failure would get tried again with the same idea in different words. The third attempt never feels like the third; it feels like finally understanding the error. So the test is no longer a count: it is whether I can say what is actually different about this attempt, and if I cannot then it is the same attempt. On the third failure I stop and show you the error itself, what I tried, and what needs deciding — that is the finding, not me giving up.

**And "fixed" now means I watched it work.** Reading the code and finding every piece in place tells you it LOOKS right, which is not the same as seeing it run — the value can die at the one line I did not open while everything I checked stays correct. When I have only read it, I say so.

**A home for your projects,** at ~/Ava Projects by default — visible, not buried in hidden application data where backup tools skip it. The storage bar counts project data as its own line instead of folding it into "Other".`,
    highlights: [
      'Signing out hid your own files. Data is stored per account; without the account name I read an empty folder while the storage bar counted the gigabyte still sitting there.',
      'The Command Centre asked you to connect to see tasks, journal, memory and learning that were already read from your own disk. Plans went through the agent, so no key meant no plans.',
      'Usage works without an account, and the estimated cost was being counted twice — once at each model\'s price and again at a default rate.',
      'Starting a new project creates one in your projects home, with its Decisions folder ready — instead of building inside whatever project happened to be open.',
      'Stop now means stop, including in prose — and a failed approach gets three attempts, then the error and a question, instead of the same idea tried again in different words.',
      'Picking a mode used to send only its label — which is what filters my tools. A mode took the toolbox away without giving me the brief. Now it gives you both.',
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

**A Windows path arriving on a Linux machine** was creating a strangely-named file inside your project instead of being refused. Nothing escaped the project on either platform, but one input behaved two different ways depending on the machine.

**Stop means stop — including when I am only talking.** Told to stop I would acknowledge it and then carry on out loud: still diagnosing, still laying out the fix. From where you are sitting there is no difference between that and ignoring you, and the pull to add one more useful thing is strongest in the seconds after something has gone wrong. A stop now gets one line — what I was mid-way through and what state it is in — and then I wait.

**And I stop looping.** Nothing told me when to give up on an approach, so a failure would get tried again with the same idea in different words. The third attempt never feels like the third; it feels like finally understanding the error. So the test is no longer a count: it is whether I can say what is actually different about this attempt, and if I cannot then it is the same attempt. On the third failure I stop and show you the error itself, what I tried, and what needs deciding — that is the finding, not me giving up.

**A new tool: create_project.** Every file tool is confined to the project you have open, so "start me a new project" had no honest answer — the only place I was allowed to write was inside the project you were already in. It creates one directory in your projects home and scaffolds a Decisions folder into it. Deliberately not a wider permission: it cannot write files, cannot adopt a folder that already exists, and cannot reach anywhere else.

**And some of what I told you about myself was out of date.** I said I had 110+ tools in fifty-eight places, including my own briefing, where I tell you what I can do — it is over 120. Six screens still offered cloud sync months after it was switched off, two of them pointing at a toggle that no longer exists. A tagline advertised "2 free models" when there are none and never were: the Free plan is 300 credits a month, and every action draws from it. None of that changes what the product does. It changes whether what I say about it can be trusted, which is the part I would rather get right.`,
    highlights: [
      'The lists deciding which tools each mode and persona may use named tools that no longer existed — withheld in silence, never reported.',
      'Code mode was carrying every tool I have: around 25,000 tokens a turn describing the recipe desk to someone writing TypeScript.',
      'Every mode carries its own brief now. Code mode had none, Brainstorm could not open a file, and Security could not propose a plan.',
      'A journal day that could not be read was being overwritten with an empty one, and the write reported success.',
      'Some of what I said about myself was wrong: 110+ tools in fifty-eight places when it is over 120, and screens still offering a cloud sync switched off months ago.',
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
/**
 * QWEN KEY FIRST, ALWAYS. This is internal tooling — translating strings has
 * no business spending customer-facing platform credits, and every call
 * through the platform endpoint is metered.
 *
 * It used to prefer the platform credential twice over: AVA_PLATFORM_KEY
 * before QWEN_API_KEY, then config.json's platformKey before the qwen key in
 * the same file. With no env vars set, which is the normal case, that billed a
 * platform account silently. A benchmark and a translation run between them
 * emptied a monthly allowance on a test account that way.
 *
 * Reads packages/web/.env.local directly so it does not depend on anyone
 * remembering to export anything first.
 */
function qwenKeyFromEnvFile() {
  try {
    const p = path.join(repoRoot, 'packages', 'web', '.env.local');
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*QWEN_API_KEY\s*=\s*(.*)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '') || null;
    }
  } catch { /* ignore */ }
  return null;
}

function resolveCredential() {
  if (process.env.QWEN_API_KEY) return { kind: 'qwen', key: process.env.QWEN_API_KEY };

  const fromFile = qwenKeyFromEnvFile();
  if (fromFile) return { kind: 'qwen', key: fromFile };

  try {
    const cfgPath = path.join(os.homedir(), '.ava', 'config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg?.providers?.qwen?.apiKey) return { kind: 'qwen', key: cfg.providers.qwen.apiKey };
    }
  } catch { /* ignore */ }

  // Platform is the LAST resort and announces itself. Falling back is fine;
  // falling back quietly is what this cost us.
  const platform = process.env.AVA_PLATFORM_KEY || (() => {
    try {
      const cfgPath = path.join(os.homedir(), '.ava', 'config.json');
      if (fs.existsSync(cfgPath)) return JSON.parse(fs.readFileSync(cfgPath, 'utf8'))?.platformKey || null;
    } catch { /* ignore */ }
    return null;
  })();

  if (platform) {
    console.warn('\n  !!  No Qwen key found — falling back to a PLATFORM key.');
    console.warn('      Every call will be METERED against that account\'s credits.');
    console.warn('      Put QWEN_API_KEY in packages/web/.env.local to avoid this.\n');
    return { kind: 'platform', key: platform };
  }
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
    // RETRY, like a 500 or a timeout. A reply that comes back short is just as
    // transient as a failed request — the same locale succeeds on the next
    // attempt — but this path threw on the first try while a network error got
    // three. One locale dropping a highlight then blocked the whole migration
    // and needed a human to re-run the script, repeatedly.
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      return translateOne(locale, release, attempt + 1);
    }
    throw new Error(`incomplete translation (title=${typeof parsed.title}, highlights=${highlights.length}/${release.highlights.length})`);
  }

  // Bodies are the one field long enough for a model to quietly truncate, and a
  // half-translated release note is worse than an English one. Reject anything
  // that lost a paragraph or came back suspiciously short, and let the retry
  // handle it — silent partial output is the failure mode worth designing out.
  const paras = (t) => t.split(/\n\s*\n/).filter((p) => p.trim()).length;
  // Same retry as a short highlight list and a 5xx: a body that comes back
  // truncated is a transient bad completion, not a permanent one — German
  // returned 9 of 10 paragraphs once and all 10 on the next attempt. Without
  // this, one locale dropping one paragraph blocks the whole migration and
  // needs a person to re-run the script.
  // An English reply is a bad completion like any other — the same locale
  // succeeds next attempt. Checked here rather than in the caller so it can
  // retry on the same budget as a 5xx, a timeout and a short body.
  const cameBackEnglish = parsed.title === release.title
    || (typeof parsed.body === 'string' && parsed.body === release.body);
  if (cameBackEnglish && attempt < 3) {
    await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    return translateOne(locale, release, attempt + 1);
  }

  const bodyBad = (typeof parsed.body !== 'string' || !parsed.body.trim())
    || paras(parsed.body) < paras(release.body);
  if (bodyBad && attempt < 3) {
    await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    return translateOne(locale, release, attempt + 1);
  }
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
        // PER FIELD, not all-or-nothing. This used to require the title AND
        // the body to both match English, so a reply with a translated body
        // and an English title passed — which is exactly what Japanese did on
        // these notes: body and every highlight in Japanese, heading in
        // English, and nothing reported it. A whole sentence coming back
        // byte-identical is not a translation in any of these languages.
        const englishFields = [];
        if (t?.title === release.title) englishFields.push('title');
        if (t?.body === release.body) englishFields.push('body');
        const enHighlights = release.highlights || [];
        const sameHighlights = (t?.highlights || []).filter((h) => enHighlights.includes(h));
        if (sameHighlights.length) englishFields.push(`${sameHighlights.length} highlight(s)`);
        if (englishFields.length) {
          // Retry, for the same reason a short body or a 5xx does: a reply
          // that comes back in English is a bad completion, not a permanent
          // one — the same locale succeeds on the next attempt. This threw on
          // the first try while every other content failure had three, which
          // meant one locale ignoring the instruction blocked the migration
          // and needed a person to re-run the script.
          // Retried inside translateOne, where the attempt counter lives —
          // see the identical-to-English check beside the other content
          // guards there. Reaching HERE means three attempts all came back in
          // English, which is a real failure rather than a flaky one.
          throw new Error(`came back identical to English (${englishFields.join(', ')}) — treating as a failed translation`);
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
