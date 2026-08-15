# Ava Supernova — Documentation Outline

**Status:** draft for sign-off. Structure only — no body content yet.

**Legend:**
- `[newcomer]` — must read for first-time users
- `[power]` — reference material for experienced users
- `[both]` — useful to everyone
- `surfaces:` web / ext (VSCode extension) / ide (desktop IDE) — where this page appears
- `data:` pulls from a structured TS fact table (never hand-authored numbers)

---

## 1. Start here — `[newcomer]` surfaces: web, ext, ide

The **Beginner/Everything toggle** collapses this whole doc to just section 1 + 2 when set to Beginner.

- **1.1 What is Ava Supernova?** — 3-paragraph pitch, the three surfaces explained, who it is for.
- **1.2 Install** — tabbed: VS Code / Desktop IDE / CLI. Per-surface install steps.
- **1.3 Your first five minutes** — pick a model, send your first message, approve your first tool call, see the result.
- **1.4 Local vs cloud in one paragraph** — the sacred rule stated once, plainly.
- **1.5 Choosing your first model** — decision table: free / cheap / best-quality / my-own-key. `data: providers.ts`

## 2. Core concepts — `[both]` surfaces: web, ext, ide

- **2.1 The seven modes** — what each mode changes about Ava's mindset and tool access. `data: modes.ts`
- **2.2 Memory — how Ava remembers you** — five-layer model in plain language (extract → reflect → accumulate → analyse → consolidate). When each layer runs.
- **2.3 Tasks and journal** — what is each, when to use which, how they differ from memory.
- **2.4 Permissions — three modes, ten categories** — Strict / Balanced / Autonomous matrix. `data: permissions.ts`
- **2.5 Interjection and hard-stop** — how to guide or stop a running agent without cancelling context.

## 3. Reference — `[power]` surfaces: web, ext, ide

Collapsed when the audience toggle is set to Beginner.

- **3.1 Tool reference** — all 110 tools, 10 categories, risk badges, one-line descriptions, filterable by category/risk. `data: tools.ts`
- **3.2 Provider and model matrix** — managed (Qwen, MiniMax) vs BYOK (Anthropic, DeepSeek, Kimi, Mistral, Zhipu). Pricing, context, capabilities. `data: providers.ts`
- **3.3 Persona orchestration** — 24 specialists, 5 teams, Conductor dispatch, wave execution. `data: personas.ts`
- **3.4 CLI commands** — REPL commands (`/help`, `/mode`, `/model`, `/clear`, etc.), flags.
- **3.5 Configuration** — settings, `~/.ava/*` file layout, `.ava/instructions.md`, environment variables.
- **3.6 Keyboard shortcuts** — per-surface table. `data: shortcuts.ts`
- **3.7 Project context** — `.ava/context.md`, instruction files, project index, language detection.

## 4. Features — `[both]` surfaces: web, ext, ide (chunkable)

Each feature is its own page so the sidebar stays browsable. Features that don't apply to a surface are hidden on that surface.

- **4.1 Unified panel** — the single panel that unifies chat, dashboard, memory, tasks. ext + ide only.
- **4.2 Knowledge packs** — structured reference material Ava can pull into context.
- **4.3 Creative Studio** — image, video, music, voice generation via MiniMax.
- **4.4 Office Suite** — reports, emails, documents.
- **4.5 Dashboard library** — your projects, assets, conversations, memories in one browsable view.
- **4.6 Document preview** — read Word, Excel, PDF, CSV, HTML, Markdown inline.
- **4.7 Daily briefing** — morning summary of tasks, journal, project state.
- **4.8 Workflows** — reusable multi-step orchestrations.
- **4.9 Events and notifications** — streaming UI updates during agent runs.
- **4.10 Personality Designer** — tone, energy, communication style.
- **4.11 Release Notes** — in-app changelog. ext + ide only; web links out to `/releases`.

## 5. Troubleshooting and support — `[both]` surfaces: web, ext, ide

New section — none of the three surfaces has this today.

- **5.1 Common errors** — model not responding, tool call failed, memory not recalling, sign-in loops.
- **5.2 Where logs live** — per-surface log paths and how to read them.
- **5.3 Filing a support request** — what to include, category selection, how long responses take.
- **5.4 Reporting security issues** — responsible disclosure, timeline, contact.

---

## Per-surface notes

| Section | Web | Extension | IDE |
|---|---|---|---|
| 1. Start here | Full, with install tabs | Full, "VS Code" tab pre-selected | Full, "Desktop IDE" tab pre-selected |
| 2. Core concepts | Full | Full | Full |
| 3. Reference | Full (indexable, SEO) | Full | Full |
| 4. Features | Most (linked to /releases) | Most (skip web-only items) | Most (skip web-only items) |
| 5. Troubleshooting | Full | Full | Full |
| Audience toggle | Top-right | Top-right | Top-right |
| Search | In-page Cmd+F | Search box in sidebar | Search box in sidebar (existing) |

## Content authorship

Each page is one `.md` file in `packages/core/docs/content/` with front-matter:

```yaml
---
id: start.install
title: Install
audience: [newcomer]
surfaces: [web, ext, ide]
order: 2
---
```

Facts (tool list, provider matrix, permission table, mode list, persona roster, shortcuts) are **never** written into markdown — they are imported from the `data/*.ts` tables and rendered by each surface's renderer. Tool count can only be wrong in one place, not four.

## Open content questions (for the content pass, not this gate)

- Tone: "you" vs "the user" — lock early so content is consistent.
- Code example style: minimal and language-agnostic where possible, or concrete examples in JS/Python?
- Screenshots: do any sections need them, or is text-and-data enough?
