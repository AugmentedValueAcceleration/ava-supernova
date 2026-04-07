# Ava | Supernova

The open-source AI coding agent that remembers you.

54 tools. 6 modes. 24 specialist personas. Memory that persists. A personal tutor that teaches for free. Custom personality. Command centre dashboard. Image generation. Office suite. 12 models from 7 providers — **3M free Qwen tokens with an account, or bring your own API keys**.

> **Install, open, go.** No account. No credit card. No trial. Just start.

## What makes Ava different

- **She remembers you** — 5-layer memory system that learns your coding style, decisions, conventions, and preferences. Every session she's better at helping you specifically.
- **She thinks before she builds** — 24 specialist personas across 5 modes plan before executing. Complex tasks get proper analysis, not just code generation.
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

## Personas — Internal Specialist Team

When Ava takes on a complex task, her internal team activates:

**Work:** Scout → Architect → Verifier → Sequencer → Challenger → Builder
**Plan:** Researcher → Architect → Challenger
**Teach:** Curriculum Architect → Content Writer → Fact Checker → Quiz Master → Tutor
**Security:** Recon → Scanner → CVE Researcher → Verifier → Reporter
**Brainstorm:** Explorer → Researcher → Ideator → Challenger → Refiner

Each persona has scoped tool access. Challenger can read but never write. Simple questions skip orchestration — zero overhead.

## Unified Panel

Chat and Dashboard are one unified app inside a single editor panel. Click the Ava icon and everything is right there — chat, memory, tasks, journal, settings — all connected by a collapsible nav sidebar.

- **Single editor tab** — no more switching between sidebar and panel
- **Collapsible sidebar** — flip between left and right, persisted across sessions
- **Chat header** — model selector, Local/Cloud toggle, Provider toggle, token counter, context usage ring
- **Single bubble** — all thinking, tool calls, and text in one cohesive message per response
- **Identical layout** to the Ava IDE — seamless transition between surfaces

## Local/Cloud Data Sync

Your data, your choice. Local-first by default — nothing leaves your machine unless you choose it.

- **Green "Local"** — data stays on your machine, nothing syncs
- **Blue "Cloud"** — auto-syncs every 15 minutes (memory, tasks, journal, learning, history, settings, personality)
- Toggle in the chat header, persisted across sessions
- Only visible when connected to a platform account

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

## 54 Tools

| Category | Tools |
|---|---|
| **File ops** | `file_read`, `file_write`, `file_edit` |
| **Search** | `glob`, `grep`, `list_directory`, `find_symbol`, `project_index` |
| **Shell** | `bash` |
| **Git** | `git_status`, `git_diff`, `rollback`, `git_commit`, `git_create_pr` |
| **Web** | `web_search`, `http_request`, `browser` |
| **Media** | `screenshot`, `generate_image`, `remove_background` |
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

- **presentation_create** — Native .pptx slide decks with branded slides, speaker notes, and accent colours (via pptxgenjs)
- **email_draft** — Native .docx emails with tone-aware fonts — serif for formal, sans-serif for casual
- **report_generate** — Native .docx reports (board briefs, sprint reviews, weekly status) from your tasks, journal, memory, and git data

## Custom Personality

Design your own AI companion:

- **Name** — call her Ava, or name her anything you want
- **Pronouns** — she/her, he/him, they/them
- **Tone** — warm, direct, playful, professional, dry wit
- **Energy** — calm, enthusiastic, measured, excitable
- **Style** — concise, detailed, conversational, structured
- **Free-text description** — describe exactly who you want

The dashboard header updates to show your AI's name. Reset to default Ava anytime.

## 5-Layer Memory System

| Layer | Function |
|---|---|
| **Layer 1** | Pattern-based extraction — instant, every turn |
| **Layer 2** | LLM reflection — end of meaningful conversations |
| **Layer 3** | Pattern detection — tracks corrections, naming, style, workflow habits |
| **Layer 4** | Cross-memory insights — finds themes, contradictions, consolidation opportunities |
| **Layer 5** | Cloud sync + semantic search — vector embeddings for intelligent cross-device recall |

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
| **Ava Free** | Qwen Flash, Qwen 3.5 Plus | **FREE — 3M Qwen tokens** with account |
| **Zhipu AI** | GLM-5 | 77.8% SWE-Bench, vision, best tool-call reliability |
| **Moonshot AI** | Kimi K2.5 | 76.8% SWE-Bench, vision, 256K context |
| **DeepSeek** | V3.2, Reasoner | Best value ($0.28/M), chain-of-thought |
| **Mistral** | Large, Codestral, Devstral 2 | European, code-specialized, up to 262K context |
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | Frontier models, vision, 200K context |
| **Generic** | Custom / Local | Ollama, LM Studio, or any standard API endpoint |

## Quick Start

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova)
2. Click the Ava icon in the activity bar (or `Ctrl+Shift+A`)
3. Sign up for 3M free Qwen tokens, or add your own API keys in Settings
4. Start coding

> No account. No credit card. No trial. Just install and go.

## Privacy

- API keys encrypted in OS keychain
- All data stored locally by default
- Credentials blocked from memory at runtime
- No analytics or screen captures
- Prompt injection resistance built in
- You control what syncs and when

### Shared Learning (Opt-In)

Ava includes an optional **Contribute Shared Learning** setting (off by default). When enabled, anonymised feedback data is shared to improve response quality for all users:

- Message ratings (thumbs up/down) and selected reason
- Model and mode used
- Timestamp

**No code, no conversation content, and no personal data is ever shared.** You can disable this at any time in Settings. Usage data (token counts, model used) is reported only for users with a platform account, for billing and fair-use purposes.

## Privacy & Terms

Code context is sent only to your chosen AI provider for processing. All memory and conversation data is stored locally on your machine. Cloud sync is opt-in only.

Built by **Augmented Value Acceleration Ltd**, registered in England and Wales. Fully UK GDPR compliant.

- [Privacy Policy](https://ava-supernova.com/privacy)
- [Terms of Service](https://ava-supernova.com/terms)

## Links

- [Website](https://ava-supernova.com)
- [GitHub](https://github.com/AugmentedValueAcceleration/ava-supernova)
- [Companion App](https://companion.ava-supernova.com)
- [YouTube](https://youtube.com/@AugmentedValueAcceleration)
- [Release Notes](https://ava-supernova.com/releases)

## License

[Apache License 2.0](../../LICENSE) — Copyright 2025-2026 Augmented Value Acceleration
