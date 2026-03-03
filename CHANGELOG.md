# Changelog

All notable changes to Ava | Supernova will be documented in this file.

## [0.2.0] - 2026-03-02

### Security Mode

- **AI-powered security scanning** — new `!!` Security mode in the extension and `/security` CLI command
- OWASP-aligned audit covering 11 vulnerability categories: injection, auth, secrets, XSS, CSRF, misconfiguration, dependencies, crypto, SSRF, deserialization, logging
- Uses existing tools (file_read, grep, glob, bash) to scan the project — no new tools or agents needed
- Streams findings in real-time through the chat interface with severity, file, category, and fix recommendations
- Interactive — reply to findings ("fix that one", "explain more", "scan auth deeper")
- Available via mode selector (`!!`) in extension and `/security` (`/sec`, `/audit`) in CLI

### Platform Integration

- **Ava platform account system** — connect your account from [ava-supernova.com](https://ava-supernova.com) for managed API access
- Free, Pro ($19/mo), and Ultra ($49/mo) tiers with managed LLM proxy
- Platform key stored securely in VSCode SecretStorage
- Dashboard panel inside VSCode — account overview, billing, memory, connections, settings
- Token usage tracking and display for Pro tier users
- Automatic proxy routing for paid tier users (no provider API keys needed)

### Security Audit & Hardening

- Comprehensive security audit — 23 vulnerabilities identified and fixed
- API key storage migrated from plaintext settings to VSCode SecretStorage
- Git tool command injection prevention (execFile + metacharacter rejection)
- SSRF protection on http_request tool (blocks private/internal IPs)
- Rate limiting on all platform API routes
- Atomic usage tracking with row-level locking
- Signed admin cookies replacing client-side session storage
- CSP nonce upgraded to crypto.randomBytes
- Input validation and error sanitization across all endpoints
- RLS INSERT policies for defense-in-depth

### Providers

- **GLM (Zhipu AI)** — GLM-5, GLM-4.7, GLM-4 Flash added to platform
- **Mistral** — Mistral Large 3, Codestral, Devstral 2, Mistral Small added to platform

### New Tools (21 total, up from 13)

- **git_diff** — View git diffs for staged/unstaged changes
- **screenshot** — Capture screenshots for visual analysis
- **database_query** — Query databases directly from the chat
- **browser** — Control a browser for web interaction
- **memory_save** — Save conversation memory for cross-session recall
- **rollback** — Undo file changes with one command
- **project_index** — Index your codebase for intelligent navigation
- **find_symbol** — Find symbols (classes, functions, variables) across your project

### Extension

- Four modes: Code (`>>`), Plan (`::`), Chat (`..`), Security (`!!`)
- Dashboard panel (`Ava: Open Dashboard` command) — account management without leaving VSCode
- Provider source toggle — switch between own API keys and platform managed access
- Model selector updated with GLM and Mistral models

### CLI

- `/security` command (aliases: `/sec`, `/audit`) — run security audits from the terminal
- Supports focused scans: `/security auth`, `/security dependencies`, etc.

### i18n

- Security mode strings added to all 20 languages (core + webview)

---

## [0.1.0-beta] - 2026-02-23

### First beta release

Ava | Supernova launches as an open-source AI coding agent available as both a **terminal CLI** and a **VSCode extension**.

### Highlights

- **3 providers, 6 models** — DeepSeek (V3, R1), Kimi (K2.5, Moonshot V1), Qwen (3.5 Plus, Turbo)
- **Custom provider support** — Use any locally hosted model via Ollama, LM Studio, or any standard API format endpoint
- **13 built-in tools** — file_read, file_write, file_edit, glob, grep, bash, web_search, http_request, list_directory, git_status, present_plan, todo_write, ask_user
- **3 permission modes** — Strict, Balanced, Autonomous
- **20 languages** — Full i18n across CLI, extension, and core
- **Vision support** — Attach images in the chat for models that support it (Qwen 3.5 Plus)
- **Context compression** — Automatic context management to stay within model limits
- **Project context** — `.ava/instructions.md` loaded into the system prompt per project
- **Conversation history** — Auto-saved, searchable, pinnable, renamable, exportable

### CLI

- Interactive setup wizard for first-time configuration
- 20+ slash commands for model switching, history management, permissions, and more
- Markdown rendering in the terminal
- Thinking block display for reasoning models

### VSCode Extension

- Sidebar chat with full agent loop
- Three modes: Code (full agent), Plan (read-only), Chat (no tools)
- Tool approval cards with Allow, Deny, Always Allow, and Allow All
- Plan approval with structured goal/steps/verification display
- Ask User card for mid-task questions
- Model selector dropdown with vision indicator
- Status bar with token usage tracking
- Conversation history panel with search, pin, rename, delete, and export
- Copy buttons on code blocks and messages
- Getting Started walkthrough accessible from Settings

### Core

- Event-driven agent architecture shared by CLI and extension
- Injectable confirmation handler for UI-agnostic tool approval
- Error recovery and resilience hardening
- 208 tests across 19 test files
- Zero external SDK dependencies — all providers use native `fetch`
