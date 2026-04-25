# Roadmap

> Ava Supernova — Democratising agentic coding for everyone.

This roadmap is a living document. Priorities shift based on community feedback, funding milestones, and technical discoveries. Want to influence direction? Open a [Discussion](https://github.com/AugmentedValueAcceleration/ava-supernova/discussions) or comment on an existing issue.

---

## Recently Completed

- **54 built-in tools** — File ops, search, shell, git, web, media, data, memory, planning, office suite
- **20-language i18n** — Full internationalisation across core, webview, and extension UI
- **9 provider integrations** — Zhipu, Moonshot/Kimi, DeepSeek, Alibaba/Qwen, Mistral, Anthropic, MiniMax, H Company (Holo3), Generic/local
- **20+ models** — Qwen 3.6 Plus, MiniMax M2.7/M2.5, Holo3-122B, Claude family, and more
- **Computer Use** — Holo3 vision + UIA grounding + adaptive wait + smart replanning (IDE only)
- **Memory overhaul** — Pre-compression extraction, ambiguous reference detection, relevance-scored briefs, pattern surfacing, project memory safety
- **Memory v2** — Three-layer memory (person/workflow/project) with TF-IDF recall and Memory Agent curation
- **Screenshot compression** — Rust-side resize to 1280px for faster Holo3 inference
- **Provider resilience** — Circuit breaker failover, automatic retry, graceful degradation
- **Context compression** — Automatic sliding window with memory extraction before message drops
- **Vision support** — Image understanding for models that support it (GLM-5, Kimi K2.5, Qwen 3.5+, Mistral Large, Claude)
- **Desktop IDE** — Tauri v2 app with local @ava/core sidecar, live status feedback, project explorer, computer use
- **Live status feedback** — 15+ event types shown during tasks (scanning files, searching code, recalling memories, etc.)
- **Landing page redesign** — Show-don't-tell approach with terminal demos, scenario cards, values
- **Documentation** — Architecture guide, tool development guide, provider adapter guide, self-hosting guide

## Current Focus

### v1.0 Launch Readiness (April 13, 2026)

- [x] Context management — smarter compression with memory extraction
- [x] Computer use — desktop automation via Holo3
- [x] Memory system — pre-compression extraction, disambiguation, relevance scoring
- [x] Live status feedback — users see what Ava is doing
- [x] Landing page redesign
- [x] Privacy policy and terms of service (UK GDPR compliant)
- [x] Models page redesign with interactive benchmarks
- [ ] Extension marketplace reinstatement (pending Microsoft review)
- [ ] Paid plans activation (Pro $19, Ultra $39, Enterprise $79)
- [ ] Final stability testing across all surfaces

## Next Up

### Memory & Knowledge

- **Memory consolidation v2** — Smarter cross-session merging, project-level deduplication
- **Project indexing** — Deeper codebase understanding via AST analysis and symbol graphs

### Productivity Tools

- **Email integration** — Agent proposes drafts, user approves before sending
- **Slack / Discord** — Read channels, post messages with user approval
- **Calendar awareness** — Context about deadlines and meetings

### Developer Experience

- **Plugin marketplace** — Community-contributed tools with a simple install flow
- **Settings sync** — Sync configuration, history, and memory across machines
- **Voice system** — Kokoro TTS, offline via WASM, persona-mapped voices

### Computer Use v2

- **Multi-app workflows** — Cross-application task chains (copy from Excel, paste into email)
- **Form filling** — Auto-fill applications with user data from memory
- **Browser automation** — Research, comparison, multi-page navigation
- **Screenshot compression v2** — JPEG encoding for further size reduction

## Long-Term Vision

### Teaching & Learning Mode

Ava as a coding tutor: assess the learner's level, build adaptive curricula, track progress via memory, and adjust teaching style across sessions. Free for everyone — education shouldn't have a price tag.

### Game Engine Integrations

- **Unreal Engine** — Remote Control API + Python scripting
- **Unity** — Editor C# scripts + CLI automation
- **Godot** — GDScript + LSP integration

Write code, control the editor, screenshot the viewport — full visual iteration loop.

### Platform Evolution

A JARVIS-like development platform where Ava manages your entire development workflow: code, test, deploy, monitor, and iterate — all with human oversight at every step.

---

## How to Contribute

1. Check [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup and conventions
2. Browse issues labelled [`good-first-issue`](https://github.com/AugmentedValueAcceleration/ava-supernova/issues?q=label%3Agood-first-issue)
3. Areas where help is especially welcome:
   - **i18n** — Improving translation quality for non-English languages
   - **Provider adapters** — Adding support for new model providers
   - **Tools** — Building new tools (see `docs/tool-development-guide.md`)
   - **Testing** — Expanding test coverage, especially integration tests
   - **Accessibility** — Ensuring the extension works well with screen readers and alternative input

## Funding

This project is supported by [NGI Zero Commons Fund](https://nlnet.nl/commonsfund/). You can also sponsor development via [GitHub Sponsors](https://github.com/sponsors/AugmentedValueAcceleration).
