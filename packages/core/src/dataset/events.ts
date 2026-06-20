/**
 * Ava Action Event Taxonomy
 *
 * The canonical type definitions for every event Ava emits as she works.
 * This file is the contract between the agent (which emits events) and the
 * dataset capture consumer (which routes events into per-dataset JSONL
 * files for the future own-model training run).
 *
 * Design principles:
 *   1. Every event represents an Ava DECISION or ACTION — never a user
 *      action, never a system tick. If it isn't something Ava chose or
 *      did, it doesn't belong here.
 *   2. Every event carries enough context to reconstruct the decision
 *      without referencing the live conversation. No back-pointers into
 *      mutable runtime state.
 *   3. User-identifying or proprietary payloads are summarised, not
 *      copied verbatim. File contents become "ts file, 200 lines";
 *      prompts become category + intent; tool args become a one-line
 *      summary. Raw text of the user's message never lands in an event.
 *   4. Trajectory IDs glue related events together across files so we
 *      can reconstruct multi-step flows at training time.
 *
 * Files in this directory:
 *   events.ts    — this file, the taxonomy (types only, no runtime).
 *   emitter.ts   — typed EventEmitter (next step).
 *   consumer.ts  — subscribes, snapshots, writes JSONL (next step).
 *   routing.ts   — maps event_type → which dataset files it belongs in.
 */

// ─── Common envelope ────────────────────────────────────────────────────────

export type AvaSurface = 'cli' | 'extension' | 'ide' | 'companion';
export type AvaMode = 'work' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm' | 'write' | 'desktop';

/**
 * Every event carries this envelope. The discriminator is `event_type`;
 * `payload` is typed per event. `trajectory_id` groups events from a
 * single Ava-Run-loop so consumers can reconstruct multi-step flows.
 */
export interface AvaEvent<T extends AvaEventType = AvaEventType> {
  event_id: string;                     // UUID per event
  event_type: T;                        // discriminator
  timestamp: string;                    // ISO 8601
  trajectory_id: string;                // groups events from a single Agent.run()
  parent_trajectory_id?: string;        // for nested orchestration (Builder inside a planning run)
  session_id: string;                   // agent session UUID
  surface: AvaSurface;
  mode: AvaMode;
  model_id: string;                     // e.g. 'qwen3.7-plus'
  payload: AvaEventPayloadMap[T];
}

// ─── Event type discriminator ───────────────────────────────────────────────

export type AvaEventType =
  // Tool trajectories (Dataset 1)
  | 'tool_choice'
  | 'tool_result'
  | 'tool_chain_complete'
  // Persona handoffs (Dataset 2)
  | 'persona_decision'
  | 'persona_handoff'
  | 'persona_complete'
  | 'persona_veto'
  | 'team_depth_decision'
  // Verification (Dataset 3)
  | 'verification_decision'
  | 'correction_received'
  | 'verification_evidence'
  // Auto Mode classification (Dataset 4)
  | 'task_classification'
  | 'routing_decision'
  // Error recovery (Dataset 5)
  | 'tool_error'
  | 'error_guidance_applied'
  | 'recovery_action'
  // Memory operations (Dataset 6)
  | 'memory_save'
  | 'memory_recall'
  | 'memory_update'
  | 'memory_consolidation'
  | 'memory_forget'
  // Continuation stalls (Dataset 7)
  | 'continuation_stall_detected'
  | 'continuation_nudge_fired'
  // Mode switching (Dataset 8 — most slicing happens at query-time on the envelope's `mode`)
  | 'mode_switch'
  // Generation effectiveness (Dataset 9)
  | 'generation_started'
  | 'generation_complete'
  | 'generation_user_action'
  // Knowledge pack effectiveness (Dataset 10)
  | 'knowledge_pack_activated'
  | 'knowledge_pack_used'
  // Context management (Dataset 11 — Phase 2)
  | 'context_compression'
  // Perception / vision bridge (Dataset 12 — Phase 2)
  | 'vision_bridge'
  // Credits / billing metering (added 2026-04-22)
  | 'credits_charged';

// ─── Per-event payload shapes ───────────────────────────────────────────────

/* DATASET 1 — Tool trajectories ─────────────────────────────────────────── */

/** Ava decided to call a tool. Fired BEFORE the call executes. */
export interface ToolChoicePayload {
  tool_name: string;
  args_summary: string;                 // one-line human summary, never raw args with user data
  reasoning_summary?: string;           // if the model's chain-of-thought captured a why
  prev_tools_in_trajectory: string[];   // tool names in order, this trajectory only
  is_retry_of?: string;                 // event_id of the prior call this is retrying
}

