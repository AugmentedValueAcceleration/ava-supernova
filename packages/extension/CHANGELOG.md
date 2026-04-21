# Changelog

## 0.48.2 — 2026-04-21

### Fixed
- **Critical: chat input disabled, tokens show zero, model picker stuck on startup.** `setupAgent()` threw `ReferenceError: syncPrefs is not defined` because the Learning Data Mode gate added in v0.47.0 referenced `syncPrefs` and `cloudAllowed` from a sibling function's scope. Every call to `setupAgent()` crashed silently, so the agent never initialised → `needsSetup: true` locked the chat textarea → platform status never flowed through → model picker stayed on whatever default resolved before the crash. Declarations added locally inside `setupAgent()` matching the pattern in `refreshProjectContext()`. All users on v0.48.0 and v0.48.1 must update.

## 0.48.1 — 2026-04-21

### Fixed
- **Copy canon sweep across every surface.** Reported on X — "bugs with your headline and some texts." Tool count converged to **60** everywhere (previously drifting between 45 / 61 / 63 across marketplace description, walkthrough, webview, dashboard, and all 20 locale files). Language count corrected from 21 → **20** in the README. Plan mode tagline in WelcomeModal now reads **"Architect. Read-only. Thinks first."** (was "Strategist") — matches the one-word role-noun pattern of every other mode. Brainstorm tagline reads **"Ideator. Challenges ideas."** (was "Ideation partner"). Core system prompts updated to match so the model's self-reference stays consistent with the UI.

## 0.48.0 — 2026-04-21

### Changed
- **Teach mode — Fact Checker actually halts the pipeline.** Previously the Fact Checker persona produced verification output that downstream personas ignored — it could flag an error and Quiz Master / Tutor would still ship the wrong material. Now the Conductor has a generalised veto mechanism: any persona can opt in via `canVeto` + `vetoSignals`, and the synthesis prompt surfaces the halt reason with an explicit instruction to the downstream agent not to teach the rejected content. Fact Checker's prompt teaches the model to emit `HALT: <reason>` when it finds a blocking error — model cooperation over regex-lottery. Challenger's existing veto semantics are preserved.
- **Quiz Master persists questions properly.** A new `set_quiz` action on `learning_teach` accepts an array of quiz questions and writes them onto the lesson. Quiz Master's prompt now explicitly instructs the model to call this action for every quiz lesson it designs, closing the loop from "model generated questions" to "questions exist on the lesson and survive restart". The `write_content` template for quiz lessons previously pointed at a dead mechanism — rewritten to point at `set_quiz`.

### Fixed
- **Learning now honours Data Mode end to end.** Memory / Tasks / Journal all respected Local / Cloud / Both. Learning did not — writes always stayed on disk regardless. A signed-in user with Data Mode set to Cloud got nothing synced; curriculums were stranded in `~/.ava/learning.json`. A new `persist()` helper wraps every save with a fire-and-forget push to `/api/learning/sync` when cloud is allowed, gated on a `learningLocalOnly` flag the extension computes the same way it does for the other feature managers. Local-first is preserved — disk write always succeeds first; cloud failure never rolls back the on-disk copy.
- **`/api/learning/sync` accepts Supabase JWTs and enforces Data Mode server-side.** Now on `validateAuth` (JWT or platform key) with an `isLocalOnlyRequest` gate that rejects writes from any client that declared local-only. Matches Memory / Tasks / Journal.
- **Quiz questions now sync to the cloud.** New `quiz_questions JSONB` column on `learning_lessons` (migration 198) — the local store already carried inline questions, but the sync endpoint silently dropped them. Sync now carries the field so quiz definitions round-trip to the web dashboard.

### Added
- **Rate limits on `/api/learning/generate`** so "free for everyone" stays sustainable. Three layers: 15 req/hour per IP (spam), 30 req/day per signed-in user (fairness on shared NATs), 5 req/hour per IP for guests (tightest lane — most-abused surface). Sized around normal use (1-3 curriculums / week / real learner).
- **`persona_veto` conductor event** so chat surfaces can render "Fact Checker halted: X is wrong" inline instead of the pipeline just stopping silently.

## 0.47.0 — 2026-04-21

