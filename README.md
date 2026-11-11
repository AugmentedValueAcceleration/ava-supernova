<p align="center">
  <h1 align="center">Ava Supernova</h1>
  <p align="center">
    <strong>The open-source AI coding agent that works for everyone — not just the people who can afford it.</strong><br/>
    100+ tools · 7 modes · 24 specialist personas · frontier open-weight models from every major lab · a Creative Studio that builds real assets into your project.<br/>
    <strong>Free and open source. Your keys. Your machine. Your work.</strong>
  </p>
  <p align="center">
    <a href="#what-ava-is">What Ava Is</a> &middot;
    <a href="#where-ava-runs">Where Ava Runs</a> &middot;
    <a href="#models--fleets">Models</a> &middot;
    <a href="#getting-started">Getting Started</a> &middot;
    <a href="#tools">Tools</a> &middot;
    <a href="#privacy">Privacy</a> &middot;
    <a href="#support-ava">Support Ava</a> &middot;
    <a href="#contributing">Contributing</a>
  </p>
  <p align="center">
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License"></a>
    <img src="https://img.shields.io/badge/Node-%3E%3D20.0.0-brightgreen.svg" alt="Node">
    <img src="https://img.shields.io/badge/TypeScript-5.9-blue.svg" alt="TypeScript">
    <a href="https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova"><img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC.svg" alt="VS Code Marketplace"></a>
  </p>
</p>

---

## What Ava Is

Agentic coding shouldn't be a luxury. Ava Supernova is a full AI coding agent — she reads your codebase, plans the work, executes it task by task, and remembers what she learns so the next time gets easier. She runs on the frontier of **open-weight** models, which now match or beat closed frontier models on agentic coding at a fraction of the cost.

She's free, open source and **local-first**:

- **No account, no sign-in, no subscription.** Install, add an API key from any supported provider (or point her at a local model), and go. You pay your provider directly, at their rates — Ava never sits in the middle.
- **Your data stays on your machine.** Memory, history, journal, tasks — all stored locally. There is no cloud sync.
- **No gatekeeping.** Every capability — including the security toolkit and the teaching engine — is there for everyone. Nothing is held back for a paid tier, because there isn't one.

> Ask Ava `what can you do?` and she'll read her own source code and tell you herself.

## Where Ava Runs

The same agent engine (`@ava/core`) powers every surface — same tools, same personas, same memory:

| Surface | What it is | Best for |
|---|---|---|
| **VS Code Extension** | Ava inside the editor you already use — chat, agent, command-centre dashboard. | Adding Ava to your existing VS Code workflow. |
| **IDE** — *coming Q4 2026* | A standalone desktop app (Tauri + Rust) with Ava native and a local engine. Brings **desktop automation**. | A dedicated AI-native workspace; controlling the whole machine. |
| **CLI** | A terminal REPL with the full agent loop, run from this repository. | Living in the terminal, scripting, servers, SSH. |

Your keys and everything Ava knows about you — profile, personality, settings — are shared between the extension and the IDE. Enter a key once and both have it.

## What Makes Ava Different

