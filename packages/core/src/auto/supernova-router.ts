import type { TaskCategory } from './types.js';

/**
 * Supernova mode — polyglot routing.
 *
 * Auto Mode picks one coordinator model and runs the whole orchestration on
 * it. Supernova picks the best model for each role based on what each model
 * is actually best at:
 *
 *   - DeepSeek Flash     — coordinator, deep reasoning, long-context synthesis,
 *                          AND the mid-tier review/verification seat. DeepSeek
 *                          collapsed its line into one model on 2026-09-10, so
 *                          every DeepSeek seat below is the same model at the
 *                          same price. The seats are still distinct roles; they
 *                          are no longer distinct tiers.
 *   - Qwen 3.7 Plus      — agent loops (Terminal-Bench leader), vision input,
 *                          MCP tool orchestration, production-tested
 *   - Qwen 3.5 Plus      — OUTAGE FALLBACK ONLY (retired from primary routes,
 *                          operator decision 2026-07-04)
 *   - Qwen 3.5 Flash     — light filtering / classification (cheapest input)
 *   - Qwen 3.5 Omni Plus — vision + audio (the only audio-capable model)
 *
 * The table here is the operator-locked routing map — see the conversation
 * thread on 2026-04-25 where Auto stays as-is and Supernova ships in parallel.
 */

// ── Coordinator + special-case routes (highest priority) ──────────────────

/** The conductor that classifies tasks, picks specialists, runs the loop. */
export const SUPERNOVA_COORDINATOR_ID = 'deepseek-flash';

/** Builder agent — TaskExecutor spawn for any session task. DeepSeek V4.1
 *  Flash (his call, 2 Nov 2026 — "not had anything it can't handle"): 74.2 on
 *  DeepSWE v1.1 by DeepSeek's figure, 74.34 in Fireworks' independent rerun.
 *  It was Qwen 3.7 Plus. Images still go to Qwen 3.8 Flash (vision route). */
export const SUPERNOVA_BUILDER_ID = 'deepseek-flash';

/** Vision input override — any prompt with images bypasses persona / category
 *  routing and lands on Qwen 3.8 Flash (native vision + video).
 *
 *  Two moves got this here. It used to be forced: DeepSeek was blind at the
 *  API level, so vision HAD to leave the family. That stopped being true when
 *  V4.1 Flash shipped multimodal, which turned it into a choice — and the
 *  choice stayed with Qwen because our vision paths are tuned against it and
 *  DeepSeek's vision is new and unproven here.
 *
 *  The 2026-09-10 fleet evaluation then moved it off 3.7 Plus. Qwen 3.8 Flash
 *  reads images AND video at roughly a third the cost, and this seat only ever
 *  looks at a picture — no agentic depth to regress. That made it the safest
 *  place to take the new model first, ahead of the Builder seat. */
export const SUPERNOVA_VISION_ID = 'qwen3.8-flash';

/** Intent gate — Qwen 3.7 Flash. Same model every fleet uses upstream of spawn
 *  decisions, so one model classifies for all of them. *
 *  MEASURED 2026-09-10, 280 calls per candidate through DashScope:
 *
 *                accuracy   p50     p95     p99      worst
 *    3.5 Flash   92.9%      538ms   672ms   847ms    1310ms
 *    3.7 Flash   99.6%      570ms   790ms   1284ms   1667ms
 *    3.8 Flash   96.8%      698ms   2532ms  27038ms  51700ms
 *
 *  3.7 Flash was parked since July on a REPORTED P99 above 90 seconds. It does
 *  not reproduce: 1284ms here. 3.8 Flash is out on its tail alone — 27s at p99
 *  in front of every turn is felt as the product hanging.
 *
 *  The 32ms it gives up at p50 buys 6.8 points of accuracy, and a miss here is
 *  not a worse answer — it spawns a whole specialist team for a question the
 *  coordinator should have taken alone. Re-run scripts/gate-bench.mjs before
 *  moving this again. */
export const SUPERNOVA_INTENT_GATE_ID = 'qwen3.7-flash';

// ── Per-task-category routing ─────────────────────────────────────────────
//
// Used by ModelRouter when mode='supernova'. Each task category maps to the
// model that the locked map routes its dominant persona to.

export interface SupernovaRouteEntry {
  modelId: string;
  reason: string;
  fallbackModelId?: string;
  requiresVision?: boolean;
  /** Used by `teach` — coordinator-tier model when curriculum is being created (depth='full'). */
  creationModelId?: string;
}