### Removed
- **`presentation_create` tool removed.** LLM-generated `.pptx` decks consistently fell short for the high-stakes use cases the tool was marketed for (pitch decks, board briefs, sprint reviews). Rather than ship a feature we couldn't stand behind, the tool is gone — reports, emails, and document_manage (covering `.docx` / `.xlsx` / `.pdf` / `.csv` / `.md`) continue to be the Office Suite. Tool count drops 61 → 60.

### Added
- **Documents tab in Creative Studio.** Create blank `.docx` / `.xlsx` / `.csv` / `.md` / `.pdf` files from the dashboard, or start from one of six templates (Project Proposal, Status Report, Invoice, Formal Letter, Meeting Notes, Resume). Each tile has a format-specific Phosphor icon in the Documents colour scheme. Files land in your project's `documents/` folder and appear in the Library tab immediately.
- **Open Externally prefers LibreOffice / OpenOffice** when installed. Falls back to the OS default when neither is found. Honours the open-source stance without punishing users who don't have an OSS office suite on disk.
- **Redesigned asset preview.** Docs and spreadsheets now render a branded card (colour-matched Phosphor icon, format label, full path) instead of a bland fallback emoji. All asset types share the same action row — **Open** (LibreOffice-first), **Reveal** (OS file browser), **Download**, **Delete** — laid out on a 4-column grid.
- **Data Mode "Both" parity for documents.** Blank and templated docs now also upload to cloud storage when Data Mode is Cloud or Both, matching what the `generate_*` tools already did for images / music / video / voice. Local-first is preserved: the file always lands on disk regardless.

### Fixed
- **Memory cloud sync was silently duplicating rows.** `PlatformMemorySync.pull()` was reading a paginated response as a bare array (shape mismatch), so the client dedup map was always empty and every periodic push created fresh rows. 9,034 rows across all users collapsed to 1,019 (89% reduction) after the dedupe migration. DB-level unique index on `(user_id, key)` now blocks any future regression at the source, and the POST endpoint is idempotent on conflict.
- **Downloads now work.** `download_asset` and several other handlers referenced `fs.*` without the required dynamic import — threw "fs is not defined" at runtime. All confirmed handlers now have their imports in scope.
- **Companion mobile memories** were invisible on signed-in iPhone Safari because the service worker cached API responses and served stale empty arrays on any backgrounded fetch miss. SW now bypasses `/api/*` entirely — always live, never cached.
- **Billing polish.** Downgrade to Free surfaces as a Reactivate banner when a paid plan is cancel-at-period-end. Single unified token bar across extension / web / companion / hub. Stale 500K fallback replaced with the real 3M free allowance. Billing tab splits into Overview and History sub-tabs with Stripe invoices + local top-ups in one timeline.
- **Data Mode enforcement** tightened server-side on `/api/tasks`, `/api/journal`, `/api/memories` — endpoints now honour the `X-Ava-Data-Mode: local` header, rejecting writes from a client that claims local-only mode. Defense in depth against a buggy client.
- Authentication on those same endpoints accepts both `sk-ava-*` platform keys and Supabase JWTs, unblocking the companion which was getting 401s on every read.

### Changed
- **Auto Mode token burn reduced** via a Flash-based intent gate upstream of the coordinator, tighter orchestration thresholds (Work / Security / Brainstorm default to minimum-viable persona pipelines unless the user asks for the full team), and per-persona model tiering. Estimated 70-80% reduction on a typical orchestrated turn.
- **Documents tab icons upgraded** to format-specific Phosphor icons (`FileDoc`, `FileXls`, `FileCsv`, `FileMd`, `FilePdf`) — matches the Documents tab in the asset preview for visual consistency.
- **Creative Studio Library tab refreshes instantly** after a document is created. Previously only updated on tab switch.

### Docs
- Extension README, core ava-docs, and website marketing pages (meet-ava, extension, use-cases) swept for references to the removed presentation_create tool. All 20 i18n locale files updated — 5 keys per file (2 deleted, 3 sentence strings rewritten so "presentations" no longer appears in the Library copy).

## 0.46.0 — 2026-04-20

### Added
- **Data Mode gating.** Memory, tasks, journal, history, and creative assets all respect the Local / Cloud / Both toggle end to end — both the extension and server honour the `X-Ava-Data-Mode` header so local-first stays truly local regardless of platform.
- **Cloud Management tab** in the dashboard with inline bulk delete per category, storage refresh on mount, and a refresh button.
- **Context bar redesign.** Moved above the composer with a slimmer visual treatment; emits context_usage on conversation load/restore so the bar doesn't stay at "awaiting first turn" on a restored chat with real content.
- **Coupons** wired into all three checkout flows (plan, top-up, storage add-on) with a new admin endpoint for managing the pool.
- **Collapsed sidebar** becomes a 56px icon rail instead of disappearing entirely.

