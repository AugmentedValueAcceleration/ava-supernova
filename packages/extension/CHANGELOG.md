# Changelog

## 0.62.3 — 2026-05-05 — Brainstorm mode tuned for breadth, not depth

### Changed
- **Brainstorm mode now runs on mid-tier models across all three sovereign fleets, not the heavy-tier reasoning models the rest of the agent uses.** Ideation rewards breadth — diverse angles, creative recombination, surfacing the obvious-in-hindsight thing nobody named — not depth-bound chain-of-thought. The big models' RLHF is tuned to favour careful reasoning, which makes them *more cautious and more samey* on ideation tasks. Aurora dropped from Mistral Large 3 to Medium 3.5; Supernova from DeepSeek V4 Pro Think-Max to V4 Flash; Maestro from Qwen 3.6 Plus to 3.5 Plus. Heavy tier kept as fallback for the rare deep-reasoning brainstorm. Faster, cheaper, creatively wider.
- **Brainstorm Researcher forked from the Plan-mode Researcher.** The previous shared Researcher persona was tuned for codebase / commit / strategic-decision evidence — wrong shape for ideation. The new Brainstorm Researcher gathers what ideation actually needs: demand signals (what people are paying for and complaining about right now, with quotes), competitive landscape (gaps and failures of existing solutions, not logo lists), timing windows (what changed in the last 6-12 months that makes this possible *now*), adjacent-category angles, and the user's unique advantage explicitly surfaced from the Explorer's profile. Same fork shape as the Brainstorm Challenger fork that already happened.

## 0.62.2 — 2026-05-05 — Unified roadmap + Support tab redesign

### Changed
- **Roadmap is now one source of truth across every surface.** The extension Roadmap tab, the public web roadmap at ava-supernova.com, the IDE Roadmap page, and the Hub admin editor all read the same `/api/roadmap` payload now. The previous hardcoded `themes` const that diverged across web / IDE / extension is gone — edits land in the platform DB and propagate everywhere on next fetch. The seeded list is honest about what's actually shipped today (audited 2026-05-05); aspirational items go through the Hub editor as decisions land.
- **Support tab redesign.** The empty state used to lead with "Need a hand?" and a clunky icon-in-circle, with the input box only appearing before a thread existed. Now it's a single rounded chat surface with the composer pinned at the bottom — same spot whether or not there's an active thread. Empty state is Ava saying *"Hey — I'm Ava. Tell me what's going on…"* in her voice, not template-speak. Conversation rail is its own card with a small "Conversations" label, subtle accent tint on the active thread, polite empty line. Composer auto-grows up to 160px so multi-line questions don't crush the chat area, with a tiny hint line below: *"Enter to send · Shift+Enter for a new line"*. Legal links are now a single quiet inline row below the chat (`Terms of Service · Privacy Policy`) — no more bordered "LEGAL" card dumping at the bottom. BYOK fallback got a 3-column grid for the help destinations.

### Fixed
- **Extension Roadmap tab now refreshes from the live source.** The hardcoded list was drifting badly. Pull-to-refresh-style behaviour on every visit to the Help / Support / Releases / Roadmap tabs — host fires `load_roadmap`, the API returns the theme-grouped payload with the user's locale where translations exist, the panel re-renders.

## 0.62.1 — 2026-05-04 — Papers click loads the paper, Read with Ava lands in chat, dashboard goes full-width

### Fixed
- **Clicking a paper card now actually loads the paper.** The detail modal previously rendered only whatever fields the list-row happened to carry — papers with slim summaries felt half-empty when opened. Selecting a card now fires the host's `load_paper_detail` round-trip, merges the enriched record (full abstract, open-access PDF, publisher URL) over the click-time row, and shows an inline spinner while the detail is in flight. Live OpenAlex search results without a curated DB row continue to render whatever the search returned (no second fetch path to enrich those — coming later).
- **"Read with Ava" now switches the dashboard to Chat.** Previously the primer was sent off to the chat reducer but the dashboard stayed parked on the Library tab — the user saw nothing happen and had to manually click over to find Ava's reply. The handoff now flips the active page to Chat in the same gesture, so you land where the conversation is happening.

### Changed
- **Dashboard pages use the full window width.** Every top-level page (Overview, Library, Usage, History, Memory, Models, Billing, Connections, Personality, Settings, Roadmap, Support, SupportChat, ArticleReader, CreativeStudio) had a `max-w-Nxl` cap that capped content at 672–1152px. On wide and 4K monitors this left a third of the screen as dead space outside the content column. Caps removed at the page-wrapper level; modals, sign-in cards, search inputs and chat-message bubbles keep their intentional component-level widths so nothing renders 3000px wide that shouldn't.

## 0.62.0 — 2026-05-04 — Library → Papers (scientific paper explainer)

### Added
- **Library → Papers tab.** New top-level surface in Library between Courses and Assets. Browse foundational and recent scientific papers across every discipline — AI/CS, Biology, Medicine, Physics, Chemistry, Earth Sciences, Social Sciences, Economics, Engineering, Math — and ask Ava to explain any of them in plain language. Twelve discipline pivot chips, three sub-tabs (Featured / Trending / Latest), and a single search bar that hits OpenAlex's ~250M-work index live across all fields.
- **"Read with Ava".** One-click handoff into Teach mode. Ava runs a four-layer pass on whatever you pick: what's the question (one plain-English sentence), why it matters (the human stake), what they did (method, jargon-stripped), what they found and how confident you should be (results + caveats specific to the paper's discipline). Medical/clinical papers carry an explicit "summarisation, not medical advice" reminder before discussion starts. Retracted papers are flagged before findings are touched.
- **`paper_fetch_full_text` tool.** Read-only, available across modes. Resolves arXiv IDs, DOIs, OpenAlex IDs, or any of the corresponding URLs. For arXiv preprints with HTML rendering (~70% of recent ones) the tool extracts section headings + first paragraphs so the Tutor can speak to the body, not just the abstract. Free APIs throughout (arXiv, OpenAlex, Crossref) — no licensing, no paywalls, no auth.
- **Curated featured set seeded.** Seventy editorial picks across the ten disciplines — foundational classics (Watson & Crick, Shannon, Turing, Einstein-era LIGO, Sanger sequencing, Doll & Hill, Goodenough lithium-ion) alongside modern landmarks (BERT, GPT-3, AlphaFold 2, BNT162b2 trial, CRISPR-Cas9, Hausfather climate-model retrospective). Each carries an editorial blurb in Ava's voice — short, honest, focused on why the paper matters and what to take from it.

### Changed
- **Library default tab is now Courses** (was Assets). Library is a learning-first surface; the curated material is what makes it valuable. Assets and Documents stay one click away.

### Fixed
- **Loading spinner now shown during Library → Papers fetches.** Previously the tab area read as "empty" while data was in flight; now an inline spinner with a clear label sits in place of the list until the response lands.
- **Search and tab loads no longer flicker.** Inline arrow handlers were getting a new function identity on every render, retriggering the underlying `useEffect` and creating a tight load loop visible as the spinner flashing in and out. Stable handler references (`useCallback`) fix it. The Assets tab cloud-asset reload had the same shape and is now also stable.
- **Host fetches have explicit timeouts** — 8s for tab loads, 12s for search, 10s for paper detail. The user can never be stranded on a hanging request; on timeout the UI clears with an empty list rather than spinning forever. Webview-side 15s safety net clears the spinner even if the host's response is dropped on the round-trip.

