import type { TaskCategory } from './types.js';

/**
 * Aurora mode — Mistral-only polyglot routing, three-tier fleet.
 *
 * The European-stack analogue of Supernova: same shape, different fleet.
 * Every route lands on a Mistral model so an Aurora deployment never
 * leaves European infrastructure — important for EU customers under
 * data-residency / GDPR / AI Act constraints who can't buy a US AI stack
 * and who want a sovereign full-stack option (model + agent + tooling).
 *
 *   - Mistral Large 3   — Coordinator + heavy specialists. Sparse MoE
 *                         41B active / 675B total. Frontier reasoning,
 *                         long-context synthesis, deepest specialists.
 *   - Mistral Medium 3.5 — Builder + mid-tier specialists + vision +
 *                         long-form. 128B dense, 256K context, vision
 *                         from-scratch encoder, modified-MIT open
 *                         weights, 77.6% SWE-Bench Verified. The "merged
 *                         flagship" — instruction + reasoning + coding
 *                         in one weight set. Designed for long-horizon
 *                         work; replaces Devstral 2 in Mistral's own
 *                         Vibe CLI.
 *   - Mistral Small 4   — Light tier / intent gate. Cheap-and-fast
 *                         classification work; cheap routing decisions
 *                         and tag the same model used to keep cache
 *                         locality on short calls.
 *
 * Three-tier upgrade vs the original two-tier Aurora (Large 3 + Small 4
 * across the board): Medium 3.5 takes most of the actual work — Builder
 * spawns, code review, fact check, security verifier, vision, long-form
 * writing. Large 3 keeps coordinator + the heavy reasoning bursts. Small
 * 4 stays only at the intent gate where its $0.15/$0.60 pricing earns
 * its keep on dozens of short routing calls per turn.
 *
 * Aurora is deliberately Mistral-only. If a Mistral model is unavailable,
 * the router returns null and surfaces an error rather than silently
 * cross-routing — that's the EU-stack guarantee. Users who want graceful
 * degradation pick Maestro or Supernova instead.
 *
 * Three-tier topology locked 2026-04-29 with the Medium 3.5 release.
 */

// ── Coordinator + special-case routes (highest priority) ──────────────────

/** The conductor that classifies tasks, picks specialists, runs the loop.
 *  Large 3 wins on reasoning depth and long-context synthesis — the same
 *  qualities that put V4 Pro in the Supernova coordinator slot. Stays
 *  Large 3 — Medium 3.5 is too new to swap into the coordinator slot
 *  without production soak. Reconsider in v0.58.0 once we have real-
 *  world Aurora telemetry. */
export const AURORA_COORDINATOR_ID = 'mistral-large-3';

/** Builder agent — TaskExecutor spawn for any session task. Medium 3.5
 *  is the highest-leverage upgrade in the Aurora fleet: 77.6% SWE-Bench
 *  Verified vs Small 4's modest coding score, plus 256K context, plus
 *  vision encoder from scratch. Replaces Small 4 here. */
export const AURORA_BUILDER_ID = 'mistral-medium-3.5';

/** Vision input override — Medium 3.5's from-scratch vision encoder
 *  handles variable image sizes / aspect ratios materially better than
 *  Pixtral merged into Small 4. Replaces Small 4 here. */
export const AURORA_VISION_ID = 'mistral-medium-3.5';

