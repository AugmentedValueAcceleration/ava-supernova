<p align="center">
  <h1 align="center">Ava | Supernova</h1>
  <p align="center">
    <strong>Open-source AI coding agent — CLI + VSCode extension for agentic coding with open-source LLMs.</strong>
  </p>
  <p align="center">
    <a href="#supported-providers">Providers</a> &middot;
    <a href="#getting-started">Getting Started</a> &middot;
    <a href="#vscode-extension">Extension</a> &middot;
    <a href="#tools">Tools</a> &middot;
    <a href="#commands">Commands</a> &middot;
    <a href="#configuration">Configuration</a> &middot;
    <a href="#contributing">Contributing</a>
  </p>
  <p align="center">
    <a href="https://github.com/AugmentedValueAcceleration/ava-supernova/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License"></a>
    <img src="https://img.shields.io/badge/Node-%3E%3D20.0.0-brightgreen.svg" alt="Node">
    <img src="https://img.shields.io/badge/TypeScript-5.9-blue.svg" alt="TypeScript">
    <img src="https://img.shields.io/badge/Version-0.1.0-purple.svg" alt="Version">
  </p>
</p>

---

Ava | Supernova is an open-source AI coding agent that brings the power of agentic coding to every developer — as both a **terminal CLI** and a **VSCode extension**. Choose your model, plug in your API key, and get a full coding agent that can read, write, edit, search, plan, and execute across your entire codebase.

## Why Ava?

Agentic coding shouldn't be a luxury. The open-source model ecosystem delivers near-frontier autonomous coding performance at **50-100x lower cost** than proprietary alternatives.

| Model | SWE-Bench | Input Cost / 1M tokens |
|---|---|---|
| Qwen 3.5 Plus | 76.4% | $0.40 |
| Kimi K2.5 | 76.8% | $0.60 |
| DeepSeek V3.2 | ~66% | $0.14 |

Ava bridges the gap between these powerful models and a polished agentic coding experience.

## Supported Providers

| Provider | Models | Context Window | Tool Calling | Streaming |
|---|---|---|---|---|
| **DeepSeek** | DeepSeek V3, DeepSeek R1 | 128K | Yes* | Yes |
| **Kimi** (Moonshot AI) | Kimi K2.5, Moonshot V1 | 128K - 256K | Yes | Yes |
| **Qwen** (Alibaba Cloud) | Qwen 3.5 Plus, Qwen Turbo | 256K - 1M | Yes | Yes |
| **Custom** | Any compatible endpoint | Configurable | Yes | Yes |

*DeepSeek R1 (reasoner) does not support tool calling but supports extended thinking.
Qwen 3.5 Plus supports native vision (images) and extended thinking.

