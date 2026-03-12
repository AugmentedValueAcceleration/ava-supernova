# Roadmap

> Ava | Supernova — Democratising agentic coding for everyone.

This roadmap is a living document. Priorities shift based on community feedback, funding milestones, and technical discoveries. Want to influence direction? Open a [Discussion](https://github.com/AugmentedValueAcceleration/ava-supernova/discussions) or comment on an existing issue.

---

## Recently Completed

- **20-language i18n** — Full internationalisation across core (241 keys), webview (144 keys), and extension UI (62 keys)
- **7 provider integrations** — Zhipu, Moonshot/Kimi, DeepSeek, Alibaba/Qwen, Mistral, Anthropic, Generic/local
- **24 built-in tools** — File ops, search, shell, git, web, media, data, memory, planning
- **Memory v2** — Global + project-scoped memory with categories, archiving, recall tracking
- **Provider resilience** — Circuit breaker failover, automatic retry, graceful degradation
- **Multi-platform stability** — Extension stability (workspace switch cleanup, heartbeat, error boundaries), accessibility (WCAG 2.1 AA)
- **Testing infrastructure** — 385+ tests across core, CLI, and extension
- **Context compression** — Automatic conversation compression to stay within token limits
- **Vision support** — Image understanding for models that support it (GLM-5, Kimi K2.5, Qwen 3.5+, Mistral Large, Claude)
- **Documentation** — Architecture guide, tool development guide, provider adapter guide, self-hosting guide

## Current Focus

### v1.0 Launch Readiness

- [ ] Context management improvements — smarter compression, multi-file awareness
- [ ] Extension polish — settings UI, onboarding flow, error messaging
- [ ] Community infrastructure — governance, triage workflows, contributor docs
- [ ] Automated i18n regression testing

## Next Up

### Memory & Knowledge

- **Memory improvements** — Cross-session learning, smarter recall relevance, memory decay
- **Project indexing** — Deeper codebase understanding via AST analysis and symbol graphs

### Productivity Tools

- **Email integration** — Agent proposes drafts, user approves before sending (SMTP initially, OAuth later)
- **Slack / Discord** — Read channels, post messages with user approval
- **Calendar awareness** — Context about deadlines and meetings

### Developer Experience

- **Plugin marketplace** — Community-contributed tools with a simple install flow
- **Settings sync** — Sync configuration, history, and memory across machines
- **Streaming improvements** — Faster perceived response times, better partial rendering

## Long-Term Vision

### Teaching & Learning Mode

Ava as a coding tutor: assess the learner's level, build adaptive curricula, track progress via memory, and adjust teaching style across sessions.

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
