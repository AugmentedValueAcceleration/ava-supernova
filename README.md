<p align="center">
  <h1 align="center">Ava Supernova</h1>
  <p align="center">
    <strong>Open-source AI coding agent — 60+ tools, 6 modes, 24 specialist personas, frontier open-source models from every major Chinese + Western lab. Creative Studio for images, video, music, voice. 300 free credits per month with an account, or bring your own API keys.</strong>
  </p>
  <p align="center">
    <a href="#supported-models">Models</a> &middot;
    <a href="#getting-started">Getting Started</a> &middot;
    <a href="#vscode-extension">Extension</a> &middot;
    <a href="#ide">IDE</a> &middot;
    <a href="#tools-61">Tools</a> &middot;
    <a href="#privacy--security">Privacy</a> &middot;
    <a href="#sponsors">Sponsors</a> &middot;
    <a href="#contributing">Contributing</a>
  </p>
  <p align="center">
    <a href="https://github.com/AugmentedValueAcceleration/ava-supernova/blob/production/LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License"></a>
    <img src="https://img.shields.io/badge/Node-%3E%3D20.0.0-brightgreen.svg" alt="Node">
    <img src="https://img.shields.io/badge/TypeScript-5.9-blue.svg" alt="TypeScript">
    <a href="https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova"><img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC.svg" alt="VS Code Marketplace"></a>
  </p>
</p>

---

Ava Supernova is an open-source AI coding agent that brings full agentic coding to every developer — as a **VS Code extension**, a **standalone IDE**, a **terminal CLI**, and a **companion app**. She remembers you across sessions, teaches for free, and thinks before she builds with 24 specialist personas across 6 modes.

> **Start coding with AI in 30 seconds.** Install, open, go. Sign up for 300 free credits per month, or bring your own API keys.

## Why Ava?

Agentic coding shouldn't be a luxury. The open-source model ecosystem now matches or beats closed-source frontier on agentic coding — at a fraction of the cost.

| Model | SWE-Bench Verified | Input / Output ($/M) |
|---|---|---|
| **DeepSeek V4 Pro** *(MIT, 1M ctx, 2026-04-24)* | **80.6%** | $1.74 / $3.48 |
| **DeepSeek V4 Flash** *(MIT, 1M ctx, 2026-04-24)* | **79.0%** | **$0.14 / $0.28** |
| Qwen 3.6 Plus (Alibaba) — Terminal-Bench leader | 78.8% | $0.28+ / $0.66+ |
| Kimi K2.6 (Moonshot) — SoTA agentic | SWE-Pro 58.6 | $0.60 / $2.50 |
| GLM-5 (Zhipu AI) | 77.8% | $1.00 / $3.20 |
| **Qwen Flash on Ava Free** | — | **FREE (300 credits/month)** |

## What Makes Ava Different

- **She remembers you** — 5-layer memory system that learns your coding style, decisions, conventions, and preferences. Every session she's better at helping you specifically.
- **She thinks before she builds** — 24 specialist personas across 6 modes plan before executing. Complex tasks get proper analysis, not just code generation.
- **She teaches for free** — Switch to Teach mode, say "teach me Python", and she builds a personalised curriculum with spaced repetition. Education shouldn't have a price tag.
- **She picks the right brain** — **Maestro** runs an orchestrated single-coordinator pipeline (Qwen 3.6 Plus, the Terminal-Bench leader) that classifies each task and dispatches Builder agents. **Supernova** *(in development)* extends this into polyglot multi-model orchestration — coordinator picks the best specialist per role.
- **She's yours to design** — Choose the tone, energy, and communication style. Same brain, your personality.
- **She explains herself** — Ask "how does your memory work?" and she reads her own source code and explains it. The only AI that can.
- **She's always aware** — Tick Engine runs every 2 minutes, checking tasks, journal streaks, token balance, and support messages. She speaks up only when it matters.
- **She gets sharper, not noisier** — 4-phase memory consolidation (Orient → Gather → Consolidate → Prune) with a 25KB cap keeps memory lean at scale.