- **She remembers you.** A layered memory system learns your style, conventions, decisions, and the bugs you've fixed before — curated by a dedicated Memory Agent so context stays lean and recall stays sharp. Local-first, opt-in semantic recall.
- **She thinks before she builds.** 24 specialist personas across 7 modes plan, verify, and challenge before executing. Simple questions skip orchestration entirely — zero overhead.
- **She won't fake a "done."** A built-in honesty gate checks every claim of completion or success — "it's fixed", "tests pass", "deployed" — against the tools she actually ran that turn, and flags any it can't back with evidence. A guess never stands as fact. Always on, no off-switch.
- **She picks the right fleet for the work.** You pick the job; the right multi-model fleet falls out of it (see [Models & Fleets](#models--fleets)).
- **She teaches.** Switch to Teach mode, say "teach me Rust," and she builds a personalised curriculum and teaches it lesson by lesson — fact-checked against the live web.
- **She explains herself.** Ask "how does your memory work?" and she reads her own implementation and walks you through it.
- **She's yours to design.** Name, pronouns, tone, energy, communication style — same brain, your personality. The whole UI translates into 20 languages and switches live the moment you change it — no restart.

## 7 Modes — States of Thought

Modes aren't tool restrictions — they're states of mind. The toolkit and the persona team change to match the work.

| Mode | Prefix | Mindset | Use it for |
|---|---|---|---|
| **Code** | `>>` | Builder | Writing, editing, shipping code with the full toolkit |
| **Plan** | `::` | Architect | Read-only analysis, feature design, strategic proposals |
| **Chat** | `..` | Friend | Personal conversation, journal, memory, news, weather |
| **Teach** | `??` | Tutor | Personalised learning paths and Socratic delivery |
| **Security** | `!!` | Auditor | OWASP-aligned scanning with verified findings |
| **Brainstorm** | `**` | Ideator | Research, generate, challenge, and refine ideas |
| **Write** | `<<` | Author | Drafting real documents — reports, proposals, letters, articles — exported as branded Word & PDF |

Switch with the mode menu, or start a message with its prefix.

## Personas — Ava's Internal Specialist Team

When a task is complex, Ava's internal team activates. Each persona gets its own clean context and scoped tools (the Challenger reads but never writes). Simple tasks go direct.

- **Code:** Scout → Architect → Verifier → Sequencer → Challenger → Builder
- **Plan:** Researcher → Architect → Challenger
- **Teach:** Curriculum Architect → Content Writer → Fact Checker → Quiz Master → Tutor
- **Security:** Recon → Scanner → CVE Researcher → Verifier → Reporter
- **Brainstorm:** Explorer → Researcher → Ideator → Challenger → Refiner

Chat and Write run without personas — just Ava.

## Models & Fleets

You don't have to pick a model — pick the work, and a fleet routes each part of it to the right one. Three orchestrated fleets, each locked to its own providers:

| Fleet | Needs | Coordinator | How it splits the work |
|---|---|---|---|
| **Maestro** | A Qwen key | Qwen 3.8 Flash | Flash coordinates and handles chat, images and long context; Qwen 3.7 Plus does the deep work — coding, planning, security, teaching. |
| **Supernova** | DeepSeek + Qwen keys | DeepSeek V4.1 Flash | DeepSeek does nearly everything; Qwen 3.8 Flash reads and makes images. |
| **Aurora** | A Mistral key | Mistral Large 4 | Every model from Mistral, a European lab: Large 4 does the deep work with 1M context, Small 4 handles chat and brainstorming. |

Or pick any single model your keys reach:

| Provider | Models |
|---|---|
| **Qwen (Alibaba)** | Qwen 3.8 Max, Qwen 3.8 Flash, Qwen 3.7 Plus, Qwen 3.7 Flash, Qwen 3.5 Plus, Qwen 3.5 Flash, Qwen3 Coder Next / Flash — up to 1M context, vision, reasoning |
| **DeepSeek** | DeepSeek V4.1 Flash — MIT open-weight, 1M context |
| **Moonshot** | Kimi K3 (1M context, native vision), K2.7 Code, K2.6 |
| **Zhipu** | GLM-5.3, GLM-5.3 Flash — MIT open-weight, 1M context |
| **Mistral** | Large 4 (1M context), Small 4 |
| **MiniMax** | M3, M3.1 Flash — 1M context |
| **Xiaomi** | MiMo V2.6-Pro, V2.6-Flash — 1M context, native multimodal |
| **Tencent** | Hunyuan Hy3 — open-weight MoE, 262K context |
| **NVIDIA** | Nemotron 3 Ultra, Nemotron 3.5 Lightning — open-weight, 1M context |
| **Local** | Ollama, LM Studio, vLLM, or any standard API-format endpoint — no key, no cost |

**Images, voiceovers and video** in the Creative Studio run on your own **Qwen key**, billed by Alibaba at Alibaba's rates; without one, those are switched off. Make Qwen keys in Alibaba Cloud Model Studio's **Singapore** region — keys are region-locked and Ava uses the international endpoint.

**Web search** uses DuckDuckGo out of the box; add a Brave Search key for better results.

## Getting Started

### VS Code Extension

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova) — or search "Ava Supernova" in the Extensions panel. Click the Ava icon in the activity bar (or press `Ctrl+Shift+A`), add a key from any supported provider in the sidebar, and start.

### IDE

The standalone desktop IDE is **coming Q4 2026**, alongside desktop automation.

### CLI

Requires [Node.js](https://nodejs.org) 20 or later and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/AugmentedValueAcceleration/ava-supernova.git
cd ava-supernova
pnpm install && pnpm build
node packages/cli/dist/index.js
```

On first launch, Ava runs a short setup: pick a provider and paste your key (or choose a local model), and you're ready.

## Tools

**100+ tools.** Ava decides which to use, runs them, reads the results, and keeps reasoning. Each mode carries the tools its work needs.

| Category | Tools |
|---|---|
| **Files & code** | `read`, `write`, `edit`, `glob`, `grep`, `list_directory`, `find_symbol`, `project_index`, `analyze_architecture`, `create_project`, `self_inspect`, `docs_lookup` |
| **Shell & testing** | `bash`, `test_run`, `test_generate`, `benchmark`, `debug_logs` |
| **Git** | `git_status`, `git_diff`, `git_commit`, `git_create_pr`, `rollback` |
| **Web & research** | `web_search`, `http_request`, `browser`, `news`, `weather`, `release_notes`, `paper_fetch_full_text` |
| **Creative Studio** | `design_generate_logo`, `design_explore_logos`, `design_generate_icon`, `design_generate_image`, `design_generate_set`, `design_generate_video`, `design_generate_voice`, `design_brand_kit`, `design_find_shape`, `design_save`, `remove_background`, `browse_library`, `open_design_studio` |
| **2D & 3D rooms** *(GIMP, Blender)* | `design_propose_image_brief`, `design_build_image`, `design_duplicate_image`, `design_restore_image`, `design_show_options`, `design_mark_final`, `design_propose_model_brief`, `design_build_model`, `design_duplicate_model`, `design_restore_model`, `design_api_lookup`, `design_read_docs` |
| **Brand kits, fonts & folders** | `design_propose_kit`, `design_save_to_kit`, `design_fonts`, `design_install_font`, `design_folder` |
| **Documents & tasks** | `document_author`, `document_manage`, `email_draft`, `report_generate`, `doc_generate`, `todo_write`, `task_manage`, `task_suggest`, `journal_write` |
| **Memory** | `memory_save`, `memory_recall`, `memory_update` |
| **Learning** | `learning_create`, `learning_teach`, `learning_progress`, `open_learning_room` |
| **Health** | `health_plan_create`, `health_plan_update`, `health_plan_update_day`, `health_plan_list`, `health_plan_delete`, `health_profile_ask`, `health_catalogue_search`, `open_health_room` |
| **Security & data** | `audit_dependencies`, `database_query` |
| **Brainstorm** | `brainstorm_session` |
| **System** | `get_datetime`, `detect_language`, `support_request`, `propose_tool` |
| **Desktop & browser automation** *(IDE, Q4 2026)* | `desktop_launch_app`, `desktop_focus_window`, `desktop_list_elements`, `desktop_click_by_name`, `desktop_type`, `desktop_key_press`, `desktop_plan_approve`, `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_close` |

## Creative Studio

Ava designs whole brand identities and wires them straight into your project — a logo into `public/`, a hero clip into your landing page.

- **Logos & icons** are **constructed as true vectors (SVG), not pixels** — composed from geometric primitives and real fonts on your own machine, so they stay razor-sharp at any size. A logo brief yields a full system: primary, stacked, symbol, wordmark, monochrome and favicon. Ava shows several directions and lets you pick.
- **2D work in GIMP and 3D models in Blender**, made by Ava on your own computer with the window closed — icon sets, game UI, sprites and textures as layered GIMP files; game-ready models with baked textures, exported as .glb and .fbx. **The brief comes first**: Ava researches it, you agree it, and nothing is made until you do. Every step is saved, so you can always go back. GIMP 3 and Blender are free.
- **Brand kits** hold a project's look and voice — colours, fonts and pairings, logo, image style, rules. Link a kit to a project and everything Ava makes for it follows the kit, inside GIMP and Blender too.
- **Images & video** run on **Wan**, **voiceovers** on **Qwen3-TTS** (Alibaba's models) — on your own Qwen key.
- **Background removal and logo vectorising** run on your machine, free.
- Every asset is tracked in the **Library** — grid or list view, filter by type, preview, reuse across projects. **Folders** gather a set together, Ava can plan a whole pack with you piece by piece, and a folder downloads ready for your game engine or prepared for a store (Unity Asset Store, Fab, itch.io, Gumroad, Superhive), with a `How-this-was-made.txt` record of which AI did what. Declaring AI use to a store stays yours to do.

## Privacy

Your data stays yours:

- **API keys** are kept in your operating system's keychain — shared by the extension and the IDE, never logged, never sent to us.
- **Conversations & memory** are stored locally (`~/.ava/`), and only there. There is no cloud sync.
- **Credential safety** — runtime detection blocks API keys, tokens, and private keys from being saved to memory; high-confidence key patterns are redacted from chat output before they hit the screen.
- **Capability-based secrets** — Ava receives opaque handles for vault secrets, not raw values, scoped to the current session.
- **Prompt-injection resistance** built in. **No telemetry** — we don't track your usage, code, or conversations.
- **We never train on your data.**

## Support Ava

Ava is free for everyone and kept that way by donations. If she saves you time, you can give once or monthly at [avasupernova.com/support-ava](https://avasupernova.com/support-ava). Companies can [sponsor](https://avasupernova.com/sponsors) — recognition only, never features or a say in the roadmap. Every six months we publish what came in and what it paid for at [avasupernova.com/transparency](https://avasupernova.com/transparency).

## Architecture

A pnpm monorepo with a shared core, plus submodules for the IDE and the website:

```
packages/
├── core/        # @ava/core — shared agent engine (agent loop, providers, tools, personas, memory)
├── cli/         # @ava/cli — terminal REPL
├── extension/   # VS Code extension host + React webview + dashboard
├── ide/         # Standalone IDE (Tauri v2 + Rust + Node.js engine) — submodule
├── mobile/      # Dormant — the companion was retired 2026-10-05
└── web/         # The website — submodule
```

**Key design decisions:**

- **Shared core, zero duplication** — CLI, extension, and IDE all run the same `@ava/core` engine, tools, and providers.
- **Event-driven agent** — the agent emits typed events every host subscribes to.
- **Self-contained tools** — each tool carries its own schema and handler; adding one is a single file plus one registry line.
- **No provider SDKs** — all provider communication uses native `fetch`.
- **Permission matrix** — risk levels (`safe`, `write`, `dangerous`) combine with your permission mode to decide what needs approval. Plans and user questions always require approval.
- **Local-first** — everything works offline with a local model, and nothing is synced to the cloud.

## Contributing

Contributions are welcome — this is built for the community. See [CONTRIBUTING.md](CONTRIBUTING.md).

1. Fork the repository
2. Create a feature branch from `development`
3. Make your changes and run `pnpm build`
4. Open a pull request against `development`

## Links

- [Website](https://avasupernova.com)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova)
- [Release Notes](https://avasupernova.com/releases)
- [Discord](https://discord.gg/bbtnKMW4rf) — questions, bugs and ideas
- Email: [support@avasupernova.com](mailto:support@avasupernova.com)

## License

[Apache License 2.0](LICENSE) — Copyright 2026 Augmented Value Acceleration

---

<p align="center">
  Agentic coding for everyone.
</p>
