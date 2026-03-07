# Ava | Supernova — VSCode Extension

Open-source AI coding agent powered by Claude, DeepSeek, Kimi, GLM, Mistral, and Qwen. Full agentic coding in your editor at a fraction of frontier pricing.

## Features

- **Agentic coding** — Ava reads, writes, edits, searches, and executes code autonomously with tool-calling
- **21 built-in tools** — File ops, glob, grep, bash, git, browser, database, screenshots, planning, todos, and more
- **Four modes** — Code (`>>` full agent), Plan (`::` read-only), Chat (`..` no tools), Security (`!!` OWASP audit)
- **Persistent memory** — Ava remembers across sessions. Memories sync to your platform account and are searchable with semantic embeddings
- **Vision** — Attach images directly in the chat for models that support it (Claude, GLM-5, Qwen 3.5 Plus)
- **Codebase understanding** — Project indexer and symbol finder for intelligent code navigation
- **Context compression** — Automatic context management keeps long conversations within model limits
- **Error recovery** — Resilient tool execution with automatic retry and graceful fallbacks
- **Conversation history** — Auto-saved per project, searchable, pinnable, exportable
- **20 languages** — Full UI localization, with model responses in your preferred language
- **Project context** — Create `.ava/instructions.md` to give Ava persistent knowledge about your codebase
- **Tool approval** — Review every action before Ava executes it, or grant autonomy with permission modes
- **Security scanning** — AI-powered OWASP-aligned security audit of your project using existing tools
- **Platform account** — Connect your Ava account for managed API access, cloud sync, and memory dashboard
- **Dashboard panel** — Account management, model selection, memory, billing, and settings inside VSCode

## Quick Start

1. Install the extension from the VS Code Marketplace
2. Click the Ava icon in the activity bar (or press `Ctrl+Shift+A`)
3. Follow the **Getting Started** walkthrough to add your API key — or connect your Ava platform account
4. Start coding with Ava

## Supported Models

| Provider | Models | Highlights |
|---|---|---|
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | Most capable, vision, 200K context |
| **DeepSeek** | V3, R1 | Best price/performance, R1 has extended thinking |
| **Kimi** (Moonshot AI) | K2.5, Moonshot V1 | Best multi-step tool calling |
| **GLM** (Zhipu AI) | GLM-5, GLM-4.7, GLM-4 Flash | Best tool-call reliability, vision |
| **Qwen** (Alibaba Cloud) | 3.5 Plus, Turbo | Vision, thinking, up to 1M context |
| **Mistral** | Large 3, Codestral, Devstral 2 | Strong European provider, code-specialized |

You can also use any locally hosted model via Ollama, LM Studio, or any standard API format endpoint.

## Memory System

Ava has persistent memory that survives across sessions:

- **Global memory** — Preferences, patterns, and knowledge that apply to all projects
- **Project memory** — Context specific to the current project (stored in `.ava/memory.md`)
- **Semantic search** — Relevant memories are automatically retrieved at session start using vector embeddings
- **Cloud sync** — With a platform account, memories sync across machines and are viewable in the web dashboard
- **Memory tools** — `memory_save` and `memory_recall` let Ava store and retrieve knowledge on demand

## Platform Account (Optional)

Instead of managing API keys, connect your Ava account for managed access:

| Tier | Price | What You Get |
|---|---|---|
| **Free** | $0 | Own API keys, full agent, all tools, local memory |
| **Pro** | $19/mo | Managed API access, 10M tokens/month, cloud sync, memory dashboard |
| **Ultra** | $49/mo | Unlimited tokens, all models, cloud sync, memory dashboard |

Open the **Dashboard** (`Ava: Open Dashboard` in the command palette) to connect your account or manage your subscription.

## Settings

Open **Settings** (`Ctrl+,`) and search `ava-supernova` to configure:

| Setting | Description |
|---|---|
| **Active Model** | Select which model to use |
| **Temperature** | Sampling temperature (default: 0.7) |
| **Language** | UI and response language (20 options + auto-detect) |
| **Permission Mode** | Strict, Balanced, or Autonomous |
| **Max Tokens** | Maximum output tokens per response |
| **Auto Memory** | Enable/disable automatic memory persistence |
| **Stream Responses** | Enable/disable streaming output |

## Permission Modes

| Mode | Behavior |
|---|---|
| **Strict** | Approve all file writes and shell commands (safest) |
| **Balanced** | Auto-approve file edits, confirm shell commands only |
| **Autonomous** | Auto-approve everything (use with caution) |

## Where to Get API Keys (BYOK)

| Provider | Portal |
|---|---|
| Anthropic | [console.anthropic.com](https://console.anthropic.com/) |
| DeepSeek | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| Kimi (Moonshot) | [platform.moonshot.ai](https://platform.moonshot.ai/console/api-keys) |
| GLM (Zhipu AI) | [open.bigmodel.cn](https://open.bigmodel.cn/) |
| Qwen (Alibaba Cloud) | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com/) |
| Mistral | [console.mistral.ai](https://console.mistral.ai/api-keys/) |

## License

[Apache License 2.0](../../LICENSE) — Copyright 2026 Augmented Value Acceleration