## 0.61.0 — 2026-05-03 — Teach mode tuning pass

### Fixed
- **Fact Checker HALT now actually triggers a rewrite.** Previously, when the Fact Checker spotted a wrong claim in lesson content (e.g. "Code sample uses React.render which was removed in React 18"), the prompt promised the work would loop back to the Content Writer for a corrected version — but the conductor halted the pipeline silently. The promise has now been honoured: a HALT triggers exactly one bounded retry where Content Writer re-runs with the HALT reason as focused-correction context, then Fact Checker re-checks. If the rewrite passes, the curriculum continues to Quiz Master and Tutor as if the veto never happened. If the second check still HALTs, the pipeline halts for real with the second reason in the synthesis. Bounded at one retry per vetoer per orchestrate run so a stubborn quality issue still terminates.
- **Curriculum-creation phrasings the regex used to miss now route correctly.** The old regex-based depth detector caught `"teach me X"` and `"I want to learn Y"` but missed natural phrasings like `"I'd like to learn Rust"`, `"help me understand React from scratch"`, `"where do I start with Python"`, `"I'm trying to pick up Go"`. A Qwen Flash classifier now handles depth detection for Teach mode and routes any of these correctly to the full team. The regex remains as a fallback for when Flash is unavailable.
- **Module unlock now requires the gate quiz to be passed.** If the final lesson in a module is a quiz, the next module stays locked until the learner scores ≥70% on it. Previously every module unlocked the moment lessons hit 100% completion, which meant the Tutor could waive a learner through by marking the quiz "completed" via feedback action without verification. Modules without a final quiz keep their old auto-unlock behaviour.
- **Failed-quiz lessons no longer surface twice.** A `needs_review` lesson was being returned by both `next_lesson` (as a retry candidate) and `getLessonsForReview` (as a spaced-repetition candidate). The Tutor would get conflicting signals about what to deliver. Spaced review now strictly filters to `status === 'completed'` material (mastered → due for retention review). `needs_review` is the failed-quiz retry state, surfaces only via `next_lesson`.
- **Quiz answer matching forgives common typos and formatting differences.** "Node.js" vs "node js", "JavaScript" vs "javascripts", "fetch_data" vs "fetchData" — all treated as equivalent now. Strategy is normalize-then-edit-distance: lowercase + strip whitespace/punctuation first, then if still not equal, allow a small Levenshtein budget scaled by length (≤1 typo for ≤6 chars, ≤2 for ≤12, ≤3 for ≤20, strict for longer). Multiple-choice letter mapping (A/B/C/D) stays strict.

### Changed
- **Curriculum creation now runs on the coordinator-tier model.** Curriculum design is the cognitively heaviest Teach mode work — Architect sequencing 4-6 modules, Content Writer producing real content, Fact Checker verifying claims. Running all of that on the cheap mid-tier model produced shallow curriculums. Maestro creation routes to Qwen 3.6 Plus (was 3.5 Plus); Supernova creation routes to DeepSeek V4 Pro (was V4 Flash); Aurora creation routes to Mistral Large 3 (was Medium 3.5). Lesson-delivery turns continue to route to the cheaper teach-tier model — the cost shape matches reality, where creation is rare and delivery is frequent.
- **Tutor delivery now adapts to recent quiz performance.** When the Tutor delivers a lesson, the tool result includes a concrete pacing signal based on the curriculum's adaptive level. Recent quiz performance below 70% → "slow down, more worked examples, reinforce foundations." 70-90% → "continue at standard pace." ≥90% → "push harder, skip introductory framing, go to edge cases." The Tutor's prompt has always told it to "adapt pace to the learner" — this gives it concrete data to adapt on instead of guessing.
- **Tutor can no longer write or edit files in your project.** Demos go in markdown code blocks within chat replies, not as side-effects on disk. `test_run` / `test_generate` / `benchmark` are kept so the Tutor can verify a solution you've written. If a lesson is hands-on building, the Tutor will ask you to try the code yourself and paste the result, or suggest you switch to Work mode for actual implementation. Closes the path where a globally-allow-listed `file_write` could let a Teach session drop demo files into a user's repo.
- **Persona over-permissioning tightened.** Content Writer, Fact Checker and Quiz Master no longer have `learning_create` access — only Curriculum Architect (and Tutor in the light-path solo case) can instantiate curriculums. Stops the failure mode where a confused mid-pipeline persona could spawn a duplicate curriculum.