## 6 Modes — States of Thought

Modes aren't tool restrictions — they're states of mind.

| Mode | Prefix | Purpose |
|---|---|---|
| **Work** | `>>` | Builder mindset — full agent with 60+ tools |
| **Plan** | `::` | Architect mindset — read-only analysis and strategic planning |
| **Brainstorm** | `**` | Ideation mindset — research, generate, challenge, refine ideas |
| **Chat** | `..` | Friend mindset — personal conversation, memory, journal |
| **Teach** | `??` | Tutor mindset — personalised learning with spaced repetition |
| **Security** | `!!` | Auditor mindset — OWASP-aligned security scanning |

Switch modes with the dropdown or keyboard shortcuts `Ctrl+Shift+1` through `Ctrl+Shift+6`.

## Personas — Internal Specialist Team

When Ava takes on a complex task, her internal team activates:

**Work:** Scout → Architect → Verifier → Sequencer → Challenger → Builder
**Plan:** Researcher → Architect → Challenger
**Teach:** Curriculum Architect → Content Writer → Fact Checker → Quiz Master → Tutor
**Security:** Recon → Scanner → CVE Researcher → Verifier → Reporter
**Brainstorm:** Explorer → Researcher → Ideator → Challenger → Refiner

Each persona has scoped tool access. Challenger can read but never write. Simple questions skip orchestration — zero overhead.

## Supported Models

| Provider | Models | Highlights |
|---|---|---|
| **Ava Free** | Qwen Flash | **FREE — 300 credits/month** with account |
| **Alibaba Cloud** | Qwen 3.6 Plus, 3.5 Plus, 3.5 Omni Plus, 3.5 Omni Flash, 3.5 Flash | Maestro coordinator — Terminal-Bench #1 agentic coding, vision + audio (Omni), 1M context |
| **DeepSeek** | V4 Pro, V4 Flash | MIT-licensed open-weight, 1M context, SWE-Verified 80.6% (Pro), $0.14/$0.28 (Flash) |
| **Moonshot AI** | Kimi K2.6, K2.5 | SoTA agentic coding (K2.6 SWE-Pro 58.6, HLE-w/tools 54.0), 256K context |
| **Zhipu AI** | GLM-5 | 77.8% SWE-Bench, best tool-call reliability, separate vision SKU |
| **MiniMax** | M2.7, M2.5 | Creative Studio specialist — image / video / music / voice |
| **Anthropic** | Claude Opus 4.7, Opus 4.6, Sonnet 4.6, Haiku 4.5 | Frontier closed-source, vision, 1M context (Opus 4.7) |
| **Mistral** | Large, Codestral, Devstral 2 | European provider, code-specialised, up to 262K context |
| **Xiaomi** | MiMo V2.5, V2.5-Pro | 1M context, native multimodal, frontier-tier at lower cost |
| **Generic** | Custom / Local | Ollama, LM Studio, or any standard API format endpoint |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v20.0.0 or later
- [pnpm](https://pnpm.io) package manager
- An API key from any supported provider — **or sign up for 300 free credits per month**

### Installation

```bash
git clone https://github.com/AugmentedValueAcceleration/ava-supernova.git
cd ava-supernova
pnpm install
pnpm build
```

### CLI — First Run

```bash
node packages/cli/dist/index.js

# Or link globally
cd packages/cli && npm link
ava
```

On first launch, Ava guides you through an interactive setup wizard. Choose a provider, paste your API key, and you're ready — or sign up for free tokens and start immediately.

## VS Code Extension

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova) — or search "Ava Supernova" in the Extensions panel.

### Quick Start

1. Install the extension
2. Click the Ava icon in the activity bar (or press `Ctrl+Shift+A`)
3. Sign up for 300 free credits per month, or add your own API keys in Settings
4. Start coding

### Extension Features

