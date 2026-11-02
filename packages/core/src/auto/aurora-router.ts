import type { TaskCategory } from './types.js';

/**
 * Aurora mode — Mistral only, two models (his call, 2 Nov 2026).
 *
 *   - Mistral Large 4 — Coordinator, Builder, coding, planning, security,
 *                       teaching, image reading and long context. Mistral's
 *                       flagship since 6 Oct 2026: 1M context, reasoning,
 *                       native image input; 61.7% on DeepSWE v1.1 by
 *                       Mistral's own figure. $0.70 / $2.10 per million.
 *   - Mistral Small 4 — Chat, brainstorm, image-generation orchestration and
 *                       the intent gate. 256K, reasoning, image input,
 *                       $0.15 / $0.60.
 *
 * Each falls back to the other. Medium 3.5 (the old lead) and Large 3 (the
 * old reserve) are gone from the fleet: Mistral deprecated both on 31 Oct 2026
 * and switches them off on 30 Apr 2027, naming Large 4 as the replacement.
 *
 * Aurora is locked to Mistral (FLEET_PROVIDERS). A seat Mistral can't fill
 * stays empty and the app says the Mistral key is missing — it is never
 * handed to another lab. Aurora was dark from 6 Oct to 2 Nov 2026 because
 * Mistral never answered our approach; with every user on their own key, the
 * fleet needs nothing from Mistral, so it came back.
 */

// ── Coordinator + special-case routes ─────────────────────────────────────

export const AURORA_COORDINATOR_ID = 'mistral-large-4';
export const AURORA_BUILDER_ID = 'mistral-large-4';
export const AURORA_VISION_ID = 'mistral-large-4';
export const AURORA_INTENT_GATE_ID = 'mistral-small-4';

// ── Per-task-category routing ─────────────────────────────────────────────
//
// Used by ModelRouter when mode='aurora'.

export interface AuroraRouteEntry {
  modelId: string;
  reason: string;
  fallbackModelId?: string;
  requiresVision?: boolean;
  /** Used by `teach` — coordinator-tier model when curriculum is being created (depth='full'). */
  creationModelId?: string;
}

export const AURORA_ROUTES: Record<TaskCategory, AuroraRouteEntry> = {
  // ── The deep work → Large 4, Small 4 beneath it ──
  coding:       { modelId: 'mistral-large-4', reason: 'Mistral Large 4 — Mistral\'s flagship coder, 1M context, reasoning',            fallbackModelId: 'mistral-small-4' },
  vision:       { modelId: 'mistral-large-4', reason: 'Mistral Large 4 — native image input',                                       fallbackModelId: 'mistral-small-4', requiresVision: true },
  planning:     { modelId: 'mistral-large-4', reason: 'Mistral Large 4 — reasoning for plan synthesis',                             fallbackModelId: 'mistral-small-4' },
  security:     { modelId: 'mistral-large-4', reason: 'Mistral Large 4 — reasoning over the attack surface',                        fallbackModelId: 'mistral-small-4' },
  teach:        { modelId: 'mistral-large-4', reason: 'Mistral Large 4 — coherent long-form teaching',                              fallbackModelId: 'mistral-small-4', creationModelId: 'mistral-large-4' },
  // Long context goes where the context is: Large 4 holds 1M, Small 4 256K.
  long_context: { modelId: 'mistral-large-4', reason: 'Mistral Large 4 — 1M context',                                               fallbackModelId: 'mistral-small-4' },

  // ── Volume → Small 4, Large 4 above it ──
  // image_gen orchestrates a generate_image tool call — depth not required.
  image_gen:    { modelId: 'mistral-small-4', reason: 'Mistral Small 4 — orchestrates generate_image tool calls; sees reference images', fallbackModelId: 'mistral-large-4' },
  chat:         { modelId: 'mistral-small-4', reason: 'Mistral Small 4 — fast, reasoning, sees images',                             fallbackModelId: 'mistral-large-4' },
  brainstorm:   { modelId: 'mistral-small-4', reason: 'Mistral Small 4 — breadth and speed for ideation',                           fallbackModelId: 'mistral-large-4' },
};

// ── Personas ──────────────────────────────────────────────────────────────
//
// Aurora's personas run on the model their task is routed to — the same as
// Maestro and Supernova. A per-persona map lived here, declared ahead of a
// wiring that never came; it was deleted on 2 Nov 2026 along with
// Supernova's, because it named retired models and its keys did not match
// the real persona ids.
