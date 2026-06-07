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
 *   - Mistral Medium 3.5 — Coordinator + deep specialists + Builder + vision.
 *                         Mistral's frontier flagship: 128B dense, 256K, from-
 *                         scratch vision encoder, configurable reasoning,
 *                         77.6% SWE-Bench Verified, Artificial Analysis
 *                         Intelligence Index 39 (#2 of 61). The best Mistral
 *                         model — so it holds the lead seat.
 *   - Mistral Small 4   — High-volume workhorse + intent gate. 119B, 256K,
 *                         configurable reasoning, vision. Index 28 and just
 *                         $0.15/$0.60 — cheaper AND smarter than Large 3.
 *                         Carries chat, image-gen orchestration, long-context
 *                         grunt, brainstorm, and the light specialists.
 *   - Mistral Large 3   — Heavy reserve / fallback only. 675B/41B MoE, 256K,
 *                         Apache-2.0, multimodal — the broadest-knowledge,
 *                         most-permissive sovereign self-host option. But
 *                         *non-reasoning* (Index 23), so it holds no primary
 *                         route; it's the heavy fallback and the natural re-
 *                         promotion target when its reasoning variant ships.
 *
 * Frontier-leads topology (Medium 3.5 → Small 4 → Large-3-reserve): the old
 * config inverted this, running the weakest non-reasoning model (Large 3) in
 * the coordinator seat with the frontier model parked mid-tier. This puts the
 * best model where it matters and lets the cheap-but-capable Small 4 carry
 * volume — quality up, cost roughly flat.
 *
 * Aurora is deliberately Mistral-only. If a Mistral model is unavailable,
 * the router returns null and surfaces an error rather than silently
 * cross-routing — that's the EU-stack guarantee. Users who want graceful
 * degradation pick Maestro or Supernova instead.
 *
 * Re-tiered 2026-06-XX once Artificial Analysis confirmed Medium 3.5 (39) and
 * Small 4 (28) both out-score Large 3 (23).
 */

// ── Coordinator + special-case routes (highest priority) ──────────────────

/** The conductor that classifies tasks, picks specialists, runs the loop —
 *  the highest-leverage seat in the fleet. Medium 3.5 is Mistral's frontier
 *  flagship (Intelligence Index 39, reasoning-capable) and decisively
 *  out-classes Large 3 (23, non-reasoning), so it takes the coordinator.
 *  Large 3 stays wired as the heavy fallback for availability + its 675B
 *  breadth, and is the natural re-promotion target if/when its reasoning
 *  variant ships. */
export const AURORA_COORDINATOR_ID = 'mistral-medium-3.5';

/** Builder agent — TaskExecutor spawn for any session task. Medium 3.5:
 *  77.6% SWE-Bench Verified, 256K context, from-scratch vision encoder. */
export const AURORA_BUILDER_ID = 'mistral-medium-3.5';

/** Vision input override — Medium 3.5's from-scratch vision encoder handles
 *  variable image sizes / aspect ratios best in the fleet. */
export const AURORA_VISION_ID = 'mistral-medium-3.5';

/** Intent gate — Small 4 at $0.15/$0.60 is hard to beat for short routing
 *  calls, and it's smarter than Large 3 (Index 28 vs 23) for the rare hard
 *  classification. The high-volume workhorse anchor. */
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
  /** Used by `teach` — coordinator-tier model when curriculum is being created (depth='full'). */
  creationModelId?: string;
}

