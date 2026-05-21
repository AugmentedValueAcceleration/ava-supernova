# Command Palette — Implementation Plan

Status: **APPROVED — in build.**
Date: 2026-05-19

### Build progress
- ✅ Extension host — `palette_intent` message type, directive builder
  (`src/webview/palette-directives.ts`), `handlePaletteIntent` handler,
  `displayText` split on `handleUserMessage`. Remap + dispatch wired.
- ✅ dashboard-ui — `CommandPalette.tsx`, `InputArea` button + panel, Chat.tsx
  wiring, i18n keys. `typecheck:all` passes clean (host + both webviews).
- ✅ Extension built (`pnpm build`) and dashboard-ui palette verified working
  on the dev host by the operator.
- ✅ IDE mirror — `lib/palette-directives.ts` (duplicated, with `PaletteAction`
  type + `filterPaletteActions` helper), i18n `paletteStrings`, palette
  state + slash-detection + keyboard nav + dropdown JSX + `/` icon, all
  inlined into `DashboardPages.tsx`. `tsc --noEmit` passes clean.
- ✅ Generators credit-gated — `requiresConfirmation: true` on
  `generate_image/music/video/voice`. Ava can offer or be asked; the tool
  cannot fire until the operator clicks Allow.
- ✅ Dropdown + `/` slash trigger landed on both surfaces (dashboard-ui via
  `CommandPalette.tsx`, IDE inline). Typing `/` opens; text after the slash
  filters; ↑/↓ navigate, Enter selects, Esc closes.
- ⏳ webview-ui (legacy sidebar chat) — pending a scope decision: the operator
  did not recognise this surface; it is legacy. Decide whether it gets the
  palette before building it.

---

## 1. Goal

Add a button-style command palette to the chat input — a slide-up panel
modelled on the existing **Secret Vault** — that lets the user *explicitly*
trigger Ava's user-aid tools (Task, Journal, Creative, Support, Memory,
Learning) instead of relying on Ava to infer that intent from free
conversation.

This is a refinement of how existing capability is reached, not a new
capability. Every tool below already exists and ships today.

## 2. Why

Today Ava carries the full burden of detecting intent on every turn — "is
this a task? a support message? a creative request?" — *while* doing the
actual work. That split attention is unreliable (misses real requests,
fires on non-requests) and it degrades the primary output.

An explicit button removes the guessing. The benefits, in order of weight:

1. **Reliability** — explicit signal, zero misfires.
2. **Discoverability** — the palette advertises what Ava can do for the user.
3. **Determinism** — once intent is explicit, the tool is a known slot-fill:
   Ava gathers the fields she can't infer, pre-fills the rest, executes.

Net effect: for palette-initiated actions Ava skips classification entirely
and spends the turn on slot-gathering and good output.

**This is additive.** The conversational path ("Ava, remind me to…") is
untouched, and Ava's proactive offers stay. The palette is a second door for
users who already know what they want.

## 3. Mechanism — button → pre-classified intent → Ava

- New webview→host message: `palette_intent` with `{ tool, action }`.
- The host handler builds a **structured directive** and starts a turn via
  the existing `handleUserMessage` path. There is already precedent for
  synthetic injected turns in that path (`'continue'`, `'[pause]'`), so this
  fits the existing architecture cleanly — no agent-core changes.
