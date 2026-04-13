import { describe, it, expect, beforeEach } from 'vitest';
import {
  avaEvents,
  withTrajectory,
  withChildTrajectory,
  getTrajectory,
} from '../src/dataset/emitter.js';
import type { AvaEvent } from '../src/dataset/events.js';

const baseCtx = {
  session_id: 'sess-1',
  surface: 'cli' as const,
  mode: 'work' as const,
  model_id: 'qwen3.6-plus',
};

/** Flush queued microtasks so we can assert on handler side-effects. */
async function flushMicrotasks(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe('avaEvents', () => {
  beforeEach(() => {
    avaEvents.clearAllHandlers();
  });

  it('emits typed events to type-specific handlers', async () => {
    const received: AvaEvent[] = [];
    avaEvents.on('tool_choice', (e) => {
      received.push(e);
    });

    withTrajectory(baseCtx, () => {
      avaEvents.emit('tool_choice', {
        tool_name: 'grep',
        args_summary: 'search auth across ts files',
        prev_tools_in_trajectory: [],
      });
    });

    await flushMicrotasks();
    expect(received).toHaveLength(1);
    expect(received[0].event_type).toBe('tool_choice');
    expect(received[0].surface).toBe('cli');
    expect(received[0].mode).toBe('work');
    expect((received[0].payload as any).tool_name).toBe('grep');
  });

  it('routes to wildcard handlers too', async () => {
    const seen: string[] = [];
    avaEvents.onAll((e) => {
      seen.push(e.event_type);
    });

    withTrajectory(baseCtx, () => {
      avaEvents.emit('tool_choice', {
        tool_name: 'grep',
        args_summary: 's',
        prev_tools_in_trajectory: [],
      });
      avaEvents.emit('memory_save', {
        scope: 'project',
        layer: 'graph',
        category: 'pattern',
        source: 'auto-extract',
        content_signature: 'auth-pattern',
      });
    });

    await flushMicrotasks();
    expect(seen).toEqual(['tool_choice', 'memory_save']);
  });

  it('silently drops emits outside a trajectory scope', async () => {
    const received: AvaEvent[] = [];
    avaEvents.onAll((e) => received.push(e));

    avaEvents.emit('tool_choice', {
      tool_name: 'grep',
      args_summary: 's',
      prev_tools_in_trajectory: [],
    });

    await flushMicrotasks();
    expect(received).toHaveLength(0);
  });

  it('assigns stable trajectory_id across emits in one scope', async () => {
    const received: AvaEvent[] = [];
    avaEvents.onAll((e) => received.push(e));

    withTrajectory(baseCtx, () => {
      avaEvents.emit('tool_choice', {
        tool_name: 'a',
        args_summary: '',
        prev_tools_in_trajectory: [],
      });
      avaEvents.emit('tool_choice', {
        tool_name: 'b',
        args_summary: '',
        prev_tools_in_trajectory: ['a'],
      });
    });

    await flushMicrotasks();
    expect(received).toHaveLength(2);
    expect(received[0].trajectory_id).toBe(received[1].trajectory_id);
  });

  it('child trajectories carry parent_trajectory_id', async () => {
    const received: AvaEvent[] = [];
    avaEvents.onAll((e) => received.push(e));

    let outerId: string | undefined;

    withTrajectory(baseCtx, () => {
      outerId = getTrajectory()!.trajectory_id;
      avaEvents.emit('tool_choice', {
        tool_name: 'outer',
        args_summary: '',
        prev_tools_in_trajectory: [],
      });
      withChildTrajectory({}, () => {
        avaEvents.emit('tool_choice', {
          tool_name: 'inner',
          args_summary: '',
          prev_tools_in_trajectory: [],
        });
      });
    });

    await flushMicrotasks();
    const outer = received.find((e) => (e.payload as any).tool_name === 'outer')!;
    const inner = received.find((e) => (e.payload as any).tool_name === 'inner')!;
    expect(outer.trajectory_id).toBe(outerId);
    expect(outer.parent_trajectory_id).toBeUndefined();
    expect(inner.trajectory_id).not.toBe(outerId);
    expect(inner.parent_trajectory_id).toBe(outerId);
  });

  it('deep-clones payload so later mutations cannot affect captured events', async () => {
    const received: AvaEvent[] = [];
    avaEvents.onAll((e) => received.push(e));

    const mutablePayload = {
      tool_name: 'grep',
      args_summary: 'original',
      prev_tools_in_trajectory: ['a'],
    };

    withTrajectory(baseCtx, () => {
      avaEvents.emit('tool_choice', mutablePayload);
      // Mutate after emit — captured event must be unaffected.
      mutablePayload.args_summary = 'tampered';
      mutablePayload.prev_tools_in_trajectory.push('b');
    });

    await flushMicrotasks();
    expect((received[0].payload as any).args_summary).toBe('original');
    expect((received[0].payload as any).prev_tools_in_trajectory).toEqual(['a']);
  });

  it('a throwing handler does not affect other handlers or the emitter', async () => {
    const goodReceived: AvaEvent[] = [];
    avaEvents.on('tool_choice', () => {
      throw new Error('boom');
    });
    avaEvents.on('tool_choice', (e) => {
      goodReceived.push(e);
    });

    withTrajectory(baseCtx, () => {
      avaEvents.emit('tool_choice', {
        tool_name: 'grep',
        args_summary: '',
        prev_tools_in_trajectory: [],
      });
    });

    await flushMicrotasks();
    expect(goodReceived).toHaveLength(1);
  });

  it('a rejected async handler does not crash anything', async () => {
    const goodReceived: AvaEvent[] = [];
    avaEvents.on('tool_choice', async () => {
      throw new Error('async boom');
    });
    avaEvents.on('tool_choice', (e) => {
      goodReceived.push(e);
    });

    withTrajectory(baseCtx, () => {
      avaEvents.emit('tool_choice', {
        tool_name: 'grep',
        args_summary: '',
        prev_tools_in_trajectory: [],
      });
    });

    await flushMicrotasks();
    await flushMicrotasks();
    expect(goodReceived).toHaveLength(1);
  });

  it('unsubscribe stops delivery', async () => {
    const received: AvaEvent[] = [];
    const off = avaEvents.on('tool_choice', (e) => received.push(e));

    withTrajectory(baseCtx, () => {
      avaEvents.emit('tool_choice', {
        tool_name: 'a',
        args_summary: '',
        prev_tools_in_trajectory: [],
      });
    });
    await flushMicrotasks();
    expect(received).toHaveLength(1);

    off();

    withTrajectory(baseCtx, () => {
      avaEvents.emit('tool_choice', {
        tool_name: 'b',
        args_summary: '',
        prev_tools_in_trajectory: [],
      });
    });
    await flushMicrotasks();
    expect(received).toHaveLength(1);
  });
});
