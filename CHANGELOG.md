# Changelog

All notable changes to Ava | Supernova will be documented in this file.

## [0.22.0] - 2026-03-23

### IDE — Local AI Engine (Sidecar Integration)

- **Node.js sidecar** — `@ava/core` runs as a local process inside the Tauri IDE, giving full 54-tool access without a browser or VS Code
- **NDJSON protocol** — real-time bidirectional communication between React UI and sidecar over stdin/stdout
- **Local & Cloud toggle** — switch between BYOK keys (local, full tools) and platform API (cloud) from the chat header
- **Tool confirmation dialog** — visual approve/deny modal for dangerous tool calls (bash, file writes, git commits)
- **Hot model switching** — change models without restarting the sidecar process
- **Persona orchestration** — Conductor runs locally with all 24 specialists across 5 modes

### IDE — Library Page

- **File browser** for Ava-created content — images, documents, spreadsheets, presentations
- **Grid and list views** with type filtering (Images, Docs, Sheets, Slides)
- **File detail panel** — size, type, date, folder, quick open
- **Type-coloured badges** and icons for visual identification

### IDE — Image & File Sharing in Chat

- **Inline images** — generated images, screenshots, and background removals display directly in chat messages with download buttons
- **Created file cards** — documents, presentations, spreadsheets show as typed file cards with icons and open buttons
- **Paste images** — Ctrl+V screenshots or images directly into the chat input
- **Drag & drop** — drop images and files onto the input area
- **File attach button** — click to browse and attach images, PDFs, documents, spreadsheets
- **Attachment preview** — thumbnails above the input before sending, with remove buttons

### IDE — Infrastructure

- Registered Tauri shell plugin with scoped `node` command permissions
- Fixed CORS for IDE dev server (localhost:1430) and Tauri origins
- Platform API JSON response handling (non-SSE) for cloud mode
- Memory loading timeout to prevent init hangs
- Sidecar path resolution for Tauri's `src-tauri/` working directory

### Documentation

- Added Desktop IDE tab to Getting Started (web docs)
- Added full Desktop IDE section to documentation page (architecture, features, sidecar protocol)
- Updated README IDE section — Tauri v2 architecture, local/cloud modes, Library, image sharing
- Updated CHANGELOG with v0.22.0 release notes

---

## [0.5.4] - 2026-03-11

### Mid-Task Interjection

- **Type while Ava is working** — send additional context, corrections, or new instructions without waiting for the current task to finish
- Works across all hosts: VS Code extension, CLI, and standalone IDE
- Messages are injected between agent loop iterations for natural, collaborative flow
- CLI: type and press Enter to inject; press Escape or Ctrl+C to cancel the current task

### Self-Read Awareness

- Ava can now read her own source code when directly asked (admin/developer mode only)
- Auto-detects when the workspace is the ava-supernova monorepo
- Read-only access — Ava never browses or modifies her own code unprompted

### CLI Cancel Support

- Press **Escape** or **Ctrl+C** to cancel the current agent run in the CLI
- Clean abort — no error output, just returns to the prompt

---

## [0.5.3] - 2026-03-10

### System Prompt Optimization

- Deduplicated and trimmed system prompt for lower token overhead
- Added context-aware sections that only appear when relevant

---

## [0.5.2] - 2026-03-09

### Memory Panel v2

- Structured memory entries with categories (pattern, preference, architecture, bug-fix, convention, tool-config, decision, person, general)
- TF-IDF retrieval with composite relevance scoring (content 55%, recency 25%, recall frequency 20%)
- Conflict detection and automatic merging of duplicate/overlapping entries
- Branch scoping — scope memories to specific git branches
- Auto-archival of entries inactive for 90+ days
- Active / Stale / Archived tabs with category filters and branch badges
- Edit, archive, and restore actions in the Dashboard memory panel

---

## [0.5.0] - 2026-03-08

### Memory v2

- Complete rewrite of the memory system with structured, categorized entries
- 9 memory categories for organized knowledge storage
- TF-IDF-based semantic search replaces simple substring matching
- Temporal awareness — recent memories weighted higher
- Branch-scoped memories for experimental work
- Consolidation engine groups related entries by similarity
- Runtime credential detection blocks saving API keys, JWTs, tokens, and private keys

---

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
