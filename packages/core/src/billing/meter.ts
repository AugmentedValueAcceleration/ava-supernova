// Credit meter — the runtime side of the Ava Credits system.
//
// Every metered action (LLM call, Creative Studio generation, orchestration
// hop, Teach session) calls `chargeCredits()` on completion. The helper
// emits a `credits_charged` dataset event that rolls up into usage reports
// and, once Stage 3 flips the switch, into per-user billing.
//
// Stage 2 (this file): dual-write only. Server-side billing continues to
// read raw tokens; the `credits` field is recorded for parity audit.
// Stage 3 (later): flip the feature flag, server reads credits first,
// raw tokens become backup-only.
//
// Design choices:
//  - Emission is fire-and-forget via avaEvents (microtask-safe). The
//    user-visible response never blocks on metering.
//  - No trajectory scope required — if no trajectory is open, avaEvents
//    drops the emit silently. That's safer than throwing from a billing
//    path.
//  - Cache-hit discount is applied here at emit time via creditsFor().
//    Callers pass `{ cacheHit: true }` when the provider response
//    indicates a prompt-cache hit; the 0.3× multiplier lives in credits.ts.

import { avaEvents } from '../dataset/emitter.js';
import type { CreditAction } from './credits.js';
import { creditsFor } from './credits.js';

export interface RawTokenUsage {
  input: number;
  output: number;
  cached?: number;
}

export interface ChargeOpts {
  /** True if the provider reported a prompt-cache hit. Applies 0.3× discount. */
  cacheHit?: boolean;
  /** Provider's raw usage numbers (dual-write for Stage 2 billing parity). */
  rawTokens?: RawTokenUsage;
  /** Model identifier for audit (e.g. 'qwen3.7-plus'). */
  model?: string;
}

/**
 * Charge credits for a completed metered action.
 *
 * Returns the credits deducted so callers can log or accumulate. Emits
 * a `credits_charged` dataset event for the usage pipeline. Never throws
 * and never blocks — billing failures cannot take the chat down.
 */
export function chargeCredits(action: CreditAction, opts?: ChargeOpts): number {
  const credits = creditsFor(action, { cacheHit: opts?.cacheHit, model: opts?.model });
  avaEvents.emit('credits_charged', {
    action,
    credits,
    cache_hit: opts?.cacheHit ?? false,
    raw_input_tokens: opts?.rawTokens?.input,
    raw_output_tokens: opts?.rawTokens?.output,
    raw_cached_tokens: opts?.rawTokens?.cached,
    model: opts?.model,
  });
  return credits;
}

/**
 * Extract raw usage from a provider's CompletionResponse usage field.
 * Defensive — providers return usage in varied shapes; this normalises
 * to the dual-write envelope. Returns undefined if no usage is present
 * (some error paths, some provider non-compliance).
 */
export function extractUsage(
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    cached_tokens?: number;
    prompt_cache_hit_tokens?: number;
  } | null | undefined,
): RawTokenUsage | undefined {
  if (!usage) return undefined;
  const input = usage.input_tokens ?? usage.prompt_tokens;
  const output = usage.output_tokens ?? usage.completion_tokens;
  const cached = usage.cached_tokens ?? usage.prompt_cache_hit_tokens;
  if (input == null && output == null) return undefined;
  return {
    input: input ?? 0,
    output: output ?? 0,
    ...(cached != null && { cached }),
  };
}
