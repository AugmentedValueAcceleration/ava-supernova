# Contributing to Ava Supernova

Thanks for wanting to contribute! Ava is free and open source, and we welcome contributions of all kinds — bug fixes, features, documentation, translations, and ideas.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v20.0.0+
- [pnpm](https://pnpm.io) v10+
- An API key from at least one [supported provider](README.md#models--fleets), or a local model (Ollama, LM Studio, any standard API-format server)

### Setup

```bash
git clone https://github.com/AugmentedValueAcceleration/ava-supernova.git
cd ava-supernova
pnpm install
pnpm build

# One-time: enable the repo-local git hooks.
#  - pre-commit scans for secrets with gitleaks (CI scans again).
#  - pre-push typechecks the extension host and both webviews, and blocks a
#    push that would ship an undefined-identifier bug (the class of regression
#    that broke v0.48.2 and v0.48.3). CI runs the same check.
git config core.hooksPath .githooks
```

### Project Structure

A **pnpm monorepo**:

| Package | Path | Description |
|---------|------|-------------|
| `@ava/core` | `packages/core` | The shared engine — agent loop, providers, tools, personas, memory, config, history, i18n |
| `@ava/cli` | `packages/cli` | Terminal REPL |
| `ava-supernova` | `packages/extension` | VS Code extension host |
| `@ava/webview-ui` | `packages/extension/webview-ui` | The chat webview (React) — all 7 modes |
| `@ava/dashboard-ui` | `packages/extension/dashboard-ui` | The command-centre dashboard (React) |
| IDE | `packages/ide` | Standalone desktop IDE (Tauri v2 + Rust + Node.js engine) — submodule |
| Website | `packages/web` | avasupernova.com — submodule |

### Development Commands

```bash
pnpm build        # Build all packages
pnpm dev          # Run the CLI in development mode
pnpm typecheck    # Type check all packages
pnpm lint         # Lint all packages
pnpm test         # Run all tests
pnpm format       # Format with Prettier
pnpm i18n:check   # Check every language has every string
```

## How to Contribute

### Questions, Bugs and Ideas

The quickest place is our [Discord](https://discord.gg/bbtnKMW4rf) — answers stay there for the next person. For a tracked bug or feature:

1. Check [existing issues](https://github.com/AugmentedValueAcceleration/ava-supernova/issues) first
2. Use the **Bug Report** or **Feature Request** template
3. For bugs, include: steps to reproduce, expected behaviour, actual behaviour, and the model/provider used
4. For features, describe the use case, not just the solution — we'll discuss the approach before implementation

Found a security issue? Please don't open a public issue — email [support@avasupernova.com](mailto:support@avasupernova.com) — see [avasupernova.com/security](https://avasupernova.com/security).

### Submitting Code

1. **Fork** the repository
2. **Branch** from `development` — name it `feat/description` or `fix/description`
3. **Make changes** — keep commits focused and atomic
4. **Test** — run `pnpm typecheck && pnpm lint && pnpm test`
5. **PR** to `development` — use the PR template

### Commit Messages

We use conventional-ish commit messages:

```
Add present_plan tool with structured approval UI
Fix stop button not appearing during tool execution
Update system prompt with anti-spiraling rules
```

- Start with a verb: `Add`, `Fix`, `Update`, `Remove`, `Refactor`
- Keep the first line under 72 characters
- Body is optional — use it for context on _why_, not _what_

### Code Style

- **TypeScript strict mode** — no `any` unless absolutely necessary
- **Single quotes**, **trailing commas**, **2-space indentation** (enforced by Prettier)
- **Named exports in core** — its public API goes through `src/index.ts`
- Keep changes minimal — don't refactor unrelated code in the same PR

### Architecture Guidelines

- **Core has zero UI dependencies** — it must work for the CLI, the extension and the IDE
- **The extension bundles core inline** via esbuild — don't add heavy dependencies to core
- **Webviews are pure browser React** — no Node.js APIs; communicate via postMessage
- **Tools are self-contained** — each tool has its own file with schema + execute()
- **Providers extend BaseProvider** — override only what's different
- **Mode prefixes live in core** — `applyModePrefix()` wraps user input; new modes go in `system-prompt.ts`
- **API keys live in the OS keychain**, shared by the extension, the IDE and the CLI — never store secrets in plaintext settings
- **Local-first** — no feature may need an account or send user data to us; there is no cloud sync

## What We Need Help With

Check the [issue tracker](https://github.com/AugmentedValueAcceleration/ava-supernova/issues) for issues labeled:

- `good first issue` — small, well-scoped tasks
- `help wanted` — we'd love community input
- `enhancement` — feature ideas ready for implementation

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
