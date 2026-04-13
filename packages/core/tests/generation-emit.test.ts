/**
 * Unit tests for startGenerationTracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { startGenerationTracking } from '../src/dataset/generation-emit.js';
import { avaEvents, withTrajectory } from '../src/dataset/emitter.js';
import type { AvaEvent } from '../src/dataset/events.js';

const baseCtx = {
  session_id: 'sess-test',
  surface: 'cli' as const,
  mode: 'work' as const,
  model_id: 'qwen3.6-plus',
};

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('startGenerationTracking', () => {
  let captured: AvaEvent[];

  beforeEach(() => {
    captured = [];
    avaEvents.clearAllHandlers();
    avaEvents.onAll((e) => captured.push(e));
  });

  it('emits generation_started with prompt_signature bucket', async () => {
    withTrajectory(baseCtx, () => {
      startGenerationTracking({
        type: 'image',
        model: 'wan2.6',
        prompt: 'a sunset over mountains',
        paramsSummary: 'size=1024x1024',
      });
    });
    await flush();

    const started = captured.find((e) => e.event_type === 'generation_started');
    expect(started).toBeDefined();
    const p = started!.payload as any;
    expect(p.type).toBe('image');
    expect(p.model).toBe('wan2.6');
    expect(['short', 'medium', 'long']).toContain(p.prompt_signature);
    expect(p.params_summary).toContain('size=');
  });

  it('complete() emits success with file_size and cross-references started', async () => {
    let tracker: ReturnType<typeof startGenerationTracking>;
    withTrajectory(baseCtx, () => {
      tracker = startGenerationTracking({
        type: 'music',
        model: 'minimax-music',
        prompt: 'lo-fi beat',
        paramsSummary: 'instrumental',
      });
      tracker.complete({ fileSizeBytes: 12345 });
    });
    await flush();

    const started = captured.find((e) => e.event_type === 'generation_started')!;
    const complete = captured.find((e) => e.event_type === 'generation_complete');
    expect(complete).toBeDefined();
    const p = complete!.payload as any;
    expect(p.status).toBe('success');
    expect(p.file_size_bytes).toBe(12345);
    expect(p.generation_started_event_id).toBe(started.event_id);
    expect(typeof p.duration_ms).toBe('number');
  });

  it('fail() emits error with summary', async () => {
    withTrajectory(baseCtx, () => {
      const tracker = startGenerationTracking({
        type: 'video', model: 'minimax-video', prompt: 'p', paramsSummary: 'd=10s',
      });
      tracker.fail('upstream API timeout');
    });
    await flush();

    const complete = captured.find((e) => e.event_type === 'generation_complete')!;
    const p = complete.payload as any;
    expect(p.status).toBe('error');
    expect(p.error_summary).toContain('timeout');
  });

  it('complete() and fail() are idempotent — second call does not emit', async () => {
    withTrajectory(baseCtx, () => {
      const tracker = startGenerationTracking({
        type: 'voice', model: 'minimax-voice', prompt: 'p', paramsSummary: 'voice=Calm',
      });
      tracker.complete({ fileSizeBytes: 100 });
      tracker.fail('shouldnt-emit');
      tracker.complete({ fileSizeBytes: 200 });
    });
    await flush();

    const completes = captured.filter((e) => e.event_type === 'generation_complete');
    expect(completes).toHaveLength(1);
    expect((completes[0].payload as any).status).toBe('success');
  });
});
