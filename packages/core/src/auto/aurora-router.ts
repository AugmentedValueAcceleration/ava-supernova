import type { TaskCategory } from './types.js';

/**
 * Aurora mode — Mistral-only polyglot routing.
 *
 * The European-stack analogue of Supernova: same shape, different fleet.
 * Every route lands on a Mistral model so an Aurora deployment never
 * leaves European infrastructure — important for EU customers under
 * data-residency / GDPR / AI Act constraints who can't buy a US AI stack
 * and who want a sovereign full-stack option (model + agent + tooling).
 *
 *   - Mistral Large 3   — coordinator, deep reasoning, long-context
 *                         synthesis. Sparse MoE 41B active / 675B total.
 *   - Mistral Small 4   — Builder spawn. Unified Magistral + Pixtral +
 *                         Devstral merge → vision-aware, agentic-coding
 *                         capable, frontier capability at $0.15/$0.60.
 *
 * Vision tasks stay on Small 4 (Pixtral capability is baked in) — no
 * hard switch to a separate vision model required, unlike Supernova
 * which routes vision to Qwen 3.5 Omni Plus.
 *
 * Aurora is deliberately Mistral-only. If a Mistral model is unavailable,
 * the router returns null and surfaces an error rather than silently
 * cross-routing — that's the EU-stack guarantee. Users who want graceful
 * degradation pick Maestro or Supernova instead.
 *
 * The table here is the operator-locked routing map per the design
 * conversation on 2026-04-28.
 */

// ── Coordinator + special-case routes (highest priority) ──────────────────

/** The conductor that classifies tasks, picks specialists, runs the loop.
 *  Large 3 wins on reasoning depth and long-context synthesis — the same
 *  qualities that put V4 Pro in the Supernova coordinator slot. */
export const AURORA_COORDINATOR_ID = 'mistral-large-3';

/** Builder agent — TaskExecutor spawn for any session task. Small 4
 *  carries Devstral's agentic-coding genealogy plus Pixtral vision in
 *  one model, at flash-tier pricing. The single most economical
 *  Builder spawn target Aurora has access to. */
export const AURORA_BUILDER_ID = 'mistral-small-4';

/** Vision input override — Aurora is unique in not needing one. Small 4
 *  is the Builder *and* the vision specialist (Pixtral merged in), so
 *  attaching an image doesn't force a model switch. Exposed as a
 *  constant for symmetry with Supernova's API surface; the value is
 *  the same model the Builder route already lands on. */
export const AURORA_VISION_ID = 'mistral-small-4';

/** Intent gate — the cheapest Mistral model that can also do agentic
 *  classification. Small 4 itself works at this scale; using one model
 *  for the gate + Builder gives a tighter cache-hit story than swapping
 *  models for a 50-token classification call. */
export const AURORA_INTENT_GATE_ID = 'mistral-small-4';

// ── Per-task-category routing ─────────────────────────────────────────────
//
// Used by ModelRouter when mode='aurora'. Each task category maps to the
// Mistral model best-suited to its dominant persona.

export interface AuroraRouteEntry {
  modelId: string;
  reason: string;
  fallbackModelId?: string;
  requiresVision?: boolean;
}

