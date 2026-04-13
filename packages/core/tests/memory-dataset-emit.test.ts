/**
 * Integration tests for memory operation events.
 *
 * Covers memory_save, memory_recall, memory_update emitted by the
 * MemoryManager, and memory_consolidation / memory_forget emitted
 * by the consolidation runner when there's something to report.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryManager } from '../src/memory/memory-manager.js';
import { avaEvents, withTrajectory } from '../src/dataset/emitter.js';
import type { AvaEvent } from '../src/dataset/events.js';

const baseCtx = {
  session_id: 'sess-test',
  surface: 'cli' as const,
  mode: 'work' as const,
  model_id: 'qwen3.6-plus',
};

async function flushMicrotasks(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

let tmp: string;
let captured: AvaEvent[];
let manager: MemoryManager;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'ava-memory-test-'));
  captured = [];
  avaEvents.clearAllHandlers();
  avaEvents.onAll((e) => captured.push(e));
  manager = new MemoryManager({ globalDir: tmp, projectDir: join(tmp, 'project') });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('MemoryManager → dataset event wiring', () => {
  it('emits memory_save with scope, layer, category, source', async () => {
    await withTrajectory(baseCtx, async () => {
      await manager.saveEntry({
        scope: 'global',
        content: 'user prefers tabs over spaces',
        category: 'preference',
      });
    });
    await flushMicrotasks();

    const save = captured.find((e) => e.event_type === 'memory_save');
    expect(save).toBeDefined();
    const p = save!.payload as any;
    expect(p.scope).toBe('global');
    expect(p.category).toBe('preference');
    expect(p.source).toBe('explicit'); // default
    expect(typeof p.layer).toBe('string');
    expect(p.content_signature).toBe('preference');
  });

  it('memory_save respects the source field when caller sets it', async () => {
    await withTrajectory(baseCtx, async () => {
      await manager.saveEntry({
        scope: 'global',
        content: 'auto-extracted fact',
        category: 'general',
        source: 'auto-extract',
      });
    });
    await flushMicrotasks();

    const save = captured.find((e) => e.event_type === 'memory_save');
    expect((save!.payload as any).source).toBe('auto-extract');
  });

  it('emits memory_update on updateEntry', async () => {
    let entryId = '';
    await withTrajectory(baseCtx, async () => {
      const e = await manager.saveEntry({
        scope: 'global',
        content: 'first version',
        category: 'general',
      });
      entryId = e.id;
    });
    await flushMicrotasks();
    captured.length = 0;

    await withTrajectory(baseCtx, async () => {
      await manager.updateEntry('global', entryId, { content: 'second version' });
    });
    await flushMicrotasks();

    const upd = captured.find((e) => e.event_type === 'memory_update');
    expect(upd).toBeDefined();
    const p = upd!.payload as any;
    expect(p.scope).toBe('global');
    expect(p.what_changed).toBe('content');
    expect(p.reason).toBe('updateEntry');
  });

  it('emits memory_recall with a length-bucketed query_signature', async () => {
    await withTrajectory(baseCtx, async () => {
      await manager.saveEntry({
        scope: 'global',
        content: 'the answer is 42 according to the guide',
        category: 'general',
      });
    });
    await flushMicrotasks();
    captured.length = 0;

    await withTrajectory(baseCtx, async () => {
      await manager.recall({ query: 'guide', scope: 'global' });
    });
    await flushMicrotasks();

    const rec = captured.find((e) => e.event_type === 'memory_recall');
    expect(rec).toBeDefined();
    const p = rec!.payload as any;
    expect(p.query_signature).toBe('single-word');
    expect(typeof p.results_count).toBe('number');
    expect(p.results_used_count).toBe(0);
  });

  it('query_signature buckets into single-word / short-phrase / long-query', async () => {
    await withTrajectory(baseCtx, async () => {
      await manager.recall({ query: 'one', scope: 'global' });
      await manager.recall({ query: 'two three four', scope: 'global' });
      await manager.recall({ query: 'this is a much longer query with many words', scope: 'global' });
    });
    await flushMicrotasks();

    const recalls = captured.filter((e) => e.event_type === 'memory_recall');
    expect(recalls).toHaveLength(3);
    expect((recalls[0].payload as any).query_signature).toBe('single-word');
    expect((recalls[1].payload as any).query_signature).toBe('short-phrase');
    expect((recalls[2].payload as any).query_signature).toBe('long-query');
  });

  it('memory_update reports tags vs metadata changes correctly', async () => {
    let entryId = '';
    await withTrajectory(baseCtx, async () => {
      const e = await manager.saveEntry({
        scope: 'global',
        content: 'tagged entry',
        category: 'general',
      });
      entryId = e.id;
    });
    await flushMicrotasks();
    captured.length = 0;

    await withTrajectory(baseCtx, async () => {
      await manager.updateEntry('global', entryId, { tags: ['important'] });
    });
    await flushMicrotasks();
    expect((captured.find((e) => e.event_type === 'memory_update')!.payload as any).what_changed).toBe('tags');

    captured.length = 0;
    await withTrajectory(baseCtx, async () => {
      await manager.updateEntry('global', entryId, { branch: 'main' });
    });
    await flushMicrotasks();
    expect((captured.find((e) => e.event_type === 'memory_update')!.payload as any).what_changed).toBe('metadata');
  });
});
