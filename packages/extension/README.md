# Ava | Supernova — VSCode Extension

Open-source AI coding agent powered by the best open-source and frontier models. Full agentic coding in your editor at a fraction of frontier pricing.

## Features

- **Agentic coding** — Ava reads, writes, edits, searches, and executes code autonomously with tool-calling
- **24 built-in tools** — File ops, glob, grep, bash, git, web search, HTTP requests, browser, database, screenshots, planning, todos, memory, and more
- **7 providers, 13 models** — DeepSeek, Kimi, Zhipu AI, Qwen, Mistral, Anthropic, plus any local/custom endpoint
- **Four modes** — Code (`>>` full agent), Plan (`::` read-only), Chat (`..` no tools), Security (`!!` OWASP audit)
- **Model selector** — Switch models instantly from the header dropdown with provider labels and active model indicators
- **Persistent memory** — Ava remembers across sessions with automatic save/recall
- **Vision** — Attach images directly in the chat for models that support it (Claude, GLM-5, Kimi K2.5, Qwen 3.5 Plus)
- **Codebase understanding** — Project indexer and symbol finder for intelligent code navigation
- **Context compression** — Automatic context management keeps long conversations within model limits
- **Error recovery** — Resilient tool execution with automatic retry and graceful fallbacks
- **Conversation history** — Auto-saved per project, searchable, with quick access from the header
- **20 languages** — Full UI localization, with model responses in your preferred language
- **Project context** — Create `.ava/instructions.md` to give Ava persistent knowledge about your codebase
- **Tool approval** — Review every action before Ava executes it, or grant autonomy with permission modes
- **Security scanning** — AI-powered OWASP-aligned security audit using existing tools
- **Dashboard panel** — Provider configuration, model selection, memory management, and settings inside VSCode
- **Documentation viewer** — Built-in docs panel for quick reference without leaving the editor

## Quick Start

1. Install the extension from the VS Code Marketplace
2. Click the Ava icon in the activity bar (or press `Ctrl+Shift+A`)
3. Follow the **Getting Started** walkthrough to add your API key
4. Start coding with Ava

## Supported Models

| Provider | Models | Highlights |
|---|---|---|
| **Zhipu AI** | GLM-5, GLM-4.5 Flash | 77.8% SWE-Bench, vision, GLM-4.5 Flash is FREE |
| **Moonshot AI** | Kimi K2.5 | 76.8% SWE-Bench, best tool calling, vision, 256K |
| **DeepSeek** | V3.2, Reasoner | Best price/performance ($0.28/$0.42), R1 has extended thinking |
| **Alibaba Cloud** | Qwen 3.5 Plus | Thinking + vision, 256K context |
| **Mistral** | Large, Codestral, Devstral 2 | European provider, code-specialized, up to 262K context |
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | Most capable, vision, 200K context |
| **Generic** | Custom / Local | Ollama, LM Studio, or any standard API format endpoint |

## Tools

| Category | Tools |
|---|---|
| **File ops** | `file_read`, `file_write`, `file_edit` |
| **Search** | `glob`, `grep`, `list_directory`, `find_symbol`, `project_index` |
| **Shell** | `bash` |
| **Git** | `git_status`, `git_diff`, `rollback` |
| **Web** | `web_search`, `http_request`, `browser` |
| **Media** | `screenshot` |
| **Data** | `database_query` |
| **Memory** | `memory_save`, `memory_recall` |
| **Planning** | `present_plan`, `todo_write` |
| **Interaction** | `ask_user`, `support_request` |
| **Docs** | `docs_lookup` |

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

## Where to Get API Keys

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