export const AURORA_ROUTES: Record<TaskCategory, AuroraRouteEntry> = {
  // ── Hard / deep routes → Medium 3.5 (frontier), Large 3 as heavy reserve ──
  // Builder territory — Medium 3.5 carries SWE-Bench + 256K + vision.
  coding:       { modelId: 'mistral-medium-3.5', reason: 'Mistral Medium 3.5 — 77.6% SWE-Bench Verified, 256K context, agentic-coding optimised',   fallbackModelId: 'mistral-large-3' },
  // Vision input → Medium 3.5's from-scratch encoder beats Pixtral merged.
  vision:       { modelId: 'mistral-medium-3.5', reason: 'Mistral Medium 3.5 — vision encoder trained from scratch for variable sizes',             fallbackModelId: 'mistral-large-3', requiresVision: true },
  // Planning is Architect + Researcher depth — now the frontier model.
  planning:     { modelId: 'mistral-medium-3.5', reason: 'Mistral Medium 3.5 — frontier reasoning for plan synthesis (Index 39 vs Large 3 23)',     fallbackModelId: 'mistral-large-3' },
  // Security = CVE Researcher leads — deep reasoning over attack surface.
  security:     { modelId: 'mistral-medium-3.5', reason: 'Mistral Medium 3.5 — frontier reasoning over the attack surface',                          fallbackModelId: 'mistral-large-3' },
  // Teach = Tutor + Curriculum Architect — coherent long-form is its lane.
  // Curriculum *creation* also stays on Medium 3.5 (the top model now).
  teach:        { modelId: 'mistral-medium-3.5', reason: 'Mistral Medium 3.5 — coherent long-form output for tutorials and lesson plans',           fallbackModelId: 'mistral-large-3', creationModelId: 'mistral-medium-3.5' },

  // ── High-volume routes → Small 4 (cheap + capable), Medium 3.5 ceiling ──
  // image_gen routes a generate_image tool call to Wan / MiniMax — the
  // Mistral model just orchestrates; depth not required, Small 4 is cheapest.
  image_gen:    { modelId: 'mistral-small-4',    reason: 'Mistral Small 4 — orchestrates generate_image tool calls; depth not required at this layer', fallbackModelId: 'mistral-medium-3.5' },
  // computer_use route retired alongside the Holo3 integration.
  // Chat = direct conversational response. Small 4: configurable reasoning,
  // multimodal, fast TTFT, cheapest input in the fleet. Medium 3.5 ceiling
  // for hard chats.
  chat:         { modelId: 'mistral-small-4',    reason: 'Mistral Small 4 — configurable reasoning, multimodal, fast TTFT for typical chat turns', fallbackModelId: 'mistral-medium-3.5' },
  // Long-context grunt: both models are 256K, so route on cost+capability —
  // Small 4's $0.15/M input is the cheapest place to push large prompts, and
  // it out-indexes Large 3. Medium 3.5 is the depth fallback.
  long_context: { modelId: 'mistral-small-4',    reason: 'Mistral Small 4 — 256K context at the fleet\'s cheapest input; smarter than Large 3',     fallbackModelId: 'mistral-medium-3.5' },
  // Brainstorm = breadth over depth — Small 4 is fast, cheap, and creatively
  // wide for ideation; Medium 3.5 ceiling when a session needs real depth.
  brainstorm:   { modelId: 'mistral-small-4',    reason: 'Mistral Small 4 — breadth and speed for ideation at workhorse cost',                       fallbackModelId: 'mistral-medium-3.5' },
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
// Re-tiered for the frontier-leads fleet:
//   - Deep reasoning + core-deliverable personas → Medium 3.5 (Index 39).
//     These were on Large 3 (Index 23) — the worst seat in the old config;
//     promoting them to the frontier model is the biggest quality win.
//   - Supporting / light / breadth personas → Small 4 (Index 28, $0.15/$0.60).
//     These were on the pricier Medium 3.5; the workhorse covers them cheaper.
//   - Large 3 holds no primary persona — it's the heavy fallback / reserve.

export const AURORA_PERSONA_MODEL: Record<string, string> = {
  // Work mode — depth + the build deliverable on Medium 3.5; ordering/checks on Small 4
  architect:           'mistral-medium-3.5',  // planning depth, vision-aware
  researcher:          'mistral-medium-3.5',  // ↑ from Large 3 — synthesis is frontier work
  builder:             'mistral-medium-3.5',  // 77.6% SWE-Bench, 256K, vision
  verifier:            'mistral-small-4',      // ↓ verification is a check — workhorse
  challenger:          'mistral-medium-3.5',  // ↑ adversarial reasoning needs the frontier
  sequencer:           'mistral-small-4',      // ↓ task ordering, light
  // Plan mode personas
  plan_researcher:     'mistral-medium-3.5',  // ↑ from Large 3
  plan_architect:      'mistral-medium-3.5',
  plan_challenger:     'mistral-medium-3.5',  // ↑ from Large 3
  // Teach mode — the taught content on Medium 3.5; quiz gen on Small 4
  curriculum_architect:'mistral-medium-3.5',
  content_writer:      'mistral-medium-3.5',  // long-form coherence
  fact_checker:        'mistral-medium-3.5',  // ↑ accuracy needs the frontier model
  quiz_master:         'mistral-small-4',      // ↓ quiz generation, light
  tutor:               'mistral-medium-3.5',  // teaching quality
  // Security mode — the deep reasoning on Medium 3.5; recon/scan/report on Small 4
  recon:               'mistral-small-4',      // ↓ surface mapping, light
  scanner:             'mistral-small-4',      // ↓ systematic scanning, volume
  cve_researcher:      'mistral-medium-3.5',  // ↑ deep reasoning over attack surface
  security_verifier:   'mistral-medium-3.5',  // ↑ exploitability reasoning
  reporter:            'mistral-small-4',      // ↓ assembles verified findings
  // Brainstorm mode — breadth over depth, all on the cheap-and-wide workhorse
  explorer:            'mistral-small-4',
  brainstorm_researcher:'mistral-small-4',
  ideator:             'mistral-small-4',
  brainstorm_challenger:'mistral-small-4',
  refiner:             'mistral-small-4',
};
