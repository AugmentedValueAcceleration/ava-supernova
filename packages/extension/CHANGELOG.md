# Changelog

## 0.49.0 — 2026-04-24

### Changed
- **Chat history is now local-only by design.** Raw conversations — the user's code, prompts, tool output, file paths — never leave the machine they were recorded on. Cloud sync for chat is removed from the client; the Sync page drops the chat-history toggle across extension + IDE; docs and Data Mode copy updated. The 5-layer memory pipeline continues to extract durable facts (preferences, decisions, patterns) and sync THOSE for cross-device continuity, so nothing meaningful is lost — only the transcripts themselves stay on your machine. Biggest privacy improvement in the product's history. Additional win: every active user reclaims roughly 100–500 MB of cloud storage per year that was previously being filled by plaintext chat logs.
- **`deleteConversation` and `pullLatest` still work** against the legacy cloud endpoint so users who synced chat history under earlier versions can migrate it down to local + wipe the cloud copy. No new cloud saves; clean path off the old data.

### Fixed
- **Context compression no longer destroys your chat scrollback.** Previously, when the agent hit the 70% context-window threshold and auto-compressed — or when the user manually ran compression — the compressed message array replaced the conversation in memory AND persisted to disk. Users who triggered a compression lost every pre-compression turn on next load; only the summary block survived. The fix separates the agent's working context (freely compressed for token economy) from the user's canonical history (immutable ledger of real events). Compression now runs strictly internally; the full transcript is preserved and saved untouched. What the model sees on the next turn: still compressed. What you see in the chat: every turn you ever had.
- **`Agent.run()` contract redrawn.** Public API changes from "returns the full history plus new turn" to "returns only the new messages produced this turn." Callers append to their Conversation (`conversation.appendMessages(newMessages)`) instead of replacing state wholesale. This makes the compression-destroys-history class of bug impossible by construction — destructive transforms can no longer cross the conversation boundary because they have no way to. Backed by a new `Conversation.appendMessages()` method and a one-way ownership model: Conversation owns history, Agent owns model context, boundary is architectural.

### Internal
- 3 call sites updated to the new append pattern (extension main chat, CLI REPL, AutoCoordinator). TaskExecutor and Curator verified unchanged (their last-assistant-extraction pattern still works). 4 test files migrated. Full test suite: 441 passing / 18 pre-existing failures unchanged — zero regressions from this architectural cut.
- Typecheck strict on host + both webviews; pre-push gate continues to block any type-error regression.

## 0.48.14 — 2026-04-24

### Added
- **Auto post-build verification.** Every code-writing turn ends with a `<changes-summary>` block from the Builder declaring files touched and change categories (ts, route, migration, asset, auth, payment, etc.). A new `verify_change` tool then runs the right checks in parallel on the real diff: typecheck for TypeScript, route curl with TCP dev-server detection for pages/routes/OG/sitemap, HEAD probe for public assets, migration dry-run (skip-with-instructions — never auto-apply), link check for prose. A pass/fail block appends to the visible output. Mandatory floor on auth / payment / migration paths — opt-out flags don't apply. New Integrator persona (replaces Tester) lives in both Work full and Work light teams with a `VERIFY_FAIL:` veto protocol.
- **`verification_start` / `verification_end` agent events** so host UIs can render the pass/fail block inline. Tauri IDE, extension webview, CLI all pick them up.

### Fixed
- **Stop button is now a real hard stop.** Three queues that previously survived the abort and made stop feel like a pause-and-resume: `pendingModeTransition` (from `switch_mode` tools approved mid-task), agent-level pending interjections, and incomplete trailing assistant messages from mid-stream aborts. All cleared on cancel. Post-stop context restriction now also handles empty/incomplete assistant bubbles so pre-stop context doesn't leak into the next turn. Stop icon updated to match: solid square, not pause bars.
- **Mid-task message injection — reliable across streaming and orchestration.** Previously, injections only fired between agent iterations. Messages typed during model streaming silently queued until the stream finished (often never reached the model). Messages typed during multi-persona Conductor runs were orphaned for 10–60 seconds. Now: `streamResponse` polls between chunks and gracefully aborts the provider stream when an injection arrives (pre-tool-calls only, to keep API history valid). Conductor accepts a `hasPendingInjection` callback and breaks between personas/waves when one fires. Net: typing during any blocking phase reliably lands on the next iteration.
- **Auto-journal LLM reflection actually runs.** The reflective first-person journal entry Ava writes at the end of each session called `provider.complete()` — a method that never existed on `Provider`. Every invocation since this code shipped TypeError'd into the structured-template fallback. Users have only ever seen template summaries. New `Agent.completeOneShot()` method in core provides the correct primitive; the extension's reflection path now uses it. Warm specific first-person entries now appear for the first time.

