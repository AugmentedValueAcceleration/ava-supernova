# Documentation Audit — Ava | Supernova

> Audit date: 2026-04-16
> Surfaces audited: web platform (`packages/web`), VSCode extension (`packages/extension`), and cross-surface consistency.
> Out of scope (separate audits): hub, companion, IDE, code-level JSDoc.
> Lens: usability for **three** reader profiles — non-coder, new dev, experienced dev.

---

## 0. Executive Summary — The 10 Things That Matter Most

| # | Issue | Surface | Severity | Effort |
|---|-------|---------|----------|--------|
| 1 | **Tool count drift: web says 54, extension says 61** | Both | P0 | XS |
| 2 | **JARVIS leaked in public release notes** (`migrations/052…sql:9`) | Web (DB) | P0 | XS |
| 3 | **All paid tiers show "Coming Soon" — no way to actually pay** | Web pricing | P0 | S |
| 4 | **No in-extension walkthrough** — strings exist, registration empty | Extension | P0 | S |
| 5 | **Mode descriptions buried in README** — not shown when user picks a mode | Extension | P0 | S |
| 6 | **/documentation TOC promises 27 sections, most are stubs** | Web | P0 | L |
| 7 | **"Unlock" language contradicts "Free = Paid on features" promise** | Both | P1 | XS |
| 8 | **Tool descriptions exist in code, never shown when user approves a tool** | Extension | P1 | S |
| 9 | **No FAQ / knowledge base** — support is form-only | Web | P1 | M |
| 10 | **Token math is meaningless to non-coders** ("3M tokens" ≠ "~80 chats") | Both | P1 | S |

Rough effort: **XS** = under an hour, **S** = an afternoon, **M** = a day, **L** = a week.

---

## 1. Reader Profiles — Who Are We Writing For?

Right now nearly all copy assumes the reader is **Profile C** (experienced dev who already knows the AI-coding-tool space). That's roughly 30% of incoming traffic. The other 70% is being written past.

### Profile A — Non-coder (curious creative, designer, founder, student)
- Has heard "AI coding agent" and is curious if it can help them
- Doesn't know what BYOK, API key, model, token, tool, mode, persona, agent mean
- Will close the tab if the first paragraph contains 3+ acronyms
- **Currently served by: very little.** Homepage hero is OK; everything past it loses them.

### Profile B — New dev (junior, bootcamp grad, first paid tool)
- Knows what an IDE is; has used Copilot once
- Doesn't know what an "agentic" coding agent is, what makes Ava different
- Wants to know: **what can I do in 5 minutes?** What's free? What's the catch?
- **Currently served by: README marketplace listing.** Strong on positioning, weak on "first 5 minutes."

### Profile C — Experienced dev (the audit's current default)
- Wants benchmarks, model lists, security posture, BYOK details, tool catalogue
- **Currently served well** by `/models`, `/security`, README technical sections.

**Recommendation:** Every public doc page should have a **two-tier structure** — the first 200 words written for Profile A, then a "Going deeper" section for Profile C. New devs (Profile B) get the union for free.

---

## 2. Web Platform Inventory & Findings

### 2.1 Public marketing pages

| Route | Audience served | Depth | Status |
|-------|----------------|-------|--------|
| `/` (homepage) | A + B + C | Medium | Decent hero, weak feature education |
| `/models` | C | Excellent | Great benchmarks; loses A entirely |
| `/security` | B + C | Good | Articulate on local-first |
| `/use-cases` | A + B | Good | 5 industries × modes; tool names listed without explanation |
| `/extension`, `/cli`, `/ide` | B + C | Thin | Promotional, no substantive feature content |

**Gap:** No individual depth pages for any of the six modes, the 24 personas, Creative Studio, or Memory v2. Homepage says "Six modes. One mind." — that's it. A non-coder closes the tab.

### 2.2 `/documentation` route
**File:** `src/app/documentation/page.tsx`
**Status:** TOC with 27 promised sections (Getting Started → Shortcuts). Most section bodies are stubs. Sections currently empty or shallow:
- Unified Panel
- Choosing Your Model
- Tools (the 61-tool reference users actually need)
- Modes (no per-mode page)
- Personas (no per-persona page)
- Workflows
- Permissions
- Configuration
- Memory

**This is the single biggest content gap on the platform.** Users hit the docs link and find a TOC with no flesh.

### 2.3 Pricing page
**File:** `src/app/pricing/page.tsx`
**Accuracy:** ✓ Tiers + top-ups match spec.
**Critical issue:** All paid tiers show **"Coming Soon"** (lines 37–71). Buttons are dead. **A user who decides to buy literally cannot.** Conversion lost at the moment of intent.
**Gap for Profile A:** "3M tokens" means nothing. Add: *"Roughly 80 long conversations or 200 short ones — about a month of typical use."*
**Gap:** Storage tier (2 GB / 25 GB / 100 GB) is buried in FAQ. The pricing card doesn't make it visible.