- **Agentic coding** — Ava reads, writes, edits, searches, and executes code autonomously
- **Six modes** — Work (`>>` full agent), Plan (`::` read-only), Brainstorm (`**` ideation), Chat (`..` friend), Teach (`??` personal tutor), Security (`!!` OWASP audit)
- **24 specialist personas** — Internal team orchestrated by Conductor across 5 modes
- **5-layer memory** — Pattern extraction, LLM reflection, habit detection, cross-memory insights, cloud sync with semantic search
- **Custom personality** — Name, pronouns, tone, energy, communication style — design your own AI companion
- **Command centre dashboard** — Weather, news, tasks, journal, learning, memory, session stats, library, settings, sync, and more
- **Image generation** — Create icons, illustrations, backgrounds via Alibaba Wan2.6, browse in dashboard library
- **Background removal** — Remove image backgrounds directly in chat
- **Office suite** — Native .pptx presentations, .docx emails/reports, .xlsx spreadsheets, .pdf generation
- **Daily briefing** — Morning summary with tasks, calendar events, journal prompts, and priorities
- **Knowledge packs** — Curated learning content for languages, frameworks, and tools
- **Workflow engine** — Automate multi-step processes with triggers and conditions
- **Usage analytics** — Token consumption, cost tracking, and usage patterns
- **Cloud sync** — Delta tracking, selective sync per data type, full transparency
- **Model selector** — Switch models from the header dropdown with provider labels and availability indicators
- **Mid-task interjection** — Type while Ava is working to add context, corrections, or redirect
- **Vision** — Attach images in chat for models that support it
- **Codebase understanding** — Project indexer and symbol finder for intelligent code navigation
- **Context compression** — Automatic context management keeps long conversations within model limits
- **Conversation history** — Auto-saved per project, searchable, with quick access from the header
- **Project context** — Create `.ava/instructions.md` to give Ava persistent knowledge about your codebase
- **Tool approval** — Review every action before Ava executes it, or grant autonomy with permission modes
- **20 languages** — Full UI and response localization

## Command Centre Dashboard

Open the dashboard and everything's right there:

- **Live weather** — auto-detected location, 3-day forecast
- **Latest news** — tech articles with category filtering
- **Today's tasks** — due today and overdue, complete from the overview
- **Journal** — your entry and Ava's, with mood tracking
- **Learning progress** — active curriculums with progress bars
- **Memory count** — what Ava remembers
- **Latest release** — current version at a glance
- **Session stats** — messages, tokens, tool calls, duration

Plus dedicated pages for Tasks, Journal, Memory, Learning, Library, Settings, Sync, Releases, Support, and more.

## IDE

