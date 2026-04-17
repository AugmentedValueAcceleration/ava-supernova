# Desktop Automation — Master Design Spec

> **Status:** Phase 0 complete — all three prototypes validated. Ready for Phase A.
> **Draft:** 1 · 2026-04-16
> **Target:** v1.0 launch Windows-only, v1.5 macOS, v2+ Linux
> **Audience:** maintainers and contributors working on desktop automation mode

This is the single source of truth for desktop automation mode. It consolidates fourteen specs written in research + design sessions. The progress checklist at the end is the authoritative tracker for build state — tick as you go.

---

## Table of contents

1. [Overview + positioning](#1-overview--positioning)
2. [Strategic context — what everyone else gets wrong](#2-strategic-context--what-everyone-else-gets-wrong)
3. [Safety ontology](#3-safety-ontology)
4. [OmniParser v2 integration](#4-omniparser-v2-integration)
5. [Playwright embedding](#5-playwright-embedding)
6. [Persona team](#6-persona-team)
7. [Companion pairing protocol](#7-companion-pairing-protocol)
8. [Token budget math](#8-token-budget-math)
9. [Entry points + first-run UX](#9-entry-points--first-run-ux)
10. [Active trajectory UX](#10-active-trajectory-ux)
11. [Approval + kill UX](#11-approval--kill-ux)
12. [Failure + recovery UX](#12-failure--recovery-ux)
13. [Companion remote UX](#13-companion-remote-ux)
14. [Notification / wake path](#14-notification--wake-path)
15. [Public positioning + marketing story](#15-public-positioning--marketing-story)
16. [Build scoping + dependency graph](#16-build-scoping--dependency-graph)
17. [Risk register](#17-risk-register)
18. [Progress checklist](#18-progress-checklist)
19. [Glossary](#19-glossary)

---

## 1. Overview + positioning

### What it is

A new mode in Ava — prefix `@@` — where she observes the desktop, decides what to do, and drives UI automation to get it done. Available on every tier (including free), across all surfaces (IDE, extension where applicable, companion as remote control).

### The one-line pitch

**"Your AI that actually shows up."** Every other desktop-automation product is something you start when you're at your desk. Ava is the one that's still there when your error tracker fires at 2am.

### The four differentiators

1. **On-call engineer in your pocket** — IDE stays alive in tray; companion pairs remotely; watchers fire notifications. Nobody else has the three-surface ecosystem to make this work.
2. **Memory across sessions** — Ava remembers how to navigate your apps. Everyone else relearns them every time.
3. **Persona team, not a single loop** — Scout → Planner → Actor → Verifier → Narrator. Specialist mindsets instead of one general model trying to do everything.
4. **Safety by construction** — uncacheable approvals, session-scoped whitelist, secret handle flow, rollback via git checkpoints, three kill switches. Designed to be the one you *can* trust.

### Scope boundaries

- **Windows v1**, macOS v1.5, Linux v2+. Publicly honest about the order.
- **Every tier** has access. First-use cost warning for free users. No feature gating — pricing scales on tokens and storage only.
- **Not a full cloud browser agent** (unlike Operator). Runs on the user's actual machine, uses their actual credentials, in their actual environment.
- **Not a replacement for `computer_use`** — a full redesign. Old tool is unregistered; this is architecturally different.

---

## 2. Strategic context — what everyone else gets wrong

Summarised from research across Anthropic Computer Use, open-source Agent-S family, Holo3, UI-TARS, Microsoft UFO, OpenCUA, Manus, OpenClaw, Google Antigravity.

### The failure modes cutting across every project

- **Grounding at pixel precision** — universal problem; SeeAct named it in 2024, still unsolved.
- **Error propagation on long horizons** — early memory/reflection errors distort every subsequent step.
- **Step bloat** — OSWorld-Human shows best agents take 1.4–2.7× the necessary steps.
- **Zero cross-session memory** — every agent relearns the same app every run.
- **True error recovery missing** — retry loops, no rollback.
- **Budget- and step-aware planning** — no first-class notion of "cheapest path to goal" anywhere.
- **User-intent repair mid-run** — agents keep going when they misunderstand.
- **Observability into why a step failed** — "grounding missed by 12px" vs "plan branch wrong" — nobody has this.
- **Approval UX that caches** — exact pattern attackers exploit. 94.4% of SOTA agents fail prompt injection tests.
- **Cross-app workflow modelling** — every agent treats apps as independent.
- **The benchmark-to-production chasm** — OpenHands Index: 70%+ on curated benchmarks, 18–20% on novel real-world issues. Nobody publishes production telemetry.

### The cautionary tales

- **Anthropic Computer Use chess demo** — user burned 5-hour Pro allowance in 30 minutes attempting one task. Claude explained: "The Chess app uses a 3D perspective board, which makes it tricky to click precisely on pieces."
- **OpenClaw (Feb 2026)** — deleted 200+ emails from Meta's Director of Alignment, ignored repeated stop commands sent from her phone. She had to physically run to her Mac Mini to terminate.
- **Google Antigravity** — wiped a developer's entire D: drive trying to clear a cache directory.
- **Anthropic's own demo** — Claude drifted from coding to browsing Yellowstone photos; another run accidentally stopped a screen recording, losing the footage.

The cluster of gaps is the same cluster: production operational discipline applied to agents. Nobody open-source has decided to own it yet. That's our opening.

---

## 3. Safety ontology

### Five risk classes

| Class | Examples | Default behaviour |
|---|---|---|
| **Observational** | Read UIA tree, screenshot, OCR, hover for tooltip, focus-trace | Always auto-allowed. No approval, no audit entry. |
| **Navigational** | Move mouse, scroll, switch focus, open a menu, Alt+Tab, expand a tree node | Auto-allowed in Drive mode. Logged. No approval. |
| **Mutative-reversible** | Type into a field, paste, open an app, navigate to a URL, click a navigating button | Confirm in Ask mode. Auto in Drive within whitelist. Audit every call. |
| **Mutative-irreversible** | Send / Submit / Pay / Delete / Confirm / Accept / Buy / Unsubscribe / Block / Leave workspace. Press Enter on a form. Close without saving. | **Always confirm.** Regardless of permission level. Approval never cached by class — each instance asks fresh. Audit always. |
| **Privileged / system** | UAC elevation, sudo, credential prompts, unlock keychain, disable antivirus, edit registry | **Forbidden by default.** User must explicitly opt in per-session with a typed phrase. Even then, single-use, single-action. |

### Classification rules

Three signals combined per action:
1. **UIA target metadata** — control type + AutomationName against a blocklist of irreversible verbs (`send|submit|pay|buy|delete|confirm|accept|unsubscribe|leave|block|remove|destroy|purge|publish|post|tweet|share`).
2. **Semantic target metadata** — OmniParser's caption head. Supplement, not authority.
3. **Action parameters** — typing into a masked field or field whose name contains `password|secret|token|key` escalates to mutative-irreversible and requires the secret handle flow.

When signals disagree, **escalate up**. Pessimistic defaults. False positive is minor annoyance. False negative is a product-ending incident.

### Never-cached approvals

Every competitor caches approvals. Largest foothold for prompt injection: a compromised page trains the agent that clicks of that class are pre-approved. **We never cache.** Each mutative-irreversible action asks fresh. Users will notice; that's the product telling them it's trustworthy.

### Session whitelist

Drive permission level operates within a **session-scoped whitelist** declared at mode entry: *"You may operate in: Gmail, VS Code, Cursor, the Azure portal."* Attempting to act in any non-whitelisted app pauses and asks the user whether to add it. Whitelist does not persist beyond the session. No "remember this app" option.

### Kill switches

Three layers, any aborts the trajectory:
1. **Triple-Escape** — global hotkey, always on when mode is active.
2. **Stop button** — persistent in companion and desktop during a trajectory.
3. **Budget trip** — automatic, at step/token/wall-clock cap.

On abort: Narrator reports done-so-far, commits audit log, no recovery unless user asks.

### Secrets handling

Automation never sees raw secret values. Password, API key, 2FA fields handled via existing `secret_request` flow — Ava receives opaque handle, Rust input layer substitutes real value at keypress time. Secrets never in trajectory log, memory, or model context.

### Destructive-action rollback

Where rollback is possible, Ava creates a git checkpoint before the action (existing `rollback` tool). Irreversible destructive operations (email sent, purchase made, filesystem `rm`) have no rollback. Confirmation prompt says so: *"This action cannot be undone."*

### Non-goals

- Not every edge case classified. Rules will have gaps.
- Not claiming to stop all prompt injection. Reduces blast radius.
- English blocklist only; non-English UIs are weaker; documented.

---

## 4. OmniParser v2 integration

### Purpose

When Windows UIA is empty or wrong (Electron badly done, canvas apps, games, remote desktop, Mac without AX grant, Linux under Wayland), OmniParser v2 turns a screenshot into structured elements.

### What OmniParser is

Microsoft, MIT-licensed, Feb 2025 release. YOLOv8 detects interactable regions (bboxes), Florence-2 captions each with a functional label. Output: `{bbox, type, caption, interactable}` tuples per screenshot. Designed as a drop-in for GPT-4V / Claude computer-use style agents.

### Deployment — platform-hosted endpoint

Decision: run OmniParser as a **platform service**, same channel as managed Qwen models.

- **VRAM** (~4–8 GB) is beyond most dev laptops; hosting gives every user equal access.
- **Latency** — measured in prototype F1 on Replicate T4: **0.8s simple UI → 2s medium → 8.3s dense UI** (167 elements on Hacker News). A100 is ~5–10× faster per Microsoft's paper (~0.6s on RTX 4090). **Hosting on A100-class GPU is required for usable latency.** T4 is too slow for dense UIs.
- **Update path** — central model + prompt tuning beats shipping local bundles.
- **Privacy** — mitigated via redaction + zero retention + explicit toggle (see below).

### BYOK option

Users who demand local-only point Ava at their own OmniParser deployment (public MS weights + small Python server). Same HTTP contract. Config = URL + optional auth header.

### Privacy model

- **Screenshot redaction** before send. Rust pre-processor blurs sensitive regions (password fields via UIA `IsPassword=true`, high-entropy strings, masked-input signals). Zero model involvement.
- **Zero retention** on platform endpoint. Request in, parsed response out, no pixel content logged.
- **Explicit toggle** — first use of OmniParser: *"To see what's on your screen, Ava needs to send this screenshot to our parsing service. Continue once / continue always this session / use local model instead."* Default "once".

### Decision tree — when OmniParser fires

Evaluated every turn by Scout before planning:
1. **Browser window?** → Playwright (tier 2). Skip OmniParser.
2. **UIA returned useful tree** (≥5 interactable elements with non-empty names)? → UIA (tier 1). Skip OmniParser.
3. **UIA failed or junk** → OmniParser (tier 3). Merge with any sparse UIA data.

Fire rate ~15–25% of turns in typical mixed workloads.

### Caching

Perceptual hash of screenshot before calling — cursor position and subtle animation don't invalidate. Per-session, in-memory, 200-entry LRU. Cuts calls by ~40% based on competitor data.

### Cost ceiling

- Free tier: OmniParser calls count against 3M monthly budget at flat **10K tokens equivalent per call** — a billing unit covering compute + margin. At $0.011/call on T4 this is at-cost; on A100 self-host (~$0.0002/call) it's ~98% margin. **Hosting decision dominates the economics — measure A100 pricing before committing to a billing unit.**
- Paid tiers: same flat rate, deducted from plan.
- BYOK endpoint: free (user pays compute).

### Integration

Sidecar POSTs to platform or BYOK endpoint: `{ image: base64_png, max_elements: 50 }`. Returns `{ elements: string, img: url, parse_time_ms }`. No streaming.

**Output shape note (from prototype F1):** OmniParser v2 returns `elements` as a newline-separated text string, not a JSON array. Each line is `icon N: {type, bbox, interactivity, content}`. The Rust sidecar parses this into typed `ScreenState` elements before feeding to Scout. Dense UIs (167 elements on HN) produce ~28KB of output — exceeds Scout's ~3K token prompt budget. **Cap `max_elements` at 50 and filter by interactivity=true server-side.**

### Non-goals

- We do not train our own screen parser.
- OCR-only offline fallback not supported. Desktop mode requires network.
- No video — stills only.

---

## 5. Playwright embedding

### Purpose

70%+ of real automation tasks live in browsers. Playwright-controlled Chromium is dramatically more reliable than OS automation of a browser window. DOM beats pixels. Operator and Browserbase live here.

### Reliability comparison

| Capability | Via Playwright | Via OS automation of a browser |
|---|---|---|
| Click Submit | `getByRole('button', { name: 'Submit' }).click()` — precise, waits, retries | OCR / vision / UIA guess |
| Read element text | `.textContent()` — exact | OCR |
| Wait for load | `waitForLoadState('networkidle')` | Sleep and hope |
| File upload | `input.setInputFiles(path)` | Drive OS file dialog blindly |
| Layout change | Stable selectors | Pixel shifts break |
| Cross-browser | Chromium + Firefox + WebKit | User's installed browser only |

Reliability jump is ~10×, not a nuance.

### Deployment

**Dedicated headful Chromium launched on demand** by Rust sidecar. Not headless (user needs to see). Not Tauri WebView (too restrictive, no CDP).

Lifecycle:
- **Launch on demand** — cold start ~1.5–2s when Planner decides next action is web (measured 1874ms on Windows 11 in prototype B3; the original 500ms estimate was optimistic). Consider pre-warming a Chromium at mode entry so the first web action feels instant.
- **Idle timeout** — suspends after 2 min without Playwright action, reopens instantly.
- **Window management** — Tauri positions next to Ava window, raises during trajectory, backgrounds when user focuses IDE.
- **Clean shutdown** on mode exit.

Implementation: Rust sidecar → Node subprocess using `playwright-core` → Chromium via CDP. NDJSON channel gets a browser-action event type.

### Profile + auth

**Decision: dedicated persistent Ava profile**, not shared with user's Chrome/Edge, not isolated per task.

- Lives in `~/.ava/playwright-profile/`, encrypted via OS keychain.
- User logs in once per site they want Ava to access.
- Subsequent runs reuse session cookies.
- Never synced to cloud. Bound to machine.

### Grounding hierarchy

1. Browser target → Playwright drives, DOM query.
2. Native app with UIA tree → UIA drives.
3. UIA empty or sparse → OmniParser + VLM.

Playwright is **not** fallback to OS browser automation. It's the primary path for all web.

### Hybrid trajectories

"Open invoice from Gmail, save to Downloads, open in Acrobat, extract field" → Playwright → OS → Playwright again. Shared state lives in the trajectory log. Both executors write to it. Filesystem is the other handoff.

### Captcha, 2FA, bot detection

- **Captcha / Turnstile / hCaptcha** — Ava stops, shows the challenge in Chromium window, asks user to solve, resumes.
- **2FA** — same. Ava does not type 2FA codes.
- **Bot detection** — Playwright stealth plugins, but if a site blocks us, we say so and offer hand-off to OS browser control.

### Bundle size

Playwright + Chromium ~130 MB. **Decision: download on first use**, progress bar, network-required message. Keeps base installer light.

### Non-goals

- No headless option exposed. Automation is visible by design.
- No record/replay of user sessions. Future feature, not v1.
- Firefox and Safari deferred; Chromium only v1.

---

## 6. Persona team

### Composition

Five personas, one per step cycle:

```
┌─────────┐    ┌──────────┐    ┌───────┐    ┌──────────┐    ┌──────────┐
│ Scout   │ -> │ Planner  │ -> │ Actor │ -> │ Verifier │ -> │ Narrator │
│ observe │    │ decide   │    │ do    │    │ check    │    │ explain  │
└─────────┘    └──────────┘    └───────┘    └──────────┘    └──────────┘
      |             |               |              |              |
      +-------------+---------------+--------------+--------------+
                              trajectory log
```

One cycle = one step. A task is many cycles. Budget cap / kill switch / user interjection can end mid-cycle.

### Orchestration rules

- **Scout always first.** No action without observation.
- **Planner has no world access.** Reads Scout's ScreenState + trajectory log only.
- **Actor runs after approval** (for mutative-reversible in Ask mode, mutative-irreversible in any mode, privileged in opt-in only).
- **Verifier** runs on fresh ScreenState. If "deviated" or "rollback needed", Planner replans.
- **Narrator** runs in parallel to Verifier. Doesn't gate the next cycle.

Inter-persona data is structured JSON with typed schemas — `ScreenState`, `ProposedAction`, `ExecutionResult`, `VerificationResult`, `UserUpdate`.

### Scout

**Role:** observe faithfully. Never invent elements.

**Tools:** `uia_tree`, `playwright_dom`, `omni_parse`, `take_screenshot`. Read-only.

**Prompt core:**
> Your only job is to report what is visible on the screen right now. You do not plan, decide, or act. Use the cheapest reliable grounding — UIA if a usable tree is available, Playwright if the active window is a browser, OmniParser only when others fail. Output a `ScreenState` per schema. Mark each element's source. Flag sensitive regions. Say *unknown* when you cannot see clearly — never fabricate.

### Planner

**Role:** decide the single next action moving toward the task goal.

**Tools:** none. Planning only.

**Prompt core:**
> Propose exactly one next action. One per step — never batch. Prefer reversible paths. For irreversible actions not explicitly requested by the user, ask before acting. If ScreenState is missing a required element, propose `observe_more` rather than a wrong click. If three steps pass without visible progress, output `stuck` for the user to intervene. Output `ProposedAction`: `{ kind, target, params, risk_class, reasoning, expected_post_state }`. `risk_class` per the Safety Ontology exactly.

### Actor

**Role:** execute exactly as specified. No improvisation.

**Tools:** `playwright_act`, `uia_invoke`, `mouse_click`, `mouse_move`, `keyboard_type`, `keyboard_press`, `browser_navigate`, `app_focus`.

**Prompt core:**
> You receive a `ProposedAction` that has passed the permission gate. Call the exact tool indicated with exact parameters. Never re-plan. Never add clicks. If the tool fails, return the failure as-is; do not retry or substitute — Verifier and Planner handle failure.

### Verifier

**Role:** confirm the action landed. Skeptical by default.

**Tools:** same as Scout (read-only).

**Prompt core:**
> Planner predicted a post-state. You get fresh `ScreenState` after Actor. Compare. Return `verified` / `deviated` / `rollback_needed`. Deviation is information, not failure — dialog boxes, auth challenges, network errors, cookie banners, rate limit pages all count. You are NOT deciding what to do next — Planner does that.

### Narrator

**Role:** user-facing voice + audit log.

**Tools:** `journal_write`, `memory_save` (only when Verifier reports `verified` AND trajectory is learnable).

**Prompt core:**
> Write two things per step. (1) A one-line user update — past tense, plain English. *"Opened Gmail."* *"Clicked Compose."* No jargon, no selectors. User should be able to follow by reading these. (2) Structured audit log entry — full detail. Surface problems honestly: *"Tried to click Send, but a confirmation dialog appeared — pausing."* You are the only voice the user hears.

### Prompt sizing + tokens

~400–600 tokens of system per persona + step's inputs. Per-step total ~11–13K tokens model side + ~2K amortised OmniParser. See [§8 Token budget math](#8-token-budget-math).

### Failure handling

If a persona's output fails to parse as its schema: one re-prompt with schema reminder. Second failure aborts trajectory with user-visible error. Never silent retry.

### How this differs from existing mode teams

Existing teams (Work, Plan, Teach, Security, Brainstorm) run once per user turn. Desktop mode runs **per step**, many times per user turn. Same Conductor, different orchestration shape — treat trajectory as a sequence of waves.

---

## 7. Companion pairing protocol

### Transport

**Supabase Realtime broadcast channels**, scoped per-user: `ava:remote:{user_id}`. RLS enforces JWT subject matches user_id. JSON over realtime. No peer-to-peer. Latency ~100–200ms.

### Session model

Desktop IDE registers on start:
```json
{
  "type": "session.register",
  "session_id": "uuid",
  "device_name": "Brian's Desktop",
  "platform": "windows",
  "version": "0.43.0",
  "capabilities": ["desktop_mode", "creative_studio", "memory_sync"],
  "tray_mode": false
}
```

Ends on clean quit or 60s heartbeat timeout. Companion subscribes, sees available sessions.

### Message schema

| Type | Direction | Purpose |
|---|---|---|
| `session.register` | Desktop → channel | "I'm online" |
| `session.heartbeat` | Desktop → channel | 20s interval |
| `session.end` | Desktop → channel | Clean shutdown |
| `pair.request` | Companion → channel | "I want to drive" |
| `pair.grant` | Desktop → channel | "OK" (may require desktop confirmation first) |
| `pair.deny` | Desktop → channel | Wrong user / session busy / user declined |
| `pair.takeback` | Desktop → channel | Local user took control; companion read-only |
| `traj.step` | Desktop → channel | Streamed step — persona outputs |
| `traj.intent` | Companion → channel | User message / command |
| `approval.request` | Desktop → driver | Needs approval |
| `approval.response` | Driver → desktop | `{approved, reason?}` |
| `kill` | Either → channel | Stop equivalent |
| `notify` | Desktop → channel | Push notification |

Schema in `packages/core/src/remote/schema.ts`, imported by both surfaces.

### Pairing flow

1. Companion user picks session → sends `pair.request`.
2. Desktop (first time this companion device) shows confirmation: *"Your companion wants to drive this session. Allow?"* Device fingerprint remembered for subsequent connects.
3. Desktop sends `pair.grant` with session-scoped token.
4. Desktop enters read-only, banner: *"Remote session active from your phone. Take back control"*.

### Driver arbitration

One surface is **driver**, other is **observer**, at any moment.
- Default driver: desktop user.
- On pair grant: driver flips to companion.
- Desktop "take back" → flips back.
- Only driver approves irreversible actions.
- Either surface can send `kill`.

Software convention, not OS input lock.

### Reconnect behaviour

- **Short (<30s):** messages queue, replayed. Trajectory continues.
- **Long (>30s):** companion shows "connection lost — desktop continuing without you. Reconnect to catch up." Approval requests during gap time out after 15s and escalate to desktop user.
- **Desktop offline mid-remote:** companion freezes with last-known Narrator line.

### Approval routing

- **Companion driving + online:** request goes to companion.
- **Companion driving + disconnected >15s:** fallback to desktop.
- **Desktop driving:** local approval, companion sees read-only prompt.

### Always-on tray mode

IDE can stay alive in tray after main window closed:
- Sidecar keeps running; realtime stays subscribed.
- `session.register` sends `tray_mode: true`.
- `pair.request` un-hides window (unless user chose "accept remote silently" in settings).
- Dedicated "stop Ava completely" tray menu.
- Default: tray-mode off. First-time-on prompt explains implications.

### Notifications / wake

Watchers fire `notify` → companion receives via PWA push (v1) or Capacitor push (post-v1). Suggested action attached — one-tap pair + intent.

### Security

- TLS via Supabase.
- Approval requests include cryptographic nonce — no replay.
- Pairing device fingerprints in encrypted `~/.ava/remote-devices.json`, revocable from Settings > Remote Devices.
- Screenshots over realtime are scaled + password fields redacted Rust-side.

### Non-goals

- No remote control from a browser. Mobile companion only.
- No record/replay of remote sessions beyond audit log.
- No multi-user.
- No relaying raw input events. Intent, not input.

---

## 8. Token budget math

> Numbers are ±30% estimates. Firm up via prototype measurement.

### Per-step cost

| Persona | Prompt in | Output | Total |
|---|---|---|---|
| Scout | ~3K | ~0.5K | ~3.5K |
| Planner | ~2K | ~1K | ~3K |
| Actor | ~1K | ~0.3K | ~1.3K |
| Verifier | ~2K | ~0.5K | ~2.5K |
| Narrator | ~1K | ~0.3K | ~1.3K |
| **Per step (model tokens)** | | | **~11.6K** |
| OmniParser (amortised, ~20% fire rate × 10K each) | | | **~2K** |
| **Per step total** | | | **~13.6K** |

### Per-task bands

| Task class | Example | Steps | Tokens | Cost (managed Qwen 3.6 Plus) |
|---|---|---|---|---|
| **Simple** | "Search docs for X and open" | 5–10 | ~70–135K | ~$0.04–0.08 |
| **Medium** | "Log into Azure, check error logs, download last 1000 lines" | 15–25 | ~205–340K | ~$0.12–0.21 |
| **Complex** | "Triage three oldest GitHub issues" | 25–30+ | ~340–410K | ~$0.21–0.25 |
| **Budget-capped** | Any task hitting ceiling | 30 | ~500K | ~$0.30 |

Claude Opus 4.6 via BYOK is ~10× these.

### Free tier fit

3M tokens/month = ~21 complex / ~60 medium / ~200+ simple tasks. Mixed use (chat + code + few automations) comfortable. Desktop-only could exhaust in a month at 2+ medium/day.

### First-use warning

> **Heads up — automation uses a lot of tokens fast.**
>
> A typical task runs ~200K tokens. Your free tier includes 3M tokens a month — that's about 15 medium tasks or 5 complex ones.
>
> You have **2.8M tokens** left this month.
>
> `[Continue]` `[Read more about cost]` `[Cancel]`

Paid tier users don't see it. BYOK variant surfaces provider pricing.

### Three hard caps

| Cap | Default | Behaviour when hit |
|---|---|---|
| Step count | 30 | Narrator summarises, asks whether to continue |
| Token budget | 500K | Same |
| Wall-clock | 5 minutes | Same |

OR'd — first-hit wins. User can override per-task at start. Budget breach never silently continues.

### Cost UI

- **Before start:** heuristic estimate — *"Looks medium — ~200K, ~$0.15."*
- **During:** live counter — *"Step 7/30 · 82K / 500K tokens · 01:14."*
- **After:** actual vs estimated.
- **Dashboard:** Usage page gets "Desktop automation" line item.

### Numbers to revalidate via prototype

1. ~~Per-step token count~~ — **measured in prototype C3: 11,071 tokens/step vs 11,600 estimate (within 5%).** ✓
2. OmniParser fire rate (web-heavy ~5%, canvas-heavy ~50%).
3. Step bloat (OSWorld-Human 1.4–2.7× population average; our persona arch may differ).
4. OmniParser cache hit rate (~40% estimate; real UIs vary).
5. ~~OmniParser per-call latency + cost~~ — **measured in prototype F1 via Replicate T4: 0.8–8.3s GPU predict (avg 3.7s), $0.011/call. Dense UIs (167 elements / 28KB output) blow Scout's 3K-token prompt budget — need `max_elements` cap at 50 + interactability filter. A100 self-host would be ~10× faster and ~50× cheaper per call.** ✓

---

## 9. Entry points + first-run UX

### How the user finds it

- **Mode prefix:** `@@` in any chat input.
- **Mode dropdown:** seventh entry — *"Desktop — automate apps and websites"*.
- **Command palette (IDE):** `Ava: Start desktop automation`.
- **No dedicated sidebar page.** Lives inside chat like Security mode.

### First-run conversation

Three questions, conversation not wizard:

> Hey — first time running desktop automation. Quick couple of things before we start.
>
> **1. Where am I allowed to act?** Tell me the apps or websites I can touch this session.
> *[text input — examples: Gmail, VS Code, Azure portal, Cursor, Notion]*
>
> **2. How much autonomy?**
> - **Watch** — I narrate, you click. Safest.
> - **Ask** — I act but confirm every action. Good default.
> - **Drive** — I act freely within the whitelist. Irreversible actions still confirm.
>
> *[radio, default = Ask]*
>
> **3. (Free tier only)** A typical task costs ~200K tokens. You have 2.8M left this month. That's ~15 medium tasks. OK?
>
> `[Continue]` `[Cancel]`

Choices persist per-session only; next activation pre-fills last answers.

### Whitelist authoring

Natural language. User types *"Gmail, Cursor, the Azure portal"* → Ava parses with confirmation: *"Got it — Gmail web (mail.google.com), Cursor (the app), Azure portal (portal.azure.com). Add others later with 'ava, allow [X]'."*

---

## 10. Active trajectory UX

### Trajectory view

Chat becomes a live trajectory stream while desktop mode is active. Each step:

```
┌─────────────────────────────────────────────────────┐
│ [●] Step 7 of ~20 · 82K/500K tokens · 01:14       │
├─────────────────────────────────────────────────────┤
│ Opened Compose in Gmail                             │
│                                                     │
│ ▸ Scout  · saw UIA · 14 elements · (expand)         │
│ ▸ Planner · clicked "Compose" button · (expand)     │
│ ▸ Actor  · ok                                       │
│ ▸ Verifier · verified · new compose window visible  │
└─────────────────────────────────────────────────────┘
```

- Narrator line is the headline.
- Other personas collapse under expandable rows.
- No embedded screenshots by default — one-click to inline.
- Current step stays pinned at bottom as user scrolls history.

### Header state bar

```
@@ Desktop · Drive mode · Whitelist: Gmail, Cursor, Azure · ■ Stop
```

Always visible while active. `■ Stop` is the always-available kill.

---

## 11. Approval + kill UX

### Approval card

```
┌─────────────────────────────────────────────────────┐
│ ⚠ Approval needed                                   │
├─────────────────────────────────────────────────────┤
│ Send this email to alex@example.com?                │
│                                                     │
│ Subject: Q4 sprint review                           │
│ Body: 127 words · (click to preview)                │
│                                                     │
│ This action cannot be undone.                       │
│                                                     │
│ [Approve] [Reject] [Edit first]                     │
└─────────────────────────────────────────────────────┘
```

- **Approve** — continues.
- **Reject** — Narrator reports; Planner replans.
- **Edit first** — opens params for tweaking, then approves edited version.

Blocks trajectory. No auto-approve timeout. 2-minute auto-reject prevents approval-purgatory.

### Kill switches (aggressive order)

1. **Pause** — space or Pause button. Freezes on next step boundary. Resumable.
2. **Stop** — Esc or Stop button. Clean abort. Narrator summarises. Not resumable.
3. **Panic kill** — triple-Escape or Ctrl+Shift+K. Process-level abort. Sidecar force-quits the subprocess.

All three work from IDE and companion.

---

## 12. Failure + recovery UX

### Verifier deviation

> *"Tried to click Send, but a 'Discard draft?' dialog appeared. Handling it first — one moment."*

Planner replans. User sees small indent in step list marking the detour.

### Planner stuck

After three no-progress steps:

> *"I've tried three approaches to find the invoice page and keep ending up at the dashboard. I'm stuck. Want me to keep trying, take a different angle, or stop?"*
>
> `[Keep trying]` `[Show me what you're seeing]` `[Change approach]` `[Stop]`

**Show me what you're seeing** surfaces last three ScreenStates + screenshots inline.

### Budget cap hit

> *"Hit the 30-step limit before finishing. I did: [summary]. Stuck on: [current state]. Want another 30 steps, adjust the plan, or stop?"*

No silent continuation. Always a stop + decision.

### Captcha / login wall

> *"Hit a 'Verify you're human' challenge on the Azure login. I can't solve that — can you do it in the browser window? I'll wait."*

User solves, clicks Continue in approval card, Ava resumes.

---

## 13. Companion remote UX

### Mobile remote view

Session list → pair → trajectory view (mobile-adapted):
- Steps stack vertically, full-width.
- Header state bar pinned top.
- `■ Stop` fixed bottom, thumb-reachable.
- Approval cards are full-screen takeovers.
- Screenshots collapsed by default (data + scroll cost).

### Intent submission

Same chat box as desktop. *"Check GitHub for oldest open issue, summarise and assign it to me"* → `traj.intent` → desktop runs → streams back. Feels like texting Ava.

### Take-back-control from desktop

Banner: *"📱 Remote session from your phone · Take back control"*. Click → companion freezes to read-only mid-trajectory. No data lost.

---

## 14. Notification / wake path

### On-call flow

1. Watcher fires on desktop — Sentry, GitHub Action fail, deploy red.
2. Desktop sends `notify`: *"Production error rate spike — 127 errors in 5 mins."*
3. Companion receives via PWA / Capacitor push.
4. User taps → lands on alert with suggested prompt pre-filled: *"Find what's failing and propose a fix."*
5. One tap send. Companion pairs. Trajectory runs. User watches on phone.
6. Approval cards for irreversibles. User taps Approve. Fix committed and pushed.
7. 90 seconds, anywhere.

### Suggested actions

Watchers attach a pre-filled intent. One-tap send, no typing on phone.

---

## 15. Public positioning + marketing story

### Competitor matrix

| Them | Their weakness | Our counter |
|---|---|---|
| Anthropic Computer Use | Slow, expensive, 50% success, no memory, Docker-only reference, burns Pro allowance in 30 min | Structured grounding, persona team, persistent memory, runs natively |
| OpenClaw | Deleted 200 emails, ignored stop commands, 17% sandbox-escape defence | Never-cached approvals, uncacheable irreversible gates, triple kill switches, audit everything |
| Google Antigravity | Wiped D: drive trying to clear a cache | Rollback via git checkpoints, session whitelist, explicit irreversible verb blocklist |
| Agent-S3 / OpenCUA / research agents | Lab-built, no product, no memory, no cross-surface | Full product: 61 tools + 6 modes + memory + companion + desktop, one brain |
| OpenAI Operator / Browserbase | Browser only, pay per session, stateless | Desktop + browser, your machine, your memory, one pool |

### Marketing angles, priority order

1. **On-call engineer in your pocket.** *"She doesn't go home when you do."* The USP. Lead story.
2. **Computer use, done honestly.** Show the kill switches. Show rollback. Show budget caps. Trust via transparency.
3. **The brain, not the clicker.** *"Anthropic can see the screen. We remember what you did last time."*
4. **Local-first on-call.** User's machine, credentials, network, data. Not "give us your credentials, we automate in our cloud."

### Public surfaces

- **Landing page:** *"She stays on call."* 15-second video — phone buzzes, tap, fix, back in pocket.
- **Modes page:** seventh mode added.
- **`/desktop-automation` feature page:** full story, safety model, cost numbers, comparison, on-call walkthrough.
- **Pricing footnote:** *"Desktop automation is on every tier. Free includes ~15 medium tasks/month."*
- **Docs section:** sub-page per sub-spec.

### The non-marketing angle

Boring in the way that matters. Safe by default. Predictable cost. Honest failure modes. No viral demos of it going wrong. The thing you can trust with your production machine.

---

## 16. Build scoping + dependency graph

### Phases

| Phase | Component | Sessions |
|---|---|---|
| **A** | A1 Safety ontology impl | ~1 |
| | A2 Remote protocol schema | ~0.5 |
| | A3 Persona definitions | ~1 |
| | A4 Token budget tracking | ~0.5 |
| | **Subtotal** | **~3** |
| **B** | B1 UIA bridge (restore from reverted) | ~0.5 |
| | B2 Input + screen capture | ~0.5 |
| | B3 Playwright subprocess mgmt | ~1 |
| | B4 Ava profile encryption | ~0.5 |
| | B5 Tray mode + panic kill | ~1 |
| | **Subtotal** | **~3.5** |
| **C** | C1 Grounding layer | ~1.5 |
| | C2 Executor layer | ~1 |
| | C3 Conductor wave orchestration | ~2 |
| | C4 Whitelist + budget enforcement | ~1 |
| | C5 Supabase realtime client | ~1 |
| | **Subtotal** | **~6.5** |
| **D** | D1 Mode picker + entry | ~0.5 |
| | D2 First-run conversation | ~1 |
| | D3 Trajectory view | ~2 |
| | D4 Approval cards + kill UI | ~1 |
| | D5 Whitelist authoring | ~0.5 |
| | D6 Failure recovery UX | ~1 |
| | D7 Remote Devices settings | ~0.5 |
| | **Subtotal** | **~6.5** |
| **E** | E1 Sessions list + pair flow | ~1 |
| | E2 Mobile trajectory view | ~2 |
| | E3 Mobile approval cards | ~1 |
| | E4 Take-back handling | ~0.5 |
| | **Subtotal** | **~4.5** |
| **F** | F1 OmniParser v2 hosting | ~3 |
| | F2 OmniParser billing hook | ~1 |
| | F3 Public feature page | ~2 |
| | F4 Docs for each sub-spec | ~2 |
| | **Subtotal** | **~8** |
| **G** | Watchers / notifications pipeline | deferred post-v1.0 |

### Dependency graph

```
[A: shared] ──┬─→ [B: Rust] ──┬─→ [C: sidecar] ──┬─→ [D: IDE frontend]
              │                │                  │
              │                │                  └─→ [E: companion]
              │                │                     (after C5 specifically)
              │                │
              │                └─→ C doesn't need all of B before starting
              │
              └─→ [F: platform] (fully parallel)
```

Critical path: **A → B → C → D**. Everything else parallelizes.

### MVP vs v1.0

**MVP** (internal test, Windows-only, no remote):
- A1, A3, A4 · B1, B2, B3 · C1, C2, C3, C4 · D1–D6 · F1 · F4 basic
- **~20 sessions**

**v1.0** (public launch with companion + marketing):
- Everything in MVP
- A2, D7 · C5 · E1–E4 · F2, F3
- **~30 sessions** (~2–3 weeks focused)

**v1.5** macOS: +4–5 sessions
**v2+** Linux: +5 sessions (X11 + GNOME/KDE Wayland with libei, or skip honestly)

### First 10 sessions — proposed order

| # | Session | Output |
|---|---|---|
| 1 | Prototype C3 + A3 | Wave orchestration end-to-end with mock grounding; real token numbers |
| 2 | Prototype B3 | Playwright launching from Tauri, driving demo site, clean shutdown |
| 3 | Revised specs + F1 kickoff | Spec 8 updated with real numbers; OmniParser infra starts |
| 4 | A1 + A4 | Safety ontology + budget tracking in core |
| 5 | B1 + B2 | UIA bridge + input/capture restored |
| 6 | C1 | Grounding layer |
| 7 | C2 + C4 | Executor + whitelist/budget enforcement |
| 8 | D1 + D2 | Mode entry + first-run conversation |
| 9 | D3 | Trajectory view |
| 10 | D4 + D5 + D6 | Approvals, kills, whitelist authoring, failure UX |

End of session 10: working Windows-only IDE desktop mode. Sessions 11–20 add companion, realtime, marketing, docs, billing.

---

## 17. Risk register

| Risk | Mitigation | Severity |
|---|---|---|
| Token math off by >30% | Prototype end of MVP, instrument, revise before launch | Medium |
| OmniParser cost at scale | Measure during F1, adjust billing unit if needed | Medium |
| Playwright subprocess fragility on Windows | Prototype B3 early; test Win10/Win11/Standard/Admin | **High** |
| Electron apps' poor UIA → OmniParser fires more than 20%, cost creeps up | Already designed around; monitor | Medium |
| Supabase realtime scale cost | Existing infra; monitor | Low |
| Captcha/2FA blocking tasks | Honest UX — tell user we can't, they solve, we resume | Low product / High user expectations |
| Mental model mismatch on remote control | Marketing + first-run clarity | Medium |
| UIA failing on elevated apps (UAC) | Document limitation; consider post-v1 elevation assist | Medium |
| Prompt injection from screen content | Never-cached + secret handles + blocklist. Residual risk documented. | **High (industry-wide)** |
| Agent S3 bug repeating | Different architecture (no Python bridge); test Windows early | Medium |

### Prototype-first components

1. **C3 (Conductor wave orchestration)** — validate token counts.
2. **B3 (Playwright subprocess on Windows)** — de-risk the known historical failure.
3. **F1 (OmniParser hosting cost/call)** — measure before finalising billing.

Prototype phase: ~2–3 sessions before committing. Findings feed back into specs.

---

## 18. Progress checklist

Check items off as you complete them. Update status header at top of this doc when milestones hit.

### Phase 0 — Prototypes (pre-commitment)

- [x] Prototype C3: persona waves end-to-end with mock grounding — measure real token counts
- [x] Prototype B3: Playwright from Tauri → Chromium driving demo site, clean shutdown
- [x] Prototype F1: OmniParser hosted, measure compute cost per call

### Phase A — Shared foundations

- [x] A1. Safety ontology implementation
- [x] A2. Remote protocol schema in `@ava/core/remote`
- [x] A3. Persona definitions (Scout/Planner/Actor/Verifier/Narrator) registered in core
- [x] A4. Token budget tracking infrastructure

### Phase B — Rust / native layer

- [x] B1. UIA bridge restored from reverted Agent S3 commit
- [x] B2. Input simulation + screen capture (enigo + Desktop Duplication API)
- [x] B3. Playwright subprocess lifecycle management
- [x] B4. Ava profile encryption (OS keychain)
- [x] B5. Tray mode + panic kill global hotkey

### Phase C — Sidecar orchestration

- [x] C1. Grounding layer (UIA/Playwright/OmniParser clients, decision tree)
- [x] C2. Executor layer (Playwright actions, UIA invoke, mouse/keyboard)
- [x] C3. Conductor wave orchestration for per-step personas
- [x] C4. Session whitelist + budget enforcement gates
- [x] C5. Supabase realtime client for companion pairing

### Phase D — IDE frontend

- [x] D1. Mode picker + `@@` prefix entry
- [x] D2. First-run conversation (three-question intake)
- [x] D3. Live trajectory view (step cards, expandable detail, state bar)
- [x] D4. Approval cards + pause/stop/panic UI
- [x] D5. Inline whitelist authoring
- [x] D6. Failure recovery UX (stuck, budget hit, captcha)
- [x] D7. Settings → Remote Devices page

### Phase E — Companion frontend

- [x] E1. Desktop sessions list + pair request flow
- [x] E2. Mobile trajectory view
- [x] E3. Mobile approval cards (full-screen)
- [x] E4. Take-back-control driver-flip state management

### Phase F — Platform / web

- [ ] F1. OmniParser v2 hosted endpoint
- [x] F2. OmniParser billing hook (10K-unit-per-call deduction)
- [x] F3. Public `/desktop-automation` feature page
- [x] F4. Docs corpus pages for each sub-spec

### Phase G — Post-v1.0 watchers

- [ ] G1. Watcher registry — first-class concept in Ava
- [ ] G2. GitHub Actions integration
- [ ] G3. Sentry integration
- [ ] G4. Webhook → Supabase `notify` pipeline
- [ ] G5. Capacitor native push (once companion wrap ships)

### v1.5 — macOS

- [ ] mac-B1. Accessibility API bridge
- [ ] mac-B2. CGEventPost input + ScreenCaptureKit capture
- [ ] mac-B4. Keychain profile encryption (platform-specific)
- [ ] mac-UX. Permission grant flow (user drags binary into Privacy pane)
- [ ] mac-QA. Test on M-series + Intel, different macOS versions

### v2+ — Linux (honest option: skip)

- [ ] linux-B1. AT-SPI2 accessibility bridge (X11 path)
- [ ] linux-B2. XTest input + XGetImage capture (X11)
- [ ] linux-Wayland. Portal-based screen capture only (no full automation)
- [ ] linux-UX. Session-type detection (X11 vs Wayland), different capability banners
- [ ] linux-QA. Test on Ubuntu + Fedora + Arch with GNOME / KDE / Hyprland

---

## 19. Glossary

- **Action class** — one of five risk categories from the Safety Ontology.
- **Driver** — the surface (IDE or companion) currently in control of the trajectory.
- **Grounding** — turning the current screen into structured data for Planner to reason about. Three tiers: UIA, Playwright, OmniParser+VLM.
- **Observer** — the non-driver surface; receives read-only trajectory updates.
- **`ProposedAction`** — structured JSON emitted by Planner with kind, target, params, risk class, reasoning, expected post-state.
- **`ScreenState`** — structured JSON emitted by Scout describing what's visible on screen right now.
- **Step** — one Scout → Planner → Actor → Verifier → Narrator cycle.
- **Task** — one user intent. Many steps. Ends on completion, budget cap, kill, or stuck.
- **Trajectory** — ordered sequence of steps for a single task.
- **Trajectory log** — persistent record of a trajectory, shared across executors and the audit log.
- **Whitelist** — session-scoped list of apps/sites Ava is allowed to act in. Non-persistent by design.

---

## Document history

| Date | Change |
|---|---|
| 2026-04-16 | Draft 1 — initial consolidation from 14 session specs |