- The directive tells Ava: intent is confirmed (do **not** ask "do you want
  a task?"), here is the tool and its required fields, gather only what you
  can't infer from context, pre-fill the rest, then call the tool.
- Ava runs her normal turn from there — gathers slots conversationally and
  calls the tool through the existing confirmation flow.

## 4. UI

Mirror `dashboard-ui/src/chat/components/SecretVault.tsx`:

- Slide-up panel — `absolute`, `bottom: 100%`, `vault-slide-up` animation,
  purple theme, Escape-to-close.
- New trigger button in `InputArea.tsx`, in the right-hand action row next
  to the Vault button. New `paletteOpen` state, same pattern as `vaultOpen`.
- Panel content: categorised columns. Each column is a **title header** with
  its action buttons stacked vertically beneath it. Most columns have one
  button; Creative has four (Image / Music / Video / Voice).

## 5. The six columns

Field lists below are verified against the tool schemas in
`packages/core/src/tools/`.

| Column   | Button(s)                       | Tool                       | Required slots             |
|----------|---------------------------------|----------------------------|----------------------------|
| Task     | New task                        | `task_manage` (create)     | title                      |
| Journal  | New entry                       | `journal_write` (write_user)| content                    |
| Creative | Image · Music · Video · Voice   | `generate_*`               | prompt — exact schema confirmed at build |
| Support  | Contact support                 | `support_request`          | email, message, category   |
| Memory   | Remember this                   | `memory_save`              | scope, content             |
| Learning | New learning path               | `learning_create` (via assess) | subject, level, goal   |

## 6. Per-tool directive (example — Task)

> [Palette action] The user explicitly requested: **create a task**. Intent
> is confirmed — do not ask whether they want a task. Use `task_manage` with
> `action=create`. Required field: `title`. Ask for the title if it is not
> obvious from recent context. Default `priority=medium`, infer `category`
> from context, `due_date=today` unless the user states otherwise. Confirm
> the details once, then create.

One directive per column/action, written to match each tool's real schema.

**Every palette action confirms before committing.** The button speeds up
*intent* — it never turns into silent action. Ava double-checks the details
with the user before the tool runs (e.g. for Memory she confirms `project` vs
`global` scope), keeping both sides on the same page.

## 7. Surfaces

- `packages/extension/dashboard-ui` — primary modern InputArea. **Build target 1.**
- `packages/ide` — Tauri chat input bar (`DashboardPages.tsx`). Must mirror.
- `packages/extension/webview-ui` — legacy chat-only InputArea.
  **OPEN QUESTION (see §9).**

## 8. Out of scope

- Conversational triggering — untouched.
- File / git / shell / agentic tools — never in the palette.
- No changes to the tool schemas themselves.

## 9. Decisions

**Settled:**

- **Layout** — each column is a title header with its action buttons stacked
  vertically beneath it. Most columns have one button; Creative has four
  (Image / Music / Video / Voice).
- **Memory scope** — "Remember this" defaults to `project`, but Ava
  double-checks the scope with the user before saving.
- **Confirmation** — every palette action confirms details with the user
  before committing. The trigger speeds up intent, never silent action.
- **Timing** — ships in **1.0.0**.

- **Surfaces** — the palette appears on *every* Ava chat input, so behaviour
  is identical everywhere the user can talk to Ava. Confirming the exact set
  of input-bar files (extension chat webview(s) + IDE chat input) is a build
  task, not a product decision.

All decisions are settled — plan is ready for sign-off.

## 10. Addendum — Health Plans tool (queued for evening of 2026-05-20)

### What exists today

- **Data model** is fully defined in `dashboard-message-types.ts` (lines 759–842): `HealthPlan` / `HealthPlanDay` / `HealthPlanExercise` / `HealthPlanMeal`, with `HealthPlanType = 'fitness' | 'meal' | 'combined'` and **`HealthPlanSource = 'manual' | 'ava'`** — the `'ava'` source value is already reserved, waiting on the tool.
- **UI** lives in [`HealthPlans.tsx`](packages/extension/dashboard-ui/src/pages/HealthPlans.tsx) — Calendar + Programs tabs, with a "+ New plan" wizard overlay (`PlanSetup`) that picks **type** (fitness / meal / combined) and **duration** (presets: 1 / 7 / 28 / 56 / 84 days), then a builder that fills days from the recipe + exercise catalog.
- **Persistence** is VS Code `globalState` only — `ava.healthPlan.${id}` per plan plus `ava.planIndex` for the summary list. Full host-side CRUD already in [`DashboardPanel.ts`](packages/extension/src/webview/DashboardPanel.ts) (lines 4212–4270): `saveHealthPlan`, `getHealthPlan`, `getHealthPlanIndex`, `deleteHealthPlan`. Save-as-active auto-archives any other active plan.
- **Catalogs** come from the web API: `/api/health/exercises`, `/api/health/recipes`.

### What's missing — the gap Ava needs

**There is no core tool for health plans.** No file under `packages/core/src/tools/health*`, no `healthPlanManager` in `sharedState`. The `'ava'` source value is unused. Ava can't currently create a plan.

### Proposed tool design (mirrors the `learning_create` + `learning_teach(write_content)` skeleton-first pattern)

Two tools rather than one mega-call, because a 28-day combined plan is too big to fit in a single tool argument cleanly:

1. **`health_plan_create`** — creates the skeleton.
   - Required: `type` (`'fitness' | 'meal' | 'combined'`), `title`, `duration_days` (1/7/28/56/84).
   - Optional: `goal` (free text).
   - Sets `source: 'ava'`, `status: 'draft'`, `schema_version: 1`, builds empty `days[0..duration_days]`.
   - Returns: `plan_id`.
   - `requiresConfirmation: true` (writes to operator state).

2. **`health_plan_update_day`** — fills or updates one day. Lets Ava iterate without one giant call.
   - Required: `plan_id`, `day_index`.
   - Updates: `kind` (`'training' | 'rest' | 'active_recovery'`), `title`, `training[]`, `meals[]`, `notes`.
   - `requiresConfirmation: false` (per-day edits on an already-confirmed plan would otherwise spam the operator).

3. *(Optional)* **`health_plan_activate`** — `status: 'active'`, sets `start_date`. Could also be left to the UI for now.

### Storage shape

Add `healthPlanStore` to `ToolExecutionContext.sharedState` — a small interface (`list / get / save / delete`) implemented by the host against `globalState`. Mirrors how `taskManager` / `journalManager` / `memoryManager` are injected today.

### Palette integration

Add a **new "Plans" column** to `ALL_PALETTE_ACTIONS` (both surfaces — dashboard-ui CommandPalette.tsx and IDE inline). Mirror Creative's multi-button shape:

| Column | Buttons |
|---|---|
| Plans | Meal plan · Fitness plan · Combined plan |

Each button pre-classifies the `type`, so Ava only has to ask for `title` + `duration` + (optional) `goal`, then create.

### Directive copy (extension + IDE `palette-directives.ts`)

Add three cases — `plans.meal`, `plans.fitness`, `plans.combined`. Each tells Ava: intent + type confirmed, use `health_plan_create` with the locked type, ask the user for a clear title and a duration (offer 1 / 7 / 28 / 56 / 84 as presets), capture an optional goal, then create. Optionally follow up with `health_plan_update_day` calls if the user wants Ava to fill the days now vs. open the builder UI.

### Locked decisions (2026-05-20 evening)

1. **Palette shape — three buttons under a new "Plans" column: Meal · Fitness · Combined.** Mirrors the type picker in the manual `PlanSetup` wizard. Ava walks the same sequence the wizard does — type pre-classified by the button, then asks duration, then title / goal, then optionally days.
2. **Ava fills the plan.** Skeleton-only was scrapped — the whole point is that Ava produces a filled plan, not an empty scaffold. `health_plan_create` accepts an optional `days[]` argument: small plans (1 / 7 day) get filled in a single call; longer plans (28 / 56 / 84 day) use `health_plan_create` for the shell then a self-loop of `health_plan_update_day` per day to keep individual calls bounded. Ava picks the mechanism based on size.
3. **Local-first storage** — same posture as the rest of the platform: data lives in local storage by default, with optional cloud sync via the account / Sync tab. Operator already wired sync when manual plan adding shipped; verify in place before depending on it. The tool reaches storage via a `healthPlanStore` interface in `sharedState`, implemented per surface (extension → VS Code `globalState`; IDE → its own local store).
4. **No default status.** `status` is a required field on `health_plan_create`. Ava asks the operator explicitly once the plan is ready ("Save as draft, or start it today?") and passes the answered value. The user already knows what they want when they trigger the action — Ava doesn't get to assume.
5. **One-active-only behaviour stays as-is**, but Ava names the plan that would be archived as part of the same status question when the user picks "start it today." Auto-archive never fires silently from an Ava-driven save.

### Build sequence (locked — execute tonight)

1. Verify the existing local-first plan sync wiring is in place (operator confirmed but check before depending on it).
2. `HealthPlanStore` interface in core + host implementation wiring (extension globalState; IDE local store).
3. `health_plan_create` (with optional `days[]`) + `health_plan_update_day` tool classes in core; `requiresConfirmation: true` on create.
4. Register both tools in the tool registry.
5. Add palette actions + directives — three buttons under a new "Plans" column on both surfaces (dashboard-ui CommandPalette.tsx + IDE inline).
6. i18n keys: `palette.col.plans`, `palette.plans.meal / .fitness / .combined`.
7. Typecheck + build extension; mirror to IDE; hand over for testing.

### Corrective addendum — Catalogue integration (2026-05-20 evening, awaiting sign-off)

The first pass shipped without catalogue linkage — `normaliseExercise` and `normaliseMeal` hard-coded `ref: null`, no search tool existed for Ava to find catalogue slugs, and the directive didn't instruct catalogue-first behaviour. Plans created via Ava are therefore weaker than plans created via the manual `PlanBuilder` (no nutrition derivation, no technique guides, no demos). The manual flow already wires the full catalogue path via `/api/health/exercises` and `/api/health/recipes` and the `plan_exercises_searched` / `plan_recipes_searched` message protocol. The fix re-uses that path rather than building anything parallel.

**Remove (already in code — needs change):**
- `core/src/tools/health-plan-create.ts` — `normaliseExercise` + `normaliseMeal`: drop `ref: null` hardcode; accept optional `ref.slug` from tool args and set `ref: { kind, slug }`.
- `core/src/tools/health-plan-create.ts` — schema: add `training[].ref.slug` and `meals[].ref.slug` fields to the `days[]` entries.
- `core/src/tools/health-plan-update-day.ts` — same schema additions; normaliser fix carries through automatically.
- `extension/src/webview/palette-directives.ts` + `ide/src/lib/palette-directives.ts` — rewrite `makeHealthPlanDirective`: instruct catalogue-search-first, then create with slugs, only fall back to free-text when nothing fits.

**Add (new code):**
- `core/src/tools/health-catalogue-search.ts` — new tool. Schema: `kind` (`'exercise' | 'recipe'`), `query`, optional `category`, optional `limit` (default 10). Calls `/api/health/exercises?search=…` or `/api/health/recipes?search=…` (anon-read, public). Returns summary rows `{ slug, name, category, level/course, ... }`.
- Register in `core/src/tools/tool-registry.ts`.

**Stays unchanged (architecturally correct from the first pass):**
- `HealthPlanStore` interface + both impls (`ExtensionHealthPlanStore`, `NodeHealthPlanStore`) — they write to the same storage paths the manual flow uses.
- AvaViewProvider + IDE sidecar sharedState wiring.
- Palette button / dropdown UI / i18n keys.
- The `health_plan_create` + `health_plan_update_day` save flow.

**Deferred:** `health_catalogue_detail` for full recipe nutrition / exercise routine. Not needed for the corrected flow — UI's `mealMacros` derives nutrition live from `ref.slug` + `servings`, and Ava can set sensible sets/reps from her own training knowledge. Add later if catalogue-aware defaults turn out to matter.

## 11. Build sequence (after sign-off)

1. `palette_intent` message type + host directive builder + handler.
2. `CommandPalette.tsx` component (mirrors `SecretVault.tsx`) — dashboard-ui.
3. Wire the trigger button into the dashboard-ui `InputArea`.
4. Per-tool directive copy.
5. Mirror to the IDE chat input.
6. webview-ui (only if in scope per §9.1).
7. i18n keys for column/button labels across all locales.
8. Test each column end-to-end on the dev host.