/** Intent gate — the cheapest Mistral model that can classify reliably.
 *  Stays on Small 4: $0.15/$0.60 input/output is hard to beat for short
 *  routing calls, and a 50-token classification doesn't need Medium's
 *  depth. Keeping Small 4 here protects per-turn cost from the Medium
 *  3.5 upgrade everywhere else. */
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
  // Builder dominates — Medium 3.5 carries the SWE-Bench Verified score
  // and 256K context. Fallback to Large 3 if Medium 3.5 is unavailable
  // (preserves capability ceiling) rather than dropping back to Small 4.
  coding:       { modelId: 'mistral-medium-3.5', reason: 'Mistral Medium 3.5 — 77.6% SWE-Bench Verified, 256K context, agentic-coding optimised',   fallbackModelId: 'mistral-large-3' },
  // Vision input → Medium 3.5's from-scratch encoder beats Pixtral merged.
  vision:       { modelId: 'mistral-medium-3.5', reason: 'Mistral Medium 3.5 — vision encoder trained from scratch for variable sizes',             fallbackModelId: 'mistral-large-3', requiresVision: true },
  // image_gen routes a generate_image tool call to Wan / MiniMax — the
  // Mistral model just orchestrates the tool, doesn't need agentic depth
  // here. Small 4 is materially cheaper + faster than Medium 3.5 with no
  // capability loss for this surface. Falls back to Medium 3.5 if Small 4
  // is unavailable so the orchestrator still has vision context.
  image_gen:    { modelId: 'mistral-small-4',    reason: 'Mistral Small 4 — orchestrates generate_image tool calls; depth not required at this layer', fallbackModelId: 'mistral-medium-3.5' },
  computer_use: { modelId: 'mistral-medium-3.5', reason: 'Mistral Medium 3.5 — vision + agentic tool orchestration, designed for long-horizon work',fallbackModelId: 'mistral-large-3', requiresVision: true },
  // Planning is Architect + Researcher territory. Large 3 stays —
  // long-context synthesis and depth-of-reasoning are coordinator work.
  planning:     { modelId: 'mistral-large-3',    reason: 'Mistral Large 3 — sparse MoE depth + long-context planning synthesis',                    fallbackModelId: 'mistral-medium-3.5' },
  // Chat = direct conversational response. Small 4's configurable
  // reasoning means it can match Large 3 quality on harder chats while
  // staying snappy on easy ones — and at $0.15/M input it's ~3× cheaper
  // than Large 3 and materially faster on first-token latency. Falls
  // back to Large 3 (not Medium 3.5) so the capability ceiling on hard
  // chats is preserved if Small 4 is unavailable.
  chat:         { modelId: 'mistral-small-4',    reason: 'Mistral Small 4 — configurable reasoning, multimodal, fast TTFT for typical chat turns', fallbackModelId: 'mistral-large-3' },
  // Long-context grunt: Large 3's MoE handles 1M-class context efficiently
  // (only 41B active per token). Medium 3.5 caps at 256K so it's the
  // fallback only when Large 3 is unavailable.
  long_context: { modelId: 'mistral-large-3',    reason: 'Mistral Large 3 — MoE efficiency at long context (41B active / 675B total)',              fallbackModelId: 'mistral-medium-3.5' },
  // Teach = Tutor + Curriculum Architect (mid-depth). Medium 3.5 is the
  // sweet spot now — coherent long-form output for tutorial generation
  // is exactly its lane.
  teach:        { modelId: 'mistral-medium-3.5', reason: 'Mistral Medium 3.5 — coherent long-form output for tutorials and lesson plans',           fallbackModelId: 'mistral-large-3' },
  // Security = CVE Researcher leads — depth-4 reasoning over attack surface.
  security:     { modelId: 'mistral-large-3',    reason: 'Mistral Large 3 — deep reasoning over attack surface',                                    fallbackModelId: 'mistral-medium-3.5' },
  // Brainstorm = Ideator depth 5. Large 3 reasoning depth gives the
  // Ideator persona the headroom it needs.
  brainstorm:   { modelId: 'mistral-large-3',    reason: 'Mistral Large 3 — frontier reasoning depth for ideation',                                 fallbackModelId: 'mistral-medium-3.5' },
};

// ── Per-persona override map ──────────────────────────────────────────────
//
// Used by Conductor when spawning specific personas. Persona is finer-grained
// than task category — a "planning" task might invoke Architect (Medium 3.5)
// AND Researcher (Large 3) within the same orchestration. Persona override
// wins over the category route when set.
//
// Keys match persona names from packages/core/src/personas/definitions.ts.
//
// Three-tier mapping after the 2026-04-29 Medium 3.5 integration:
//   - Heavy reasoning personas (Researcher, Challenger, CVE Researcher,
//     Ideator, Fact Checker) → Large 3
//   - Most working personas (Architect, Builder, Verifier, Sequencer,
//     Tutor, Curriculum Architect, etc.) → Medium 3.5
//   - Light routing personas (none currently — Small 4 stays at the
//     intent gate level, not personas)

export const AURORA_PERSONA_MODEL: Record<string, string> = {
  // Work mode personas
  architect:           'mistral-medium-3.5',  // vision-aware planning at the right depth
  researcher:          'mistral-large-3',     // long-context synthesis depth
  builder:             'mistral-medium-3.5',  // 77.6% SWE-Bench, 256K, vision
  verifier:            'mistral-medium-3.5',  // verification benefits from Medium's reasoning lift
  challenger:          'mistral-large-3',     // adversarial reasoning needs depth
  sequencer:           'mistral-medium-3.5',  // task ordering, mid-depth, agentic
  // Plan mode personas
  plan_researcher:     'mistral-large-3',
  plan_architect:      'mistral-medium-3.5',
  plan_challenger:     'mistral-large-3',
  // Teach mode personas
  curriculum_architect:'mistral-medium-3.5',
  content_writer:      'mistral-medium-3.5',  // long-form coherence is Medium's lane
  fact_checker:        'mistral-large-3',     // depth + accuracy
  quiz_master:         'mistral-medium-3.5',
  tutor:               'mistral-medium-3.5',
  // Security mode personas
  recon:               'mistral-medium-3.5',
  scanner:             'mistral-medium-3.5',
  cve_researcher:      'mistral-large-3',     // deep reasoning over attack surface
  security_verifier:   'mistral-large-3',
  reporter:            'mistral-medium-3.5',  // long-form report generation
  // Brainstorm mode personas
  explorer:            'mistral-medium-3.5',
  brainstorm_researcher:'mistral-large-3',
  ideator:             'mistral-large-3',     // depth 5
  brainstorm_challenger:'mistral-large-3',
  refiner:             'mistral-medium-3.5',
};