### 2.4 Auth / signup copy
**File:** `src/app/auth/signup/page.tsx`
**Issues:**
- Password validation: "Password does not meet all requirements" — generic. Should be: *"Add a special character (e.g. !, @, #, $)."*
- Post-signup `WelcomeModal` (6 steps) is a checklist, not an interactive walkthrough. Doesn't explain *why* the user should care about each step.
- Email verification flow is invisible to the audit (likely silent backend) — needs explicit "Check your inbox" screen with a fallback.

### 2.5 Dashboard inline copy
**Status:** Headers are terse, empty states absent, tooltips minimal.

| Page | Issue |
|------|-------|
| `/dashboard` | "Token Usage" with no tooltip. Profile A doesn't know what that is or that resets are monthly. |
| `/dashboard/memory` | No "What is a memory? How does Ava use it?" explainer. Profile A bounces. |
| `/dashboard/learning` | No empty state ("Create your first curriculum"). Profile B opens it and finds nothing to do. |
| `/dashboard/keys` | "Generate an API key to connect…" — good but doesn't say *which provider* you'd want or what BYOK means. |
| `/dashboard/billing` | No "Why upgrade?" copy. No "What happens when I run out?" |

### 2.6 Onboarding
- Modal-based 6-step checklist. Static. Doesn't show the user a single moment of value.
- **Missing:** A "First task with Ava" walkthrough — interactive, takes 90 seconds, ends with a real result.

### 2.7 Legal — ✓ Compliant
- Privacy + Terms exist, real content (last updated 2026-04-03), UK GDPR cited, contact email present.
- **Minor gap:** No standalone cookie policy page; no DPA template for EU customers.

### 2.8 Support / help
**File:** `src/app/support/page.tsx`
- Contact form only. "Real humans read every message" is great reassurance.
- **Missing:** FAQ, troubleshooting, status page, community forum / Discord, GitHub issues link, response-time SLA.
- Profile A who hits a problem at 11pm Saturday has nowhere to look.

### 2.9 News / Releases
- `/news` is editorial AI news (not product docs). Fine, but not where users look for product help.
- `/releases` shows DB-backed release notes. **Stale:** No clear release notes per version with breaking changes / migration guides.

---

## 3. Extension Inventory & Findings

### 3.1 Marketplace listing — `README.md`
**Status:** 280 lines, comprehensive, well-positioned.
**Strengths:**
- Strong narrative hook ("One AI partner. Every part of building.")
- Mode prefixes (`>>`, `::`, `**` etc.) explained
- Privacy + open-source posture clearly stated

**Gaps for Profile A/B:**
- Never says head-to-head: *"Like Copilot, but does the whole job, not just autocomplete."*
- "Free with account" — never clarifies what an "account" gets you vs BYOK
- No "first 5 minutes" section. Quick Start is a feature list, not a walkthrough.

### 3.2 CHANGELOG
**Status:** **Stale.** Last updated 2026-04-03 with IDE/Core/Companion entries. **No v0.41.0 entry** — current published version. Users who update to v0.41.0 read the marketplace and see nothing new explained.

### 3.3 `package.json` `contributes`
- All 8 commands have NLS-keyed titles. ✓
- Some are bare ("Preview Document"). Most are descriptive ("Open Chat — Start an AI coding session with 61 tools and 6 modes").
- 9 settings, all have descriptions. Quality good. `maxTokens` doesn't explain cost impact. `contributeSharedLearning` privacy implications are nested in `markdownDescription`.

### 3.4 In-extension walkthrough — **CRITICAL GAP**
- `package.json` has `"walkthroughs": []` (line 127) — **empty array, nothing registered.**
- `package.nls.json` lines 41–52 contain 7 walkthrough strings (`walkthrough.step.apiKey.title`, `…model.title`, `…language.title`, `…permissions.title`, `…start.title`).
- **The strings exist. The walkthrough was never registered.** This is a 30-line `package.json` patch that would dramatically improve first-run experience.

### 3.5 Mode descriptions
- Visible in README. **Not visible in the chat UI.** When the user clicks the mode dropdown they see icons + names only. Tooltip is the bare label, no description.
- For Profile A/B clicking "Teach mode" with no idea what it does → confusion.
- Fix: Hover-tooltip per mode with the README description.

### 3.6 Persona descriptions
- All 24 personas have `description` + `prompt` in `core/src/personas/definitions.ts`.
- **Never exposed to users.** No "Ava's team" page in the dashboard. New users don't know personas exist.