Ava Supernova IDE is a standalone desktop application built on [Tauri v2](https://v2.tauri.app/) (Rust + React) with Ava deeply integrated. A Node.js sidecar runs `@ava/core` locally, giving you the full agent without a browser or VS Code.

The IDE includes:
- **Local AI engine** — `@ava/core` runs as a sidecar process with the full toolkit, personas, and memory
- **Cloud & Local modes** — toggle between platform API (cloud) and your own BYOK keys (local)
- **11 dashboard pages** — Command Centre, Chat, Memory, Tasks, Journal, Learning, Library, Personality, Cloud Sync, Usage, Settings
- **Library** — browse images, documents, presentations, and spreadsheets created by Ava (grid + list views, type filtering)
- **Image & file sharing** — paste/drag-drop images into chat, inline image display, file attachment support
- **Tool confirmation UI** — approve or deny dangerous tool calls with a visual dialog
- **VS Code-like layout** — activity bar, sidebar, editor area, terminal panel, status bar
- **Cross-platform** — Windows, macOS, Linux (via Tauri)

## Companion App

Ava on the go. The companion web app gives you access to Ava from your phone or tablet — chat, tasks, journal, memory, and learning progress.

- [companion.ava-supernova.com](https://companion.ava-supernova.com)

## Tools

| Category | Tools | Description |
|---|---|---|
| **File ops** | `file_read`, `file_write`, `file_edit` | Read, create, and surgically edit files |
| **Search** | `glob`, `grep`, `list_directory`, `find_symbol`, `project_index` | Find files, search content, navigate symbols |
| **Shell** | `bash` | Execute commands, run builds, start servers |
| **Git** | `git_status`, `git_diff`, `rollback`, `git_commit`, `git_create_pr` | Check repo state, view diffs, undo changes, commit, create PRs |
| **Web** | `web_search`, `http_request`, `browser` | Search the web, test APIs, automate browsers |
| **Creative** | `generate_image`, `generate_video`, `generate_music`, `generate_voice`, `remove_background`, `browse_library`, `screenshot` | Full creative studio — images, video, music, voice, asset library |
| **Computer** | `computer_use` | Browser and desktop automation |
| **Data** | `database_query` | Read-only SQL against PostgreSQL, SQLite, MySQL |
| **Memory** | `memory_save`, `memory_recall`, `memory_update`, `memory_delete` | Smart persistent memory with TF-IDF retrieval |
| **Tasks** | `task_manage` | Create, update, complete, and track tasks |
| **Journal** | `journal_write` | Daily journal entries with mood tracking |
| **Documents** | `document_manage` | Manage structured documents |
| **Learning** | `learning_create`, `learning_teach`, `learning_progress` | Personalised curricula with spaced repetition |
| **Testing** | `test_run`, `test_generate` | Run tests and generate test suites |
| **Architecture** | `analyze_architecture` | Analyze project structure and dependencies |
| **Docs** | `doc_generate` | Generate documentation from code |
| **Security** | `audit_dependencies`, `security` | Dependency scanning and comprehensive security audits |
| **Performance** | `benchmark` | Run performance benchmarks |
| **Batch** | `apply_plan` | Execute multi-step plans |
| **Debug** | `debug_logs` | Access and analyze debug logs |
| **Office** | `presentation_create`, `email_draft`, `report_generate` | Native .pptx, .docx, and .xlsx generation |
| **Planning** | `present_plan`, `todo_write`, `switch_mode` | Structured plans with approval, task tracking, collaborative mode transitions |
| **Interaction** | `ask_user`, `support_request` | Ask for clarification, submit support tickets |
| **Self** | `docs_lookup`, `propose_tool`, `self_inspect`, `release_notes` | Self-inspection, docs, tool proposals |
| **Utility** | `get_datetime`, `detect_language`, `weather`, `news` | Date/time, language detection, weather, news |

The agent automatically decides which tools to use, executes them, reads the results, and continues reasoning — up to 200 iterations per request.

## Creative Studio

Ava's built-in creative suite — generate images, video, music, and voice from inside your IDE.

- **Images** — Wan2.6 (Qwen) or MiniMax image-01. Smart prompt enhancement for icons, logos, backgrounds. Vision-verified quality. Transparent backgrounds for UI elements.
- **Video** — MiniMax Hailuo 2.3. 6s at 1080P or 10s at 768P. Custom video player with thumbnails, progress bar, and fullscreen.
- **Music** — MiniMax. Instrumental or vocal tracks with lyrics. Custom audio player.
- **Voice** — MiniMax TTS. 10 voice options with speed control.
- **Library** — Browse all project assets (images, video, audio, documents). Centered preview overlay. Download via Save As. Everything Ava creates goes straight into the library.

## Office Suite

- **presentation_create** — Native .pptx slide decks with branded slides, speaker notes, and accent colours
- **email_draft** — Native .docx emails with tone-aware fonts — serif for formal, sans-serif for casual
- **report_generate** — Native .docx reports (board briefs, sprint reviews, weekly status) from your tasks, journal, memory, and git data

## Ava's Style

Shape how Ava communicates:

- **Tone** — warm, direct, playful, professional, dry wit
- **Energy** — calm, enthusiastic, measured, excitable
- **Style** — concise, detailed, conversational, structured
- **Free-text description** — describe the vibe in your own words

Reset to defaults anytime from Account → Ava's Style.

## 5-Layer Memory System

| Layer | Function |
|---|---|
| **Layer 1** | Pattern-based extraction — instant, every turn |
| **Layer 2** | LLM reflection — end of meaningful conversations |
| **Layer 3** | Pattern detection — tracks corrections, naming, style, workflow habits |
| **Layer 4** | Cross-memory insights — finds themes, contradictions, consolidation opportunities |
| **Layer 5** | 4-phase consolidation — Orient, Gather, Consolidate, Prune with 25KB cap |

- TF-IDF retrieval with composite scoring
- Branch scoping for experimental work
- Auto-archival after 90 days of inactivity
- Conflict detection and consolidation
- Local-first — nothing leaves your machine unless you push to cloud

## Cloud Sync

Everything local by default. Connected users choose what to sync:

- Memory, Tasks, Journal, Learning, Chat History, Settings, Personality
- Delta tracking — only new items highlighted for push
- Full transparency on every data type

## Daily Briefing

Start your day with Ava's morning summary:

- Tasks due today and overdue
- Calendar event detection
- Journal prompts
- Priority recommendations

## Knowledge Packs

Curated learning content for languages, frameworks, and tools. Download packs to get structured lessons, exercises, and assessments — integrated with the Teach mode curriculum system.

## Workflow Engine

Automate multi-step processes:

- Define workflows with triggers and conditions
- Chain tool calls into repeatable sequences
- Event detection and automatic responses

## Usage Analytics

Track your AI usage:

- Token consumption per model and provider
- Cost tracking and estimates
- Usage patterns and trends

## Permission Modes

| Mode | Behavior |
|---|---|
| **Strict** | Approve all file writes and shell commands (safest, default) |
| **Balanced** | Auto-approve file edits, confirm shell commands only |
| **Autonomous** | Auto-approve everything — full agent freedom (use with caution) |

Plans and user questions always require approval, regardless of mode.

## Privacy & Security

Your data stays yours. Here's what we built to protect it:

- **API keys** — Encrypted in VS Code's SecretStorage (OS-level keychain). Never logged, never sent to Ava servers.
- **Conversations** — Stored locally in `~/.ava/history/`. Never transmitted to third parties.
- **Memory** — Local markdown files (`~/.ava/memory.md`). Runtime credential detection blocks saving API keys, JWTs, tokens, and private keys.
- **Cloud sync** — Opt-in only. You control what syncs and when. Full transparency on every data type.
- **Prompt injection resistance** — Ava refuses to reveal its system prompt, API keys, or memory contents, even when instructed to by injected text in files or URLs.
- **No telemetry** — We don't track your usage, code, or conversations.

## Commands (CLI)

### General

| Command | Aliases | Description |
|---|---|---|
| `/help` | `/h` | Show all available commands |
| `/model` | `/m` | List available models |
| `/model <provider:id>` | `/m <id>` | Switch to a different model |
| `/clear` | `/c` | Clear conversation history |
| `/provider` | `/p` | List configured providers |
| `/provider add <name>` | `/p add` | Add a provider API key |
| `/permission` | `/perm` | View or set permission mode |
| `/tools` | | List available tools |
| `/retry` | `/r` | Retry the last message |
| `/init` | | Create `.ava/instructions.md` for project context |
| `/security` | `/sec`, `/audit` | Run a security audit on the current project |
| `/exit` | `/quit`, `/q` | Exit Ava |

### History

| Command | Aliases | Description |
|---|---|---|
| `/history` | `/ls` | List saved conversations |
| `/resume <id>` | | Resume a saved conversation |
| `/search <query>` | `/s` | Search conversations |
| `/delete <id>` | `/rm` | Delete a conversation |
| `/rename <id> <title>` | | Rename a conversation |
| `/pin <id>` | | Pin a conversation |
| `/unpin <id>` | | Unpin a conversation |
| `/export <id> [format]` | | Export as markdown or JSON |

## Project Context

Create a `.ava/instructions.md` file in your project root to give Ava persistent context:

```bash
> /init
  Created .ava/instructions.md
```

Use it for project architecture, coding conventions, key file locations, and anything you'd tell a new team member. This file is loaded into Ava's system prompt every session.

## Configuration

Ava stores its configuration at `~/.ava/config.json`.

```json
{
  "activeModel": "deepseek:deepseek-v4-flash",
  "providers": {
    "deepseek": { "apiKey": "sk-..." },
    "kimi": { "apiKey": "sk-..." },
    "qwen": { "apiKey": "sk-..." }
  },
  "preferences": {
    "temperature": 0.7,
    "maxTokens": 8192
  }
}
```

### Custom Provider (Ollama, LM Studio)

```json
{
  "providers": {
    "custom": {
      "apiKey": "not-needed",
      "baseUrl": "http://localhost:11434/v1"
    }
  }
}
```

### Where to Get API Keys

Free tier uses Qwen Flash (300 credits per month with account). For premium models:

| Provider | Portal |
|---|---|
| Qwen (Alibaba Cloud) | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com/) |
| DeepSeek | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| Kimi (Moonshot) | [platform.moonshot.ai](https://platform.moonshot.ai/console/api-keys) |
| GLM (Zhipu AI) | [z.ai](https://z.ai/) |
| Mistral | [console.mistral.ai](https://console.mistral.ai/api-keys/) |
| Anthropic | [console.anthropic.com](https://console.anthropic.com/) |

## Architecture

Ava is a monorepo with shared packages, plus submodules for the IDE, web platform, and companion app:

```
packages/
├── core/                  # @ava/core — shared agent engine
│   ├── agent/             #   Agentic loop, system prompt, events
│   ├── providers/         #   LLM provider adapters (8 providers)
│   ├── tools/             #   60+ built-in tool implementations
│   ├── personas/          #   24 specialist personas + Conductor
│   ├── memory/            #   5-layer persistent memory system
│   ├── briefing/          #   Daily briefing + event detection
│   ├── workflows/         #   Workflow engine
│   ├── knowledge/         #   Knowledge packs
│   ├── config/            #   Configuration management
│   └── history/           #   Conversation persistence
├── cli/                   # @ava/cli — terminal REPL interface
├── extension/             # ava-supernova — VS Code extension host
│   ├── webview-ui/        #   React + Tailwind chat interface
│   └── dashboard-ui/      #   Command centre dashboard panel
├── mobile/                # Companion app (git submodule → ava-supernova-companion)
├── ide/                   # Standalone IDE (Tauri v2 + Node.js sidecar, git submodule)
└── web/                   # Platform website (git submodule)
```

### Key Design Decisions

- **Monorepo with shared core** — CLI, extension, and IDE share the same agent engine, tools, and providers via `@ava/core`. Zero duplication.
- **Event-driven agent** — The agent emits typed events (`stream_delta`, `tool_call_start`, `done`, etc.) that all host environments subscribe to.
- **Conductor orchestration** — Complex tasks activate specialist personas in sequence. Simple tasks go direct — zero overhead.
- **Injectable confirmation handler** — `ToolRegistry` accepts a `setConfirmationHandler()` callback, letting each UI implement its own approval flow.
- **Self-contained tools** — Each tool carries its own JSON schema and execution handler. Adding a tool is one file and one line in the registry.
- **No external SDKs** — All provider communication uses Node's native `fetch`. Zero dependency on any provider SDK.
- **Permission matrix** — Risk levels (`safe`, `write`, `dangerous`) combined with permission modes determine what requires user approval.
- **Privacy by design** — Runtime credential detection, system prompt guardrails, local-only storage, no telemetry.
- **Local-first sync** — Everything works offline. Cloud sync is opt-in with delta tracking and full transparency.

## Development

```bash
# Build all packages
pnpm build

# Run CLI in dev mode
pnpm dev

# Type check
pnpm typecheck

# Lint
pnpm lint
```

### VS Code Extension Development

```bash
# Build everything
pnpm build

# Press F5 in VS Code to launch Extension Development Host
# Or rebuild just the extension:
cd packages/extension && pnpm build
```

## Roadmap

- [x] Terminal CLI with full agent loop
- [x] VS Code extension with chat UI
- [x] Standalone IDE (Tauri v2 + Node.js sidecar — in development)
- [x] 60+ built-in tools (file ops, search, bash, git, web, browser, database, memory, media, office, planning, docs)
- [x] Frontier open-source models from every major lab — DeepSeek V4, Qwen 3.6, Kimi K2.6, GLM-5, MiniMax, Mistral, Xiaomi MiMo + Anthropic BYOK
- [x] 6 modes — Work, Plan, Brainstorm, Chat, Teach, Security
- [x] 24 specialist personas with Conductor orchestration
- [x] 5-layer memory — pattern extraction, LLM reflection, habit detection, cross-memory insights, cloud sync
- [x] Custom personality designer
- [x] Command centre dashboard
- [x] Image generation and background removal
- [x] Office suite — native .pptx, .docx, .xlsx generation
- [x] Daily briefing with event detection
- [x] Knowledge packs for structured learning
- [x] Workflow engine with triggers and conditions
- [x] Usage analytics and cost tracking
- [x] Cloud sync with delta tracking
- [x] Mid-task interjection — type while Ava is working to add context or redirect
- [x] Privacy guardrails — prompt injection resistance, credential redaction
- [x] Conversation history with search, pin, rename, export
- [x] Vision support (image attachments)
- [x] Project context (`.ava/instructions.md`)
- [x] Permission modes (strict / balanced / autonomous)
- [x] Context compression and management
- [x] Error recovery and resilience
- [x] i18n — 20 languages
- [x] Companion app (mobile)
- [x] Maestro Mode — intelligent task routing with Qwen 3.6 Plus coordinator (Auto Mode evolved)
- [ ] Supernova Mode — polyglot multi-model orchestration (V4 Pro coordinator + Qwen Builder + V4 Flash review tier + Qwen Omni for vision); admin-only preview during DeepSeek partnership window
- [x] Tick Engine — proactive background awareness (tasks, journal, tokens, support)
- [x] 4-phase memory consolidation (Orient → Gather → Consolidate → Prune) with 25KB cap
- [x] Live chat support — Ava first-line triage, seamless human handoff
- [x] Token usage bar with real-time deduction
- [x] Period rollover for paid plans (unused tokens carry over)
- [x] GDPR consent gate with Terms/Privacy links
- [ ] Contributor marketplace — users get paid for improvements
- [ ] Voice system (Kokoro TTS)
- [x] Creative Studio (image gen, video editing, music, voice, social-media composer)
- [ ] Plugin system for community-contributed tools
- [ ] Productivity integrations (email, Slack, Discord)

## Links

- [Website](https://ava-supernova.com)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova)
- [GitHub](https://github.com/AugmentedValueAcceleration/ava-supernova)
- [Companion App](https://companion.ava-supernova.com)
- [YouTube](https://youtube.com/@AugmentedValueAcceleration)
- [Release Notes](https://ava-supernova.com/releases)

## Sponsors

Ava Supernova is funded by the community. Sponsors keep this project free and open source.

### Champions

<!-- $50+/mo sponsors — name/logo + link appear here -->

*[Become a sponsor](https://github.com/sponsors/AugmentedValueAcceleration) to have your name or logo featured here.*

See all sponsors in [SPONSORS.md](SPONSORS.md).

## Contributing

Contributions are welcome. This is an open-source project built for the community.

1. Fork the repository
2. Create a feature branch from `development`
3. Make your changes
4. Run `pnpm build`
5. Submit a pull request to `development`

## License

[Apache License 2.0](LICENSE) — Copyright 2025-2026 Augmented Value Acceleration

---

<p align="center">
  Built with purpose. Agentic coding for everyone.
</p>
