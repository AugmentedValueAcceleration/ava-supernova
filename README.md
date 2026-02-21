<p align="center">
  <h1 align="center">Ava | Supernova</h1>
  <p align="center">
    <strong>Open-source AI coding assistant CLI — agentic coding for everyone.</strong>
  </p>
  <p align="center">
    <a href="#supported-providers">Providers</a> &middot;
    <a href="#getting-started">Getting Started</a> &middot;
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

Ava | Supernova is an open-source, terminal-based AI coding agent that brings the power of agentic coding to every developer — at a fraction of the cost of proprietary alternatives.

Choose your model. Plug in your API key. Get a full coding agent that can read, write, edit, search, and execute across your entire codebase.

## Why Ava?

Agentic coding shouldn't be a luxury. The open-source model ecosystem has reached a point where models like DeepSeek, Kimi, GLM, and Mistral deliver near-frontier autonomous coding performance — at **50-100x lower cost** than proprietary alternatives.

| Model | SWE-Bench | Input Cost / 1M tokens |
|---|---|---|
| GLM-5 | 77.8% | $0.30 |
| Kimi K2.5 | 76.8% | $0.60 |
| DeepSeek V3.2 | ~66% | $0.14 |
| Codestral | 86.6% HumanEval | $0.30 |

Ava bridges the gap between these powerful models and a polished agentic coding experience.

## Supported Providers

| Provider | Models | Context Window | Tool Calling | Streaming |
|---|---|---|---|---|
| **DeepSeek** | DeepSeek V3, DeepSeek R1 | 128K | Yes* | Yes |
| **Kimi** (Moonshot AI) | Kimi K2.5, Moonshot V1 | 128K - 256K | Yes | Yes |
| **Zhipu AI** | GLM-5, GLM-4.7, GLM-4 Flash | 128K - 200K | Yes | Yes |
| **Mistral AI** | Mistral Large, Codestral, Mistral Small | 128K - 256K | Yes | Yes |
| **Custom** | Any compatible endpoint | Configurable | Yes | Yes |

*DeepSeek R1 (reasoner) does not support tool calling but supports extended thinking.

The **Custom** provider supports any locally hosted model via [Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai), or any API-compatible server.

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

# Build
pnpm build
```

### First Run

```bash
# Start Ava in development mode
pnpm dev

# Or run the built version
node dist/index.js
```

On first launch, Ava will guide you through an interactive setup wizard:

```
  Welcome to Ava | Supernova
  Let's set up your LLM provider.

  1. DeepSeek
  2. Kimi (Moonshot AI)
  3. Zhipu AI (GLM)
  4. Mistral AI

  Choose a provider (number): 1

  Get your API key at: https://platform.deepseek.com/api_keys
  DeepSeek API Key: sk-...

  Setup complete! Active model: DeepSeek V3
```

### Global Installation

```bash
# Build and link globally
pnpm build
npm link

