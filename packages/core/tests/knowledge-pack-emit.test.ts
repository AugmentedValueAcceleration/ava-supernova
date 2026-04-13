/**
 * Unit tests for knowledge_pack_activated.
 *
 * knowledge_pack_used (response-content reference detection) is a
 * follow-up — requires per-pack markers we don't have today.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { routePacks } from '../src/knowledge/pack-router.js';
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

describe('routePacks → dataset event wiring', () => {
  let captured: AvaEvent[];

  beforeEach(() => {
    captured = [];
    avaEvents.clearAllHandlers();
    avaEvents.onAll((e) => captured.push(e));
  });

  it('emits knowledge_pack_activated when a pack matches keywords', async () => {
    withTrajectory(baseCtx, () => {
      const ids = routePacks('I need help with docker and kubernetes deployment', new Set());
      expect(ids.length).toBeGreaterThan(0);
    });
    await flush();

    const evts = captured.filter((e) => e.event_type === 'knowledge_pack_activated');
    expect(evts.length).toBeGreaterThan(0);
    const p = evts[0].payload as any;
    expect(p.trigger_signal).toBe('keyword');
    expect(typeof p.pack_name).toBe('string');
    expect(typeof p.trigger_detail).toBe('string');
    expect(p.injected_token_count).toBeGreaterThanOrEqual(0);
  });

  it('does NOT emit when message has no matching keywords', async () => {
    withTrajectory(baseCtx, () => {
      routePacks('hello there', new Set());
    });
    await flush();
    expect(captured.find((e) => e.event_type === 'knowledge_pack_activated')).toBeUndefined();
  });

  it('does NOT emit for already-loaded packs', async () => {
    // First call activates it
    let firstActivated: string[] = [];
    withTrajectory(baseCtx, () => {
      firstActivated = routePacks('docker kubernetes', new Set());
    });
    await flush();
    captured.length = 0;

    // Second call with the same pack already loaded
    withTrajectory(baseCtx, () => {
      routePacks('more docker stuff', new Set(firstActivated));
    });
    await flush();
    expect(captured.find((e) => e.event_type === 'knowledge_pack_activated')).toBeUndefined();
  });
});
