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

import { avaEvents } from './emitter.js';

export type GenerationType = 'image' | 'audio' | 'voice' | 'video' | 'music';

export interface GenerationTracker {
  /** event_id of the generation_started event — for cross-reference. */
  readonly startedEventId: string;
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

  return {
    startedEventId,
    startTime,
    type: opts.type,
    complete({ fileSizeBytes } = {}) {
      if (completed) return;
      completed = true;
      avaEvents.emit('generation_complete', {
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
      avaEvents.emit('generation_complete', {
        generation_started_event_id: startedEventId,
        type: opts.type,
        status: 'error',
        duration_ms: Date.now() - startTime,
        error_summary: errorSummary.slice(0, 200),
      });
    },
  };
}