export const SUPERNOVA_ROUTES: Record<TaskCategory, SupernovaRouteEntry> = {
  // Coding on DeepSeek V4.1 Flash, the same model as the Builder seat (his
  // call, 2 Nov 2026); Qwen 3.7 Plus is the fallback.
  coding:       { modelId: 'deepseek-flash',              reason: 'DeepSeek V4.1 Flash — 74 on DeepSWE v1.1 (independently rerun), the Supernova Builder', fallbackModelId: 'qwen3.7-plus' },
  // Vision input → Qwen 3.8 Flash (native vision + video).
  vision:       { modelId: 'qwen3.8-flash',               reason: 'Qwen 3.8 Flash — native vision + video, 1M context', fallbackModelId: 'qwen3.7-plus', requiresVision: true },
  // image_gen orchestrates a generate_image tool call to Wan — no agentic
  // depth needed at this layer, but it should see a reference image.
  image_gen:    { modelId: 'qwen3.8-flash',               reason: 'Qwen 3.8 Flash — orchestrates generate_image tool calls and sees reference images', fallbackModelId: 'qwen3.7-plus' },
  // computer_use route retired alongside the Holo3 integration.
  // Planning is Architect + Researcher territory — Architect is Qwen 3.6
  // Plus per the map, but planning leans heavily on Researcher's
  // long-context synthesis, which is DeepSeek's strength. Architect gets
  // routed back to Qwen 3.7 Plus per persona below.
  planning:     { modelId: 'deepseek-flash',    reason: 'DeepSeek V4.1 Flash — long-context planning + synthesis depth',                          fallbackModelId: 'qwen3.7-plus' },
  // Chat shares the coordinator's model. That used to be a downgrade to a
  // cheaper tier; now it is simply the same model, so a chat turn costs what
  // an orchestration turn costs per token and the fleet has no cheap-chat
  // tier left to fall to. 1M context, MIT open-weight, fast enough for
  // single-turn.
  chat:         { modelId: 'deepseek-flash',  reason: 'DeepSeek V4.1 Flash — 1M-context chat on the fleet coordinator',              fallbackModelId: 'qwen3.7-plus' },
  // 1M-context grunt: DeepSeek shines (10% KV cache footprint at 1M).
  long_context: { modelId: 'deepseek-flash',    reason: 'DeepSeek V4.1 Flash — 1M context with 10% KV cache footprint',                           fallbackModelId: 'qwen3.7-plus' },
  // Teach = Tutor + Curriculum Architect (both medium-depth) → DeepSeek's sweet spot.
  teach:        { modelId: 'deepseek-flash',  reason: 'DeepSeek V4.1 Flash — mid-depth teaching at flash-tier cost',                          fallbackModelId: 'qwen3.7-plus', creationModelId: 'deepseek-flash' },
  // Security = CVE Researcher leads — depth 4 reasoning over attack surface.
  security:     { modelId: 'deepseek-flash',    reason: 'DeepSeek V4.1 Flash — deep reasoning over attack surface',                               fallbackModelId: 'qwen3.7-plus' },
  // Brainstorm = ideation, not depth-bound reasoning. The old note here
  // preferred Flash over Pro Think-Max on cognitive shape — breadth beats
  // careful reasoning for ideation. There is no Think-Max tier to avoid any
  // more, so the preference is moot and DeepSeek is simply the fleet's
  // reasoning model. The fallback was briefly the SAME id as the primary —
  // when DeepSeek collapsed to one model there was nothing left to fall back
  // to inside the family, so an outage here degraded to nothing. It falls to
  // Qwen 3.8 Flash now, which is in-family for Supernova and a real second
  // option rather than a restatement of the first.
  brainstorm:   { modelId: 'deepseek-flash',  reason: 'DeepSeek V4.1 Flash — breadth-first ideation at 1M context', fallbackModelId: 'qwen3.8-flash' },
};

// ── Personas ──────────────────────────────────────────────────────────────
//
// Supernova's personas run on the model their task is routed to. The teams
// only field for planning, security, brainstorm and teach, and all four route
// to DeepSeek V4.1 Flash, so every persona runs there (Qwen falls back: 3.7
// Plus, or 3.8 Flash for brainstorm). A per-persona map lived here from April and was never wired;
// it was deleted on 2 Nov 2026 because wiring it would have moved personas
// off DeepSeek, and its keys did not match the real persona ids.
