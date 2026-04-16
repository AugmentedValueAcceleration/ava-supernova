# Desktop automation prototype — Phase 0 / Session 1

**Purpose**: validate the persona wave orchestration from the master spec (section 6) end-to-end with mock grounding, and measure actual token usage so we can firm up the cost model in section 8 before committing to the full build.

**Status**: prototype. Not shipped. Not registered as a tool or mode.

## What this prototype does

1. Runs a fake task: *"Open the GitHub notifications page and tell me the three newest ones."*
2. For each step (up to 5 max):
   - **Scout** gets a mocked `ScreenState` (from `mock-grounding.ts`), re-wraps it.
   - **Planner** proposes the next action.
   - **Actor** pretends to execute via `mock-executor.ts`.
   - **Verifier** inspects a mocked post-state and reports.
   - **Narrator** writes the user-facing line + audit entry.
3. Logs each persona's inputs, outputs, and token counts to `results/run-<timestamp>.json`.
4. Prints a summary at the end: tokens per persona, tokens per step, total, cost estimate.

## What this prototype does NOT do

- Does not touch a real screen. Grounding is mocked.
- Does not execute real clicks. The executor prints what it would do.
- Does not integrate with the UI. Output is terminal + JSON file.
- Does not cost money on the primary plan — configure a BYOK provider to keep the measurement runs off the 3M allowance.

## Running it

**Default path — uses your signed-in Ava account + the production coordinator (Qwen 3.6 Plus).** No env vars needed.

```bash
# One-off
pnpm --filter @ava/core build

# Run
pnpm --filter @ava/proto-desktop-mode run run
```

The harness reads your platform key from `~/.ava/config.json` (populated when you signed in to the extension / IDE / companion). Model and token usage match what desktop mode will cost in production.

**BYOK override** — useful for a second pass comparing how a smaller or larger model behaves:

```powershell
$env:AVA_PROTOTYPE_PROVIDER = "deepseek"      # or kimi / anthropic / mistral / zhipu
$env:AVA_PROTOTYPE_API_KEY  = "sk-..."
$env:AVA_PROTOTYPE_MODEL    = "deepseek-chat"  # optional, provider default used otherwise

pnpm --filter @ava/proto-desktop-mode run run
```

The harness calls the chosen provider five times per step, up to five steps. ~25 model calls total per run. On Qwen 3.6 Plus that's ~$0.15 per run at managed rates, which deducts from your account's token allowance. Compare against DeepSeek (~$0.02/run) or Claude Opus 4.6 (~$1.50/run) if you want to see how the numbers move across model sizes.

## Measurements we care about

After each run, the summary prints:

```
┌──────────┬─────────┬──────────┬─────────┐
│ Persona  │ In avg  │ Out avg  │ Total   │
├──────────┼─────────┼──────────┼─────────┤
│ Scout    │  2,847  │     412  │   3,259 │
│ Planner  │  1,998  │     896  │   2,894 │
│ Actor    │    981  │     284  │   1,265 │
│ Verifier │  2,036  │     503  │   2,539 │
│ Narrator │  1,102  │     267  │   1,369 │
└──────────┴─────────┴──────────┴─────────┘

Per step: ~11.3K tokens
Per task (5 steps): ~56.5K tokens
```

Compare against Spec 8's estimate of ~11.6K tokens per step. If we're off by more than 30%, revise Spec 8 before committing.

## Files

- `types.ts` — shared types: `ScreenState`, `ProposedAction`, `ExecutionResult`, `VerificationResult`, `UserUpdate`.
- `personas.ts` — five persona definitions, each with a concrete system prompt.
- `mock-grounding.ts` — fake ScreenStates for each step of the test task.
- `mock-executor.ts` — logs what the Actor would do, returns mock result.
- `orchestrator.ts` — the wave runner. Calls each persona in order per step.
- `run.ts` — harness. Wires provider, runs the trajectory, writes the results file, prints the summary.

## Next steps after this

1. Compare real numbers to Spec 8. Update the spec if needed.
2. Run at least three times with different providers (Qwen, DeepSeek, Claude Opus) to see how the numbers move with model size.
3. Move on to Session 2 — prototype B3 (Playwright subprocess on Windows).
