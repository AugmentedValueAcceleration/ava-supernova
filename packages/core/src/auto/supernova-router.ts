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

/** Builder agent — TaskExecutor spawn for any session task. Terminal-Bench
 *  leader; production-tested in our existing personas; vision-aware so an
 *  attached screenshot doesn't need a re-route. */
export const SUPERNOVA_BUILDER_ID = 'qwen3.7-plus';

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

/** Intent gate — cheapest classifier in the roster. Same model Auto Mode uses
 *  upstream of spawn decisions. No reason to swap; Qwen Flash at $0.065 input
 *  is cheaper than DeepSeek Flash ($0.15) for this input-heavy workload. */
export const SUPERNOVA_INTENT_GATE_ID = 'qwen3.5-flash';

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
  // Builder dominates — Qwen 3.7 Plus is the Terminal-Bench leader and what
  // we've tuned the Builder persona against.
  coding:       { modelId: 'qwen3.7-plus',                reason: 'Qwen 3.7 Plus — Terminal-Bench leader, production-tested Builder',                  fallbackModelId: 'deepseek-flash' },
  // Vision input → Qwen 3.7 Plus (native vision + video).
  vision:       { modelId: 'qwen3.8-flash',               reason: 'Qwen 3.8 Flash — native vision + video, 1M context', fallbackModelId: 'qwen3.7-plus', requiresVision: true },
  // image_gen orchestrates a generate_image tool call to Wan —
  // no agentic depth needed at this layer. Flash is cheapest.
  image_gen:    { modelId: 'qwen3.5-flash',               reason: 'Qwen 3.5 Flash — orchestrates generate_image tool calls; depth not required at this layer', fallbackModelId: 'qwen3.7-plus' },
  // computer_use route retired alongside the Holo3 integration.
  // Planning is Architect + Researcher territory — Architect is Qwen 3.6
  // Plus per the map, but planning leans heavily on Researcher's
  // long-context synthesis, which is DeepSeek's strength. Architect gets
  // routed back to Qwen 3.7 Plus per persona below.
  planning:     { modelId: 'deepseek-flash',    reason: 'DeepSeek Flash — long-context planning + synthesis depth',                          fallbackModelId: 'qwen3.7-plus' },
  // Chat shares the coordinator's model. That used to be a downgrade to a
  // cheaper tier; now it is simply the same model, so a chat turn costs what
  // an orchestration turn costs per token and the fleet has no cheap-chat
  // tier left to fall to. 1M context, MIT open-weight, fast enough for
  // single-turn.
  chat:         { modelId: 'deepseek-flash',  reason: 'DeepSeek Flash — 1M-context chat on the fleet coordinator',              fallbackModelId: 'qwen3.7-plus' },
  // 1M-context grunt: DeepSeek shines (10% KV cache footprint at 1M).
  long_context: { modelId: 'deepseek-flash',    reason: 'DeepSeek Flash — 1M context with 10% KV cache footprint',                           fallbackModelId: 'qwen3.7-plus' },
  // Teach = Tutor + Curriculum Architect (both medium-depth) → DeepSeek's sweet spot.
  teach:        { modelId: 'deepseek-flash',  reason: 'DeepSeek Flash — mid-depth teaching at flash-tier cost',                          fallbackModelId: 'qwen3.7-plus', creationModelId: 'deepseek-flash' },
  // Security = CVE Researcher leads — depth 4 reasoning over attack surface.
  security:     { modelId: 'deepseek-flash',    reason: 'DeepSeek Flash — deep reasoning over attack surface',                               fallbackModelId: 'qwen3.7-plus' },
  // Brainstorm = ideation, not depth-bound reasoning. The old note here
  // preferred Flash over Pro Think-Max on cognitive shape — breadth beats
  // careful reasoning for ideation. There is no Think-Max tier to avoid any
  // more, so the preference is moot and DeepSeek is simply the fleet's
  // reasoning model. The fallback was briefly the SAME id as the primary —
  // when DeepSeek collapsed to one model there was nothing left to fall back
  // to inside the family, so an outage here degraded to nothing. It falls to
  // Qwen 3.8 Flash now, which is in-family for Supernova and a real second
  // option rather than a restatement of the first.
  brainstorm:   { modelId: 'deepseek-flash',  reason: 'DeepSeek Flash — breadth-first ideation at 1M context', fallbackModelId: 'qwen3.8-flash' },
};

// ── Per-persona override map ──────────────────────────────────────────────
//
// Used by Conductor when spawning specific personas. Persona is finer-grained
// than task category — a "planning" task might invoke Architect (Qwen 3.7 Plus)
// AND Researcher (DeepSeek Flash) within the same orchestration. Persona override
// wins over the category route when set.
//
// Keys match persona names from packages/core/src/personas/definitions.ts.

export const SUPERNOVA_PERSONA_MODEL: Record<string, string> = {
  // Heavy specialists — chosen per the locked routing map.
  architect:           'qwen3.7-plus',                  // vision-aware planning, MCP, production-tested
  builder:             'qwen3.7-plus',                  // Terminal-Bench leader, real agent loops
  curator:             'deepseek-flash',    // mid-tier reasoning, cost-effective
  researcher:          'deepseek-flash',      // long-context synthesis
  cve_researcher:      'deepseek-flash',      // deep reasoning over attack chain
  content_writer:      'qwen3.7-plus',                  // flagship long output — 3.5 Plus retired from primaries (operator, 2026-07-04)
  tutor:               'deepseek-flash',    // mid-depth, latency matters
  ideator:             'deepseek-flash',      // reasoning depth 5 — Think-Max territory

  // Light specialists — cheapest classifier where reasoning depth ≤ 2.
  scout:               'qwen3.5-flash',
  verifier:            'qwen3.5-flash',
  sequencer:           'qwen3.5-flash',
  challenger:          'qwen3.5-flash',
  integrator:          'qwen3.5-flash',

  // Mid-light specialists — reasoning depth 3. These sat on the cheaper
  // DeepSeek tier when there were two; they now sit on the same model as the
  // coordinator, so "mid-light" describes the work, not the price.
  code_reviewer:       'deepseek-flash',
  fact_checker:        'deepseek-flash',
  quiz_master:         'deepseek-flash',
  recon:               'deepseek-flash',
  scanner:             'deepseek-flash',
  security_verifier:   'deepseek-flash',
  security_reporter:   'deepseek-flash',
  curriculum_architect:'deepseek-flash',
  explorer:            'deepseek-flash',
  refiner:             'deepseek-flash',

  // Vision specialist — follows SUPERNOVA_VISION_ID onto Qwen 3.8 Flash:
  // same native image + video, newer generation, roughly a third the cost.
  design_reviewer:     'qwen3.8-flash',
};

/**
 * Resolve the right model id for a persona in Supernova mode. Falls back to
 * `defaultModelId` when the persona isn't in the map (a new persona shipped
 * without a Supernova route — graceful degrade rather than throw).
 */
export function resolveSupernovaPersonaModel(
  persona: string,
  defaultModelId: string,
): string {
  return SUPERNOVA_PERSONA_MODEL[persona.toLowerCase()] ?? defaultModelId;
}