### Changed
- **Billing tab.** Canonical plan data across all surfaces, "Coming Soon" state on purchases, UsageBar inverted to standard progress-bar semantics (% used rather than % remaining), all 4 plans visible with the current one flagged.
- **Token reduction.** Anthropic prompt caching, PLATFORM_FACTS gating, history cap, context-dump → summary, `file_read` / `grep` output ceilings.

## 0.45.0 — 2026-04-19

### Changed
- **i18n future-proofed.** TypeScript now enforces that every non-English locale file contains exactly the same keys as `en.ts`. Adding a new key to the source file fails the build in all 19 sibling files until filled — no more silent drift.
- **Policy allowlist (`KEEP_ENGLISH`).** Brand names, proper nouns, and placeholder-only strings live in a single policy file per surface. The check script skips them so they don't register as "untranslated".
- **`pnpm i18n:check` CI gate.** Fails on missing keys, extras, empty values, English leaks outside the allowlist, and placeholder mismatches. Runs across core, webview-ui, and `package.nls`.
- **`pnpm i18n:translate` auto-translator.** Fills untranslated strings via the platform's Qwen API. Idempotent, safe to re-run, timeout-protected with retry.
- **ESLint guardrail on webview JSX.** A `no-restricted-syntax` rule blocks raw English text and hard-coded `aria-label` / `placeholder` / `title` / `alt` attributes. Any future PR adding untranslated UI text fails lint.
- **Hardcoded strings extracted.** `ChatContainer`, `SecretGrantPrompt`, `SecretVault`, `PersonaStatus`, `Header`, `InputArea`, `MemoryPanel`, `ContextBar`, `MessageBubble`, `App.tsx` — the GDPR consent gate, persona team labels + verbs, secret-grant modal, accessibility aria-labels, brand wordmarks — all now flow through `t()`.

### Translated
- **~2,500 strings** auto-translated across the 19 non-English locales via Qwen 3.5 Flash, covering core messages, extension webview UI, and the VSCode manifest strings. Check error count fell from 3,720 to 248 (99% resolution). Remaining residuals are cognates already correct in the target language (e.g. "Chat" in German, "Version" in French).

### Notes
- IDE ships with the same translated strings for free — it imports from `core/dist/i18n/locales/*.js`.

## 0.44.0 — 2026-04-18

### Fixed
- **Error recovery is no longer stuck.** When a provider returned a 400 mid-run, pressing the old "Continue" button re-sent the same broken conversation state and hit the same 400 — a loop that burned tokens on every identical failure. The button now runs a conversation-repair pass (orphan tool-call cleanup, unmatched tool-result removal) before issuing the next request, so the retry actually has a chance to succeed. Button relabelled to "Retry" to match what it does.
- **browserLaunched scope bug** in end-of-turn auto-close no longer throws ReferenceError.

### Changed
- **Per-turn token cost reduced in Work mode.** Added a Work-mode tool whitelist so coding turns no longer ship all 59 tool schemas every request. Office tools, Creative Studio capture, and cross-mode tools still reachable by switching modes. Saves ~2-2.5K tokens per Work-mode turn.
- **Conductor persona tiering — light by default.** Work, Security, and Brainstorm modes now default to a minimum-viable persona pipeline (4 / 3 / 3 personas respectively) instead of the full 9 / 5 / 5. Users opt into the full team via keywords: "full team", "comprehensive review", "deep audit", "thorough review". Plan and Teach modes unchanged — already at intended minimums. Saves 3-15K tokens per orchestrated turn.
- **Post-Conductor gate dedupe.** When the Conductor already validated user intent via a 5-persona run, the downstream AutoCoordinator orchestration gate no longer makes a redundant Flash call asking "should we orchestrate?"
- **Marketplace description** updated to accurately reflect extension scope (desktop automation and screen capture live in the dedicated Ava IDE, not this extension).

### Notes
- Desktop-level automation (screen capture, app control, keyboard/mouse drive) continues to live in the dedicated Ava IDE, not in this VSCode extension — per marketplace policy.
