import type { TaskCategory } from './types.js';

/**
 * Supernova mode — polyglot routing.
 *
 * Auto Mode picks one coordinator model and runs the whole orchestration on
 * it. Supernova picks the best model for each role based on what each model
 * is actually best at:
 *
 *   - DeepSeek V4 Pro    — coordinator, deep reasoning, long-context synthesis
 *   - Qwen 3.6 Plus      — agent loops (Terminal-Bench leader), vision input,
 *                          MCP tool orchestration, production-tested
 *   - DeepSeek V4 Flash  — mid-tier review/verification, anomaly price/perf
 *   - Qwen 3.5 Plus      — cost-sensitive long-output writing
 *   - Qwen 3.5 Flash     — light filtering / classification (cheapest input)
 *   - Qwen 3.5 Omni Plus — vision + audio (the only audio-capable model)
 *
 * The table here is the operator-locked routing map — see the conversation
 * thread on 2026-04-25 where Auto stays as-is and Supernova ships in parallel.
 */

// ── Coordinator + special-case routes (highest priority) ──────────────────

/** The conductor that classifies tasks, picks specialists, runs the loop. */
export const SUPERNOVA_COORDINATOR_ID = 'deepseek-v4-pro-platform';

/** Builder agent — TaskExecutor spawn for any session task. Terminal-Bench
 *  leader; production-tested in our existing personas; vision-aware so an
 *  attached screenshot doesn't need a re-route. */
export const SUPERNOVA_BUILDER_ID = 'qwen3.6-plus';

/** Vision input override — any prompt with images bypasses persona / category
 *  routing and lands on Omni Plus. V4 has no vision via API. */
export const SUPERNOVA_VISION_ID = 'qwen3.5-omni-plus';

/** Intent gate — cheapest classifier in the roster. Same model Auto Mode uses
 *  upstream of spawn decisions. No reason to swap; Qwen Flash at $0.065 input
 *  is cheaper than V4 Flash for the input-heavy classification workload. */
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
}

export const SUPERNOVA_ROUTES: Record<TaskCategory, SupernovaRouteEntry> = {
  // Builder dominates — Qwen 3.6 Plus is the Terminal-Bench leader and what
  // we've tuned the Builder persona against.
  coding:       { modelId: 'qwen3.6-plus',                reason: 'Qwen 3.6 Plus — Terminal-Bench leader, production-tested Builder',                  fallbackModelId: 'deepseek-v4-flash-platform' },
  // Vision input → Omni only path.
  vision:       { modelId: 'qwen3.5-omni-plus',           reason: 'Qwen 3.5 Omni Plus — only vision-capable model in scope',                            fallbackModelId: 'qwen3.6-plus', requiresVision: true },
  // image_gen orchestrates a generate_image tool call to Wan / MiniMax —
  // no agentic depth needed at this layer. Omni Flash is materially cheaper
  // than 3.6 Plus and still vision-capable for the result handoff.
  image_gen:    { modelId: 'qwen3.5-omni-flash',          reason: 'Qwen 3.5 Omni Flash — orchestrates generate_image tool calls; depth not required at this layer', fallbackModelId: 'qwen3.5-omni-plus' },
  computer_use: { modelId: 'qwen3.6-plus',                reason: 'Qwen 3.6 Plus — vision-aware tool orchestration',                                    fallbackModelId: 'qwen3.5-omni-plus', requiresVision: true },
  // Planning is Architect + Researcher territory — Architect is Qwen 3.6
  // Plus per the map, but planning leans heavily on Researcher's
  // long-context synthesis where V4 Pro wins. Default to V4 Pro; Architect
  // gets routed back to Qwen 3.6 Plus per persona below.
  planning:     { modelId: 'deepseek-v4-pro-platform',    reason: 'DeepSeek V4 Pro — long-context planning + synthesis depth',                          fallbackModelId: 'qwen3.6-plus' },
  // Chat is a single-turn response — doesn't exercise V4 Pro's MoE
  // coordinator strengths (specialist dispatch, multi-step reasoning).
  // V4 Flash is the right tier: same DeepSeek family, 1M context, MIT
  // open-weight, 13B active params — fast and materially cheaper. V4
  // Pro stays reserved for the workloads where the coordinator pattern
  // actually pays off (planning, orchestration, security, brainstorm,
  // long_context).
  chat:         { modelId: 'deepseek-v4-flash-platform',  reason: 'DeepSeek V4 Flash — fast chat tier, V4 Pro reserved for orchestration',              fallbackModelId: 'qwen3.6-plus' },
  // 1M-context grunt: V4 Pro shines (10% KV cache footprint at 1M).
  long_context: { modelId: 'deepseek-v4-pro-platform',    reason: 'DeepSeek V4 Pro — 1M context with 10% KV cache footprint',                           fallbackModelId: 'qwen3.6-plus' },
  // Teach = Tutor + Curriculum Architect (both medium-depth) → V4 Flash sweet spot.
  teach:        { modelId: 'deepseek-v4-flash-platform',  reason: 'DeepSeek V4 Flash — mid-depth teaching at flash-tier cost',                          fallbackModelId: 'qwen3.6-plus' },
  // Security = CVE Researcher leads — depth 4 reasoning over attack surface.
  security:     { modelId: 'deepseek-v4-pro-platform',    reason: 'DeepSeek V4 Pro — deep reasoning over attack surface',                               fallbackModelId: 'qwen3.6-plus' },
  // Brainstorm = Ideator depth 5 → V4 Pro Think-Max.
  brainstorm:   { modelId: 'deepseek-v4-pro-platform',    reason: 'DeepSeek V4 Pro Think-Max — frontier reasoning depth for ideation',                  fallbackModelId: 'qwen3.6-plus' },
};

