# Ava | Supernova — VS Code Extension

Open-source AI coding agent powered by the best open-source and frontier models. Full agentic coding in your editor — with **two free models that work instantly, no API key required**.

> **Start coding with AI in 30 seconds.** Install, open, go. Free models are always available.

## Highlights

- **2 free models** — GLM-4.7 Flash and GLM-4.5 Flash work instantly with zero setup
- **14 models, 7 providers** — DeepSeek, Kimi, Zhipu AI, Qwen, Mistral, Anthropic, plus any local/custom endpoint
- **29 built-in tools** — File ops, search, git, shell, web, browser, database, screenshots, planning, memory
- **Smart memory** — TF-IDF retrieval, temporal awareness, branch scoping, auto-archival — Ava gets smarter every session
- **Privacy first** — API keys encrypted in OS keychain, credentials blocked from memory, prompt injection resistance
- **20 languages** — Full UI and response localization

## Features

- **Agentic coding** — Ava reads, writes, edits, searches, and executes code autonomously with tool-calling
- **Mid-task interjection** — Type while Ava is working to add context, corrections, or redirect without waiting — true collaborative flow
- **Four modes** — Code (`>>` full agent), Plan (`::` read-only), Chat (`..` no tools), Security (`!!` OWASP audit)
- **Model selector** — Switch models from the header dropdown with provider labels, benchmarks, and availability indicators
- **Smart memory v2** — Structured, categorized memories with TF-IDF retrieval, composite relevance scoring, branch scoping, and auto-archival of stale entries. Credentials are blocked at runtime.
- **Vision** — Attach images in chat for models that support it (Claude, GLM-5, Kimi K2.5, Qwen 3.5 Plus, Mistral Large)
- **Codebase understanding** — Project indexer and symbol finder for intelligent code navigation
- **Context compression** — Automatic context management keeps long conversations within model limits
- **Error recovery** — Resilient tool execution with automatic retry and graceful fallbacks
- **Conversation history** — Auto-saved per project, searchable, with quick access from the header
- **Project context** — Create `.ava/instructions.md` to give Ava persistent knowledge about your codebase
- **Tool approval** — Review every action before Ava executes it, or grant autonomy with permission modes
- **Security scanning** — AI-powered OWASP-aligned security audit using existing tools
- **Task management** — Full life-management system with dashboard, collapsible chat panel (Personal + Ava tabs), recurrence, priorities, categories, and platform sync
- **Session transparency** — When Ava works on complex tasks, her step-by-step progress shows in the Ava tab with a live progress bar
- **Dashboard panel** — Provider configuration, model selection, task management, memory management, and settings inside VS Code
- **Documentation viewer** — Built-in docs panel for quick reference without leaving the editor

## Quick Start

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova)
2. Click the Ava icon in the activity bar (or press `Ctrl+Shift+A`)
3. **Start coding immediately** — free models work with zero configuration
4. Optionally add API keys for premium models via the Dashboard

> No account needed. No credit card. No trial expiry. Just install and go.

## Supported Models

| Provider | Models | Highlights |
|---|---|---|
| **Ava Free** | GLM-4.7 Flash, GLM-4.5 Flash | **FREE — no API key needed**, instant access for all users |
| **Zhipu AI** | GLM-5 | 77.8% SWE-Bench, vision, best tool-call reliability |
| **Moonshot AI** | Kimi K2.5 | 76.8% SWE-Bench, best tool calling, vision, 256K context |
| **DeepSeek** | V3.2, Reasoner | Best value ($0.28/M input), Reasoner has chain-of-thought |
| **Alibaba Cloud** | Qwen 3.5 Plus | Thinking + vision, 256K context, $0.20/M input (partnership) |
| **Mistral** | Large, Codestral, Devstral 2 | European provider, code-specialized, up to 262K context |
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | Frontier models, vision, 200K context |
| **Generic** | Custom / Local | Ollama, LM Studio, or any standard API format endpoint |

## Memory System (v2)

Ava's memory system is a key differentiator — it makes every model smarter over time.

- **9 categories** — pattern, preference, architecture, bug-fix, convention, tool-config, decision, person, general
- **TF-IDF retrieval** — Smart search finds relevant memories without exact substring matches
- **Composite scoring** — Results ranked by content relevance (55%), recency (25%), and recall frequency (20%)
- **Conflict detection** — Duplicate/overlapping entries automatically merged using TF-IDF similarity
- **Branch scoping** — Scope memories to specific git branches for experimental work
- **Auto-archival** — Entries inactive for 90+ days flagged as stale, can be auto-archived
- **Consolidation** — Related entries grouped by TF-IDF similarity for review and merging
- **Dashboard** — Active/Stale/Archived tabs, category filters, branch badges, edit/archive/restore

## Task Management

Built-in life management — not just coding tasks, but everything. Three integrated surfaces:

- **Dashboard** — Full CRUD task manager with stats, filters by priority and category, search, recurrence, and subtask tracking
- **Chat Panel** — Collapsible right-side panel in the chat view with **Personal** and **Ava** tabs — your today tasks and Ava's live session progress with a visual progress bar
- **Chat Integration** — Tell Ava to manage tasks naturally. Session tasks from `todo_write` persist and show in real-time

Key features:

- **Local-first** — JSON storage at `~/.ava/tasks.json` (global) and `.ava/tasks.json` (per project). Works offline.
- **4 priorities** — Low, medium, high, urgent with color-coded badges
- **5 categories** — Coding, personal, admin, meeting, custom
- **Recurrence** — Daily or weekly auto-regeneration of completed tasks
- **Platform sync** — Connected users get tasks synced to the cloud automatically
- **Ava context** — Active tasks injected into Ava's system prompt so she knows what you're working on

## Tools (29)

| Category | Tools | Description |
|---|---|---|
| **File ops** | `file_read`, `file_write`, `file_edit` | Read, create, and surgically edit files |
| **Search** | `glob`, `grep`, `list_directory`, `find_symbol`, `project_index` | Find files, search content, navigate symbols |
| **Shell** | `bash` | Execute commands, run builds, start servers |
| **Git** | `git_status`, `git_diff`, `rollback` | Check repo state, view diffs, undo changes |
| **Web** | `web_search`, `http_request`, `browser` | Search the web, test APIs, automate browsers |
| **Media** | `screenshot` | Capture screen for visual analysis |
| **Data** | `database_query` | Read-only SQL against PostgreSQL, SQLite, MySQL |
| **Memory** | `memory_save`, `memory_recall`, `memory_update`, `memory_delete` | Smart persistent memory with TF-IDF retrieval |
| **Planning** | `present_plan`, `todo_write` | Structured plans with approval, task tracking |
| **Interaction** | `ask_user`, `support_request` | Ask for clarification, submit support tickets |
| **Docs** | `docs_lookup` | Search built-in documentation |
| **Meta** | `propose_tool`, `get_datetime` | Agent self-improvement proposals, time awareness |

## Privacy & Security

Your data stays yours. Here's what we built to protect it:

- **API keys** — Encrypted in VS Code's SecretStorage (OS-level keychain). Never logged, never sent to Ava servers.
- **Conversations** — Stored locally in `~/.ava/history/`. Never transmitted to third parties.
- **Memory** — Local JSON files (`~/.ava/memory.json`). Runtime credential detection blocks saving API keys, JWTs, tokens, and private keys.
- **Free proxy** — Messages stream through to the model provider. Nothing is logged or stored on our servers.
- **Prompt injection resistance** — Ava refuses to reveal its system prompt, API keys, or memory contents, even when instructed to by injected text in files or URLs.
- **No telemetry** — We don't track your usage, code, or conversations.

## Settings

Open **Settings** (`Ctrl+,`) and search `ava-supernova` to configure:

| Setting | Description |
|---|---|
| **Active Model** | Select from 14 models across 7 providers (2 free) |
| **Temperature** | Sampling temperature — 0 = deterministic, 1 = creative (default: 0.7) |
| **Language** | UI and response language (20 languages + auto-detect) |
| **Permission Mode** | Strict, Balanced, or Autonomous |
| **Max Tokens** | Maximum output tokens per response |
| **Auto Memory** | Enable/disable automatic memory persistence |
| **Stream Responses** | Enable/disable streaming output |

## Permission Modes

| Mode | Behavior |
|---|---|
| **Strict** | Approve all file writes and shell commands (safest, default) |
| **Balanced** | Auto-approve file edits, confirm shell commands only |
| **Autonomous** | Auto-approve everything — full agent freedom (use with caution) |

## Where to Get API Keys

Free models require no keys. For premium models:

| Provider | Portal |
|---|---|
| DeepSeek | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| Kimi (Moonshot) | [platform.moonshot.ai](https://platform.moonshot.ai/console/api-keys) |
| GLM (Zhipu AI) | [open.bigmodel.cn](https://open.bigmodel.cn/) |
| Qwen (Alibaba Cloud) | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com/) |
| Mistral | [console.mistral.ai](https://console.mistral.ai/api-keys/) |
| Anthropic | [console.anthropic.com](https://console.anthropic.com/) |

## Commands

| Command | Shortcut | Description |
|---|---|---|
| **Ava: Open Chat** | `Ctrl+Shift+A` | Start an AI coding session |
| **Ava: New Chat** | — | Fresh conversation with context reset |
| **Ava: Switch Model** | — | Choose from 14 models |
| **Ava: Chat History** | — | Browse and resume previous conversations |
| **Ava: Open Dashboard** | — | Manage API keys and providers |
| **Ava: Documentation** | — | Built-in reference guide |
| **Ava: Getting Started** | — | Setup wizard for new users |

## Links

- [GitHub](https://github.com/AugmentedValueAcceleration/ava-supernova) — Source code, issues, and contributions
- [Website](https://ava-supernova.com) — Project homepage
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova) — Install page

## License

[Apache License 2.0](../../LICENSE) — Copyright 2025-2026 Augmented Value Acceleration