/** Tool returned. Fired AFTER the result lands. */
export interface ToolResultPayload {
  tool_name: string;
  tool_choice_event_id: string;         // links back to the choice
  success: boolean;
  result_summary: string;               // never the raw result if it could contain user data
  duration_ms: number;
  error_summary?: string;
}

/** A tool chain finished — Ava stopped calling tools and produced a final response. */
export interface ToolChainCompletePayload {
  tool_count: number;
  total_duration_ms: number;
  outcome: 'task_completed' | 'gave_up' | 'asked_user' | 'hit_loop_limit';
  outcome_summary: string;
}

/* DATASET 2 — Persona handoffs ──────────────────────────────────────────── */

/** Conductor decided which persona team to spawn for this task. */
export interface PersonaDecisionPayload {
  task_classification: string;          // 'coding' | 'planning' | 'security' | etc.
  chosen_team: string[];                // ordered persona names: ['scout', 'architect', 'verifier']
  reasoning_summary: string;
}

/** One persona finished and handed work to the next. */
export interface PersonaHandoffPayload {
  from_persona: string;
  to_persona: string;
  artifacts_produced: string[];         // 'findings', 'design', 'task-list', etc.
  context_word_count: number;           // size of handoff context
}

/** A persona finished its leg of the orchestration. */
export interface PersonaCompletePayload {
  persona: string;
  output_summary: string;
  success: boolean;
  duration_ms: number;
}

/**
 * A veto-capable persona (Challenger, Fact Checker, Verifier…) halted the
 * pipeline because its output tripped its veto signal. Strong negative
 * signal — the team caught bad work before it shipped. The raw veto reason
 * is never captured; only the kind of veto and how substantive it was.
 */
export interface PersonaVetoPayload {
  vetoing_persona: string;              // persona.id that vetoed
  veto_category: string;               // role-derived category, never the raw reason text
  reason_word_count: number;           // shape of the reason, not its content
}

/**
 * The Conductor decided whether to run the light or full persona team for
 * this task. Trains the "how much orchestration does this task need" signal.
 * Shape-only: mode, the depth, what drove it, and team size.
 */
export interface TeamDepthDecisionPayload {
  mode: string;                        // the mode that drove the decision
  depth: 'light' | 'full';
  trigger: 'classifier' | 'regex_fallback';  // upstream Flash classifier vs the regex safety net
  team_size: number;                   // personas in the chosen team
}

/* DATASET 3 — Verification vs speculation ──────────────────────────────── */

/**
 * Ava chose either to verify (read/grep/search) before answering, or to
 * answer directly. Captures the decision and what tools (if any) were
 * used to verify. Outcome quality gets joined in at training time from
 * `correction_received` events on the same trajectory.
 */
export interface VerificationDecisionPayload {
  verified: boolean;
  verification_tools_used: string[];    // empty if verified=false
  response_word_count: number;
  question_signature: string;           // category, never raw text
}

/**
 * The user pushed back on a previous response. Strong signal the prior
 * answer was wrong. Linked to the trajectory whose verification decision
 * we want to re-evaluate.
 */
export interface CorrectionReceivedPayload {
  corrected_trajectory_id: string;      // which prior trajectory got corrected
  original_verification: boolean;       // did we verify before the wrong answer?
  correction_signature: string;         // category of correction, e.g. 'factual', 'approach', 'code-bug'
}

/**
 * Did Ava's evidence-gathering actually *succeed* this run — not just "was
 * verification attempted" (that's verification_decision) but "did the
 * read-only verify tools come back ok, and did the soft-honesty gate flag
 * an unbacked claim". This is the verifiability signal: a self-generated
 * trajectory is only training-grade if its claims can be checked. All
 * shape-only counts/booleans — no tool output, no response text.
 */
export interface VerificationEvidencePayload {
  verify_tool_calls: number;            // calls to read-only verify tools this run
  verify_tool_successes: number;        // how many of those returned ok
  distinct_verify_tools: number;        // distinct verify tools used
  verified_before_response: boolean;    // any verify tool ran at all
  claim_flagged: boolean;               // soft-honesty gate flagged an unbacked factual claim
}

/* DATASET 4 — Auto Mode classification ─────────────────────────────────── */

/** task_classifier categorised an incoming request. */
export interface TaskClassificationPayload {
  input_signature: string;              // intent category, never raw user text
  classified_as: string;                // 'coding' | 'planning' | 'vision' | etc.
  classifier_model: string;             // typically 'qwen3.5-flash'
  confidence?: number;
}

