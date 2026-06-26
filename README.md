<p align="center">
  <h1 align="center">Ava Supernova</h1>
  <p align="center">
    <strong>The open-source AI coding agent that works for everyone — not just the people who can afford it.</strong><br/>
    60+ tools · 7 modes · 24 specialist personas · frontier open-weight models from every major lab · a Creative Studio that builds real assets into your project. <strong>Free to start, no account, no credit card.</strong>
  </p>
  <p align="center">
    <a href="#what-ava-is">What Ava Is</a> &middot;
    <a href="#one-ava-four-surfaces">Surfaces</a> &middot;
    <a href="#models--fleets">Models</a> &middot;
    <a href="#getting-started">Getting Started</a> &middot;
    <a href="#tools">Tools</a> &middot;
    <a href="#privacy">Privacy</a> &middot;
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

## What Ava Is

Agentic coding shouldn't be a luxury. Ava Supernova is a full AI coding agent — she reads your codebase, plans the work, executes it task by task, and remembers what she learns so the next time gets easier. She runs on the frontier of **open-weight** models, which now match or beat closed frontier models on agentic coding at a fraction of the cost.

She's open-source, **local-first**, and free to start:

- **No account, no credit card, no trial.** Install, open, go. Bring your own API key and run fully local — or sign up for **300 free credits a month** and start with zero setup.
- **Your data stays on your machine.** Memory, history, journal, tasks — all local by default. Cloud sync is opt-in.
- **No gatekeeping.** Every capability — including the security toolkit and the teaching engine — is available to everyone. The free tier is a floor, not a free trial.

> Ask Ava `what can you do?` and she'll read her own source code and tell you herself.

## One Ava, Four Surfaces

The same agent engine (`@ava/core`) powers every surface — same tools, same personas, same memory. You choose where you work:

| Surface | What it is | Best for |
|---|---|---|
| **CLI** (`@ava/cli`) | A terminal REPL with the full agent loop. | Living in the terminal, scripting, servers, SSH. |
| **VS Code Extension** | Ava inside the editor you already use — chat, agent, command-centre dashboard. | Adding Ava to your existing VS Code workflow. |
| **IDE** | A standalone desktop app (Tauri + Rust) with Ava native and a local engine. Owns **desktop automation**. | A dedicated AI-native workspace; controlling the whole machine. |
| **Companion** | A mobile/web app — chat, tasks, journal, memory on the go. | Ava away from your desk. |

## What Makes Ava Different

