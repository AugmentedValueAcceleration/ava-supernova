# Contributing to Ava | Supernova

Thanks for wanting to contribute! Ava is an open-source project and we welcome contributions of all kinds — bug fixes, features, documentation, and ideas.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v20.0.0+
- [pnpm](https://pnpm.io) v10+
- An API key from at least one [supported provider](README.md#supported-providers)

### Setup

```bash
git clone https://github.com/AugmentedValueAcceleration/ava-supernova.git
cd ava-supernova
pnpm install
pnpm build
```

### Project Structure

This is a **pnpm monorepo** with four packages:

| Package | Path | Description |
|---------|------|-------------|
| `@ava/core` | `packages/core` | Agent loop, providers, tools, config, history |
| `@ava/cli` | `packages/cli` | Terminal REPL interface |
| `ava-supernova` | `packages/extension` | VSCode extension host |
| `@ava/webview-ui` | `packages/extension/webview-ui` | React webview for the extension |

### Development Commands

```bash
pnpm build        # Build all packages
pnpm dev          # Run CLI in development mode
pnpm typecheck    # Type check all packages
pnpm lint         # Lint all packages
pnpm test         # Run all tests
pnpm format       # Format with Prettier
```

## How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/AugmentedValueAcceleration/ava-supernova/issues) first
2. Use the **Bug Report** issue template
3. Include: steps to reproduce, expected behavior, actual behavior, model/provider used

### Suggesting Features

1. Open a **Feature Request** issue
2. Describe the use case, not just the solution
3. We'll discuss the approach before implementation

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
- **No default exports** — use named exports everywhere
- **Barrel exports** — public APIs go through `src/index.ts`
- Keep changes minimal — don't refactor unrelated code in the same PR

### Architecture Guidelines

- **Core has zero UI dependencies** — it must work for both CLI and extension
- **Extension bundles core inline** via esbuild — don't add heavy dependencies to core
- **Webview is pure browser React** — no Node.js APIs, communicate via postMessage
- **Tools are self-contained** — each tool has its own file with schema + execute()
- **Providers extend BaseProvider** — override only what's different

## What We Need Help With

Check the [issue tracker](https://github.com/AugmentedValueAcceleration/ava-supernova/issues) for issues labeled:

- `good first issue` — small, well-scoped tasks
- `help wanted` — we'd love community input
- `enhancement` — feature ideas ready for implementation

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
