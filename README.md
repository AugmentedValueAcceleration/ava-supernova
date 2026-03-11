<p align="center">
  <h1 align="center">Ava | Supernova</h1>
  <p align="center">
    <strong>Open-source AI coding agent — 15 models, 7 providers, 26 tools, 2 free models that work instantly.</strong>
  </p>
  <p align="center">
    <a href="#supported-models">Models</a> &middot;
    <a href="#getting-started">Getting Started</a> &middot;
    <a href="#vscode-extension">Extension</a> &middot;
    <a href="#ide">IDE</a> &middot;
    <a href="#tools-24">Tools</a> &middot;
    <a href="#privacy--security">Privacy</a> &middot;
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

Ava | Supernova is an open-source AI coding agent that brings full agentic coding to every developer — as a **VS Code extension**, a **standalone IDE**, and a **terminal CLI**. Two free models work instantly with zero setup. Add your own API keys for 13 more models from 7 providers.

> **Start coding with AI in 30 seconds.** Install, open, go. No account, no credit card, no trial expiry.

## Why Ava?

Agentic coding shouldn't be a luxury. The open-source model ecosystem delivers near-frontier autonomous coding performance at a fraction of the cost.

| Model | SWE-Bench | Input Cost |
|---|---|---|
| GLM-5 (Zhipu AI) | 77.8% | $1.00/M |
| Kimi K2.5 (Moonshot) | 76.8% | $0.60/M |
| Qwen 3.5 Plus (Alibaba) | ~76% | $0.40/M |
| DeepSeek V3.2 | ~66% | $0.28/M |
| **GLM-4.7 Flash** | — | **FREE** |
| **GLM-4.5 Flash** | — | **FREE** |

## Supported Models

| Provider | Models | Highlights |
|---|---|---|
| **Ava Free** | GLM-4.7 Flash, GLM-4.5 Flash | **FREE — no API key needed**, instant access |
| **Zhipu AI** | GLM-5 | 77.8% SWE-Bench, vision, best tool-call reliability |
| **Moonshot AI** | Kimi K2.5 | 76.8% SWE-Bench, best tool calling, vision, 256K context |
| **DeepSeek** | V3.2, Reasoner | Best value ($0.28/M input), Reasoner has chain-of-thought |
| **Alibaba Cloud** | Qwen 3.5 Plus | Thinking + vision, 256K context |
| **Mistral** | Large, Codestral, Devstral 2 | European provider, code-specialized, up to 262K context |
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | Frontier models, vision, 200K context |
| **Generic** | Custom / Local | Ollama, LM Studio, or any standard API format endpoint |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v20.0.0 or later
- [pnpm](https://pnpm.io) package manager
- An API key from any supported provider — **or use the free models with no keys at all**

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

On first launch, Ava guides you through an interactive setup wizard. Choose a provider, paste your API key, and you're ready — or skip setup entirely and use a free model.

## VS Code Extension

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova) — or search "Ava Supernova" in the Extensions panel.

### Quick Start

1. Install the extension
2. Click the Ava icon in the activity bar (or press `Ctrl+Shift+A`)
3. **Start coding immediately** — free models work with zero configuration
4. Optionally add API keys for premium models via the Dashboard

### Extension Features

- **Agentic coding** — Ava reads, writes, edits, searches, and executes code autonomously
- **Four modes** — Code (`>>` full agent), Plan (`::` read-only), Chat (`..` no tools), Security (`!!` OWASP audit)
- **Model selector** — Switch models from the header dropdown with provider labels and availability indicators
- **Persistent memory** — Ava remembers across sessions with structured entries, TF-IDF retrieval, branch scoping, and auto-archival (credentials blocked at runtime)
- **Mid-task interjection** — Type while Ava is working to add context, corrections, or redirect — true collaborative flow
- **Vision** — Attach images in chat for models that support it
- **Codebase understanding** — Project indexer and symbol finder for intelligent code navigation
- **Context compression** — Automatic context management keeps long conversations within model limits
- **Conversation history** — Auto-saved per project, searchable, with quick access from the header
- **Project context** — Create `.ava/instructions.md` to give Ava persistent knowledge about your codebase
- **Tool approval** — Review every action before Ava executes it, or grant autonomy with permission modes
- **Security scanning** — AI-powered OWASP-aligned security audit using existing tools
- **Dashboard panel** — Provider configuration, model selection, memory management, and settings
- **20 languages** — Full UI and response localization

