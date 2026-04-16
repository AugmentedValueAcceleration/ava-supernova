# Changelog

All notable changes to Ava | Supernova will be documented in this file.

## Extension [0.41.0] - 2026-04-16

### Secret Vault — Capability Model
- **Owner-split vault** — your keys live in VSCode SecretStorage; Ava only sees secrets you explicitly grant for the current chat session. New chat = fresh trust boundary, working set wiped automatically.
- **Streaming-safe redactor** — high-confidence patterns (Anthropic, OpenAI, GitHub, AWS, Stripe, SendGrid, Slack, JWT) are scrubbed from chat output before they hit the screen, even for keys that aren't in your vault yet.
- **Capability handles** — Ava receives opaque `{{secret:<id>}}` references, never raw values. The host substitutes them into tool args at execution time, so secrets never enter conversation history.
- **`secret_request` tool** — Ava asks for what she needs; you pick from a grant prompt; she gets a handle, you stay in control.
- **`env_write` tool** — project-aware writer (Next.js → `.env.local`, others → `.env`); refuses to write unless the target file is `.gitignored`; rejects `NEXT_PUBLIC_/VITE_/PUBLIC_` prefixes for secrets.
- **Per-secret "Always grant for this project"** — set once, skip future prompts for that vault entry.

### Sync — Toggle Enforcement End-to-End
- **Sync Page toggles now enforce** — previously the dashboard toggles were UI-only and background pushes ignored them. Now they gate every push site (memory/tasks/journal/history managers + settings/personality push helpers + manual Sync Now buttons).
- **Phantom toggles removed** — Profile and Creative Assets sync rows pointed at endpoints that don't exist, surfaced silent errors, and the auto-sync interval was firing failed `creative` pushes every 15 minutes. Both removed; auto-sync stops trying.
- **Personality cloud sync** — push on save fire-and-forget; pull on init prefers cloud copy and writes through to local; Sync Now button now uses the dedicated personality column instead of nesting in the settings JSONB.
- **Settings cloud sync** — push on save with `lastSettingsPushAt` watermark; pull on init applies remote only when newer; prevents stale-cloud overwrite of newer local.
- **Chat history persistence** — webview now restores messages and current conversation id across reloads (cap 200 messages to stay within VSCode's webview-state quota).
- **Secret consolidation** — four DashboardPanel reads were pulling from `globalState['ava.platformKey']` (a key nobody ever wrote, silently 401'd those flows); switched to `secrets.get(PLATFORM_KEY_SECRET)` matching every other call site.

### Documentation Audit (P0s shipped)
- **Tool count drift** — every surface that mentioned a count (54, 59, 61) now reads 63 (the truth after the vault overhaul). Fixed across 19 files.
- **Mode tooltips** — the chat-input mode picker now shows a plain-English description under each mode label, no jargon.
- **Walkthrough registered** — first-time installers now get the 5-step Getting Started walkthrough (api key → model → language → permissions → start). Strings existed; the `walkthroughs[]` array was empty.

### History Page
- **Open from anywhere** — the History nav button now switches to the chat page first, then opens the history panel. Previously only worked when chat was already active.
- **Design pass** — rewritten to use the dashboard token system (border-card / bg-card / accent) so it visually matches the rest of the extension.

### Bug Fixes
- **DashboardPanel `this.context` field** — was referenced in `set_working_hours` and the new sync-pref helpers but never declared / stored from the constructor; surfaced once the sync init path exercised it. Field added.
- **Sync Now ENOENT guards** — memory / tasks / learning push handlers blew up with ENOENT when the local file didn't exist yet (fresh install + auto-sync racing on mount). All three now treat a missing file as 'nothing to sync'.

## IDE [0.7.3] - 2026-04-03

### Memory System — Project Safety + Context Recovery
- **Project memory fallback** — project-scoped saves with no project open now fall back to global scope instead of silently vanishing
- **Context compression recovery** — compression note now instructs Ava to proactively check memory before claiming lack of context

## IDE [0.7.2] - 2026-04-03

### Memory System Overhaul
- **Pre-compression extraction** — Layer 1 regex patterns now run on messages before context compression drops them. Preferences, corrections, and decisions are no longer silently lost.
- **Recall threshold** — raised from 0.15 to 0.25 TF-IDF minimum, filtering out weak noise
- **Relevance-scored candidates** — memory brief generator sees match percentage and recency metadata
- **Ambiguous reference detection** — "that thing we discussed" enriches memory query with conversation context for disambiguation
- **Pattern surfacing** — brief generator highlights learned preferences and style patterns
- **Brief curation** — prompt instructs score-based prioritisation of strong recent matches

## IDE [0.7.1] - 2026-04-03

### Screenshot Compression
- **Rust-side resize** — screenshots resized to 1280px width before PNG encoding (~60-75% smaller payloads)
- **Coordinate mapping** — Holo3 coordinates scaled back: resized image space to original pixels to DPI-adjusted logical coordinates

### Smart Replanning
- **Stuck detection** — 3x same action triggers Qwen 3.6 Plus replan from blackboard state
- **Failure recovery** — 3 consecutive failures trigger replan with full context (what was done, what failed, current screen)
- **Adaptive approach** — new plan only includes remaining steps, adapts method if original failed
- **Max 2 replans** before final abort (configurable)

## IDE [0.7.0] - 2026-04-03

### Computer Use Overhaul
- **UIA grounding** — Holo3 receives visible UI element names and coordinates from Windows UI Automation for pixel-perfect clicking
- **Vision knowledge** — app-specific visual patterns (Notepad, Browser, VS Code, etc.) injected into Holo3 system prompt
- **DPI scaling fix** — re-detect every 10s, safe 1.0 default instead of wrong 1.5, coordinate bounds clamping
- **Screen dimensions** — Holo3 knows the coordinate space to stay in bounds
- **Adaptive wait** — polls for screen changes after actions instead of fixed sleep
- **History** — action history extended from 3 to 6 steps for better multi-step continuity

## IDE [0.6.2] - 2026-04-03

### Live Status Feedback
- **15+ event types** surfaced as user-friendly status text (Scanning files, Searching code, Recalling memories, etc.)
- **Tool-specific labels** — glob shows "Scanning files", grep shows "Searching code", bash shows "Running command"
- **Status shown next to thinking spinner** — replaces static "thinking" text

### Chat API Fix
- **500 error fix** — wrap increment_usage RPC in try-catch, allow chat through on tracking failure

## IDE [0.6.1] - 2026-04-03

### Project Explorer Fix
- **set_cwd command** — sidecar now receives working directory updates when user opens a folder
- **Agent.setCwd() / Conductor.setCwd()** — dynamic working directory updates without recreating the agent
- **Memory + indexer refresh** — re-creates MemoryManager and ProjectIndexer for the new project

### Image Warning
- **Vision model check** — immediate warning when attaching images on a non-vision model

### Usage Fix
- **405 error** — balance fetch was calling POST-only /api/usage with GET, now uses /api/account-info

## Website - 2026-04-03

### Landing Page Redesign
- **Hero** — single headline, ambient glow, one CTA button
- **Terminal demo** — animated Ava reviewing a project
- **3 scenario cards** — Work (build), Teach (learn), Computer Use (desktop control)
- **Values** — free for everyone, your data stays yours, open source
- **Modes** — minimal 6-icon strip with hover effects
- **Removed** — install counts, proof carousel, provider grid, stats bar

### Models Page Redesign
- **Interactive benchmarks** — click any model to see detailed performance bars with layman explanations
- **7 benchmark categories** — SWE-Bench, HumanEval, MMLU, MATH, GPQA, Tool Use, Vision
- **Platform/BYOK badges** — every model shows how it can be accessed
- **20+ models** — added Qwen 3.6 Plus, Qwen Omni Flash, MiniMax M2.7/M2.5, Holo3 models

### Legal
- **Privacy policy** — UK GDPR compliant with data subject rights, Computer Use section, all providers listed
- **Terms of service** — Computer Use liability section, free token pool terms, all providers listed

### Content Fixes
- Tool count 56 to 54 across all pages
- Removed install counts (no vanity metrics)
- Removed standalone Qwen page (consolidated into models)
- Updated model count to 20+

---

## [0.22.2] - 2026-03-23

### Platform-Tagged Release Notes
- **Platform column** on `release_notes` table — core, extension, ide, companion
- **Colour-coded tabs** on all surfaces — All, Core (blue), Extension (purple), IDE (green), Companion (orange)
- **Compound unique constraint** — (version, platform) allows per-platform versioning
- **API filter** — `?platform=core` or `?platform=core,ide` query param
- **Core tool updated** — `release_notes` tool accepts `platform` parameter
- Recategorised 14 existing releases as core, 4 as companion
- Added 3 companion + 3 IDE release entries

### IDE — Session Stats Sync
- **Shared session stats store** in `api.ts` with real-time CustomEvent dispatching
- Token usage, messages, tool calls tracked across Usage Analytics, Command Centre, and chat header
- `trackTokenUsage()`, `trackMessage()`, `trackToolCall()` called on every event
- Reset on New Chat

### IDE — Collapsible Tasks Panel
- **Two-tab sidebar** — Ava (session tasks from `todo_write`) and My Tasks (platform API)
- **Live updates** — panel refreshes on `tool_call_start` so users watch tasks tick off
- **Resizable** — drag left edge (200-500px), persisted to localStorage
- **Auto-open** when Ava creates session tasks
- **Inline TodoCard** — checklist renders inside chat messages with progress bar
- **Escape to close**, badge count in header button

### IDE — UI Polish
- **Custom dropdowns** — replaced all 4 native `<select>` elements with styled `CustomSelect`
- **Sidebar sections** — Workspace, Personalise, Account, Help with collapsible groups
- **Active tab highlight** — purple left border + background
- **40/60 news/tasks split** in Command Centre
- **Tab icon fix** — no longer duplicates emoji
- **Command Centre default** — opens on launch, Welcome page removed

### API Fixes
- **1000-row cap fix** — Supabase default limit removed from `/usage/summary` and `/memories` with pagination
- **`totals.requests`** now uses `requests_count` from usage table, not capped log count

### Documentation
- IDE README rewritten from Tauri boilerplate to full feature documentation
- CHANGELOG updated with v0.22.1 and v0.22.2

---

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