# Now run from anywhere
ava
```

## Usage

Once running, Ava is an interactive coding agent. Type your request and it will reason, use tools, and iterate until the task is complete.

```
> Read the package.json and tell me what dependencies we have

  [tool] file_read ({"file_path":"package.json"})
  [OK] 1  {

Here are the dependencies in your project:
...

> Create a utility function that validates email addresses

  [tool] file_write ({"file_path":"src/utils/validate-email.ts","content":"..."})
  [OK] File written: src/utils/validate-email.ts (12 lines)

Done. I've created `src/utils/validate-email.ts` with a regex-based
email validation function.

> Find all files that import the logger

  [tool] grep ({"pattern":"import.*logger","file_pattern":"**/*.ts"})
  [OK] src/index.ts:4: import { logger } from './core/logger.js';

Found 1 file that imports the logger:
...
```

## Tools

Ava has 6 built-in tools for full codebase interaction:

| Tool | Description |
|---|---|
| **file_read** | Read files with line numbers. Supports offset and limit for large files. |
| **file_write** | Create or overwrite files. Automatically creates parent directories. |
| **file_edit** | Exact string replacement in files. Supports single or global replace. |
| **glob** | Find files matching glob patterns (e.g. `**/*.ts`, `src/**/*.js`). |
| **grep** | Search file contents with regex. Filter by file pattern. |
| **bash** | Execute shell commands with configurable timeout (default 2 min). |

The agent automatically decides which tools to use, executes them, reads the results, and continues reasoning — up to 50 iterations per request.

## Commands

| Command | Aliases | Description |
|---|---|---|
| `/help` | `/h` | Show all available commands |
| `/model` | `/m` | List available models |
| `/model <provider:id>` | `/m <provider:id>` | Switch to a different model |
| `/clear` | `/c` | Clear conversation history |
| `/exit` | `/quit`, `/q` | Exit Ava |

### Switching Models

```
> /model
  deepseek:deepseek-chat - DeepSeek V3
  deepseek:deepseek-reasoner - DeepSeek R1
  kimi:kimi-k2.5 - Kimi K2.5
  zhipu:glm-5 - GLM-5
  mistral:codestral-latest - Codestral
  ...

> /model zhipu:glm-5
  Switched to GLM-5 (Zhipu AI)
```

## Configuration

Ava stores its configuration at `~/.ava/config.json`.

```json
{
  "activeModel": "deepseek:deepseek-chat",
  "providers": {
    "deepseek": {
      "apiKey": "sk-..."
    },
    "mistral": {
      "apiKey": "..."
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

You can configure multiple providers simultaneously and switch between them with `/model`:

```json
{
  "activeModel": "deepseek:deepseek-chat",
  "providers": {
    "deepseek": { "apiKey": "sk-..." },
    "kimi": { "apiKey": "sk-..." },
    "zhipu": { "apiKey": "..." },
    "mistral": { "apiKey": "..." }
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
| Zhipu AI (GLM) | https://open.bigmodel.cn/usercenter/apikeys |
| Mistral AI | https://console.mistral.ai/api-keys/ |

## Conversation History

Conversations are automatically saved to `~/.ava/history/` when you exit. Each session is stored as a JSON file and can be resumed in future versions.

## Architecture

```
src/
├── core/           # Type system, errors, constants
├── providers/      # LLM provider adapters
│   ├── deepseek/   #   DeepSeek API
│   ├── kimi/       #   Moonshot AI API
│   ├── zhipu/      #   Zhipu AI API
│   ├── mistral/    #   Mistral AI API
│   └── generic/    #   Custom endpoints
├── tools/          # Agentic tool implementations
├── agent/          # Core agentic loop & event system
├── cli/            # Terminal REPL interface
├── config/         # Configuration & setup wizard
└── history/        # Conversation persistence
```

**Key design decisions:**

- **Provider adapter pattern** — A shared base class handles HTTP and SSE streaming. Each provider overrides only what differs. Adding a new provider is ~20 lines of code.
- **Event-driven agent** — The agent emits typed events (`stream_delta`, `tool_call_start`, `done`, etc.) that the CLI subscribes to. This same pattern will power the future VSCode extension.
- **Self-contained tools** — Each tool carries its own JSON schema and execution handler. Adding a tool is one file and one line in the registry.
- **No external SDKs** — All provider communication uses Node's native `fetch`. Zero dependency on any provider SDK.

## Development

```bash
# Run in dev mode (no build step needed)
pnpm dev

# Type check
pnpm typecheck

# Run tests
pnpm test

# Lint
pnpm lint

# Format
pnpm format

# Build
pnpm build
```

## Roadmap

- [ ] VSCode extension (thin wrapper around the CLI)
- [ ] Conversation resume from history
- [ ] Token usage tracking and cost estimation
- [ ] Configurable system prompts
- [ ] Plugin system for custom tools
- [ ] DeepSeek V4 support (when released)
- [ ] Context window management and compression

## Contributing

Contributions are welcome. This is an open-source project built for the community.

1. Fork the repository
2. Create a feature branch from `development`
3. Make your changes
4. Run `pnpm typecheck && pnpm lint && pnpm test`
5. Submit a pull request to `development`

Please ensure all code passes type checking and follows the existing style conventions.

## License

[Apache License 2.0](LICENSE) — Copyright 2026 Stew.AI

---

<p align="center">
  Built with purpose. Agentic coding for everyone.
</p>
