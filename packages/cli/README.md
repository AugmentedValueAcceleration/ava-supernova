# Ava Supernova CLI

**The open-source AI coding agent, in your terminal.**

`@ava/cli` is the terminal surface of [Ava Supernova](https://avasupernova.com) — a full agentic coding agent with 80+ tools, 7 modes, and 24 specialist personas, running the same `@ava/core` engine as the VS Code extension and the desktop IDE. She reads your codebase, plans the work, executes it task by task, and remembers what she learns across sessions.

> **Free and open source. Your keys. Your machine. Your work.** No account, no sign-in — bring an API key from any supported provider, or run a local model.

---

## Install

The CLI runs from this repository. You need [Node.js](https://nodejs.org) 20 or later and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/AugmentedValueAcceleration/ava-supernova.git
cd ava-supernova
pnpm install && pnpm build
node packages/cli/dist/index.js
```

On first launch, Ava runs a short setup — pick a provider and paste your API key, or choose a local model (Ollama, LM Studio, or any standard API-format server) — and you're ready. Add more keys any time with `/provider add <name>`.

## What you get

- **Full agent loop** — Ava reads, writes, edits, searches, runs commands, and uses git autonomously, with your approval at the level you choose.
- **Honesty gate** — completion claims ("done", "tests pass", "deployed") are checked against the tools actually run that turn; unbacked claims are flagged, not asserted as fact. Always on, no off-switch.
- **7 modes** — Code (`>>`), Plan (`::`), Chat (`..`), Teach (`??`), Security (`!!`), Brainstorm (`**`), Write (`<<`). Switch mid-session.
- **24 specialist personas** — complex tasks activate an internal team (Scout → Architect → Verifier → Sequencer → Challenger → Builder for code); simple tasks go direct.
- **Persistent memory** — Ava remembers your conventions, decisions, and past fixes across sessions. Local-first.
- **Conversation history** — every session auto-saved, searchable, resumable, exportable.
- **Bring your own model** — any supported provider, or a local endpoint (Ollama, LM Studio, vLLM) for a free, fully offline agent.

## Models

Pick any model your keys reach:

| Provider | Models |
|---|---|
| **Qwen (Alibaba)** | Qwen 3.8 Max, 3.8 Flash, 3.7 Plus, 3.7 Flash, 3.5 Plus, 3.5 Flash, Coder Next / Flash |
| **DeepSeek** | DeepSeek V4.1 Flash |
| **Moonshot** | Kimi K3, K2.7 Code, K2.6 |
| **Zhipu** | GLM-5.3, GLM-5.3 Flash |
| **Mistral** | Large 4, Small 4 |
| **MiniMax** | M3, M3.1 Flash |
| **Xiaomi** | MiMo V2.6-Pro, V2.6-Flash, V2.6-Pro UltraSpeed |
| **Tencent** | Hunyuan Hy3 |
| **NVIDIA** | Nemotron 3 Ultra, Nemotron 3.5 Lightning |
| **Local** | Ollama, LM Studio, vLLM, any standard API-format endpoint |

Or let a fleet route the work with `/route`:

- **Maestro** — Qwen only. Needs a Qwen key.
- **Supernova** — DeepSeek + Qwen. Needs both keys.
- **Aurora** — every model from Mistral, a European lab. Needs a Mistral key.

Make Qwen keys in Alibaba Cloud Model Studio's **Singapore** region — keys are region-locked and Ava uses the international endpoint.

## Commands

| Command | Aliases | Description |
|---|---|---|
| `/help` | `/h` | Show all commands |
| `/model [provider:id]` | `/m` | List models, or switch the active model |
| `/route [fleet]` | `/r` | Switch the routing fleet — Maestro / Supernova / Aurora |
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

**API keys** go in your operating system's keychain — the same one the VS Code extension and the IDE use, so a key entered in any of them works in all three. If a keychain isn't available, keys fall back to `~/.ava/config.json`, written owner-read/write only.

Everything else lives in `~/.ava/config.json`:

```json
{
  "activeModel": "qwen:qwen3.7-plus",
  "preferences": { "temperature": 0.7, "maxTokens": 8192 }
}
```

### Local / custom endpoint (Ollama, LM Studio, vLLM)

Choose **A local model** in the first-run setup. It is saved in `~/.ava/settings.json` — shared with the extension and the IDE — like this:

```json
{
  "local_model": {
    "baseUrl": "http://localhost:11434/v1",
    "modelName": "qwen2.5-coder",
    "models": ["qwen2.5-coder"]
  }
}
```

If your server needs a key, the setup asks for it and keeps it in the keychain.

That's a full agent, fully offline, at no cost.

## Privacy

- API keys kept in your OS keychain; never logged, never sent to us.
- Conversations and memory stored locally under `~/.ava/`. No cloud sync.
- Runtime credential detection blocks keys and tokens from being saved to memory.
- No telemetry. We never train on your data.

## Links

- [Website](https://avasupernova.com)
- [GitHub](https://github.com/AugmentedValueAcceleration/ava-supernova)
- [Release Notes](https://avasupernova.com/releases)
- [Discord](https://discord.gg/bbtnKMW4rf)
- [Support Ava](https://avasupernova.com/support-ava) — Ava is free and kept that way by donations

## License

[Apache License 2.0](../../LICENSE) — Copyright 2026 Augmented Value Acceleration