/** Auto Mode picked a model based on the classification. */
export interface RoutingDecisionPayload {
  classification: string;
  chosen_model: string;
  fallback_model?: string;
  reason: string;
}

/* DATASET 5 — Error recovery ───────────────────────────────────────────── */

/** A tool failed. */
export interface ToolErrorPayload {
  tool_name: string;
  tool_result_event_id: string;
  error_pattern_match?: string;         // matched pattern from error-guidance.ts (e.g. 'command_not_found')
  error_summary: string;
}

/** error-guidance.ts surfaced fix advice based on a pattern match. */
export interface ErrorGuidanceAppliedPayload {
  tool_error_event_id: string;
  pattern: string;
  guidance_summary: string;
}

/** Ava's next move after an error — did she retry, switch tools, give up, escalate? */
export interface RecoveryActionPayload {
  tool_error_event_id: string;
  recovery_kind: 'retry_same' | 'retry_with_change' | 'switch_tool' | 'ask_user' | 'gave_up';
  next_tool?: string;
  eventually_succeeded?: boolean;       // joined in once the trajectory completes
}

/* DATASET 6 — Memory operations ────────────────────────────────────────── */

/** Ava saved a memory. */
export interface MemorySavePayload {
  scope: 'global' | 'project';
  /** Mirrors `MemoryLayer` from packages/core/src/memory/types.ts. */
  layer: 'person' | 'workflow' | 'project';
  category: string;
  source: 'explicit' | 'auto-extract' | 'reflection' | 'consolidation' | 'memory-agent';
  content_signature: string;            // category/topic, never raw text
  confidence?: number;
}

/** Ava recalled memories. */
export interface MemoryRecallPayload {
  query_signature: string;              // category, never raw query
  results_count: number;
  results_used_count: number;           // how many of the recalled memories appeared in the final response
}

/** Ava updated an existing memory. */
export interface MemoryUpdatePayload {
  scope: 'global' | 'project';
  what_changed: 'content' | 'confidence' | 'tags' | 'metadata';
  reason: string;
}

/** Background consolidation merged duplicate memories. */
export interface MemoryConsolidationPayload {
  count_before: number;
  count_after: number;
  scope: 'global' | 'project';
}

/** Background forgetting removed stale memories. */
export interface MemoryForgetPayload {
  count_forgotten: number;
  reason: 'low_confidence' | 'age' | 'superseded';
}

/* DATASET 7 — Continuation stalls ──────────────────────────────────────── */

/** Agent detected a stall (response narrated intent but produced no tool call). */
export interface ContinuationStallDetectedPayload {
  response_summary: string;             // category, e.g. "narrated_intent_no_action"
  stall_pattern: string;                // matched detector pattern
}

/** Auto-continuation nudge fired. */
export interface ContinuationNudgeFiredPayload {
  stall_event_id: string;
  nudge_action: string;
  recovered: boolean;                   // joined in once the next response lands
}

/* DATASET 8 — Mode switch (most slicing happens via envelope.mode) ─────── */

/** Ava switched mode mid-conversation. */
export interface ModeSwitchPayload {
  from_mode: AvaMode;
  to_mode: AvaMode;
  trigger: 'user_prefix' | 'auto_detection' | 'orchestrator';
}

/* DATASET 9 — Generation effectiveness (Creative Studio) ───────────────── */

/** Ava started a Creative Studio generation job. */
export interface GenerationStartedPayload {
  type: 'image' | 'audio' | 'voice' | 'video' | 'music';
  model: string;
  prompt_signature: string;             // category, never raw prompt
  params_summary: string;               // 'duration=10s, aspect=9:16' etc.
}

/** Generation finished. */
export interface GenerationCompletePayload {
  generation_started_event_id: string;
  type: 'image' | 'audio' | 'voice' | 'video' | 'music';
  status: 'success' | 'error';
  duration_ms: number;
  file_size_bytes?: number;
  error_summary?: string;
}

/** What the user did with the result — kept it, retried, discarded, edited. */
export interface GenerationUserActionPayload {
  generation_complete_event_id: string;
  user_action: 'kept' | 'retried' | 'discarded' | 'edited' | 'unknown';
}

/* DATASET 10 — Knowledge pack effectiveness ────────────────────────────── */

/** Auto-activation chose a knowledge pack to inject into the system prompt. */
export interface KnowledgePackActivatedPayload {
  pack_name: string;
  trigger_signal: 'file_type' | 'framework' | 'language' | 'keyword' | 'manual';
  trigger_detail: string;               // e.g. 'detected: react, typescript'
  injected_token_count: number;
}