### Removed
- **Dead `lesson.learning_objectives` reads stripped.** The lesson-level objectives field was initialized as an empty array and never populated (the `learning_create` schema doesn't accept per-lesson objectives). The "After this lesson, you will:" block in `deliver`, the "You'll learn:" suffix in `next_lesson`, and the search loop entry that scanned them — all referenced data that was always empty. Three dead reads removed; the field stays in the type for forward-compat. Module-level objectives (`module.learning_objectives`) are populated via the schema and stay in place.

## 0.60.1 — 2026-05-02 — Polish + cleanup (Creative Studio composer, Holo strip, document styling)

### Changed
- **Creative Studio composer hint adapts to platform.** Mac users see `⌘↵`, Windows / Linux see `Ctrl+↵`. No more cross-platform translation in the user's head.
- **Composer clears on a successful generation.** Prompt text resets the moment the generation lands so the next idea has a fresh canvas. Reference image attachments and mode settings persist — only the prompt clears.
- **Image generation cards no longer push the action buttons off-screen.** Generated images cap at 32vh of viewport height (was unbounded) so Animate / Voice over / Download stay reachable without scrolling on every screen size.
- **Empty-state suggestion prompts are now random + reshufflable.** Each Creative Studio mode (Image / Music / Voice / Video) has a 12-prompt pool; the empty state picks 3 at random per visit, with a refresh icon to roll a new set without leaving the page. Stops the same three prompts becoming wallpaper.
- **Every Word doc Ava generates now matches the brand.** The shared document-styling kit means `document_manage` output (any `.docx` Ava writes for you, ad-hoc or templated) inherits the same Calibri / Ava-purple / themed-table look that `report_generate` already had. Per-template style profiles so a letter has formal margins and no cover page, an invoice gets a footer, a report or proposal gets the full cover treatment. PDFs got real boxed tables instead of pipe-separated text.
- **Editing a `.docx` now warns explicitly that it's destructive.** The underlying library is creation-first; editing recreates the file from scratch and any custom formatting (fonts, colours, images, complex tables, headers/footers) in the original is lost. Tool description and result message both flag this so you can choose to edit in Word directly when formatting matters.

### Removed
- **Holo / Computer Use retired across the extension.** The Holo3 vision-action provider, the `computer_use` and `computer_use_blackboard` tools, and the dead computer-use knowledge pack are stripped from `@ava/core`. Tool registry no longer carries a `screenshot` / `computer_use` exclude list (those tools no longer exist). README and Settings copy updated. Desktop automation continues to work via the OS-native UI Automation tree in the dedicated Ava IDE — the extension itself never had access to those tools, so this is purely housekeeping for the extension surface.

## 0.60.0 — 2026-05-01 — Creative Studio redesign + cost transparency + Planner polish

### Added
- **Creative Studio rebuilt as a conversation-first canvas.** Drop the form-and-gallery split — page is now a chat-style thread. A single composer pinned at the bottom, generations stack as feed cards above (oldest top, newest bottom), Cmd/Ctrl+Enter sends. Mode is a four-glyph dock on the composer (Image / Music / Voice / Video) instead of a top tab strip — switching mid-thought stays in the same surface. Empty state opens with a soft invitation and three mode-specific suggested prompts you can one-click into the composer.
- **Style / mood / camera presets per mode**, surfaced via a settings overlay above the composer. Image gets 7 styles (Cinematic, Photoreal, Illustration, Anime, Watercolour, Graphic, Auto) + variation count (1/2/4 — fanned out as parallel calls). Music gets 7 mood presets + duration. Voice gets 6 emotions + speed + pitch slider + an Ava brand-voice lock that pins narration to MiniMax `English_radiant_girl`. Video gets 6 camera moves + 3 motion intensities. Settings overlay is a backdrop-blurred modal so opening it never shifts the page; click outside or Escape to close.
- **Cross-mode "Send to" hand-offs.** Hover any image card → "Animate to video" or "Voice over from this". Hover any music card → "Use as score for video". Each handler switches tab AND pre-fills the target's prompt + reference image where applicable, so iteration across modes never needs copy-paste.
- **Live cost preview using canonical credit math.** Per-action credit costs read directly from `CREDIT_COST` in `@ava/core/billing/credits` — same constants the server bills with. Image: 12 credits × variations. Music: 50 credits flat. Voice: 10 credits per 500-char chunk. Video: 150 credits (6s) / ~250 credits (10s). Cost line goes amber when a single generation would push you over your remaining balance.
- **Prominent credit balance card** in the Creative Studio header. Three states: live balance + colour-coded bar (purple → amber under 30% → red under 10%) for platform users, gradient "Unlimited" badge for admin tier, "Sign in to see your credits" prompt when signed out.
- **Themed Tooltip component** mirrored from the IDE into the dashboard. Replaces native `title=""` everywhere on Creative Studio — themed lavender border, blur backdrop, 300ms delay, portal-rendered so z-index never fights stacking contexts.
- **Image-to-video first-frame upload** actually works now (was sending the wrong field name; server silently dropped it). Drop an image on the video composer or click the paperclip — sent as MiniMax `first_frame_image`. Bonus: server auto-routes to the cheaper `Hailuo-2.3-Fast` model (~50% credit savings) when a first-frame is present.

### Changed
- **Tasks tool now requires confirmation on every action.** `task_manage` (list / create / complete / update / delete) prompts before each call so Ava can't silently spawn tasks from tangential mentions in conversation. Per-tool always-allow permission still works for `list` if you want to skip prompts on read calls.
- **Mode glyph dock + settings overlay** (Creative Studio) replace the previous tab bar + inline settings strip. Settings open in a centered card with a subtle slide-up animation; current mode glyph is filled lavender; non-active glyphs are muted until hover.
- **Phosphor icons throughout Creative Studio** — settings gear, close X, paperclip attach all moved from inline SVG paths to `@phosphor-icons/react` duotone weight, matching the rest of the dashboard's icon style.

### Fixed
- **Planner mini-calendar selection** finally works the way it looks. Picked day fills with the accent colour (today gets an outline ring underneath), Tasks tab now filters by the selected date instead of always showing today, and Journal tab loads the picked day. New "Selected day / All" toggle on Tasks lets you fall back to the full list when you want it.
- **Library page no longer hangs on "Loading cloud assets…"** for users with no synced assets. Replaced the full-page gate with a non-blocking inline pill — grid renders whatever it has immediately, pill auto-clears after 15s safety timeout if a response is missed.
- **Chat page no longer hangs on empty history.** The chat surface used to wait for a `history_list` message before rendering; that message only feeds the History sidebar, not the main chat, so the spinner could hang on an irrelevant fetch. Drops the gate on `chat_init`.
- **Sign-in callbacks no longer get silently dropped.** Added `onUri` to `activationEvents` so VS Code always wakes the extension on a `vscode://…/auth` callback. Diagnostic `[Ava]` logs at every sign-in step (URL opening, callback received, code exchange status). Yellow toast on stale callbacks instead of silent ignore.

### Removed
- **Admin Support and Admin Proposals pages** stripped from the extension — both moved to the operator hub. Strips two routes, the admin state, the message handlers, the host-side methods, and the `AdminToolProposal` type.
- **History tab "Wipe legacy cloud history" button** — was meaningless to users who'd never cloud-synced chat (i.e. most of them). The backend `/conversations/all` endpoint stays available in case we re-surface it elsewhere later.

## 0.59.1 — 2026-05-01 — Marketplace description refresh

### Changed
- **Marketplace listing description** updated to reflect v0.59.0's tier-differentiated routing across all three modes (Maestro tier-differentiated Qwen, Supernova V4 Flash chat tier, Aurora Small 4 expanded to chat + image-gen) plus the per-mode credit estimates after the chat-tier rebalance. Free tier evaluation footprint corrected from "~100 Maestro chat turns" to "~300 chat turns across any mode" — the rebalance roughly tripled the free allowance's effective reach. Loop prevention mentioned as the load-bearing v0.59.0 feature. No code changes; this release exists solely to push the updated `package.nls.json` description to the marketplace.

## 0.59.0 — 2026-04-30 — Loop prevention + chat-tier routing rebalance + UX polish

### Added
- **Loop prevention shipped end-to-end.** When Ava finishes a turn with file edits that haven't been verified, she runs typecheck/tests against those files before declaring done. On failure she gets one chance to fix; if the same root-cause signature recurs three times, an independent fresh-eyes review fires (one extra LLM call). New events (`verify_started`, `verify_passed`, `verify_failed`, `fresh_eyes_started`, `fresh_eyes_complete`) surface the recovery cycle in the chat so it's never silent. Caps fairness via the new `loop_refund_eligible` event — backend decides if credits return on attempted-but-failed recovery. Toggle in Account → Settings → Advanced (default on).
- **Chat-tier routing rebalance across all three modes.** Maestro chat → Qwen 3.5 Flash (~1 credit/turn, was ~3). Aurora chat → Mistral Small 4 (~1 credit/turn, was ~5). Maestro vision → Qwen 3.5 Omni Plus (was 3.6 Plus, which has no native vision). Maestro computer_use → Omni Plus. Maestro teach → 3.5 Plus. Maestro image-gen → 3.5 Flash. Aurora image-gen → Small 4. Supernova image-gen → Omni Flash. Vision still routes to the right specialist on every mode; long-form goes to cost-sensitive tiers; heavy work stays on the coordinator.
- **Stop preserves Ava's partial work.** Pressing Stop mid-task now persists completed tool calls and streamed assistant text into conversation history before the stop marker is added. Next turn she remembers what she'd done. Previously she lost everything between your prompt and the stop, leaving a context gap.
- **Persona errors surfaced.** Conductor planning failures (Scout / Architect / Challenger / etc. red X marks) now show the actual error string under each X — was silent before.
- **Loop prevention toggle** in Account → Settings → Advanced.

### Changed
- **Chat bubble redesign.** Clean black gradient (`#1a0f24` → `#0a0712` for user, `#0f0f17` → `#1a1625` for Ava) + thin electric purple border (`#a855f7` solid for user, 55% alpha for Ava) + subtle outer glow. Subtle visual hierarchy so the user bubble pops a touch more than Ava's.
- **Provider error messages now include the upstream response body.** When a provider returns 4xx/5xx, the thrown `ProviderError` message includes the first 500 chars of the response body — used to be hidden at debug level. Surfaces actual rejection reasons instead of bare status codes.
- **Documentation routing tables** updated across extension README, IDE README, and in-app docs to reflect the new chat / image-gen / vision / long-form routes.

### Fixed
- **History → Conversations.** Local conversations were rendering as empty rows (the UI read `updated_at` snake-case, but `HistoryManager.listConversations` returns `updatedAt` camelCase metadata-only rows). Now reads both shapes; drops the "0 messages" line when no count is available; row design refreshed to match the new bubble aesthetic.
- **Conversation delete is local-first.** Was cloud-only — local-only users couldn't delete anything, signed-in users saw deleted rows reappear on reload because the `~/.ava/` file was untouched. Now deletes the local file via `historyManager.deleteConversation` first, then mirrors to cloud as best-effort.

## 0.58.1 — 2026-04-30 — Editable display name on Command Centre + cross-surface sync

### Added
- **Editable display name on the Command Centre greeting.** Click your name in "Good afternoon, [name]" → input appears in-place. Enter or blur saves; Escape cancels; empty submit clears the custom name and falls back to the email prefix. The display name is what Ava uses to refer to you in chat panel welcomes and trajectory events, so it actually matters that it sounds like something you go by.
- **Single source of truth across surfaces.** Saving pushes the name to your platform user record (`/api/account-info` PATCH) so the IDE, companion, and web dashboard pick up the same name on their next refresh. The host's existing `update_name` plumbing wires straight to the platform; the webview just sends the message.
- **Local-first preserved.** Every save commits to localStorage immediately for instant UI; the platform PATCH is fire-and-forget and silently no-ops if you're not signed in. The editor still works without an account.
- **No-name fallback.** If no custom name has been set yet (sign-in hasn't seeded one), the greeting shows a small purple **"+ add name"** link instead of just trailing the comma with nothing.

## 0.58.0 — 2026-04-30 — Aurora and Supernova public

### Changed
- **Aurora and Supernova leave admin gating.** Both modes now public on every plan alongside Maestro. BYOK gating unchanged: Maestro=Qwen, Supernova=DeepSeek+Qwen, Aurora=Mistral.
- **Aurora ships its three-tier Mistral fleet.** Mistral Large 3 coordinator + heavy specialists, Mistral Medium 3.5 (released this week — 128B dense, 256K context, vision encoder from scratch, 77.6% SWE-Bench Verified) for Builder + mid-tier + vision + long-form, Mistral Small 4 at the intent gate. Open weights end to end, EU-only.
- **40% margin rebalance.** Maestro chat 50% cheaper, Supernova chat 12× cheaper, Aurora chat ~30% cheaper. Same plans, materially more work per dollar. Free tier (300 credits/month) finally meaningful for real evaluation.
- **Mode-first picker.** Plans surface only the three orchestrated modes — raw single-model selection moves to a BYOK-only power-user path. Picker subtitles tell you the unlock path ("Add Mistral key", "Connect or add DeepSeek + Qwen keys").
- **Wan replaces MiniMax for image generation.** Materially better on graphic-design / icons / banners at the same credit cost. MiniMax stays for music, voice, video.
- **Faster cold start.** SecretStorage reads parallelised, release-notes fetch wrapped in a 5s timeout, v2→v3 memory migration deferred off the activation hot path. ~200–300ms saved per dashboard open on typical networks.
- **History tab now reads local conversations** — was bailing to empty when not signed in to cloud; now merges local + cloud sorted newest-first.
- **"Use a different account" on /auth/extension** — one click signs out the active Supabase session and bounces to /auth/login with the original device-auth params preserved.
- **Audit pagination** (25/page) on the History → Audit tab; filters migrated to the project Select component for consistent styling.
- **Status bar shows mode name** ("Ava: Aurora") not the resolved coordinator's model name. Tooltip exposes both.
- **Stale "Get Started — Add an API Key" banner retired** — picker subtitles carry the unlock guidance directly.

## 0.57.0 — 2026-04-29

### Changed
- **Plans surface only the 3 orchestrated modes.** Aurora · Supernova · Maestro. Raw individual models (Qwen 3.6 Plus, MiniMax, etc.) move to BYOK-only — plan users pick a mode, the fleet falls out of that.
- **BYOK mode gating.** Maestro unlocks with a Qwen key. Supernova needs DeepSeek + Qwen. Aurora needs Mistral. Each mode shows its unlock path in the picker subtitle ("Add Mistral key", "Connect or add DeepSeek + Qwen keys"). Single source of truth across both panel surfaces.
- **Wan replaces MiniMax for image generation.** Wan 2.6 (Alibaba's open-weight image model) handles graphic-design / icons / banners materially better than MiniMax image-01. MiniMax stays for music, voice, video.
- **Faster cold start.** SecretStorage reads parallelised — `getConnectionStatus()` (4 keys) and BYOK + local provider key reads (11 keys) now run via `Promise.all` instead of sequentially. Saves 200–300ms typical per dashboard open. Release-notes fetch now has a 5s `AbortController` timeout (used to hang activation indefinitely on slow networks).
- **Stale "Get Started — Add an API Key" banner removed** from the chat. The model picker now carries the unlock guidance directly — banner duplicated it with outdated "3M free Qwen tokens" copy.
- **`enumDescriptions` no-model copy** updated from "3M free Qwen tokens" to "1,500 free credits/month" to match the post-rebalance pricing.

## 0.55.1 — 2026-04-28

### Changed
- **Marketplace description + README updated to feature Aurora.** The listing now mentions all three orchestrated routing modes (Maestro / Supernova / Aurora) and the EU-stack positioning for Aurora — important for European procurement audiences scanning the listing for sovereignty-relevant tooling. No code changes; visibility patch.
- **`Switch Model` command title** updated to mention Aurora alongside Maestro and Supernova so the command palette description matches what's actually in the dropdown.
- **`activeModel` setting description** rewritten to surface the three orchestrated modes by name.

## 0.55.0 — 2026-04-28

The European AI stack, in one click.

### Added
- **Aurora — Mistral-only polyglot routing.** New entry in the Orchestrated section of the model dropdown, sitting alongside Maestro and Supernova. Aurora pins its coordinator to **Mistral Large 3** (sparse MoE 41B active / 675B total) and spawns Builders on **Mistral Small 4** (the unified Magistral + Pixtral + Devstral merge — vision-aware, agentic-coding capable, configurable reasoning effort). Vision tasks stay on Small 4 because Pixtral is baked in — no hard switch required, unlike Supernova which routes vision to Qwen 3.5 Omni Plus. Available to anyone with a Mistral key (BYOK) or a platform connection. Same shape as Supernova's polyglot router; different fleet.
- **Mistral Small 4 + Mistral Large 3 in the BYOK lineup.** Both models shipped by Mistral in 2026 — Small 4 in March, Large 3 in December 2025. Aurora's two specialists, also pickable directly under the Mistral provider group when you want one model rather than the routing layer.
- **Platform-managed Mistral entries.** Platform users get `mistral-small-4-platform` + `mistral-large-3-platform` resolved server-side via `/api/chat` so Aurora works on the platform plan without bringing your own key.

### Changed
- **Per-model cost multipliers calibrated for Mistral.** Small 4 lands at **0.6×** (cheaper than the Qwen 3.6 Plus anchor at 1.5×) and Large 3 at **1.4×** (about par). Aurora turns on Small 4 are net-positive on margin compared to Qwen-coordinated Maestro turns. No new credit brackets, no plan changes — slots into the existing credit math the same way Supernova does.
- **`/api/chat` recognises `model: 'aurora'`** as an orchestrator alias, mapping to `mistral-large-3-platform` for cloud-fallback paths (mobile companion, IDE cloud routing).
- **Vision reroute extended.** When a request with attached images lands on `mistral-large-3` (text-only), the server reroutes to `mistral-small-4` instead of falling out to Qwen Omni Plus — preserves Aurora's EU-stack guarantee even on the cloud-proxy path.

### Internal
- New `packages/core/src/auto/aurora-router.ts` — operator-locked routing table for Aurora mode. Categories map: coding/vision/image_gen/computer_use/teach → Small 4; planning/chat/long_context/security/brainstorm → Large 3. Per-persona override map for the 24-persona system follows the same shape as Supernova's.
- `RoutingMode` union extended to `'auto' | 'supernova' | 'aurora'`. `ModelRouter` swaps to `AURORA_ROUTES` when mode is aurora; falls back to default Qwen routes otherwise.
- `AutoCoordinator.create({ mode: 'aurora' })` resolves the coordinator through a strict Mistral-only chain: platform Large 3 → BYOK Large 3 → platform Small 4 → BYOK Small 4. Returns null if no Mistral model is reachable rather than silently routing to Qwen — Aurora never breaks the EU-stack guarantee.
- Extension `AvaViewProvider` synthesises Aurora into the dropdown when a Mistral key OR platform connection is present. Sits above Supernova in unshift order so Aurora is the first option visible to operators with Mistral access.
- Both `ModelSelector` components (chat panel + dashboard chat) accept `'aurora'` as an orchestrated id with a tailored label, subtitle ("EU stack — Mistral only"), and tooltip.
- IDE `DashboardPages.tsx` mirrors all of the above — `SIDECAR_MODEL_MAP['aurora'] = 'aurora'`, desktop-capable model id list, dropdown, active-model display, sidecar passthrough on init + setModel.
- Web `credits-pricing.ts` MODEL_COST_MULTIPLIER mirrors the core values so the server's authoritative billing surface and the client's dataset-audit emitter agree.

## 0.54.1 — 2026-04-28

### Fixed
- **Locally-saved videos now play in the dashboard Library.** The host was deliberately skipping video files when building the library snapshot — base64 data URIs are too large for video, and webviews can't load `file://` URLs, so the dashboard had no way to play them. Now every local file (image / audio / video / document) is served via `webview.asWebviewUri(vscode.Uri.file(absPath))` instead of base64. Streams from disk on demand → no size cap, no memory blow-up, works for arbitrarily large videos. The 5MB image / 10MB audio caps are gone with the same change.
- **Webview CSP `media-src` now allows `${webview.cspSource}`.** Previously listed only `data: https: blob:`, which silently blocked the new `vscode-webview-resource://` URLs for `<video>` and `<audio>` elements (images worked fine — img-src already included `cspSource`). Without this the asWebviewUri rollout above would have loaded broken media.
- **Webview `localResourceRoots` now includes every workspace folder.** asWebviewUri returns a URL the webview will refuse to load unless the underlying path lives inside a declared root. Previously the only allowed root was the extension's `dist/dashboard` folder, so even with the right CSP the project files would have been blocked.

## 0.54.0 — 2026-04-27

Extension dashboard now mirrors the IDE pixel-for-pixel — same titles, same tab shapes, same chrome — so users moving between the two surfaces never have to re-learn the layout. Plus a real Conversations tab in History (not just credits and audit), a tier badge + Platform/API Key toggle in the sidebar, and a critical fix for the loading hangs that could lock the dashboard for minutes on slow networks.

### Added
- **History → Conversations tab.** The History page now has three tabs matching the IDE: Conversations · Usage · Audit. Conversations lists every saved chat with search, click-to-resume, and per-row delete. Pinned chats sort first, then most-recently-updated. Usage now nests Session + All-time under a sub-toggle so no data is lost — same content, cleaner top-level shape.
- **NavSidebar tier badge + Platform / API Key toggle.** Account block at the bottom of the sidebar now matches the IDE: avatar + email + tier badge (Free / Pro / Ultra / Enterprise / Admin, each with the IDE's accent colour) + Disconnect, with a Platform / API Key pill below that routes requests through the chosen source. Signed-in users can flip to BYOK without disconnecting.
- **Loading skeleton in account block.** While the host fetches the account snapshot from the platform, the sidebar shows an `animate-pulse` skeleton instead of flashing the signed-out Connect screen for a few seconds. Drops the moment the snapshot lands.

### Changed
- **Account / Billing alignment with IDE.** Tab order matches: Settings · Billing · Connections · Ava's Style · Sync (renamed from Cloud, dropped the muted-state styling). Connections is no longer hidden — it surfaces alongside the IDE. Billing card restructured: separate Current Plan strip (tier label + colored credit-limit chip + Manage Plan gradient pill) and Credits Remaining card (28pt big number + 95% / 80% red/amber/green progress ramp + footer). Top-Up Balance card surfaces only when there's a separate top-up pool above the plan allowance.
- **Library, Memory, Creative Studio, Models page chrome.** All four now mirror the IDE: 22pt #cdd6f4 page titles + 13pt #6c7086 subtitles, IDE-style tab pattern (`#c084fc` active / `#a855f7` underline), no per-tab counts on Library, no top-level Refresh button. Creative Studio drops the Documents tab to match the IDE's four-tab shape (Images / Audio / Voice / Video). Memory Refresh + Delete All buttons restyled to match the IDE's purple/red pill shapes.
- **All other dashboard page titles normalised.** Account, Help, Journal, Planner, Tasks, Settings, Personality, Roadmap, Connections, Releases, Sync, Usage, Overview, Learning, Support, Learning Library, Library — all 17 top-level page headers swapped from a mix of `text-lg` / `text-xl` / `text-2xl` styles to the same 22pt #cdd6f4 / 13pt #6c7086 the IDE uses.
- **Sidebar control icons.** The hide-sidebar / flip / export trio at the top of the dashboard sidebar converted from filled-path SVG to stroke-based icons matching the IDE's 24×24 viewBox / stroke-2 style. Cleaner glyphs, simpler hover state (`#6c7086` muted → `#cdd6f4` on hover), tighter cluster spacing.
- **History page label.** Was "Usage" via a wrong i18n key; now correctly reads "History" with subtitle "Conversations, credits, and tool-call audit".

### Fixed
- **Dashboard loading hang up to 2-3 minutes on slow networks.** Root cause: `apiFetch` had no timeout, so a slow or unreachable platform would let Node's default HTTPS socket timeout (which is huge) propagate all the way to the dashboard webview, leaving "Loading..." on screen for minutes. Now: 10s default timeout via `https.request({ timeout })` + a `'timeout'` listener that destroys the socket and resolves with `{ ok: false, status: 0, data: 'timeout after 10000ms' }`. Callers can override per-call via `timeoutMs`.
- **Dashboard chrome blocked on `init`.** `sendInit` was awaiting `fetchAccount` + `pullSettingsFromCloud` + `loadMemories` before posting the `init` message that lets the dashboard render. Network blips would cascade into a blank loading screen. Now: `init` posts immediately with what's on disk; account fetch + settings sync + memories load run as fire-and-forget background tasks that post update messages when (or if) they return.
- **Billing credit math on paid tiers.** Extension was summing `free_credits + plan_credits` (e.g. 300 + 5,000 for Pro) when calculating remaining credits. The IDE intentionally doesn't sum — on paid plans the legacy 300 free credits aren't an additive bonus, they're the pool that's bypassed. Fixed: free tier shows free pool, paid shows plan pool, no double-counting.

### Internal
- New `load_conversation` dashboard message type — host forwards to `AvaViewProvider.handleChatMessage` so the chat panel restores the thread the same way it does from the chat-panel sidebar. Cross-webview localStorage signal (the IDE's mechanism) doesn't work in VS Code because dashboard and chat webviews have separate origins; this is the host-mediated equivalent.
- `AccountPage` tab labels migrated to `tt(key, fallback)` — new locales fall back to English on missing strings instead of showing raw keys.
- `tt()` helper added to dashboard-ui i18n.

## 0.52.0 — 2026-04-26

Trust, transparency, and portability. The extension stops asking you to take its word for anything: every tool call is auditable in a persistent log you can search and export, every credit charge is now visible per-model in real units, and you can download every byte of personal data the platform holds about you in one click. Plus a new Models page that points at the only AI coding benchmark with public receipts.

### Added
- **Models page — public benchmark leaderboard.** New top-level dashboard entry between History and Account. Reads `leaderboard.json` directly from the public `ava-supernova-bench` GitHub repo (no platform middleman — the bytes you see are the bytes anyone visiting the repo sees). Heatmap view (model rows × six categories: tool reliability, edit precision, multi-step coherence, instruction adherence, cost per success, latency) plus plain-language summary cards beneath. Each score links to the exact prompt sent and the exact response received in the public repo, so any number is auditable + reproducible. Empty state stays graceful until the public repo publishes its first run batch. Background and methodology spelt out at [github.com/AugmentedValueAcceleration/ava-supernova-bench](https://github.com/AugmentedValueAcceleration/ava-supernova-bench).
- **Persistent Audit log + overhauled Audit tab.** Every tool call Ava makes — file edits, bash, web fetches, image generations, the lot — is now logged to `~/.ava/audit-log.jsonl` on your own machine. Survives restarts, never syncs anywhere. The History → Audit tab now has search by tool name + argument, risk filter, status filter, and a per-row Cost column showing **credits** (platform mode) or **estimated USD** (BYOK mode) computed from provider rate cards. Plus pattern findings surface above the table — "you auto-approve `bash` but 23% fail this week, consider tightening the rule" — and one-click **Markdown / JSON export** for hand-off to a compliance team or personal record. Local-first by design: zero cloud sync, works fully without an account.
- **GDPR Article 20 — Download all my cloud data.** New hero CTA at the top of the Data Portability dialog. One click → bundles every row of personal data the platform holds for you (memories, tasks, journal, learning paths, conversations, billing, settings, audit, consent records, support history, more) into a single downloadable JSON. Auth-gated, rate-limited 5/day per IP, sanitises sensitive fields server-side (raw API keys, password hashes, OAuth tokens never leave the database — even on your own export). The pre-existing per-type export still lives in the same dialog for granular work; the new button is the "give me everything" path the per-type flow couldn't cover (subscriptions, consent records, etc.).

### Changed
- **History tabs restyled to match Library + Models.** Was the only pill-toggle group in the dashboard; now underline-tab style for visual consistency. Three tabs: Session · All Time · Audit.
- **Usage page — Recent Requests leads with credits.** New Credits column (highlighted in accent purple, font-semibold) computed via `creditsForTurn` — same bracket-scaling math the server bills with, so the in-app number matches the actual charge byte-for-byte. "In tokens" / "Out tokens" stay as supporting detail columns, demoted visually. Tooltips explain the source.
- **BYOK Usage view — explainer banner.** New "BYOK mode — your provider bills you directly for these tokens, so there's no Ava credit charge to display" line above the per-model breakdown. Stops the missing credit columns from reading as a bug; it's by design.

### Internal
- New `@ava/core/audit` subpackage — append-only JSONL persistence at `~/.ava/audit-log.jsonl` (auto-rotates at 50MB into archives), in-memory + disk read shim, programmatic pattern detection, cost computation hookup via `creditsForTurn` (platform) or provider rate cards (BYOK), Markdown/JSON export bundler. Both the extension AvaViewProvider tool-call audit callback and the IDE sidecar audit hookup write through this; surfaces read newest-first across the live log + every archive.
- New `@ava/core/benchmarks` subpackage — public-leaderboard fetcher with localStorage cache + 1-day TTL, mirror types of `ava-supernova-bench/bench/types.ts` so a schema drift becomes a typecheck failure here, picker-summary helper for future model-dropdown badges. Browser-safe; works across extension dashboard-ui and IDE renderer identically.
- New `/api/export-my-data` server endpoint — auth-gated, queries 26 user-owned tables in parallel against `auth.userId`, applies a deny-list of sensitive field names server-side, returns a self-describing JSON bundle with a methodology footer. Tables that don't exist on a given deploy (schema drift across environments) are skipped silently with a logged warning, never failing the whole export.
- `request_audit_log` host handler now reads from the persistent JSONL store first, falls back to in-memory if the read errors. New `export_audit_log` host handler routes the bundle through `vscode.window.showSaveDialog`. New `export_full_account_data` host handler proxies the GDPR endpoint with the platform key from SecretStorage.
- Server `/api/chat` resolves `model: 'supernova'` and `model: 'auto'` aliases server-side (Supernova → DeepSeek V4 Pro Platform with admin gate, Maestro → Qwen 3.5 Plus). Used by clients without the full local agent loop (mobile companion, IDE cloud-fallback path).
- Server middleware CORS allow-list now includes `X-Ava-Data-Mode` so locally-running clients (IDE webview at `localhost:1430`, dev preview deploys) don't get preflight-rejected.

## 0.51.2 — 2026-04-25

### Fixed
- **DeepSeek V4 BYOK multi-turn `reasoning_content` 400.** After ~8 messages of agentic conversation, BYOK V4 Pro / V4 Flash started failing with `The reasoning_content in the thinking mode must be passed back to the API.` Cause: `trimOldToolResults` in the core agent was unconditionally stripping `reasoning_content` from every old assistant message — but DeepSeek V4 thinking-mode requires reasoning to be preserved on assistant turns that contain `tool_calls`, otherwise subsequent requests are rejected. Strip now skips tool-calling turns. Plain-text turns still drop reasoning for token-budget reasons (DeepSeek and every other provider ignore the field on those). Supernova mode was carrying the same latent bug — surfaces only on long agentic chains, which is why short tests worked.

### Changed
- **Settings provider description for DeepSeek** now reads "DeepSeek V4 Pro and V4 Flash — 1M context, MIT open-weight" (was the stale "V3 and R1 — best price/performance"). Mirrored in the IDE Dashboard.
- **In-product help docs (`docs_lookup`)** updated for DeepSeek: setup recommendation, model table, "best overall value" / "best reasoning" suggestions, and the example `~/.ava/config.json` `activeModel` value all now reference V4 Pro / V4 Flash instead of V3 / R1 / V3.2 / `deepseek-chat`.

## 0.51.1 — 2026-04-25

### Fixed
- **BYOK DeepSeek V4 endpoint** — `DeepSeekProvider.getDefaultBaseUrl()` returned `https://api.deepseek.com` so completions hit `/chat/completions`. DeepSeek V4 (Pro + Flash) ships on the canonical `/v1/chat/completions` path; the non-`/v1` base accepted V3 model ids but rejected V4 with thinking-mode errors like "The reasoning_content in the thinking mode must be passed back to the API." Base URL is now `https://api.deepseek.com/v1` so `${baseUrl}/chat/completions` produces the V4 URL. Platform Supernova was already using a separate forward path with the correct URL — only BYOK was affected.

### Internal
- Added explicit `supportsVision: false` to DeepSeek V4 Pro / V4 Flash (BYOK + platform variants) and `qwen3.5-flash`. Server-side `VISION_REROUTE` already handles the swap to Qwen 3.5 Omni Plus when an image is attached to a text-only model; the metadata flag now lets the extension's attach-image button gate the UI before the request leaves.
- Extension `InputArea` accepts a `modelSupportsVision` prop and disables the attach button when the active model is text-only, with a tooltip pointing users to vision-capable alternatives (Qwen 3.5 Omni Plus / Omni Flash, Qwen 3.6 Plus).

## 0.51.0 — 2026-04-25

Honest math, proactive task capture, and a hard ceiling under abusive turns. Credits now scale with actual cost (so a 200K-token turn doesn't get billed the same as a 4K one), Ava offers to capture task-worthy items mid-conversation instead of waiting for an explicit "add this to my list", and Free's media generation gets sensible caps so the tier remains a real evaluation surface without turning into a margin sink.

### Changed
- **Credits scale with token volume on long turns.** Sub-16K-effective-token turns charge the flat per-action rate as before. Beyond that, credits scale linearly with actual cost — `effective_tokens = nonCachedInput + 0.1×cachedInput + 4×output`, brackets = `ceil(effective_tokens / 16K)`. A 200K-token turn that used to charge 3 credits now charges ~39. Light chat is unaffected; heavy agentic loops finally pay for themselves at the COGS layer.
- **Per-tier per-turn input cap** — Free 16K, Pro 128K, Ultra 256K, Enterprise 512K. Pre-flight rejection (HTTP 413, code `INPUT_TOKEN_CAP_EXCEEDED`) before the provider call, so a runaway turn can't drain a month's allowance in one shot. Estimate is char-based; the provider's reported `prompt_tokens` settles the post-flight bracket-scaling charge.
- **Action cost recalibration.** `image_gen` 10 → 12 credits, `video_gen` 100 → 150, `voice_gen` 3 → 10. The previous numbers were underwater against verified MiniMax Hailuo + Speech 2.8 rates (voice was −173% margin per call). New numbers restore positive margin without changing plan prices or shrinking allowances. Music stays 50 credits; Free is pinned to Music 2.0 (~$0.03/track) and paid tiers keep Music 2.6.
- **DeepSeek V4 Pro multiplier 5× → 6×.** V4 Pro is ~6× Qwen 3.6 Plus on input, ~2× on output — the previous 5× left only ~5% margin on agentic-heavy turns. 6× restores margin parity (~21%) with the Qwen 3.6 baseline. V4 Pro stays the premium pick without becoming a money pit.
- **Per-model cache discount.** Default cache-hit discount is still 0.3× of the normal cost. V4 Pro is now capped at 0.5× because its output share of total cost is high — a flat 0.3× whole-turn discount over-credited cached V4 Pro turns and could flip margin negative. Other models unchanged.
- **Ava proactively offers task capture.** New rule in the central system prompt: when the user mentions an obligation, deadline, or thing-to-do — even casually ("I should...", "remind me to...", "we need to X by Friday") — Ava offers to add it to your personal task list with `task_manage`. Ask first, create only on yes. One ask per item; if you decline or change subject, she drops it. `todo_write` stays Ava's session-progress tracker, `task_manage` is your persistent list — the rule explicitly distinguishes them so they don't get confused. Chat mode also gained `task_manage` in its tool list; previously it could only reach the session-only `todo_write` in casual conversation.

### Added
- **Free-tier media caps** — Free is capped at 0 videos, 5 images, 10 voice generations, and 3 music tracks per month. Cap-counting reads `creative_assets` rows in your current period and pre-flight-rejects before the MiniMax call burns money. Paid tiers (Pro / Ultra / Enterprise) remain uncapped beyond the credit allowance. Without the caps, a single Free user generating five 1080p Hailuo videos would cost ~$2.40 against $0 revenue — multiply by the free user count and the bleed compounds linearly. Caps are a hard architectural floor under "Free is fine, but not abusable."

### Internal
- New `packages/core/src/billing/credits.ts` exports `creditsForTurn(action, opts)` for token-aware charging — replaces flat `creditsFor()` for chat-like actions when prompt/output token counts are known. Constants `TOKENS_PER_BRACKET = 16K`, `OUTPUT_TOKEN_WEIGHT = 4`, `CACHED_TOKEN_WEIGHT = 0.1` are exported for any other surface that wants to compute identically.
- New `packages/web/src/lib/plan-token-caps.ts` — `TIER_INPUT_TOKEN_CAP` table + `estimateInputTokens` (char-based) + `checkInputTokenCap` pre-flight helper.
- New `packages/web/src/lib/free-tier-caps.ts` — `FREE_TIER_MEDIA_CAPS` + `checkFreeMediaCap` helper, wired into `generate-image`, `generate-video`, `generate-music`, `generate-voice` routes. Fail-open if the count query errors so a transient DB blip never blocks a paying flow that just happens to be on Free this cycle.
- Credits page (`ava-supernova.com/credits`) + pricing FAQ + `seo.ts` schema.org Offer descriptions all updated to the recalibrated numbers. The pre-rebalance 1,500 / 15,000 / 40,000 / 100,000 credit allowances were still in the SEO data despite the 2026-04-23 plan rebalance.
- `task_manage` tool schema description now includes a "Proactive use" sentence so the model sees the behavioural rule at the point of tool inspection, not just in the system prompt.

## 0.50.1 — 2026-04-25

A six-mode audit pass — Chat, Plan, Work, Teach, Security, Brainstorm. No new features; the modes you already use just work better, faster, and more honestly.

### Fixed
- **Phantom `security` tool removed.** Security mode advertised a `security` tool in the system prompt and allow-list that was never registered — the model would call it, get a "tool not found" error, and either retry or fabricate output. References cleaned up; `audit_dependencies` is now the single documented entry point.
- **Security Scanner uses OWASP 2021** (was on the 2017 list). A04 Insecure Design, A08 Software & Data Integrity Failures, and A10 SSRF are now named explicitly. Crypto failures separated from generic "sensitive data". CSRF still called out alongside.
- **Brainstorm Challenger no longer silently halts the pipeline** when it uses normal critique words ("reject", "stop", "abort"). Forked into its own persona with ideation-shaped questions (commercial viability, originality, timing, hidden cost) and KEEP / KILL / RESHAPE-AS labels for the Refiner to consume.
- **Plan + Work Challenger gate goes structured.** Veto now requires a `VETO: <reason>` first line — same model-cooperative pattern Fact Checker uses with `HALT:`. Ordinary "I'd reject the microservices approach" critique is no longer a tripwire.
- **Teach `assess` action is reachable** for new learners. Was structurally broken — the handler bailed on missing curriculum before the assess branch ran, despite the documented flow being "assess first, then create curriculum".
- **Curator tool reachable from Work + Plan + Brainstorm.** The fresh-context taste specialist (the architectural answer to design quality dropping under cognitive load) was wired but never allow-listed in any mode. The system prompt told the model to call it; the call got filtered out before reaching the model.

### Changed
- **Conductor catches natural phrasing** in Security / Brainstorm / Plan / Teach. Empty submission honours the placeholder ("just hit Enter for a full audit"); bare verbs ("plan", "scan", "ideas", "teach me") trigger the team. Previously you had to type the magic phrase from the docs.
- **Teach uses a light team for ongoing delivery turns.** The full 5-persona prep pipeline only fires on creation signals ("teach me X", "create a curriculum"). Follow-on turns ("continue", "another example", "I'm stuck") run the Tutor alone — same response, ~5× less reasoning load.
- **Security light team includes the Verifier.** Was producing reports labelled "verified" without the verifier in the pipeline. Now the labels are honest.
- **Security `audit_dependencies` scoped to one persona** (CVE Researcher). Was on three personas, leading to triple `npm audit` runs per pass.
- **Work Challenger runs at priority 3** (was 5), short-circuiting Verifier and Sequencer when it vetoes. Order now: Scout → Architect → Challenger → Verifier → Sequencer.
- **Tutor blast radius tightened** — `git_commit` and `git_create_pr` removed from the Tutor's toolset. A teaching session can no longer commit code into the user's repo.
- **Mode allow-lists expanded** — Plan, Brainstorm, Teach, Security all gained the research / capture / utility tools their personas use, so the coordinator-direct path matches what orchestrated mode can do. Includes `news` for Researcher, `http_request` + `browser` for Plan + Brainstorm + Teach research, `memory_update` for evolving learner profile, `todo_write` for mid-Chat capture.
- **Conductor wave loop ignores deps that aren't in the running team.** Lets light teams skip optional personas without deadlocking downstream verifiers.
- **Chat taglines stop saying "no tools"** when the allow-list has 10. IDE: "Friend. Off the clock." Extension: "Ava as a friend, off the clock. Memory, search, journal, weather, news — no coding tools."
- **Chat system prompt names the warmth tools** — weather on a "rough day", news only on user-raised events, memory referenced naturally not mechanically, `memory_update` over `memory_save` when something has changed.
- **`todo_write` in Chat allow-list** — capture an idea mid-conversation without switching modes and back.

### Internal
- Dead post-build personas (Integrator, Code Reviewer, Design Reviewer) stripped from `WORK_PERSONAS`. All depended on Builder, which is filtered from the planning team — they only ever ran on missing Builder output and produced hollow "nothing to verify" results. Real verification path uses `verify_change` directly via the post-build hook in AutoCoordinator.
- `SECURITY_REPORTER` persona id renamed `'challenger'` → `'security_reporter'` (was a copy-paste collision with the Brainstorm Challenger).
- `BRAINSTORM_CHALLENGER` is its own persona id with `canVeto: false` so the silent-deadlock pattern stays gone.
- Builder persona's `allowedTools` cleaned — `screenshot` (extension can't ship screen capture per marketplace rule) and `verify_change` (handled by the post-build hook) removed; definition now matches actual operational toolset.

## 0.50.0 — 2026-04-25

### Added
- **DeepSeek V4 in BYOK.** V4 Pro (1.6T total / 49B active, 1M context, SWE-Verified 80.6%) and V4 Flash (284B / 13B active, 1M context, SWE-Verified 79.0% at $0.14/$0.28 per M tokens — the price/performance anomaly of the 2026 cohort). Both MIT-licensed open-weight, both with dual thinking/non-thinking modes. Add a DeepSeek API key in Settings to use them.
- **Supernova mode (admin preview).** Polyglot multi-model orchestration — DeepSeek V4 Pro coordinator picks specialists per task: Qwen 3.6 Plus for Builder spawns (Terminal-Bench leader on real agent loops), V4 Flash for mid-tier review work, Qwen 3.5 Omni Plus for vision input. Admin-only at preview while DeepSeek partnership conversation finalises; non-admin platform users see Supernova in the dropdown as a roadmap teaser ("In development" badge).
- **Maestro mode** — what Auto Mode is now called. Same single-conductor orchestration on Qwen 3.6 Plus, just a name that reads as the natural pair to Supernova (one virtuoso vs the full orchestra). The internal model id stays `'auto'` so saved settings carry over.
- **Vision guard for V4.** V4 is text-only at the API level. Manually picking V4 from the dropdown and attaching an image now reroutes server-side to Qwen 3.5 Omni Plus for that turn — no error, no hallucinated description of an image V4 couldn't see.

### Changed
- **DeepSeek V3.2 and Reasoner retired** from the model catalogue ahead of upstream retirement (DeepSeek retires `deepseek-chat` and `deepseek-reasoner` endpoints on 2026-07-24). The legacy IDs already silently route to V4 Flash under the hood; we now expose V4 Pro / V4 Flash directly so users aren't on a deprecating ID surface.
- **Chat model picker cleanup.** Managed MiniMax (M2.5 / M2.7) is hidden from the chat picker for platform users — MiniMax is reserved for Creative Studio on managed plans. Users with a BYOK MiniMax key still see the entries (their key, their call). Supernova appears above Maestro for admin; both get highlighted as Ava-orchestrated modes vs raw model picks.
- **Marketplace description + README refresh.** "3M free Qwen tokens" → "300 free credits per month" (post 2026-04-23 credit rebalance). Model lineup listings updated across both READMEs and the marketplace NLS strings — V4 family added, K2.6 added, Opus 4.7 added, Xiaomi MiMo added.

### Internal
- New `packages/core/src/auto/supernova-router.ts` holds the polyglot routing table (per-task category routes + per-persona model overrides for the 24-persona system, ready for the Conductor wire-up in a follow-up commit).
- `AutoCoordinator.create({ mode: 'supernova' })` pins the coordinator to V4 Pro and routes Builder spawns through Qwen 3.6 Plus instead of inheriting the coordinator model.
- `/api/models` admin gate via `validateAuth()` (sk-ava-* or Supabase JWT) — admin-only models filtered from public response. Migration 218 introduced the `admin_only` column.
- Removed the vestigial Auto Mode coordinator picker from Dashboard → Settings (it predated Supernova as a separate mode and is no longer meaningful).
- Pricing math validated: Supernova adds zero pressure on the 2026-04-23 credit rebalance — V4 Flash carries the volume at lower cost than Qwen 3.6 Plus on output, V4 Pro coordinator's higher per-token rate applies only to small orchestration volumes.

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