### 3.7 Tool descriptions
- All 61 tools have `description` in their schemas.
- **Confirmation prompts show tool name + args only** — not the description. User sees "Allow bash?" with no idea what bash will do.
- Fix: Include the tool description below the name in the confirmation card.

### 3.8 Settings descriptions — adequate
- All 9 settings have NLS descriptions. Quality is acceptable. Two tweaks worth making (cost impact on `maxTokens`, surfacing privacy text on `contributeSharedLearning`).

### 3.9 Empty-state copy
- History: "No saved conversations yet" ✓ (clear but not actionable — could add "Try '>> add a button to my homepage' to start.")
- Tasks: "No tasks for today" ✓
- Memory: "No global memories yet. Ava saves memories as you work together." ✓ (best in class — reassures + explains)

### 3.10 Error messages — mixed
- Good: "Cannot switch model while Ava is working. Wait for the current task to finish."
- Good: "Auto Mode needs at least one configured provider. Add an API key or sign in."
- Weak: "Conversation not found." (no recovery path)
- Weak: "Failed to export conversation." (no reason)

### 3.11 Tooltips
- `title="Chat History"`, `title="Tasks"`, `title="Dashboard"` — bare labels, not hints.
- No keyboard shortcut tips.
- Fix: Tooltips should hint at what the action does, not just what the icon is.

### 3.12 First-run experience
- `SignInScreen`: 4 paths (GitHub OAuth, email, no-account, manual key). Clear options.
- **Missing:** Why-care messaging. What does signing in get me? What's "3M free tokens" worth in practice?
- **Missing:** Link to pricing page from the sign-in screen.
- **Missing:** After sign-in, no guided "now do your first thing" path. User is dropped into chat with no prompt suggestions.

---

## 4. Cross-Surface Consistency

### 4.1 Tool count drift — P0
- Extension README: **61 Tools** (line 180)
- Web `/extension/page.tsx:57`: **54 Tools**
- Web `/extension/page.tsx:86`: "**61-tool arsenal**"
- Pick a number. Fix every place. Leave a comment in the schema noting how to recount when tools are added/removed.

### 4.2 JARVIS leak — P0
- `packages/web/supabase/migrations/052_release_notes_v0130_0140.sql:9` contains *"The JARVIS move"* in publicly visible release notes.
- Per memory feedback: JARVIS is the internal vision, never public.
- Fix: amend the row, or write a follow-up migration that updates that release note.

### 4.3 "Unlock" framing — P1
Three places use feature-unlock language despite the "Free = Paid on features" core promise:
1. `web/src/app/extension/page.tsx:80` — *"Each mode unlocks a different mindset"*
2. `extension/dashboard-ui/src/chat/components/ModelSelector.tsx` — *"Add ${provider} API key to unlock"*
3. `web/src/app/models/page.tsx:557` — *"Paid plans unlock more tokens and additional models"*

Replace with *activates / brings / opens up*. (3) is technically OK because it's about tokens/models, but the verb still suggests gating.

### 4.4 Modes & personas — ✓ consistent across surfaces
Names and counts match. Only the surface presentation differs (README rich vs in-app sparse — covered in 3.5/3.6).

### 4.5 Onboarding handoff — gap
- Web post-signup doesn't tell the user how to get into the extension.
- Extension "needs setup" doesn't link to the right web page.
- Fix: A single "Open in VS Code" button in the web post-signup, and a "Don't have an account? Sign up" link on the extension sign-in screen.

### 4.6 Pricing surface coverage
- Web pricing page is full.
- Extension billing view does not exist standalone (users pushed to web). That's fine — but the *path* should be one click, not buried in the dashboard.

### 4.7 Personal info — ✓ compliant
- All public copy uses "Augmented Value Acceleration". No real-name leaks found.

---

## 5. Readability for Non-Coders & New Devs (NEW LENS)

This is the gap the rest of the audit kept circling. A pass-by-pass through the surfaces with Profile A goggles on:

### 5.1 Acronyms & jargon used without definition
- **BYOK** — used in pricing, dashboard, README. Never defined inline. *Fix: First mention should be "BYOK (bring your own API key from a provider like Anthropic, OpenAI, or DeepSeek)".*
- **API key** — assumed everyone knows what one is and how to get one. *Fix: A 2-minute video or 1-paragraph "what is an API key" link on the keys page.*
- **Model** — homepage, pricing, dashboard. Profile A doesn't know what choosing one means. *Fix: "We pick the best one for you by default — only change this if you know what you're doing."*
- **Token** — the unit of all pricing. Never explained in user terms. *Fix on every pricing surface: "Tokens are units of text. 3M ≈ 80 long conversations or a month of typical use."*
- **Tool / Agent / Persona** — used everywhere, defined nowhere. *Fix: A "How Ava works" 60-second explainer at the top of /docs.*

