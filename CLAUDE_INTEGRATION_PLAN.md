# Claude Integration Plan

Adding Claude (Opus 4.6, Sonnet 4.6, Haiku 4.5) as the one closed-source model family in Ava | Supernova.

**Why Claude?** Anthropic walked away from a $200M Pentagon contract rather than remove safety guardrails. They refused to allow mass domestic surveillance or autonomous weapons use. They got blacklisted by the US government for standing on their values. That's the kind of company we want to support — and Claude is literally helping build Ava.

---

## Updated Pricing

| Plan | Price | Open-Source Tokens | Claude Tokens | Claude Models |
|------|-------|--------------------|---------------|---------------|
| Free | $0 | 500K (BYOK only) | BYOK only | All via own key |
| Pro | $25 | 10M | 1M (Haiku only) | Haiku 4.5 |
| Ultra | $59 | 30M | 2M | Sonnet 4.6, Haiku 4.5 |
| Enterprise | $129 | 50M | 3M | Opus 4.6, Sonnet 4.6, Haiku 4.5 |

**Claude Top-Ups:**
- 500K Claude tokens — $10
- 1M Claude tokens — $18
- 2.5M Claude tokens — $40

---

## Phase 1 — Database & Backend

- [x] **1.1** Add `claude_tokens_used` and `claude_tokens_limit` columns to `usage` table
- [x] **1.2** Migration script for existing rows (set `claude_tokens_limit` based on current tier)
- [x] **1.3** Update plan definitions in backend — new prices, new token limits, Claude model access per tier
- [x] **1.4** Model access enforcement middleware — check tier before proxying Claude requests
- [x] **1.5** Separate token deduction logic — Claude calls deduct from Claude pool, everything else from open-source pool
- [x] **1.6** Update `/account-info` endpoint to return `claude_tokens_used` and `claude_tokens_limit`
- [x] **1.7** Update `/usage` endpoint to return Claude usage separately
- [x] **1.8** Claude top-up products — 500K/$10, 1M/$18, 2.5M/$40

## Phase 2 — Stripe

- [x] **2.1** Create new Stripe price IDs for Pro ($25), Ultra ($59), Enterprise ($129) *(Stripe dashboard — manual)*
- [x] **2.2** Create Claude top-up Stripe products *(Stripe dashboard — manual)*
- [x] **2.3** Update checkout/billing endpoints to use new price IDs
- [ ] **2.4** Plan for existing subscribers — grandfather or notify of price change

## Phase 3 — Core Provider

- [x] **3.1** New `AnthropicProvider` class implementing provider interface
- [x] **3.2** Claude message format adapter (Claude API differs from standard format)
- [x] **3.3** Model definitions — Opus 4.6 (`claude-opus-4-6`), Sonnet 4.6 (`claude-sonnet-4-6`), Haiku 4.5 (`claude-haiku-4-5-20251001`)
- [x] **3.4** Tool calling support (Claude native tool use)
- [x] **3.5** Vision support (Opus and Sonnet)
- [x] **3.6** Streaming response handling for Claude's SSE format
- [x] **3.7** Token counting / usage reporting tagged as Claude vs open-source
- [x] **3.8** Register in `registerBuiltins()` or equivalent

## Phase 4 — BYOK Support

- [x] **4.1** Add Anthropic API key storage in SecretStorage (extension) and config.json (CLI/IDE)
- [x] **4.2** BYOK Claude requests bypass platform token pool entirely
- [x] **4.3** Available on all plans including Free
- [x] **4.4** Dashboard UI for adding/removing Anthropic API key
- [ ] **4.5** IDE settings panel for Anthropic key *(saved for next IDE build)*

## Phase 5 — Extension & IDE

- [x] **5.1** Register Claude models in model selector (when BYOK key present OR paid plan with access)
- [ ] **5.2** Model picker shows plan availability — greyed out with "Upgrade to Ultra" for restricted models
- [ ] **5.3** IDE: same model access logic as extension *(saved for next IDE build)*
- [x] **5.4** Both: tag usage reports so platform deducts from correct token pool

## Phase 6 — Dashboard

- [x] **6.1** Two usage bars — "Open-Source Tokens" and "Claude Tokens"
- [x] **6.2** Claude top-up button alongside existing top-ups
- [x] **6.3** Clear labelling of which models use which pool
- [x] **6.4** Usage history shows Claude vs open-source breakdown

## Phase 7 — Website