The **Custom** provider supports any locally hosted model via [Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai), or any server exposing a standard API format.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v20.0.0 or later
- [pnpm](https://pnpm.io) package manager
- An API key from at least one supported provider

### Installation

```bash
# Clone the repository
git clone https://github.com/AugmentedValueAcceleration/ava-supernova.git
cd ava-supernova

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### CLI — First Run

```bash
# Start the CLI
node packages/cli/dist/index.js

# Or link globally
cd packages/cli && npm link
ava
```

On first launch, Ava guides you through an interactive setup wizard:

```
  Welcome to Ava | Supernova
  Let's set up your LLM provider.

  1. DeepSeek
  2. Kimi (Moonshot AI)
  3. Qwen (Alibaba Cloud)

  Choose a provider (number): 1

  Get your API key at: https://platform.deepseek.com/api_keys
  DeepSeek API Key: sk-...

  Setup complete! Active model: DeepSeek V3.2
```

## VSCode Extension

Ava also runs as a VSCode sidebar extension with the same agent and tools.

### Setup

1. Open the `ava-supernova` folder in VSCode
2. Press `F5` to launch the Extension Development Host
3. Click the Ava icon in the activity bar
4. Open Settings (`Ctrl+,`) and search `ava-supernova`
5. Add your API key under **Providers > DeepSeek**, **Providers > Kimi**, or **Providers > Qwen**
6. Select a model under **Active Model**

### Features

- **Chat interface** — Markdown rendering, thinking blocks, tool call cards
- **Three modes** — Code (full agent), Plan (read-only analysis), Chat (no tools)
- **Tool approval UI** — Approve, deny, "Always Allow", or "Allow All" per session
- **Plan approval** — Review and approve plans before Ava executes
- **Ask User** — Ava can ask you questions mid-task with a text input card
- **Conversation history** — Auto-saved per project, searchable, pinnable, exportable
- **Vision** — Attach images directly in the chat
- **Model switching** — Switch models from the dropdown without restarting
- **Project context** — Loads `.ava/instructions.md` for project-specific guidance
- **Permission modes** — Strict, Balanced, or Autonomous (configurable in settings)

## Tools

Ava has **13 built-in tools** for full codebase interaction:

### Reading & Searching

| Tool | Description |
|---|---|
| **file_read** | Read files with line numbers. Supports offset and limit for large files. |
| **glob** | Find files matching glob patterns (e.g. `**/*.ts`, `src/**/*.js`). |
| **grep** | Search file contents with regex. Filter by file pattern. |
| **list_directory** | List directory contents with file sizes and types. |
| **git_status** | Run read-only git commands (status, diff, log, branch, show). Auto-approved. |

### Writing & Editing

| Tool | Description |
|---|---|
| **file_write** | Create or overwrite files. Automatically creates parent directories. |
| **file_edit** | Exact string replacement in files. Supports single or global replace. |
| **bash** | Execute shell commands with configurable timeout. Supports background processes. |

### Research

| Tool | Description |
|---|---|
| **web_search** | Search the web via DuckDuckGo. No API key required. |
| **http_request** | Make HTTP requests (GET, POST, PUT, DELETE). Test APIs directly. |

### Collaboration

| Tool | Description |
|---|---|
| **present_plan** | Present a structured plan for user approval before executing. |
| **todo_write** | Track task progress with a structured to-do list. |
| **ask_user** | Ask the user a question mid-task and wait for their response. |

The agent automatically decides which tools to use, executes them, reads the results, and continues reasoning — up to 50 iterations per request.

## Permission Modes

Control how much Ava can do without asking:

| Mode | Behavior |
|---|---|
| **Strict** | Confirm all file writes and shell commands (safest) |
| **Balanced** | Auto-approve file edits, confirm shell commands only |
| **Autonomous** | Auto-approve everything — full autonomy |

Plans and user questions always require approval, regardless of mode.

Set via `/permission` in the CLI or in VSCode settings.

## Commands

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

### Switching Models

```
> /model
  deepseek:deepseek-chat - DeepSeek V3.2 (active)
  deepseek:deepseek-reasoner - DeepSeek R1
  kimi:kimi-k2.5 - Kimi K2.5
  kimi:moonshot-v1-128k - Moonshot V1 128K
  qwen:qwen3.5-plus - Qwen 3.5 Plus
  qwen:qwen-turbo-latest - Qwen Turbo

> /model qwen:qwen3.5-plus
  Switched to Qwen 3.5 Plus (Qwen (Alibaba Cloud))
```

## Project Context

Create a `.ava/instructions.md` file in your project root to give Ava persistent context about your codebase:

```bash
> /init
  Created .ava/instructions.md
  Edit this file to give Ava project-specific context.
```

This file is loaded into Ava's system prompt every session. Use it for:
- Project architecture overview
- Coding conventions and style preferences
- Key file locations and patterns
- Anything you'd tell a new team member

History is also scoped per project — each project gets its own conversation history.

## Configuration

Ava stores its configuration at `~/.ava/config.json`.

```json
{
  "activeModel": "deepseek:deepseek-chat",
  "providers": {
    "deepseek": {
      "apiKey": "sk-..."
    }
  },
  "preferences": {
    "temperature": 0.7,
    "maxTokens": 8192,
    "markdownRendering": true
  }
}
```

### Multiple Providers

Configure multiple providers and switch freely with `/model`:

```json
{
  "activeModel": "deepseek:deepseek-chat",
  "providers": {
    "deepseek": { "apiKey": "sk-..." },
    "kimi": { "apiKey": "sk-..." },
    "qwen": { "apiKey": "sk-..." }
  }
}
```

### Custom Provider (Ollama, LM Studio)

To use a local model, add a custom provider entry with a `baseUrl`:

```json
{
  "providers": {
    "deepseek": {
      "apiKey": "sk-...",
      "baseUrl": "http://localhost:11434/v1"
    }
  }
}
```

### Where to Get API Keys

| Provider | API Key Portal |
|---|---|
| DeepSeek | https://platform.deepseek.com/api_keys |
| Kimi (Moonshot) | https://platform.moonshot.ai/console/api-keys |
| Qwen (Alibaba Cloud) | https://bailian.console.alibabacloud.com/ |

## Architecture

Ava is a monorepo with four packages:

```
packages/
├── core/                  # @ava/core — shared agent engine
│   ├── agent/             #   Agentic loop, system prompt, events
│   ├── providers/         #   LLM provider adapters (DeepSeek, Kimi, generic)
│   ├── tools/             #   13 built-in tool implementations
│   ├── config/            #   Configuration management
│   └── history/           #   Conversation persistence
├── cli/                   # @ava/cli — terminal REPL interface
│   └── cli/               #   Commands, renderer, spinner, setup wizard
├── extension/             # ava-supernova — VSCode extension host
│   └── webview/           #   Extension ↔ webview bridge
└── extension/webview-ui/  # @ava/webview-ui — React + Tailwind webview
    └── components/        #   Chat UI, tool cards, plan cards, etc.
```

### Key Design Decisions

- **Monorepo with shared core** — The CLI and VSCode extension share the same agent engine, tools, and providers via `@ava/core`. Zero duplication.
- **Event-driven agent** — The agent emits typed events (`stream_delta`, `tool_call_start`, `done`, etc.) that both the CLI and extension subscribe to.
- **Injectable confirmation handler** — The `ToolRegistry` accepts a `setConfirmationHandler()` callback, letting each UI (CLI readline, VSCode webview) implement its own approval flow.
- **Self-contained tools** — Each tool carries its own JSON schema and execution handler. Adding a tool is one file and one line in the registry.
- **No external SDKs** — All provider communication uses Node's native `fetch`. Zero dependency on any provider SDK.
- **Permission matrix** — Risk levels (`safe`, `write`, `dangerous`) combined with permission modes (`strict`, `balanced`, `autonomous`) determine what requires user approval.

## Development

```bash
# Build all packages
pnpm build

# Run CLI in dev mode
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format
```

### VSCode Extension Development

```bash
# Build everything
pnpm build

# Press F5 in VSCode to launch Extension Development Host
# Or rebuild just the extension:
cd packages/extension && pnpm build
```

## Roadmap

- [x] Terminal CLI with full agent loop
- [x] VSCode extension with chat UI
- [x] 13 built-in tools (file ops, search, bash, git, web, HTTP, planning)
- [x] Conversation history with search, pin, rename, export
- [x] Vision support (image attachments)
- [x] Project context (`.ava/instructions.md`)
- [x] Permission modes (strict / balanced / autonomous)
- [ ] Context window management and compression
- [ ] Multi-file awareness improvements
- [ ] Plugin system for custom tools
- [ ] Error recovery resilience
- [ ] Marketplace extension publishing

## Contributing

Contributions are welcome. This is an open-source project built for the community.

1. Fork the repository
2. Create a feature branch from `development`
3. Make your changes
4. Run `pnpm build && pnpm test`
5. Submit a pull request to `development`

Please ensure all code passes type checking and follows the existing style conventions.

## License

[Apache License 2.0](LICENSE) — Copyright 2026 Stew.AI

---

<p align="center">
  Built with purpose. Agentic coding for everyone.
</p>