### Changed
- **Webview message-type mirrors eliminated architecturally.** Both webviews (`dashboard-ui`, `webview-ui`) used to manually mirror the host's message-type file. Over many versions the mirrors drifted — 88 type errors hiding a systemic "missed message variant" class of bug. Replaced with a path alias so each webview imports the host's types directly. Drift is now architecturally impossible — one definition file per webview.
- **Extension host type debt cleared.** The previous pre-push gate filtered to runtime-breaking errors only because ~67 pre-existing type errors in the host would have blocked every push. All 67 now fixed, including 5 private-access violations across class boundaries (exposed via a new `LegacyCompleteSurface` structural path and one migrated to `getMessages()`), 12 fetch `.json()` `unknown` sites, 5 `possibly-undefined` narrowings, and missing message-type variants (`secrets_loaded`, `auto_routing`, `auto_agent_start`, `auto_agent_end`, `save_creative_to_disk`, etc.).
- **Pre-push gate is now fully strict** on host + both webviews. Any new type error blocks the push — no more quiet drift behind a narrow filter.

## 0.48.13 — 2026-04-23

### Changed
- **Free tier allowance tightened: 1,500 → 300 credits/month.** BYOK already gives anyone unlimited free usage via their own provider key. At 1,500 credits, managed Free was subsidising ~$4.50/user/month at published Qwen rates — enough for a hobbyist to ship real projects on Free forever. That conflated trial with subsidy. 300 credits keeps Free honest: evaluation window of 5–7 days of active use, then the user upgrades to Pro or adds a BYOK key. Fallback values in dashboard Billing / Overview / Usage + the welcome copy all updated to match.

## 0.48.12 — 2026-04-23

### Added
- **Xiaomi (MiMo) BYOK key input in dashboard settings.** v0.48.11 added MiMo V2.5 / V2.5-Pro to the model catalogue and provider registry but the settings page never surfaced the input field, so users had no way to actually enter their key. Settings PROVIDERS now lists Xiaomi with signup URL and description, the `ProviderKeyStatus` type carries an `xiaomi` boolean end-to-end, and the host `PROVIDER_KEY_SECRETS` map wires key reads from secret storage. Submodules (companion + IDE) bumped with matching entries.

## 0.48.11 — 2026-04-23

### Added
- **Xiaomi MiMo V2.5 and V2.5-Pro as BYOK providers.** Open-source MoE (1T params, 42B active) — matches Claude Sonnet 4.6 on agentic multimodal and Gemini 3 Pro on Video-MME. V2.5 $0.40/$2/M, V2.5-Pro $1/$3/M. Endpoint `https://api.mimo.xiaomi.com/v1` (OpenAI-compatible). Cost profile (V2.5-Pro is 3–4× Qwen 3.6 Plus) rules it out of managed-platform default; a real option for BYOK users who want frontier-class open-source on their own key.

## 0.48.10 — 2026-04-22

### Fixed
- **"X left" pill next to the send icon renders exact comma-separated values** instead of K-compacted. Post-credit rebalance, plan caps are small numbers (5K / 10K / 20K) and the M/K compact formatter rounded them to the nearest 1K, obscuring the real remaining balance. A user at 4,752 credits saw "5K left" — same as someone at 5,000. Fixed across four surfaces: `dashboard-ui` InputArea + chat header, `webview-ui` InputArea (low-balance threshold rescaled from 500K tokens to 20% of plan) + WelcomeModal. Token-era labels also swapped to "credits" in tooltips and section headers.

## 0.48.9 — 2026-04-22

### Changed
- **Ava Credits rebalanced to published Qwen 3.6 Plus rates.** Alibaba walked back the 50% discount on Qwen 3.6 Plus; the prior allowances assumed that discount plus a $0.0025/credit revenue target that never shipped (Pro landed at $19 = $0.00127/credit). Margin was underwater. Rebalanced to a 55% net margin design point at published rates: Free 1,500, Pro 5,000 (was 15K), Ultra 10,000 (was 35K), Enterprise 20,000 (was 75K). Credit top-ups: $3 → 750, $8 → 2,000, $15 → 4,000. Stripe Price IDs unchanged. @ava/core billing is the source of truth — IDE + companion read from it automatically. Existing users keep their current-cycle allowance via migration 203's rollover logic; new rates materialise next period with no forced clawback.

## 0.48.8 — 2026-04-22

### Fixed
- **Session counter in the chat header shows credits, not raw tokens.** The dashboard-ui running counter was summing prompt + completion tokens and labelling the result "tokens used this session" — inconsistent with every other pill in the product post-credits. Host now computes credits on the usage event (mirrors server math for `chat_turn`, including cache-hit detection from `usage.cached_tokens`), ships the value as `credits` on the postMessage, and the chat reducer accumulates `sessionCredits` for display. No billing-logic change — purely aligns the in-chat display with what the user is actually charged.

## 0.48.7 — 2026-04-22

### Fixed
- **Welcome hero sticks around until the user actually speaks.** Previously the hero hid the moment `state.messages.length > 0`, but ambient messages (daily briefing, model-switch notices, tick nudges) arrive unprompted and flipped the gate — users who opened a fresh chat, closed it before speaking, and reopened it got a headline-less screen instead of the welcome. Fixed by gating on "has the user spoken?" rather than raw message count. Ambient messages render below the hero so they're not swallowed.

