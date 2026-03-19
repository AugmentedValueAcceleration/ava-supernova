# Ava | Supernova

The open-source AI coding agent that remembers you.

54 tools. 6 modes. 14 personas. Memory that persists. A personal tutor that teaches for free. Custom personality. Command centre dashboard. Image generation. Office suite. 14 models from 7 providers — **two free models that work instantly, no API key required**.

> **Install, open, go.** No account. No credit card. No trial. Just start.

## What makes Ava different

- **She remembers you** — 4-layer memory system that learns your coding style, decisions, conventions, and preferences. Every session she's better at helping you specifically.
- **She thinks before she builds** — 14 internal personas (Scout, Architect, Verifier, Sequencer, Challenger, Builder) plan before executing. Complex tasks get proper analysis, not just code generation.
- **She teaches for free** — Switch to Teach mode, say "teach me Python", and she builds a personalised curriculum with spaced repetition. Education shouldn't have a price tag.
- **She's yours to design** — Name her. Choose the tone, energy, and communication style. Same brain, your personality.
- **She explains herself** — Ask "how does your memory work?" and she reads her own source code and explains it. The only AI that can.

## 6 Modes — States of Thought

Modes aren't tool restrictions — they're states of mind.

| Mode | Prefix | Purpose |
|---|---|---|
| **Work** | `>>` | Builder mindset — full 54-tool agent |
| **Plan** | `::` | Architect mindset — read-only analysis and strategic planning |
| **Brainstorm** | `**` | Ideation mindset — research, generate, challenge, refine ideas |
| **Chat** | `..` | Friend mindset — personal conversation, memory, journal |
| **Teach** | `??` | Tutor mindset — personalised learning with spaced repetition |
| **Security** | `!!` | Auditor mindset — OWASP-aligned security scanning |

Switch modes with the dropdown or keyboard shortcuts `Ctrl+Shift+1` through `Ctrl+Shift+6`.

## 14 Personas — Internal Specialist Team

When Ava takes on a complex task, her internal team activates:

**Work:** Scout → Architect → Verifier → Sequencer → Challenger → Builder
**Plan:** Researcher → Analyst → Strategist → Challenger
**Teach:** Curriculum Architect → Content Writer → Verifier → Quiz Master → Tutor
**Security:** Recon → Scanner → Researcher → Verifier → Reporter
**Brainstorm:** Explorer → Researcher → Ideator → Challenger → Refiner

Each persona has scoped tool access. Challenger can read but never write. Simple questions skip orchestration — zero overhead.

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

## 53 Tools

| Category | Tools |
|---|---|
| **File ops** | `file_read`, `file_write`, `file_edit` |
| **Search** | `glob`, `grep`, `list_directory`, `find_symbol`, `project_index` |
| **Shell** | `bash` |
| **Git** | `git_status`, `git_diff`, `rollback`, `git_commit`, `git_create_pr` |
| **Web** | `web_search`, `http_request`, `browser` |
| **Media** | `screenshot`, `generate_image` |
| **Data** | `database_query` |
| **Memory** | `memory_save`, `memory_recall`, `memory_update`, `memory_delete` |
| **Tasks** | `task_manage` |
| **Journal** | `journal_write` |
| **Documents** | `document_manage` |
| **Learning** | `learning_create`, `learning_teach`, `learning_progress` |
| **Testing** | `test_run`, `test_generate` |
| **Architecture** | `analyze_architecture` |
| **Docs** | `doc_generate` |
| **Security** | `audit_dependencies` |
| **Performance** | `benchmark` |
| **Batch** | `apply_plan` |
| **Debug** | `debug_logs` |
| **Office** | `presentation_create`, `email_draft`, `report_generate` |
| **Planning** | `present_plan`, `todo_write` |
| **Interaction** | `ask_user`, `support_request` |
| **Self** | `docs_lookup`, `propose_tool`, `self_inspect`, `release_notes` |
| **Utility** | `get_datetime`, `detect_language`, `weather`, `news` |

## Image Generation

Ask Ava to create icons, illustrations, backgrounds, or any visual asset. Powered by Alibaba's Wan2.6 model. Images save directly to your project's `images/` folder with sensible names.

Browse generated images in the **Dashboard Library** — grid or list view, filter by subfolder, preview, open in editor, copy path.

## Office Suite

- **presentation_create** — Marp-compatible slide decks with templates (pitch deck, sprint review, board brief)
- **email_draft** — Professional emails with tone control (formal, casual, brief, friendly, assertive)
- **report_generate** — Board briefs, sprint reviews, weekly status from your tasks, journal, memory, and git data

## Custom Personality

Design your own AI companion:

- **Name** — call her Ava, or name her anything you want
- **Pronouns** — she/her, he/him, they/them
- **Tone** — warm, direct, playful, professional, dry wit
- **Energy** — calm, enthusiastic, measured, excitable
- **Style** — concise, detailed, conversational, structured
- **Free-text description** — describe exactly who you want

The dashboard header updates to show your AI's name. Reset to default Ava anytime.

## 4-Layer Memory System

| Layer | Function |
|---|---|
| **Layer 1** | Pattern-based extraction — instant, every turn |
| **Layer 2** | LLM reflection — end of meaningful conversations |
| **Layer 3** | Pattern detection — tracks corrections, naming, style, workflow habits |
| **Layer 4** | Cross-memory insights — finds themes, contradictions, consolidation opportunities |

- TF-IDF retrieval with composite scoring
- Branch scoping for experimental work
- Auto-archival after 90 days of inactivity
- Conflict detection and consolidation
- Local-first — nothing leaves your machine unless you push to cloud

## Cloud Sync

Everything local by default. Connected users choose what to sync:

- Memory, Tasks, Journal, Learning, Chat History, Settings, Personality
- "Your device: 128. Cloud: 128. Up to date ✓"
- Delta tracking — only new items highlighted for push
- Full transparency on every data type

## Supported Models

| Provider | Models | Highlights |
|---|---|---|
| **Ava Free** | GLM-4.7 Flash, GLM-4.5 Flash | **FREE — no API key**, instant access |
| **Alibaba Cloud** | Qwen 3.5 Plus | Vision, thinking, 256K context, $0.20/M input |
| **Zhipu AI** | GLM-5 | 77.8% SWE-Bench, vision, best tool-call reliability |
| **Moonshot AI** | Kimi K2.5 | 76.8% SWE-Bench, vision, 256K context |
| **DeepSeek** | V3.2, Reasoner | Best value ($0.28/M), chain-of-thought |
| **Mistral** | Large, Codestral, Devstral 2 | European, code-specialized, up to 262K context |
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | Frontier models, vision, 200K context |
| **Generic** | Custom / Local | Ollama, LM Studio, or any standard API endpoint |

## Quick Start

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova)
2. Click the Ava icon in the activity bar (or `Ctrl+Shift+A`)
3. Start coding — free models work with zero configuration
4. Optionally add API keys for premium models via the Dashboard

> No account. No credit card. No trial. Just install and go.

## Privacy

- API keys encrypted in OS keychain
- All data stored locally by default
- Credentials blocked from memory at runtime
- No telemetry, no tracking
- Prompt injection resistance built in
- You control what syncs and when

## Links

- [Website](https://ava-supernova.com)
- [GitHub](https://github.com/AugmentedValueAcceleration/ava-supernova)
- [Companion App](https://companion.ava-supernova.com)
- [YouTube](https://youtube.com/@AugmentedValueAcceleration)
- [Release Notes](https://ava-supernova.com/releases)

## License

[Apache License 2.0](../../LICENSE) — Copyright 2025-2026 Augmented Value Acceleration
