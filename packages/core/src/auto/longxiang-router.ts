import type { TaskCategory } from './types.js';

/**
 * Longxiang mode (龙翔, "soaring dragon") — open-weights routing.
 *
 * The fourth fleet. Where Supernova is the polyglot performance stack and
 * Aurora is the European sovereign stack, Longxiang is the *open-weights*
 * stack: every seat is a model whose weights are published under a licence
 * that permits commercial use, so a Longxiang deployment can in principle be
 * self-hosted end to end with no vendor in the loop.
 *
 *   - Kimi K3 (Moonshot)     — Coordinator AND Builder. The fleet's lead seat,
 *                              held by one model deliberately: K3 is the
 *                              strongest open coder available to us — 88.3
 *                              Terminal-Bench 2.1 and 81.2 FrontierSWE, ahead
 *                              of GLM-5.2 (81.0 / 74.4) — and it is also a
 *                              strong tool-driver, which is what the
 *                              coordinator seat actually needs. Modified MIT;
 *                              attribution only triggers at 100M MAU / $20M
 *                              monthly revenue.
 *   - Qwen 3.7 Plus (Alibaba)— Mid-tier builds, vision input, long context.
 *                              Native vision + video and 1M context, and the
 *                              model our Builder persona is already tuned
 *                              against on Supernova. Carries the work that
 *                              doesn't need K3 depth but does need eyes.
 *   - DeepSeek V4 Flash      — Intent gate + light personas + chat. MIT,
 *                              $0.14/$0.28, 1M context. The cheapest place in
 *                              the fleet to put volume.
 *
 * ── Access: exactly like the other fleets ─────────────────────────────────
 *
 * A signed-in plan runs Longxiang on credits; a BYOK user unlocks it once all
 * three keys (Moonshot + Qwen + DeepSeek) are present. Same rule as Maestro,
 * Supernova and Aurora — no special-casing.
 *
 * Cost note for the managed path: K3 is $3.00/$15.00, the priciest model we
 * serve, so it carries the table's largest credit multiplier (7.28 — derived
 * as exactly 2× Mistral Medium 3.5, which it doubles on both input and
 * output). That is genuine cost passed through, not margin.
 *
 * ── Open-weights claim: NOT yet fully true ────────────────────────────────
 *
 * The fleet's headline promise is "open weights end to end". As of
 * 2026-07-18 that is true of two of three seats:
 *
 *   - Kimi K3        — weights due 2026-07-27 (Modified MIT).      pending
 *   - DeepSeek V4 Flash — MIT, weights public.                     ✅
 *   - Qwen 3.7 Plus  — CLOSED. API-only, no public weights. Alibaba's
 *                      account manager has told us it is "gearing up to
 *                      open-source soon" with no date given.       ❌
 *
 * Do NOT publish the end-to-end claim until Qwen 3.7 Plus weights are
 * actually public — verify at source, not from vendor intent. If Qwen has
 * not opened by launch, the contingency is to swap the Base seat (and only
 * the Base seat) to GLM-5.2, which is MIT today. GLM is a capable code
 * *writer* but scores weakly on Tool-Decathlon, so it is a substitute for
 * Qwen's mid-tier build work, never for K3's coordinator/Builder seat.
 *
 * Fleet named 2026-07-17; trademark search for "Longxiang" (classes 9 + 42)
 * is still outstanding and must clear before the name goes public.
 */

// ── Launch flag ───────────────────────────────────────────────────────────

/**
 * Master switch for whether Longxiang is OFFERED to users.
 *
 * Deliberately a hand-flipped boolean and NOT a date check. Longxiang's
 * launch depends on two things outside our control, either of which can
 * slip past a calendar date:
 *
 *   1. Kimi K3 weights actually being published (expected 2026-07-27).
 *   2. The "Longxiang" trademark search clearing (classes 9 + 42).
 *
 * A date-based auto-flip would launch the fleet — and its open-weights
 * claim — on a day when neither may have happened. Flipping this by hand
 * means launch stays a decision someone makes after verifying, not a timer
 * that fires regardless.
 *
 * While false, the fleet is fully built and testable but is not listed in
 * any picker and cannot be selected via the CLI's /route. The routing
 * tables below stay live either way so the test suite can exercise them.
 *
 * Before flipping to true, verify AT SOURCE:
 *   - K3 weights are on Hugging Face (not just announced)
 *   - Qwen 3.7 Plus weights are public, OR the Base seat has been swapped
 *     to GLM-5.2 and the marketing copy no longer claims "open end to end"
 *   - The trademark search has come back clean
 */