/**
 * Ava actually referenced the pack's content in her response. Computed by
 * checking response text against pack-specific markers. Strong signal the
 * pack was useful; absence is a signal it was injected unnecessarily.
 */
export interface KnowledgePackUsedPayload {
  knowledge_pack_activated_event_id: string;
  pack_name: string;
  in_response: boolean;
  reference_count: number;
}

/* DATASET 11 — Context management (Phase 2) ────────────────────────────── */

/**
 * Ava compressed or truncated the working context to stay under the model's
 * window. Trains context-management strategy: when compression fires, how
 * much it reclaims. Pure counts — no message content.
 */
export interface ContextCompressionPayload {
  operation: 'compress' | 'truncate';
  messages_before: number;
  messages_after: number;
  tokens_before: number;                // estimated tokens before the transform
  token_budget: number;                 // the input-token budget being enforced
}

/* DATASET 12 — Perception / vision bridge (Phase 2) ────────────────────── */

/**
 * A text-only coordinator couldn't see attached images, so the vision bridge
 * described them with a vision model and injected the text. Trains the
 * image→text relay signal. Shape-only: which model, how many images, latency,
 * whether descriptions were produced (vs a "switch model" fallback).
 */
export interface VisionBridgePayload {
  describer_model: string;              // the vision model id (or 'none' if unavailable)
  image_count: number;
  described_count: number;              // images successfully described
  latency_ms: number;
  success: boolean;                     // at least one image described (vs fallback note)
}

/* Credits / billing metering (added 2026-04-22) ──────────────────────────── */

/**
 * A metered action completed and credits were deducted from the user's
 * allowance. Emitted by `chargeCredits()` in billing/meter.ts. The server
 * sums these per user per billing period once Stage 3's billing switch
 * is live; during Stage 2 (dual-write) the server bills on raw tokens
 * while recording the `credits` field for parity auditing.
 *
 * One event per chargeable action — not per model iteration. An Agent
 * that loops 5 times for tool use emits one charge per iteration (each
 * is a `chat_turn`); a full Conductor run emits one charge per persona
 * (`light_persona` or `heavy_persona`).
 */
export interface CreditsChargedPayload {
  /** CreditAction from billing/credits — kept as string here to avoid a
   *  dataset ↔ billing import dependency. */
  action: string;
  /** Credits actually deducted (after cache-hit discount, if any). */
  credits: number;
  cache_hit: boolean;
  /** Provider's raw input token count (dual-write for billing parity). */
  raw_input_tokens?: number;
  raw_output_tokens?: number;
  raw_cached_tokens?: number;
  model?: string;
}

// ─── Discriminated union map ────────────────────────────────────────────────

export interface AvaEventPayloadMap {
  tool_choice: ToolChoicePayload;
  tool_result: ToolResultPayload;
  tool_chain_complete: ToolChainCompletePayload;
  persona_decision: PersonaDecisionPayload;
  persona_handoff: PersonaHandoffPayload;
  persona_complete: PersonaCompletePayload;
  persona_veto: PersonaVetoPayload;
  team_depth_decision: TeamDepthDecisionPayload;
  verification_decision: VerificationDecisionPayload;
  correction_received: CorrectionReceivedPayload;
  verification_evidence: VerificationEvidencePayload;
  task_classification: TaskClassificationPayload;
  routing_decision: RoutingDecisionPayload;
  tool_error: ToolErrorPayload;
  error_guidance_applied: ErrorGuidanceAppliedPayload;
  recovery_action: RecoveryActionPayload;
  memory_save: MemorySavePayload;
  memory_recall: MemoryRecallPayload;
  memory_update: MemoryUpdatePayload;
  memory_consolidation: MemoryConsolidationPayload;
  memory_forget: MemoryForgetPayload;
  continuation_stall_detected: ContinuationStallDetectedPayload;
  continuation_nudge_fired: ContinuationNudgeFiredPayload;
  mode_switch: ModeSwitchPayload;
  generation_started: GenerationStartedPayload;
  generation_complete: GenerationCompletePayload;
  generation_user_action: GenerationUserActionPayload;
  knowledge_pack_activated: KnowledgePackActivatedPayload;
  knowledge_pack_used: KnowledgePackUsedPayload;
  context_compression: ContextCompressionPayload;
  vision_bridge: VisionBridgePayload;
  credits_charged: CreditsChargedPayload;
}

// ─── Helper type for typed emit/subscribe ───────────────────────────────────

export type AvaEventOf<T extends AvaEventType> = AvaEvent<T>;
