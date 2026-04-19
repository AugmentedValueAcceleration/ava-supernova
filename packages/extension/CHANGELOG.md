# Changelog

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