export const LONGXIANG_ENABLED = true;

// ── Coordinator + special-case routes (highest priority) ──────────────────

/** The conductor that classifies tasks, picks specialists, runs the loop.
 *  K3 holds this seat on tool-driving strength as much as raw coding. */
export const LONGXIANG_COORDINATOR_ID = 'kimi-k3';

/** Builder agent — TaskExecutor spawn for any session task. Same model as the
 *  coordinator: K3 is the best open coder we have (88.3 Terminal-Bench 2.1,
 *  81.2 FrontierSWE), so there is nothing to gain by handing the build to a
 *  weaker seat. Front and centre by design. */
export const LONGXIANG_BUILDER_ID = 'kimi-k3';

/** Vision input override — Qwen 3.7 Plus, not K3. This is a COST call, not a
 *  capability one: K3 sees natively too (text+image+video), but at $3/$15 it
 *  is ~3x the mid-tier, and Qwen is the model our vision paths are already
 *  tuned against on Supernova. K3 remains a genuine vision fallback. */
export const LONGXIANG_VISION_ID = 'qwen3.7-plus';

/** Intent gate — the cheapest classifier in the fleet. V4 Flash at
 *  $0.14/$0.28 with 1M context; short routing calls don't need K3. */
export const LONGXIANG_INTENT_GATE_ID = 'deepseek-v4-flash';

// ── Per-task-category routing ─────────────────────────────────────────────
//
// Used by ModelRouter when mode='longxiang'. Each task category maps to the
// seat best suited to its dominant persona.

export interface LongxiangRouteEntry {
  modelId: string;
  reason: string;
  fallbackModelId?: string;
  requiresVision?: boolean;
  /** Used by `teach` — coordinator-tier model when curriculum is being created (depth='full'). */
  creationModelId?: string;
}

export const LONGXIANG_ROUTES: Record<TaskCategory, LongxiangRouteEntry> = {
  // ── Depth routes → K3 (the Peak) ──────────────────────────────────────
  // Builder territory. This is the seat the whole fleet is built around.
  coding:       { modelId: 'kimi-k3',           reason: 'Kimi K3 — 88.3 Terminal-Bench 2.1, 81.2 FrontierSWE; strongest open coder in the fleet', fallbackModelId: 'qwen3.7-plus' },
  // Planning leans on synthesis depth — K3 leads, Qwen carries the 1M ceiling.
  planning:     { modelId: 'kimi-k3',           reason: 'Kimi K3 — reasoning depth for plan synthesis and specialist dispatch',                   fallbackModelId: 'qwen3.7-plus' },
  // Security = CVE Researcher leads — deep reasoning over the attack surface.
  security:     { modelId: 'kimi-k3',           reason: 'Kimi K3 — deep reasoning over attack surface',                                           fallbackModelId: 'qwen3.7-plus' },

  // ── Vision + long-context → Qwen 3.7 Plus (the Base) ──────────────────
  // Both seats see natively; Qwen carries vision on cost, K3 is a real
  // fallback (not a degraded one) if Qwen is unreachable.
  vision:       { modelId: 'qwen3.7-plus',      reason: 'Qwen 3.7 Plus — native vision + video, 1M context, mid-tier cost',                       fallbackModelId: 'kimi-k3', requiresVision: true },
  // Both K3 and Qwen are long-context; route on cost — Qwen is the cheaper
  // place to push a large prompt, K3 is the depth ceiling.
  long_context: { modelId: 'qwen3.7-plus',      reason: 'Qwen 3.7 Plus — 1M context at mid-tier cost; K3 reserved for depth',                     fallbackModelId: 'kimi-k3' },
  // Teach = Tutor + Curriculum Architect, medium depth. Curriculum *creation*
  // upgrades to K3 — running the 5-persona prep team mid-tier goes shallow.
  teach:        { modelId: 'qwen3.7-plus',      reason: 'Qwen 3.7 Plus — long-form coherence for tutorials and lesson delivery',                  fallbackModelId: 'deepseek-v4-flash', creationModelId: 'kimi-k3' },

  // ── Volume routes → DeepSeek V4 Flash (the River) ─────────────────────
  // image_gen routes a generate_image tool call out to Qwen-Image — the model
  // here only orchestrates, so depth is wasted spend.
  image_gen:    { modelId: 'deepseek-v4-flash', reason: 'DeepSeek V4 Flash — orchestrates generate_image tool calls; depth not required at this layer', fallbackModelId: 'qwen3.7-plus' },
  // Chat is a single-turn response — doesn't exercise the coordinator pattern.
  chat:         { modelId: 'deepseek-v4-flash', reason: 'DeepSeek V4 Flash — fast, cheapest tier in the fleet for typical chat turns',            fallbackModelId: 'qwen3.7-plus' },
  // Brainstorm = breadth over depth — cheap and creatively wide beats careful.
  brainstorm:   { modelId: 'deepseek-v4-flash', reason: 'DeepSeek V4 Flash — breadth and speed for ideation at the fleet\'s lowest cost',          fallbackModelId: 'qwen3.7-plus' },
};