## IDE

Ava | Supernova IDE is a standalone desktop application built on [Eclipse Theia](https://theia-ide.org/) with Ava deeply integrated. Download from [GitHub Releases](https://github.com/AugmentedValueAcceleration/ava-supernova-ide/releases) or from [ava-supernova.com](https://ava-supernova.com).

The IDE includes everything in the extension plus:
- Full VS Code extension compatibility (via Open VSX)
- Built-in terminal, file tree, Git, settings, keybindings
- Monaco editor (same engine as VS Code)
- `@ava/core` runs directly in the Node.js backend — no sidecar needed

## Tools (26)

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

The agent automatically decides which tools to use, executes them, reads the results, and continues reasoning — up to 50 iterations per request.

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
- **Free proxy** — Messages stream through to the model provider. Nothing is logged or stored on our servers.
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
  "activeModel": "deepseek:deepseek-chat",
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

Free models require no keys. For premium models:

| Provider | Portal |
|---|---|
| DeepSeek | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| Kimi (Moonshot) | [platform.moonshot.ai](https://platform.moonshot.ai/console/api-keys) |
| GLM (Zhipu AI) | [open.bigmodel.cn](https://open.bigmodel.cn/) |
| Qwen (Alibaba Cloud) | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com/) |
| Mistral | [console.mistral.ai](https://console.mistral.ai/api-keys/) |
| Anthropic | [console.anthropic.com](https://console.anthropic.com/) |

## Architecture

Ava is a monorepo with shared packages, plus submodules for the IDE and web platform:

```
packages/
├── core/                  # @ava/core — shared agent engine
│   ├── agent/             #   Agentic loop, system prompt, events
│   ├── providers/         #   LLM provider adapters (7 providers)
│   ├── tools/             #   24 built-in tool implementations
│   ├── memory/            #   Persistent memory system
│   ├── config/            #   Configuration management
│   └── history/           #   Conversation persistence
├── cli/                   # @ava/cli — terminal REPL interface
├── extension/             # ava-supernova — VS Code extension host
│   ├── webview-ui/        #   React + Tailwind chat interface
│   └── dashboard-ui/      #   Provider config and settings panel
├── ide/                   # Standalone IDE (Eclipse Theia, git submodule)
└── web/                   # Platform website (git submodule)
```

### Key Design Decisions

- **Monorepo with shared core** — CLI, extension, and IDE share the same agent engine, tools, and providers via `@ava/core`. Zero duplication.
- **Event-driven agent** — The agent emits typed events (`stream_delta`, `tool_call_start`, `done`, etc.) that all host environments subscribe to.
- **Injectable confirmation handler** — `ToolRegistry` accepts a `setConfirmationHandler()` callback, letting each UI implement its own approval flow.
- **Self-contained tools** — Each tool carries its own JSON schema and execution handler. Adding a tool is one file and one line in the registry.
- **No external SDKs** — All provider communication uses Node's native `fetch`. Zero dependency on any provider SDK.
- **Permission matrix** — Risk levels (`safe`, `write`, `dangerous`) combined with permission modes determine what requires user approval.
- **Privacy by design** — Runtime credential detection, system prompt guardrails, local-only storage, no telemetry.

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
- [x] Standalone IDE (Eclipse Theia)
- [x] 26 built-in tools (file ops, search, bash, git, web, browser, database, memory, planning, docs)
- [x] 15 models from 7 providers, including 2 free models
- [x] Smart memory v2 — structured entries, TF-IDF retrieval, branch scoping, auto-archival, credential blocking
- [x] Mid-task interjection — type while Ava is working to add context or redirect
- [x] Privacy guardrails — prompt injection resistance, credential redaction
- [x] Conversation history with search, pin, rename, export
- [x] Vision support (image attachments)
- [x] Project context (`.ava/instructions.md`)
- [x] Permission modes (strict / balanced / autonomous)
- [x] Context compression and management
- [x] Error recovery and resilience
- [x] i18n — 20 languages
- [x] Security scanning mode — OWASP-aligned audits
- [ ] Memory system improvements — platform sync, embeddings
- [ ] Plugin system for community-contributed tools
- [ ] Productivity tools (email, Slack, Discord)
- [ ] Settings/history sync across machines

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