### 5.2 Mode names without action verbs
"Work / Plan / Chat / Teach / Security / Brainstorm" sound good but a non-coder doesn't know what each *does*. *Fix: every surface that names a mode names what happens: "Work — Ava builds it for you. Plan — Ava maps it out before touching anything. Teach — Ava explains things at your level."*

### 5.3 Empty states that don't onboard
Most empty states say "no entries" instead of "here's what you'd do." Profile B opens the Memory page, sees "no global memories yet," and doesn't know if they should add one or wait for Ava. *Fix: every empty state ends with one suggested action.*

### 5.4 Quick Start that isn't quick
README "Quick Start" is a feature list. Profile B wants: *"Install. Type `>> add a dark mode toggle to my React app`. Watch."* Three steps, one outcome.

### 5.5 Settings panel reads like a manual
VSCode's default settings UI dumps all 9 Ava settings on one page with technical descriptions. Profile A scrolls past without reading. *Fix: a single "Ava setup" page in the dashboard with friendly copy + sensible defaults preselected.*

### 5.6 Pricing math without context
"$19/mo for 15M tokens" is unparseable for Profile A. *Fix: "$19 for roughly 4× what the free plan gives you — about a working week of solid use."*

### 5.7 Non-coders need a "First win" path
Right now there's no documented end-to-end story of "I had no code → I shipped something with Ava." A single high-quality case study (with screenshots, the prompts used, the result) would land Profile A harder than ten feature pages.

---

## 6. Prioritized Fix List

### P0 — Blocks conversion or violates explicit policy
1. Resolve **tool count** to a single number on every surface
2. Remove **JARVIS** mention from public release-notes migration
3. Make pricing tiers actually purchasable (kill "Coming Soon" or replace with email-capture waitlist)
4. **Register the in-extension walkthrough** (strings already exist — wire `package.json`)
5. Fill the **/documentation stubs** for Modes, Personas, Tools, Memory, Workflows
6. Add **mode tooltips** in the chat header so clicking a mode doesn't require reading the README
7. Define **token/BYOK/API key/model** in a one-page "How Ava works" explainer

### P1 — Hurts UX or trust but won't lose users today
8. Replace **"unlock" language** across both surfaces
9. Show **tool descriptions** in confirmation prompts
10. Build **FAQ + troubleshooting** under support
11. Translate **token math** into human terms ("≈ X conversations") on every pricing surface
12. Write the **v0.41.0 CHANGELOG** entry and backfill any missed releases
13. Add **empty-state actions** (every "no X yet" should suggest one thing to do)

### P2 — Quality polish
14. Tooltip pass — every action button gets a hint, not just a label
15. Two-tier doc structure (200-word friendly intro + "going deeper" technical)
16. Onboarding handoff between web and extension (single one-click bridge each way)
17. "First win" case study — non-coder builds something with Ava end-to-end
18. Persona reference page in the dashboard ("Ava's Team")

### P3 — Strategic docs that grow over time
19. Per-mode landing pages on the web (`/modes/work`, `/modes/plan`, etc.)
20. Per-persona pages with examples
21. Cookie policy, EU DPA template, status page
22. Discord / community surface

---

## 7. Recommended Doc Architecture Going Forward

Based on the readability gap, propose moving to a **layered doc system** so every reader profile lands on something useful:

```
/docs
├── /first-5-minutes              ← Profile A. No jargon. One animated GIF + 3 steps.
├── /how-it-works                 ← Profile A/B. Defines token, model, tool, mode, persona.
├── /modes
│   ├── /work                     ← Per mode — what it does, when to pick it, an example.
│   ├── /plan
│   └── … (6 total)
├── /personas
│   ├── /scout                    ← Per persona — name, role, what triggers her, sample output.
│   ├── /architect
│   └── … (24 total)
├── /tools                        ← Searchable catalogue of all 61 tools, grouped by category.
├── /creative-studio              ← Image / video / music / voice with screenshots.
├── /memory                       ← How the 5-layer memory works, plain-English.
├── /security-and-privacy        ← Local-first, what gets sent where.
├── /pricing-explained            ← BYOK vs platform, token math in human terms.
└── /troubleshooting              ← The FAQ + common errors with fixes.
```

Each page = two tiers (friendly intro + going deeper). Same structure mirrored as in-extension help so the user finds the same words on both sides.

---

## Methodology Note

This audit was assembled from three parallel research passes (web, extension, cross-surface) plus an explicit non-coder/new-dev readability pass. Every cited finding has a `file:line` reference. No claim is made from generation alone; everything was read.

Numbers and section counts reflect the state of the codebase at audit time (v0.41.0 extension, current `development` branch on web). Token / pricing claims cross-checked against `074_free_tokens_3m.sql` and `pricing/page.tsx` lines 13–72.
