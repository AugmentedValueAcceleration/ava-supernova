# Ava Supernova CLI

**The open-source AI coding agent, in your terminal.**

`@ava/cli` is the terminal surface of [Ava Supernova](https://avasupernova.com) — a full agentic coding agent with 60+ tools, 7 modes, and 24 specialist personas, running the same `@ava/core` engine as the VS Code extension and the desktop IDE. She reads your codebase, plans the work, executes it task by task, and remembers what she learns across sessions.

> **No account, no credit card, no trial.** Bring your own API key and run fully local — or sign up for **300 free credits a month**.

---

## Install

```bash
npm install -g @ava/cli
ava
```

Requires [Node.js](https://nodejs.org) v20 or later.

On first launch, Ava runs an interactive setup wizard — pick a provider, paste your API key (or skip and sign in for the free tier), and you're ready. You can reconfigure any time with `/provider`.

## What you get

- **Full agent loop** — Ava reads, writes, edits, searches, runs commands, and uses git autonomously, with your approval at the level you choose.
- **Honesty gate** — completion claims ("done", "tests pass", "deployed") are checked against the tools actually run that turn; unbacked claims are flagged, not asserted as fact. Always on, no off-switch.
- **7 modes** — Code (`>>`), Plan (`::`), Chat (`..`), Teach (`??`), Security (`!!`), Brainstorm (`**`), Write (`<<`). Switch mid-session.
- **24 specialist personas** — complex tasks activate an internal team (Scout → Architect → Verifier → Sequencer → Challenger → Builder for code); simple tasks go direct.
- **Persistent memory** — Ava remembers your conventions, decisions, and past fixes across sessions. Local-first.
- **Conversation history** — every session auto-saved, searchable, resumable, exportable.
- **Bring your own model** — any supported provider, or a local endpoint (Ollama, LM Studio, vLLM) for a fully free, fully offline agent.

## Models

Bring your own key for any provider, or use Ava-managed models with a free or paid account:

| Provider | Models |
|---|---|
| **Qwen (Alibaba)** | Qwen 3.7 Plus, 3.7 Max, 3.5 Plus, 3.5 Flash |
| **DeepSeek** | V4 Pro, V4 Flash |
| **Moonshot** | Kimi K2.7 Code, K2.6, K2.5 |
| **Zhipu** | GLM-5.2, GLM-4.5 Air |
| **Mistral** | Medium 3.5, Small 4, Large 3, Codestral, Devstral 2 |
| **MiniMax** | M3, M2.7, M2.7 HighSpeed |
| **Xiaomi** | MiMo V2.5, V2.5-Pro |
| **Anthropic** | Claude Opus 4.8, Sonnet 4.6, Haiku 4.5 |
| **Custom / Local** | Ollama, LM Studio, vLLM, any standard API-format endpoint |

Switch the orchestration fleet with `/route`: **Maestro** (Qwen ensemble, everyday), **Aurora** (EU-sovereign Mistral stack), or **Supernova** (polyglot, best-model-per-role — with your DeepSeek + Qwen keys).

## Commands

| Command | Aliases | Description |
|---|---|---|
| `/help` | `/h` | Show all commands |
| `/model [provider:id]` | `/m` | List models, or switch the active model |
| `/route [mode]` | `/r` | Switch routing fleet — Maestro / Supernova / Aurora |
| `/provider [add <name>]` | `/p` | List providers, or add a provider API key |
| `/permission [mode]` | `/perm` | View or set permission mode — strict / balanced / autonomous |
| `/tools` | | List every tool available to the agent |
| `/init` | | Create `.ava/instructions.md` for project context |
| `/compact` | `/compress` | Compress the conversation context |
| `/clear` | `/c` | Clear the current conversation |
| `/retry` | | Retry the last message |
| `/security` | `/sec`, `/audit` | Run a security audit on the project |
| `/brainstorm` | `/idea`, `/ideas` | Start a grounded brainstorm session |
| `/dataset` | `/datasets`, `/capture` | Manage Ava's action-capture (status / on / off) |
| `/exit` | `/quit`, `/q` | Exit Ava |

### History

| Command | Aliases | Description |
|---|---|---|
| `/history` | `/ls` | List saved conversations (pinned first) |
| `/resume <id>` | | Resume a saved conversation |
| `/search <query>` | `/s` | Search conversations |
| `/delete <id>` | `/rm` | Delete a conversation |
| `/rename <id> <title>` | | Rename a conversation |
| `/pin <id>` · `/unpin <id>` | | Pin / unpin a conversation |
| `/export <id> [format]` | | Export as markdown or JSON |

## Project context

Run `/init` to create `.ava/instructions.md` in your project root. Use it for architecture, conventions, and key file locations — anything you'd tell a new teammate. It's loaded into Ava's context every session.

## Configuration

Ava stores config at `~/.ava/config.json` (owner-read/write only — it holds your keys):

```json
{
  "activeModel": "qwen:qwen3.7-plus",
  "providers": {
    "qwen": { "apiKey": "sk-..." },
    "deepseek": { "apiKey": "sk-..." }
  },
  "preferences": { "temperature": 0.7, "maxTokens": 8192 }
}
```

### Local / custom endpoint (Ollama, LM Studio, vLLM)

```json
{
  "providers": {
    "generic": [
      { "baseUrl": "http://localhost:11434/v1", "model": "qwen2.5-coder" }
    ]
  }
}
```

This is the **$0 path** — a full agent, fully offline, no account.

## Privacy

- API keys stored locally with owner-only file permissions; never sent to Ava servers.
- Conversations and memory stored locally under `~/.ava/`.
- Runtime credential detection blocks keys and tokens from being saved to memory.
- No telemetry.

## Links

- [Website](https://avasupernova.com)
- [GitHub](https://github.com/AugmentedValueAcceleration/ava-supernova)
- [Release Notes](https://avasupernova.com/releases)

## License

[Apache License 2.0](https://github.com/AugmentedValueAcceleration/ava-supernova/blob/production/LICENSE) — Copyright 2026 Augmented Value Acceleration