- [x] **7.1** Pricing page — update prices to $25/$59/$129
- [x] **7.2** Pricing page — model access table with Claude column and tier indicators
- [x] **7.3** Pricing page — "Why Claude?" section explaining Anthropic's values and why we chose them
- [x] **7.4** Pricing page — updated FAQ (Claude tokens, BYOK, separate pools, top-ups)
- [x] **7.5** Pricing page — Claude top-up options in top-up section
- [x] **7.6** Models page — add Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 cards
- [x] **7.7** Models page — plan availability labels on each Claude model
- [x] **7.8** News post announcing Claude support and explaining the decision

## Phase 7.5 — IDE Source Control (Git Integration)

The IDE's source control panel doesn't show the connected GitHub repository. Theia has built-in Git support but it needs proper wiring.

- [ ] **7.9** Verify Theia Git extension is included in IDE build (`@theia/git`)
- [ ] **7.10** Ensure `.git` directory is detected when opening a workspace/folder
- [ ] **7.11** Source control panel shows current branch, changed files, and remote URL
- [ ] **7.12** Basic Git operations work — stage, commit, push, pull from the UI
- [ ] **7.13** Remote repository visible in source control (shows connected GitHub repo)

---

## Phase 7.6 — IDE Stability & Conversation Persistence (Priority)

IDE froze during a session and had to be force-closed. On reopen, the entire conversation was lost. Both are bad UX — users lose trust fast.

### Freeze Investigation
- [ ] **7.14** Investigate IDE freeze — check if it's a runaway streaming response, blocked main thread, or memory leak
- [ ] **7.15** Add watchdog / timeout on agent responses — if no event for 60s, abort and show error instead of hanging
- [ ] **7.16** Ensure long-running agent operations don't block the Electron main process (offload to worker if needed)

### Conversation Persistence
- [ ] **7.17** Save conversation history to disk on every assistant message (not just on clean exit)
- [ ] **7.18** On IDE startup, restore last conversation from disk if it exists
- [ ] **7.19** Graceful crash recovery — if the IDE was force-closed, detect incomplete state and offer to restore
- [ ] **7.20** Conversation auto-save location: `~/.ava/conversations/` or project-scoped `.ava/history/`

---

## Phase 8 — Context Management (Priority)

Proper context compression like Claude Code — visible usage bar, manual compress, auto-compress at threshold, never silently drop messages.

### Core
- [x] **8.1** Expose `getContextUsage()` on Conversation — returns `{ used, limit, percent }` based on model's context window
- [x] **8.2** Auto-compress at 80% threshold (not 70% when it's already too late)
- [x] **8.3** Improve compression — keep last 8 messages instead of 4, preserve tool call results
- [x] **8.4** Never silently drop messages — if compression fails, emit a warning event to the UI instead of truncating
- [x] **8.5** Add `manual_compress` method on Agent that can be triggered by the user anytime
- [x] **8.6** After compression, emit updated context usage so the UI bar refreshes
- [x] **8.7** Remove the red alert "X messages dropped" — replace with compression behaviour

### IDE Chat UI
- [x] **8.8** Context usage bar in status area — shows "Context: 45%" with a fill bar
- [x] **8.9** Bar colour: green (<60%), amber (60-80%), red (>80%)
- [x] **8.10** Clickable — clicking the bar triggers manual compression
- [x] **8.11** Show "Compressing..." indicator while compression runs
- [x] **8.12** After auto-compress, show brief notification "Context compressed: 85% → 32%"

### VSCode Extension
- [x] **8.13** Same context bar in extension webview chat panel
- [x] **8.14** Same click-to-compress behaviour
- [x] **8.15** Same colour thresholds and compression notification

## Phase 9 — Testing

- [ ] **9.1** Claude API calls work through platform proxy end-to-end
- [ ] **9.2** Token counting accurate for Claude's tokenizer
- [ ] **9.3** Plan limits enforced — right model, right pool, right tier
- [ ] **9.4** Top-ups add to Claude pool not open-source pool
- [ ] **9.5** BYOK bypasses platform entirely — no token deduction
- [ ] **9.6** Upgrade prompts show correctly for restricted models
- [ ] **9.7** Dashboard displays both pools correctly
- [ ] **9.8** Stripe webhooks handle new plans and top-ups correctly
- [ ] **9.9** Context compression fires correctly at 80% — no messages ever dropped
- [ ] **9.10** Manual compress via context bar works in both IDE and extension
- [ ] **9.11** Context bar updates in real-time during conversations

---

## Notes

- Claude's API format is NOT OpenAI-compatible — needs its own adapter, not just a baseUrl change
- Claude uses `anthropic-version` header and `messages` API with different structure
- Tool use format differs (Claude uses `tool_use` / `tool_result` content blocks)
- Prompt caching (up to 90% input cost reduction) should be investigated post-launch
- Batch API (50% discount, 24hr window) could be offered as a future cost optimisation