// ── Per-persona override map ──────────────────────────────────────────────
//
// Used when spawning specific personas. Persona is finer-grained than task
// category — a "planning" task might invoke Architect AND Researcher within
// the same orchestration. Persona override wins over the category route.
//
// Keys match persona names from packages/core/src/personas/definitions.ts.
//
// NOTE: as of writing, neither SUPERNOVA_PERSONA_MODEL nor AURORA_PERSONA_MODEL
// has a live consumer — the maps are declared ahead of the wiring. This one
// mirrors them deliberately so Longxiang doesn't become the odd fleet out when
// that wiring lands.

export const LONGXIANG_PERSONA_MODEL: Record<string, string> = {
  // Heavy specialists — the seats where K3's coding + reasoning lead pays.
  architect:           'kimi-k3',            // plan depth, tool-aware
  builder:             'kimi-k3',            // the coder — fleet's whole point
  researcher:          'kimi-k3',            // synthesis depth
  cve_researcher:      'kimi-k3',            // deep reasoning over attack chain
  ideator:             'kimi-k3',            // reasoning depth 5

  // Mid-tier — long output and anything that needs eyes.
  content_writer:      'qwen3.7-plus',       // flagship long-form coherence
  design_reviewer:     'qwen3.7-plus',       // sees images + video natively

  // Light + mid-light specialists — volume tier.
  scout:               'deepseek-v4-flash',
  verifier:            'deepseek-v4-flash',
  sequencer:           'deepseek-v4-flash',
  challenger:          'deepseek-v4-flash',
  integrator:          'deepseek-v4-flash',
  curator:             'deepseek-v4-flash',
  tutor:               'deepseek-v4-flash',  // mid-depth, latency matters
  code_reviewer:       'deepseek-v4-flash',
  fact_checker:        'deepseek-v4-flash',
  quiz_master:         'deepseek-v4-flash',
  recon:               'deepseek-v4-flash',
  scanner:             'deepseek-v4-flash',
  security_verifier:   'deepseek-v4-flash',
  security_reporter:   'deepseek-v4-flash',
  curriculum_architect:'deepseek-v4-flash',
  explorer:            'deepseek-v4-flash',
  refiner:             'deepseek-v4-flash',
};

/**
 * Resolve the right model id for a persona in Longxiang mode. Falls back to
 * `defaultModelId` when the persona isn't in the map (a new persona shipped
 * without a Longxiang route — graceful degrade rather than throw).
 */
export function resolveLongxiangPersonaModel(
  persona: string,
  defaultModelId: string,
): string {
  return LONGXIANG_PERSONA_MODEL[persona.toLowerCase()] ?? defaultModelId;
}