export const AURORA_ROUTES: Record<TaskCategory, AuroraRouteEntry> = {
  // Builder dominates — Small 4 absorbs Devstral's coding lineage and
  // handles vision without a switch. No fallback to non-Mistral; the
  // EU-stack guarantee is that Aurora stays Mistral-only.
  coding:       { modelId: 'mistral-small-4',  reason: 'Mistral Small 4 — Devstral lineage + vision-aware + flash-tier cost',           fallbackModelId: 'mistral-large-3' },
  // Vision input → Small 4 stays on (Pixtral baked in). Marked
  // requiresVision so the router validates capability before routing.
  vision:       { modelId: 'mistral-small-4',  reason: 'Mistral Small 4 — Pixtral vision capability merged into single model',          fallbackModelId: 'mistral-large-3', requiresVision: true },
  image_gen:    { modelId: 'mistral-small-4',  reason: 'Mistral Small 4 — handles generate_image tool calls with vision context',       fallbackModelId: 'mistral-large-3' },
  computer_use: { modelId: 'mistral-small-4',  reason: 'Mistral Small 4 — vision + agentic tool orchestration in one model',            fallbackModelId: 'mistral-large-3', requiresVision: true },
  // Planning is Architect + Researcher territory. Large 3 wins on
  // long-context synthesis and depth-of-reasoning — same qualities V4 Pro
  // has on the Supernova table.
  planning:     { modelId: 'mistral-large-3',  reason: 'Mistral Large 3 — sparse MoE depth + long-context planning synthesis',          fallbackModelId: 'mistral-small-4' },
  // Chat = direct response from coordinator. Large 3 handles directly
  // when not orchestrated; Small 4 is the warm fallback.
  chat:         { modelId: 'mistral-large-3',  reason: 'Mistral Large 3 — coordinator handles chat directly with frontier reasoning',   fallbackModelId: 'mistral-small-4' },
  // Long-context grunt: Large 3's MoE handles 1M-class context efficiently
  // (only 41B active per token).
  long_context: { modelId: 'mistral-large-3',  reason: 'Mistral Large 3 — MoE efficiency at long context (41B active / 675B total)',    fallbackModelId: 'mistral-small-4' },
  // Teach = Tutor + Curriculum Architect (mid-depth). Small 4 is the
  // sweet spot — configurable reasoning effort lets the persona dial up
  // depth when needed without flipping models.
  teach:        { modelId: 'mistral-small-4',  reason: 'Mistral Small 4 — configurable reasoning depth at flash-tier cost',             fallbackModelId: 'mistral-large-3' },
  // Security = CVE Researcher leads — depth 4 reasoning over attack surface.
  security:     { modelId: 'mistral-large-3',  reason: 'Mistral Large 3 — deep reasoning over attack surface',                          fallbackModelId: 'mistral-small-4' },
  // Brainstorm = Ideator depth 5. Large 3 reasoning depth gives the
  // Ideator persona the headroom it needs.
  brainstorm:   { modelId: 'mistral-large-3',  reason: 'Mistral Large 3 — frontier reasoning depth for ideation',                       fallbackModelId: 'mistral-small-4' },
};

// ── Per-persona override map ──────────────────────────────────────────────
//
// Used by Conductor when spawning specific personas. Persona is finer-grained
// than task category — a "planning" task might invoke Architect (Small 4)
// AND Researcher (Large 3) within the same orchestration. Persona override
// wins over the category route when set.
//
// Keys match persona names from packages/core/src/personas/definitions.ts.

export const AURORA_PERSONA_MODEL: Record<string, string> = {
  // Heavy specialists.
  architect:           'mistral-small-4',  // vision-aware planning, MCP, production-tested
  researcher:          'mistral-large-3',  // long-context synthesis depth
  builder:             'mistral-small-4',  // Devstral lineage + vision in one
  verifier:            'mistral-small-4',  // verification leans on tool-call reliability
  challenger:          'mistral-large-3',  // adversarial reasoning needs depth
  sequencer:           'mistral-small-4',  // task ordering, mid-depth
  // Plan mode personas
  plan_researcher:     'mistral-large-3',
  plan_architect:      'mistral-small-4',
  plan_challenger:     'mistral-large-3',
  // Teach mode personas
  curriculum_architect:'mistral-small-4',
  content_writer:      'mistral-small-4',
  fact_checker:        'mistral-large-3',  // depth + accuracy
  quiz_master:         'mistral-small-4',
  tutor:               'mistral-small-4',
  // Security mode personas
  recon:               'mistral-small-4',
  scanner:             'mistral-small-4',
  cve_researcher:      'mistral-large-3',  // deep reasoning over attack surface
  security_verifier:   'mistral-large-3',
  reporter:            'mistral-small-4',
  // Brainstorm mode personas
  explorer:            'mistral-small-4',
  brainstorm_researcher:'mistral-large-3',
  ideator:             'mistral-large-3',  // depth 5
  brainstorm_challenger:'mistral-large-3',
  refiner:             'mistral-small-4',
};