// ── Per-persona override map ──────────────────────────────────────────────
//
// Used by Conductor when spawning specific personas. Persona is finer-grained
// than task category — a "planning" task might invoke Architect (Qwen 3.6 Plus)
// AND Researcher (V4 Pro) within the same orchestration. Persona override
// wins over the category route when set.
//
// Keys match persona names from packages/core/src/personas/definitions.ts.

export const SUPERNOVA_PERSONA_MODEL: Record<string, string> = {
  // Heavy specialists — chosen per the locked routing map.
  architect:           'qwen3.6-plus',                  // vision-aware planning, MCP, production-tested
  builder:             'qwen3.6-plus',                  // Terminal-Bench leader, real agent loops
  curator:             'deepseek-v4-flash-platform',    // mid-tier reasoning, cost-effective
  researcher:          'deepseek-v4-pro-platform',      // long-context synthesis
  cve_researcher:      'deepseek-v4-pro-platform',      // deep reasoning over attack chain
  content_writer:      'qwen3.5-plus',                  // cost-sensitive long output
  tutor:               'deepseek-v4-flash-platform',    // mid-depth, latency matters
  ideator:             'deepseek-v4-pro-platform',      // reasoning depth 5 — Think-Max territory

  // Light specialists — cheapest classifier where reasoning depth ≤ 2.
  scout:               'qwen3.5-flash',
  verifier:            'qwen3.5-flash',
  sequencer:           'qwen3.5-flash',
  challenger:          'qwen3.5-flash',
  integrator:          'qwen3.5-flash',

  // Mid-light specialists — reasoning depth 3 → V4 Flash earns its 2× input cost.
  code_reviewer:       'deepseek-v4-flash-platform',
  fact_checker:        'deepseek-v4-flash-platform',
  quiz_master:         'deepseek-v4-flash-platform',
  recon:               'deepseek-v4-flash-platform',
  scanner:             'deepseek-v4-flash-platform',
  security_verifier:   'deepseek-v4-flash-platform',
  security_reporter:   'deepseek-v4-flash-platform',
  curriculum_architect:'deepseek-v4-flash-platform',
  explorer:            'deepseek-v4-flash-platform',
  refiner:             'deepseek-v4-flash-platform',

  // Vision specialist — locked to Omni regardless of where else V4 might win.
  design_reviewer:     'qwen3.5-omni-plus',
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
