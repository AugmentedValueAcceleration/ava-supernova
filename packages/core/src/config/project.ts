import { existsSync } from 'node:fs';
import { readFile, readdir, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { todayLocal } from '../core/dates.js';
import {
  loadProjectConfig,
  type DecisionsOptInStatus,
} from './project-config.js';

/** Markers that indicate a directory is a project root (checked in order). */
const PROJECT_MARKERS = ['.ava', '.git', 'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', '.hg'];

/**
 * Walk up from `startDir` looking for a project root.
 * Returns the first directory containing a project marker, or null.
 */
export function detectProjectRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    for (const marker of PROJECT_MARKERS) {
      if (existsSync(join(dir, marker))) {
        return dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

/** The standard path for project instructions. */
export function getInstructionsPath(projectRoot: string): string {
  return join(projectRoot, '.ava', 'instructions.md');
}

/**
 * Load project instructions from `.ava/instructions.md`.
 * Returns the file contents, or null if the file doesn't exist or is empty.
 */
export async function loadProjectInstructions(projectRoot: string): Promise<string | null> {
  const instructionsPath = getInstructionsPath(projectRoot);
  try {
    const content = await readFile(instructionsPath, 'utf-8');
    return content.trim() || null;
  } catch {
    return null;
  }
}

const INSTRUCTIONS_TEMPLATE = `# Project Instructions for Ava

<!--
  This file is loaded automatically when Ava starts in this project directory.
  Write project-specific context, conventions, and architecture notes here.
  Ava will include this in her system prompt for every conversation.
-->

## Project Overview
<!-- Describe what this project does -->

## Tech Stack
<!-- List languages, frameworks, and key dependencies -->

## Architecture
<!-- Describe the project structure and key patterns -->

## Conventions
<!-- Coding style, naming conventions, testing practices -->

## Important Notes
<!-- Anything Ava should always keep in mind -->
`;

/**
 * Scaffold `.ava/instructions.md` in the given directory.
 * Returns the path to the created file, or null if it already exists.
 */
export async function scaffoldProjectInstructions(projectRoot: string): Promise<string | null> {
  const instructionsPath = getInstructionsPath(projectRoot);
  if (existsSync(instructionsPath)) {
    return null; // already exists
  }
  await mkdir(join(projectRoot, '.ava'), { recursive: true });
  await writeFile(instructionsPath, INSTRUCTIONS_TEMPLATE, 'utf-8');
  return instructionsPath;
}

// ─── Decisions folder ───────────────────────────────────────────────────────
//
// Durable, project-scoped context layer. Lives at `<projectRoot>/Decisions/`,
// committed to git, human-readable, edited by both Ava and the user. Holds the
// project's declared direction: overview, context, design tokens, architecture
// records, voice, assets, ideas, progress.
//
// Created only on user opt-in (never silently). Opt-in status is persisted in
// `.ava/project-config.json` at the project root.

export const DECISIONS_DIR_NAME = 'Decisions';

export function getDecisionsRoot(projectRoot: string): string {
  return join(projectRoot, DECISIONS_DIR_NAME);
}

export function hasDecisionsFolder(projectRoot: string): boolean {
  return existsSync(getDecisionsRoot(projectRoot));
}

export interface DecisionsState {
  /** True if `Decisions/` exists at the project root. */
  hasFolder: boolean;
  /** Combined contents of overview.md + context.md + progress.md, plus a
   *  filename index of records/, if present. */
  context: string | null;
  /** Per-project opt-in status from `.ava/project-config.json`. */
  optInStatus: DecisionsOptInStatus;
}

/**
 * Read the backbone of the Decisions folder for injection into the system
 * prompt at session start: `overview.md`, `context.md` and `progress.md`
 * (full, each capped), plus a filename INDEX of `records/` (names only — Ava
 * reads the relevant record on demand via file_read instead of re-deriving a
 * decision already on file). Returns null if nothing readable exists.
 *
 * Deeper docs (design/*.md, individual record bodies) are deliberately left
 * out here — design files get fresh re-injection before UI edits, and record
 * bodies are reference-on-demand to keep the prompt bounded.
 */
export async function loadDecisionsContext(projectRoot: string): Promise<string | null> {
  const root = getDecisionsRoot(projectRoot);
  if (!existsSync(root)) return null;

  const parts: string[] = [];
  const files: Array<{ name: string; header: string }> = [
    { name: 'overview.md', header: 'Overview' },
    { name: 'context.md',  header: 'Context' },
    { name: 'progress.md', header: 'Progress (shipped / next / blocked)' },
  ];

  for (const { name, header } of files) {
    try {
      const raw = await readFile(join(root, name), 'utf-8');
      const trimmed = raw.trim();
      // Cap each file so one long doc can't dominate the system prompt.
      if (trimmed) parts.push(`### ${header}\n${trimmed.slice(0, 4000)}`);
    } catch {
      /* file doesn't exist — skip */
    }
  }

  // Records index — names only, so Ava knows what decision records exist and
  // can read the relevant one on demand rather than re-deciding from scratch.
  try {
    const records = (await readdir(join(root, 'records')))
      .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
      .sort();
    if (records.length > 0) {
      parts.push(`### Decision records (read \`Decisions/records/<file>\` on demand)\n${records.map((f) => `- ${f}`).join('\n')}`);
    }
  } catch {
    /* no records/ dir — skip */
  }

  if (parts.length === 0) return null;
  return parts.join('\n\n');
}

/**
 * Load full Decisions state for a project — folder presence, context content,
 * and opt-in status from project config. Used at session start to build the
 * system prompt and tell Ava how to behave with respect to the convention.
 */
export async function loadDecisionsState(projectRoot: string): Promise<DecisionsState> {
  const [config, context] = await Promise.all([
    loadProjectConfig(projectRoot),
    loadDecisionsContext(projectRoot),
  ]);
  return {
    hasFolder: hasDecisionsFolder(projectRoot),
    context,
    optInStatus: config.decisionsOptIn ?? 'not-asked',
  };
}

// ── Machine-global decisions (standing rules) ──────────────────────────────
// Desktop automation operates the whole MACHINE, which spans projects — so its
// standing rules ("never auto-send", "save reports to D:\\Work", "don't close
// my browser tabs") live at the global AVA_HOME level, NOT a project Decisions/
// folder. Same append-only, human-readable backbone as the project Decisions
// folder — just machine-scoped. Ava reads these before every desktop turn and
// is expected to obey them.

const MACHINE_RULES_FILE = 'machine-rules.md';

/** The machine-global Decisions root: `<globalDir>/Decisions`. */
export function getGlobalDecisionsRoot(globalDir: string): string {
  return join(globalDir, DECISIONS_DIR_NAME);
}

/**
 * Append a standing machine rule (append-only). Creates the folder + file on
 * first use. Deduped on the rule text (case-insensitive) so the same rule isn't
 * stored twice. Tags are optional provenance (e.g. ['desktop', 'email']).
 */
export async function appendMachineRule(
  globalDir: string,
  rule: string,
  tags: string[] = [],
): Promise<boolean> {
  const clean = rule.trim();
  if (!clean) return false;
  const root = getGlobalDecisionsRoot(globalDir);
  await mkdir(root, { recursive: true });
  const file = join(root, MACHINE_RULES_FILE);
  let existing = '';
  try { existing = await readFile(file, 'utf-8'); } catch { /* new file */ }
  // Dedup: skip if this exact rule text is already recorded.
  if (existing.toLowerCase().includes(clean.toLowerCase())) return false;
  const header = existing.trim()
    ? ''
    : '# Standing rules for this machine\n\n'
      + 'Append-only. Ava reads these before every desktop turn and obeys them.\n\n';
  const date = todayLocal();
  const tagStr = tags.length ? ` _(${tags.join(', ')})_` : '';
  await appendFile(file, `${header}- **[${date}]** ${clean}${tagStr}\n`);
  return true;
}

/** Read the standing machine rules (for injection into desktop turns). Null if none. */
export async function loadMachineRules(globalDir: string): Promise<string | null> {
  try {
    const raw = await readFile(join(getGlobalDecisionsRoot(globalDir), MACHINE_RULES_FILE), 'utf-8');
    const trimmed = raw.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

// ─── Worked-example templates ───────────────────────────────────────────────
//
// Every template below ships with a short worked example so new developers
// can see what "good" looks like instead of staring at a blank skeleton. The
// examples use one consistent hypothetical project ("Chronicle — a personal
// reading tracker") so the files form a coherent worked example when read
// together. Each file is clearly marked "Example — replace with your own" so
// there's no confusion about what's real and what's a placeholder.
//
// The point is apprenticeship: new devs learn by pattern, not by instruction.

const DECISIONS_OVERVIEW_TEMPLATE = `# Project Overview

> _Example — replace with your own._

**Chronicle** is a personal reading tracker for people who read 30+ books a
year and want to see patterns in what they love. Target user: committed
readers who've outgrown Goodreads' social features and just want private,
beautiful analytics on their reading life.

Launch goal: one hundred books tracked across the first two months, with at
least ten users reporting that the pattern insights changed what they picked
next.
`;

const DECISIONS_CONTEXT_TEMPLATE = `# Project Context

> _Example — replace with your own._

## Stack
- **Framework:** Next.js 15 (app router, RSC-first)
- **Styling:** Tailwind 4 with CSS variables for design tokens
- **DB:** PostgreSQL via Drizzle ORM
- **Hosting:** Vercel (production), Node 22+ for local dev

## Conventions
- File naming: \`kebab-case\` for files, \`PascalCase\` for components
- One component per file, co-located styles in the same folder
- Server actions live in \`app/_actions/\`, never inside components
- Commit messages follow conventional commits (\`feat:\`, \`fix:\`, \`chore:\`)

## House Rules
- No client-side state for anything that can be server-rendered
- Forms always use server actions — never \`fetch\` + \`POST\` from the client
- If a dependency has a pure-Node alternative, prefer it
- All text is markdown-first, rendered at the edge
`;

const DECISIONS_PALETTE_TEMPLATE = `# Palette

> _Example — replace with your own._

Every token has a **name, a value, and a reason**. If you can't explain why
you picked a colour, you haven't picked it — you've guessed.

## Tokens

- **\`--color-bg\`: \`#0A0A0F\`** — near-black with a cool undertone. Warmer
  than pure black so long-read content doesn't feel sterile, but dark enough
  that UI accents pop.
- **\`--color-fg\`: \`#F5F5F7\`** — warm off-white. Pure white is fatiguing on
  dark backgrounds; this reads cleaner and matches the cool-black bg.
- **\`--color-accent\`: \`#9333EA\`** — vivid purple. Passes AA contrast
  against the bg (7.1:1), signals "technical + creative" without being
  cliché-blue. Never use for body text.
- **\`--color-danger\`: \`#EF4444\`** — red, reserved exclusively for
  destructive actions. Never for general emphasis — reserving it preserves
  its signal weight.

## Why these choices
Purple accent was chosen over teal because the brand voice leans "confident
craft" rather than "friendly startup." Pure black was rejected because this
product shows long-form content and needed eye comfort for 20-minute reading
sessions.
`;

const DECISIONS_TYPOGRAPHY_TEMPLATE = `# Typography

> _Example — replace with your own._

## Fonts
- **Display:** \`'Inter Display', sans-serif\` (via \`next/font\`, weight 300–700)
- **Body:** \`'Inter', sans-serif\` (via \`next/font\`, weight 400–500)
- **Mono:** \`'JetBrains Mono', monospace\` (via \`next/font\`, weight 400)

## Scale
Based on a 1.25 modular scale, anchored at 16px body.

| Token       | Size  | Line height | Use                   |
|-------------|-------|-------------|-----------------------|
| \`text-xs\`   | 12px  | 1.4         | Metadata, timestamps  |
| \`text-sm\`   | 14px  | 1.45        | Captions, table cells |
| \`text-base\` | 16px  | 1.6         | Body prose            |
| \`text-lg\`   | 20px  | 1.5         | Lead paragraph        |
| \`text-xl\`   | 25px  | 1.35        | H3                    |
| \`text-2xl\`  | 31px  | 1.25        | H2                    |
| \`text-3xl\`  | 39px  | 1.15        | H1                    |

## Why this scale
A 1.25 ratio gives smoother hierarchy than 1.333 for long-form reading.
Anchored at 16px (not 15 or 18) because that's the browser default — users
who've bumped their root font size inherit the adjustment naturally instead
of fighting our override.
`;

const DECISIONS_VOICE_TEMPLATE = `# Voice

> _Example — replace with your own._

## Target reader
A committed reader who's tried Goodreads, found it exhausting, and wants to
actually *think* about their reading life. Not a casual user. Not a literary
critic. Someone between — smart, self-aware, slightly allergic to marketing.

## Tone
- Warm but not chatty
- Confident but not evangelical
- Honest about tradeoffs
- Assume intelligence — never explain the obvious

## Words to prefer
Use: *track, pattern, note, private, yours*
Avoid: *easy, powerful, revolutionary, seamless, unlock your reading journey*

## Example copy

**Good** (lands):
> Track the books you finish, see what you actually love, keep it yours.

**Bad** (tries too hard):
> Unlock the power of your reading journey with beautiful insights and
> seamless tracking across all your devices.

## Why this voice
The target user has been burned by overselling. Understated confidence
signals "we respect your time" — and readers respond to respect.
`;

const DECISIONS_ASSETS_TEMPLATE = `# Generated Assets

> _Example — replace with your own._

Log of assets generated via the Creative Studio, with the **exact prompt
used** so every asset can be regenerated, iterated, or audited later. Always
record the prompt — future-you won't remember it, and neither will your
collaborators.

## 2026-04-11 — Hero background pattern
- **File:** \`public/hero-pattern.svg\`
- **Tool:** \`generate_image\` (MiniMax)
- **Prompt:** "Abstract geometric pattern, neon purple and deep black,
  hexagonal grid with faint glow, minimalist, suitable for a reading-app
  hero section background, 16:9, no text"
- **Post-processing:** Background removed via \`remove_background\`, then
  traced to SVG in Figma for crisp rendering at any size
- **Why:** Hexagonal grid ties into the brand motif (see \`design/palette.md\`
  — purple accent). No text in the asset because text would break at mobile
  viewports.

## 2026-04-11 — Empty-state illustration
- **File:** \`public/empty-library.svg\`
- **Tool:** \`generate_image\` (MiniMax)
- **Prompt:** "Minimalist line-art illustration of an empty bookshelf, single
  accent colour purple \`#9333EA\`, warm off-white background \`#F5F5F7\`,
  friendly but not cartoonish, 1:1 composition"
- **Why:** Empty-state illustrations are the user's first impression —
  picked minimalist line-art over photography because it scales to any
  accent colour and feels honest rather than stock.
`;

const DECISIONS_IDEAS_TEMPLATE = `# Ideas

> _Example — replace with your own._

Parking lot for candidates that might become decisions later. When an idea
graduates to "we're doing this", move it to \`records/\` as a numbered
decision record. When an idea is rejected, **keep it here with the reason** —
future-you will thank present-you for not re-litigating it.

## Under consideration

- **Reading-streak heatmap** — Contribution-graph style visualisation of
  reading activity. Could be motivating, could be distracting pressure.
  Want to see 50+ books tracked across 10+ users before committing.
- **Smart recommendation engine** — Based on patterns in what the user
  finishes vs. abandons. Interesting but expensive to do well. Deferred
  until v2 when we have enough data to train anything meaningful.
- **Goodreads CSV import** — Good for onboarding migrants from other tools.
  Scope carefully — we don't want to become a Goodreads mirror, we want to
  be the thing they moved *to*.

## Rejected

- **Comments on other users' reviews** — Rejected: the whole positioning
  is *private* reading. Social features would dilute the product's purpose
  and pull us into a category we deliberately left.
- **AI-generated book summaries** — Rejected: summarising is what the
  *reader* does. Automating it undermines the reason the product exists.
  We track reading, we don't replace it.
`;

const DECISIONS_PROGRESS_TEMPLATE = `# Progress

> _Example — replace with your own._

Running log of what's been shipped and what's coming next. **Append-only** —
don't delete completed items, they're the project's memory of itself. Also
useful when a future-you asks "wait, when did we actually ship X?"

## Shipped

- **2026-04-01** — Project scaffolded. Next.js 15 + Tailwind 4 + Drizzle
  configured. First deploy live on Vercel.
- **2026-04-03** — Database schema landed: users, books, reading_sessions,
  tags. First migration applied, seed script for dev.
- **2026-04-05** — "Add book" flow complete. Search via OpenLibrary API,
  manual entry fallback for obscure titles.
- **2026-04-08** — Reading session tracking live. Daily summary card on
  home page shows pages read today and current book(s).

## Next up

- [ ] Finished-books list with filters (by year, tag, rating)
- [ ] Pattern analytics: pages-per-day rolling average, reading velocity
  over time
- [ ] Private notes per book (markdown, local-first draft, cloud sync
  when online)

## Blocked

- [ ] Goodreads CSV import — waiting for their export format to stabilise
  after the 2026-Q1 changes broke it
`;

const DECISIONS_README_TEMPLATE = `# Decisions

This folder is the project's declared direction. Ava reads it at the start of
every session and treats it as law — it's the project's durable, versioned
brain.

Contents are human-readable Markdown. You (and Ava) can edit any file directly.
Changes travel with the repo, so new contributors — and their Avas — pick up
the project's context automatically.

## Structure

- \`overview.md\` — one paragraph: what this project is
- \`context.md\` — stack, conventions, house rules
- \`design/palette.md\` — chosen colour tokens and rationale
- \`design/typography.md\` — fonts, scale, weights
- \`design/voice.md\` — tone, target reader
- \`design/assets.md\` — generated assets + the prompts used to make them
- \`records/\` — ADR-style decision records, numbered (e.g. \`0001-framework.md\`)
- \`ideas.md\` — candidates that might become decisions
- \`progress.md\` — what's been shipped, what's next
- \`drafts/\` — gitignored scratchpad for in-progress thinking

## Rules

- **Never write secrets here.** This folder is committed to git.
- Edit by hand whenever you want — Ava picks up your changes next session.
- When Ava records a decision, it shows up in the timeline as a normal file
  edit so you see it happen.

## About the starter content

Every file in this folder ships with a short **worked example** — a
hypothetical reading-tracker project called "Chronicle" — marked clearly at
the top with _Example — replace with your own._

The examples aren't your project. They're there to show you *the pattern* of
a good decision record: a named value, plus the reason it was chosen, plus
the tradeoff it represents. Read them once, then replace them with content
from your own project.

If something in the examples feels useful as a starting point (palette
tokens, a typography scale, a voice rubric), keep it and edit. If not,
delete it wholesale — the scaffold is a teaching tool, not a cage.
`;

/**
 * Scaffold a `Decisions/` folder at the project root with the canonical
 * structure and starter templates. Returns the list of files created, or
 * an empty array if the folder already existed.
 */
export async function scaffoldDecisionsFolder(projectRoot: string): Promise<string[]> {
  const root = getDecisionsRoot(projectRoot);
  if (existsSync(root)) return [];

  await mkdir(root, { recursive: true });
  await mkdir(join(root, 'design'), { recursive: true });
  await mkdir(join(root, 'records'), { recursive: true });
  await mkdir(join(root, 'drafts'), { recursive: true });

  const files: Array<[string, string]> = [
    ['README.md',             DECISIONS_README_TEMPLATE],
    ['overview.md',           DECISIONS_OVERVIEW_TEMPLATE],
    ['context.md',            DECISIONS_CONTEXT_TEMPLATE],
    ['ideas.md',              DECISIONS_IDEAS_TEMPLATE],
    ['progress.md',           DECISIONS_PROGRESS_TEMPLATE],
    ['design/palette.md',     DECISIONS_PALETTE_TEMPLATE],
    ['design/typography.md',  DECISIONS_TYPOGRAPHY_TEMPLATE],
    ['design/voice.md',       DECISIONS_VOICE_TEMPLATE],
    ['design/assets.md',      DECISIONS_ASSETS_TEMPLATE],
  ];

  const created: string[] = [];
  for (const [relPath, content] of files) {
    const fullPath = join(root, relPath);
    await writeFile(fullPath, content, 'utf-8');
    created.push(fullPath);
  }

  // Gitignore the drafts folder so scratch thinking stays local
  await writeFile(join(root, 'drafts', '.gitignore'), '*\n!.gitignore\n', 'utf-8');

  return created;
}
