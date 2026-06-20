/**
 * Generation event tracker — pairs `generation_started` with
 * `generation_complete` for Creative Studio operations.
 *
 * Generate tools (image / video / music / voice) call
 * `startGenerationTracking()` once they've passed initial validation
 * and are about to actually call the upstream model. The returned
 * tracker carries the started event_id and a stopwatch; the tool
 * calls either `complete()` or `fail()` exactly once when the
 * generation finishes. The tracker enforces the "exactly once"
 * guarantee internally so a try/catch + early-return error path
 * pattern can call both without producing duplicate events.
 */

import { randomUUID } from 'node:crypto';
import { avaEvents, withTrajectory } from './emitter.js';
import type { AvaSurface } from './events.js';

export type GenerationType = 'image' | 'audio' | 'voice' | 'video' | 'music';
export type GenerationUserAction = 'kept' | 'retried' | 'discarded' | 'edited' | 'unknown';

export interface GenerationTracker {
  /** event_id of the generation_started event — for cross-reference. */
  readonly startedEventId: string;
  /** event_id of the generation_complete event — set after complete()/fail().
   *  Surfaces persist this with the asset so a later generation_user_action
   *  can link back to the exact generation. Null until completed. */
  completeEventId: string | null;
  /** Wall-clock millis when tracking opened. */
  readonly startTime: number;
  readonly type: GenerationType;
  /** Mark the generation as successful. Idempotent. */
  complete(opts?: { fileSizeBytes?: number }): void;
  /** Mark the generation as failed. Idempotent. */
  fail(errorSummary: string): void;
}

export function startGenerationTracking(opts: {
  type: GenerationType;
  model: string;
  prompt: string;
  paramsSummary: string;
}): GenerationTracker {
  const wordCount = opts.prompt.trim().split(/\s+/).filter(Boolean).length;
  const promptSignature: string =
    wordCount <= 5 ? 'short'
    : wordCount <= 30 ? 'medium'
    : 'long';

  const startedEventId = avaEvents.emit('generation_started', {
    type: opts.type,
    model: opts.model,
    prompt_signature: promptSignature,
    params_summary: opts.paramsSummary,
  });

  const startTime = Date.now();
  let completed = false;

  const tracker: GenerationTracker = {
    startedEventId,
    completeEventId: null,
    startTime,
    type: opts.type,
    complete({ fileSizeBytes } = {}) {
      if (completed) return;
      completed = true;
      tracker.completeEventId = avaEvents.emit('generation_complete', {
        generation_started_event_id: startedEventId,
        type: opts.type,
        status: 'success',
        duration_ms: Date.now() - startTime,
        file_size_bytes: fileSizeBytes,
      });
    },
    fail(errorSummary) {
      if (completed) return;
      completed = true;
      tracker.completeEventId = avaEvents.emit('generation_complete', {
        generation_started_event_id: startedEventId,
        type: opts.type,
        status: 'error',
        duration_ms: Date.now() - startTime,
        error_summary: errorSummary.slice(0, 200),
      });
    },
  };
  return tracker;
}

/**
 * Track a UI-originated (Creative Studio) generation. Creative Studio calls the
 * platform API directly rather than the agent's generate_* tools, so it runs
 * OUTSIDE any agent trajectory — and the emitter drops events fired without
 * one. This wraps the whole generation lifecycle (start → await → complete) in
 * a synthetic write-mode trajectory so the events land, and returns the
 * generation_complete event_id for the surface to persist with the asset.
 */
export async function trackUiGeneration<T>(
  opts: {
    type: GenerationType;
    model: string;
    prompt: string;
    paramsSummary: string;
    surface: AvaSurface;
    sessionId?: string;
  },
  run: (tracker: GenerationTracker) => Promise<T>,
): Promise<{ result: T; completeEventId: string | null }> {
  return withTrajectory(
    { session_id: opts.sessionId ?? randomUUID(), surface: opts.surface, mode: 'write', model_id: opts.model },
    async () => {
      const tracker = startGenerationTracking({
        type: opts.type, model: opts.model, prompt: opts.prompt, paramsSummary: opts.paramsSummary,
      });
      const result = await run(tracker);
      return { result, completeEventId: tracker.completeEventId };
    },
  );
}

/**
 * Emit a generation_user_action for a Creative Studio gallery action (kept /
 * retried / discarded / edited). Fires from the gallery, outside any agent run,
 * so it gets its own synthetic trajectory. Links to the generation via the
 * complete event_id the surface stored when the asset was created.
 */
export function emitGenerationUserAction(opts: {
  completeEventId: string;
  action: GenerationUserAction;
  surface: AvaSurface;
  model?: string;
  sessionId?: string;
}): void {
  if (!opts.completeEventId) return; // nothing to link — skip rather than emit a dangling action
  withTrajectory(
    { session_id: opts.sessionId ?? randomUUID(), surface: opts.surface, mode: 'write', model_id: opts.model ?? 'unknown' },
    () => {
      avaEvents.emit('generation_user_action', {
        generation_complete_event_id: opts.completeEventId,
        user_action: opts.action,
      });
    },
  );
}