- **She remembers you.** A layered memory system learns your style, conventions, decisions, and the bugs you've fixed before — curated by a dedicated Memory Agent so context stays lean and recall stays sharp. Local-first, opt-in semantic recall.
- **She thinks before she builds.** 24 specialist personas across 7 modes plan, verify, and challenge before executing. Simple questions skip orchestration entirely — zero overhead.
- **She won't fake a "done."** A built-in honesty gate checks every claim of completion or success — "it's fixed", "tests pass", "deployed" — against the tools she actually ran that turn, and flags any it can't back with evidence. A guess never stands as fact. Always on, no off-switch.
- **She picks the right fleet for the work.** You pick the job; the right multi-model fleet falls out of it (see [Models & Fleets](#models--fleets)).
- **She teaches for free.** Switch to Teach mode, say "teach me Rust," and she builds a personalised curriculum and teaches it lesson by lesson — fact-checked against the live web. Same credits as every other mode.
- **She explains herself.** Ask "how does your memory work?" and she reads her own implementation and walks you through it.
- **She's yours to design.** Name, pronouns, tone, energy, communication style — same brain, your personality. Full UI in 20 languages.

## 7 Modes — States of Thought

Modes aren't tool restrictions — they're states of mind. The toolkit and the persona team change to match the work.

| Mode | Prefix | Mindset | Use it for |
|---|---|---|---|
| **Code** | `>>` | Builder | Writing, editing, shipping code with the full toolkit |
| **Plan** | `::` | Architect | Read-only analysis, feature design, strategic proposals |
| **Chat** | `..` | Friend | Personal conversation, journal, memory, news, weather |
| **Teach** | `??` | Tutor | Personalised learning paths and Socratic delivery |
| **Security** | `!!` | Auditor | OWASP-aligned scanning with verified findings |
| **Brainstorm** | `**` | Ideator | Research, generate, challenge, and refine ideas |
| **Write** | `<<` | Author | Drafting real documents — reports, proposals, letters, articles — exported as branded Word & PDF |

Switch with the dropdown or `Ctrl+Shift+1` through `Ctrl+Shift+7`.

## Personas — Ava's Internal Specialist Team

When a task is complex, Ava's internal team activates. Each persona gets its own clean context and scoped tools (the Challenger reads but never writes). Simple tasks go direct.

- **Code:** Scout → Architect → Verifier → Sequencer → Challenger → Builder
- **Plan:** Researcher → Architect → Challenger
- **Teach:** Curriculum Architect → Content Writer → Fact Checker → Quiz Master → Tutor
- **Security:** Recon → Scanner → CVE Researcher → Verifier → Reporter
- **Brainstorm:** Explorer → Researcher → Ideator → Challenger → Refiner

Chat and Write run without personas — just Ava.

## Models & Fleets

You don't pick a model — you pick the work, and the right fleet falls out of it. Two orchestrated fleets ship today; a third is rolling out.

| Fleet | Status | Coordinator | Best for |
|---|---|---|---|
| **Maestro** | **Ships now** | Qwen 3.7 Plus | Daily work, predictable cost — a tier-differentiated Qwen ensemble |
| **Aurora** | **Ships now** | Mistral Medium 3.5 | GDPR-strict / sovereign EU work — Mistral-only, open weights, never leaves EU infrastructure |
| **Supernova** | BYOK now · managed preview | DeepSeek V4 Pro | Heavy multi-step work — a polyglot fleet picking the best model per role |

**Supernova** runs today with your own DeepSeek + Qwen keys; the managed (platform-hosted) version is in preview. **Maestro** unlocks with a Qwen key, **Aurora** with a Mistral key.

### Supported models

Bring your own key for any provider, or use Ava-managed models on a plan. Every plan gets every managed model — tiers differ only on monthly credit allowance, never on which models you can use.

| Provider | Models |
|---|---|
| **Ava Managed** | Qwen 3.7 Plus, Qwen 3.5 Plus, Qwen 3.5 Flash, plus the managed Mistral (Aurora) coordinators |
| **Qwen (Alibaba)** | Qwen 3.7 Plus, Qwen 3.7 Max, Qwen 3.5 Plus, Qwen 3.5 Flash — 1M context, vision, reasoning |
| **DeepSeek** | V4 Pro, V4 Flash — MIT open-weight, 1M context |
| **Moonshot** | Kimi K2.7 Code, K2.6, K2.5 — up to 1T MoE / 32B active, 256K context |
| **Zhipu** | GLM-5.2, GLM-4.5 Air — MIT open-weight, up to 1M context |
| **Mistral** | Medium 3.5, Small 4, Large 3, Codestral, Devstral 2 — EU, open weights, up to 262K context |
| **MiniMax** | M3, M2.7, M2.7 HighSpeed — up to 1M context (BYOK) |
| **Xiaomi** | MiMo V2.5, V2.5-Pro — 1M context, native multimodal |
| **Anthropic** | Claude Opus 4.8, Sonnet 4.6, Haiku 4.5 |
| **Custom / Local** | Ollama, LM Studio, vLLM, or any standard API-format endpoint — the $0 path |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v20.0.0 or later
- An API key from any supported provider — **or sign up for 300 free credits a month**

### CLI

```bash
# Install from npm
npm install -g @ava/cli
ava
```

On first launch, Ava runs an interactive setup wizard: pick a provider, paste your key (or skip and sign in for the free tier), and you're ready.

### VS Code Extension

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova) — or search "Ava Supernova" in the Extensions panel. Click the Ava icon in the activity bar (or `Ctrl+Shift+A`) and start.

### IDE

Download the standalone desktop IDE from [ava-supernova.com](https://ava-supernova.com). A local Node.js engine runs `@ava/core` on your machine — the full agent without a browser or VS Code.

### Build from source

```bash
git clone https://github.com/AugmentedValueAcceleration/ava-supernova.git
cd ava-supernova
pnpm install
pnpm build
```

## Tools

60+ user-facing built-in tools. Ava decides which to use, runs them, reads the results, and keeps reasoning. (The IDE adds desktop- and browser-automation tools on top, gated to Desktop mode.)

| Category | Tools |
|---|---|
| **File ops** | `file_read`, `file_write`, `file_edit`, `glob`, `grep`, `list_directory`, `find_symbol`, `project_index`, `analyze_architecture`, `self_inspect`, `docs_lookup`, `browse_library` |
| **Shell** | `bash`, `test_run`, `test_generate`, `benchmark`, `debug_logs` |
| **Git** | `git_status`, `git_diff`, `git_commit`, `git_create_pr`, `rollback` |
| **Web** | `web_search`, `http_request`, `browser`, `weather`, `news`, `release_notes`, `paper_fetch_full_text` |
| **Media** | `generate_image`, `generate_video`, `remove_background` |
| **Documents** | `document_author`, `document_manage`, `email_draft`, `report_generate`, `doc_generate`, `present_plan`, `apply_plan`, `todo_write`, `task_manage`, `journal_write`, `switch_mode` |
| **Memory** | `memory_save`, `memory_recall`, `memory_update`, `memory_delete`, `curator` |
| **Learning** | `learning_create`, `learning_teach`, `learning_progress` |
| **Security & Data** | `audit_dependencies`, `database_query`, `secret_request`, `env_write` |
| **System** | `get_datetime`, `detect_language`, `ask_user`, `support_request`, `propose_tool` |

## Creative Studio

Ava generates real assets and wires them straight into your project — a logo into `public/`, a hero clip into your landing page.

- **Images & video** run on **Wan** (Alibaba's open-weight models), built for clean graphic-design output and short clips with synchronised audio.
- Every asset is tracked in the **Library** — grid or list view, filter by type, preview, reuse across projects.

## Privacy

Your data stays yours:

- **API keys** encrypted in your OS keychain (VS Code SecretStorage). Never logged, never sent to Ava servers.
- **Conversations & memory** stored locally (`~/.ava/`). Local-first by default.
- **Credential safety** — runtime detection blocks API keys, tokens, and private keys from being saved to memory; high-confidence key patterns are redacted from chat output before they hit the screen.
- **Capability-based secrets** — Ava receives opaque handles for vault secrets, not raw values, scoped to the current session.
- **Prompt-injection resistance** built in. **No telemetry** — we don't track your usage, code, or conversations.
- **Cloud sync is opt-in**, with delta tracking so you see exactly what's about to be pushed.

## Plans

Every plan gets every managed model. Tiers differ only on monthly credit allowance.

| Tier | Price | Monthly credits |
|---|---|---|
| **Free** | $0 | 300 |
| **Pro** | $19 | 5,000 |
| **Ultra** | $39 | 10,000 |
| **Enterprise** | $79 | 20,000 |

Or run fully local with your own keys — the floor is free, forever.

## Architecture

A pnpm monorepo with a shared core, plus submodules for the IDE, web platform, and companion app:

```
packages/
├── core/        # @ava/core — shared agent engine (agent loop, providers, tools, personas, memory)
├── cli/         # @ava/cli — terminal REPL
├── extension/   # VS Code extension host + React webview + dashboard
├── ide/         # Standalone IDE (Tauri v2 + Rust + Node.js engine) — submodule
├── mobile/      # Companion app — submodule
└── web/         # Platform website — submodule
```

**Key design decisions:**

- **Shared core, zero duplication** — CLI, extension, and IDE all run the same `@ava/core` engine, tools, and providers.
- **Event-driven agent** — the agent emits typed events every host subscribes to.
- **Self-contained tools** — each tool carries its own schema and handler; adding one is a single file plus one registry line.
- **No provider SDKs** — all provider communication uses native `fetch`.
- **Permission matrix** — risk levels (`safe`, `write`, `dangerous`) combine with your permission mode to decide what needs approval. Plans and user questions always require approval.
- **Local-first** — everything works offline; cloud sync is opt-in.

## Contributing

Contributions are welcome — this is built for the community.

1. Fork the repository
2. Create a feature branch from `development`
3. Make your changes and run `pnpm build`
4. Open a pull request against `development`

## Links

- [Website](https://ava-supernova.com)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova)
- [Companion App](https://companion.ava-supernova.com)
- [Release Notes](https://ava-supernova.com/releases)
- [YouTube](https://youtube.com/@AugmentedValueAcceleration)

## License

[Apache License 2.0](LICENSE) — Copyright 2026 Augmented Value Acceleration

---

<p align="center">
  Agentic coding for everyone.
</p>