### Changed
- **Welcome copy refreshed.** Tagline dropped the "60 tools · 7 providers · 2 free models" line (numbers in flux, tool count disputed) for the evergreen "Every model · Every tool · 6 modes · Local-first". Setup-screen copy updated to reflect GitHub / email sign-in and the 1,500 free credits/month allowance (was the legacy "3M free Qwen tokens" copy).

## 0.48.6 — 2026-04-22

### Changed
- **Auto Mode token cost reduction.** Two compounding efficiency fixes: (1) skip the orchestration gate when the upstream intent gate already ruled "direct" — both were asking the same Flash model the same question on ~60% of planning turns; saves ~300 tokens + ~2.5s per affected turn; (2) skip the regex conversation brief on spawned task agents when Conductor produces a synthesis — brief + synthesis overlapped in purpose and stacking both was ~500–800 tokens of duplication per orchestrated task. Combined: ~5–10% token reduction on typical BYOK Auto Mode sessions. No behaviour change on non-orchestrated paths.

## 0.48.5 — 2026-04-22

### Added
- **Kimi K2.6** added to the model picker. Moonshot's SoTA open-weight model released 2026-04-20 — 58.6 on SWE-Bench Pro (beats Opus 4.6), 54.0 on HLE with tools (leads every frontier model, open or closed), 256K context, native multimodal, designed for multi-agent orchestration with up to 300 sub-agents.
- **Claude Opus 4.7** added to the model picker as Anthropic's current flagship. Same $5/$25 pricing as 4.6. Opus 4.6 kept as a legacy option so existing users keep working without migration.

### Changed
- **BYOK Auto Mode coordinator** priority reshuffled. K2.6 is now the first choice when a Moonshot key is present, Opus 4.7 second, Sonnet third, K2.5 fourth. Ava is an agentic coder first, and K2.6 leads every benchmark that measures that job specifically (SWE-Bench Pro, HLE-with-tools, LiveCodeBench v6).
- **Moonshot + Zhipu signup URLs** switched to international hosts (`platform.moonshot.ai`, `z.ai`). Prior `.cn` hosts were mainland-China portals — international users hit region-blocked signup flows. Core providers already routed to the international API endpoints; this brings the onboarding UI in line.
- **Inline model aliases** updated. Typing "use opus" now resolves to Opus 4.7 instead of 4.6; "use kimi" / "use k2" resolves to K2.6. Legacy pins kept: `opus 4.6`, `k2.5`.

### Fixed
- **Zhipu/GLM Auto Mode coordinator gap.** Users whose only BYOK provider was Zhipu/GLM silently got `null` from `resolveCoordinatorModel` and Auto Mode refused to start. `glm-5` now in the BYOK priority list with the correct context and capability flags.
- **`model-router.ts` platform fallback** dropped `kimi-k2.5` entry. Kimi has always been BYOK-only and was never registered under the platform provider, so the platform lookup for `kimi-k2.5` returned null every call. Pre-existing dead code, removed while sweeping the area.

## 0.48.4 — 2026-04-21

### Added
- **Pre-push typecheck gate.** Repo-local git hook (`.githooks/pre-push`) runs `pnpm typecheck` on the extension package and blocks any push that introduces an undefined identifier (TS2304) or shorthand property reference (TS18004). Catches the exact class of bug that shipped in v0.48.2 and v0.48.3. Enable once per clone with `git config core.hooksPath .githooks`. Pre-existing unrelated type errors are filtered out so the gate doesn't fail until those are cleaned up in a separate pass.

## 0.48.3 — 2026-04-21

### Fixed
- **Chat input re-stranded after the Library work landed.** The new `generationLocalOnly` flag that gates creative-asset cloud sync was referenced in `setupAgent()` without its declaration alongside. Same symptom as the v0.48.2 regression — agent failed to initialise, chat textarea disabled. Fixed with a load-bearing comment to keep the declaration anchored on future refactors. The typecheck gate added in v0.48.4 stops this class of issue from reaching users again.

### Added
- **Unified Library** (dashboard) — Courses / Assets / Documents in a single nav entry, replacing the separate Learning Library + Creative Studio library tab. Cloud + local items in one view, filterable by source and type.
- **Preview modal** with context-aware actions — Open (LibreOffice for office docs), Reveal, Download, Delete. Inline custom-styled media player for images / audio / video / voice. Silent cloud download to `~/Downloads` (no browser, no URL prompt). Delete works on both cloud and local items with two-click confirmation.
- **Creative asset cloud sync** — `generate_image` / `_music` / `_video` / `_voice` now push to `/api/creative-assets` after local write when Data Mode is Cloud or Both. Shared `creative-asset-sync` helper, gated on `generationLocalOnly` in sharedState. Matches the Memory / Tasks / Journal sync pattern.
- **Creative Studio** simplified to creation-only — library tab removed (it lives in the unified Library now).

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
