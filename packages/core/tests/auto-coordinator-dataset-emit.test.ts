/**
 * Integration tests for AutoCoordinator dataset event wiring.
 *
 * task_classification fires once per planning leg; routing_decision
 * fires when a non-direct category routes to a model. Verifies trajectory
 * scoping and parent_trajectory_id linkage to inner agent runs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AutoCoordinator } from '../src/auto/auto-coordinator.js';
import { ProviderRegistry } from '../src/providers/provider-registry.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import type { Provider, ChatCompletionRequest } from '../src/providers/types.js';
import type { ModelDefinition } from '../src/core/types.js';
import { avaEvents } from '../src/dataset/emitter.js';
import type { AvaEvent } from '../src/dataset/events.js';

const COORDINATOR_MODEL: ModelDefinition = {
  id: 'qwen3.5-flash',
  name: 'Qwen 3.5 Flash',
  provider: 'mock-platform',
  contextWindow: 128000,
  maxOutputTokens: 4096,
  supportsToolCalls: true,
};

function mockProvider(): Provider {
  return {
    name: 'mock-platform',
    displayName: 'Mock',
    listModels: () => [COORDINATOR_MODEL],
    async createCompletion() {
      return {
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' as const }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
    },
    async *createStreamingCompletion(_req: ChatCompletionRequest) {
      yield { choices: [{ delta: { content: 'ok' }, index: 0, finish_reason: null }] };
      yield {
        choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
        usage: { prompt_tokens: 50, completion_tokens: 5, total_tokens: 55 },
      };
    },
  };
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('AutoCoordinator → dataset event wiring', () => {
  let registry: ToolRegistry;
  let providerRegistry: ProviderRegistry;
  let captured: AvaEvent[];
  let coordinator: AutoCoordinator;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.registerBuiltins();
    const provider = mockProvider();
    providerRegistry = new ProviderRegistry();
    providerRegistry.registerCustom('mock-platform', provider);

    captured = [];
    avaEvents.clearAllHandlers();
    avaEvents.onAll((e) => captured.push(e));

    coordinator = new AutoCoordinator({
      coordinatorProvider: provider,
      coordinatorModel: COORDINATOR_MODEL,
      providerRegistry,
      toolRegistry: registry,
      cwd: '.',
      sharedState: {},
      availableProviders: new Set(['mock-platform']),
      surface: 'cli',
    });
  });

  it('emits task_classification on every coordinator run', async () => {
    await coordinator.run([{ role: 'user', content: 'hello there friend' }], () => {});
    await flush();

    const cls = captured.find((e) => e.event_type === 'task_classification');
    expect(cls).toBeDefined();
    const p = cls!.payload as any;
    expect(typeof p.classified_as).toBe('string');
    expect(['short', 'medium', 'long']).toContain(p.input_signature);
    expect(p.classifier_model).toBe('task-classifier');
  });

  it('inner agent trajectory inherits parent_trajectory_id from coordinator', async () => {
    await coordinator.run([{ role: 'user', content: 'do something' }], () => {});
    await flush();

    // Coordinator's events have one trajectory_id; inner agent emits like
    // tool_chain_complete should carry parent_trajectory_id pointing at it.
    const coordEvents = captured.filter((e) => e.event_type === 'task_classification');
    expect(coordEvents.length).toBeGreaterThan(0);
    const coordTrajId = coordEvents[0].trajectory_id;

    const childEvents = captured.filter((e) => e.parent_trajectory_id === coordTrajId);
    expect(childEvents.length).toBeGreaterThan(0);
  });

  it('input_signature buckets correctly by message length', async () => {
    await coordinator.run([{ role: 'user', content: 'hi' }], () => {});
    await flush();
    const short = captured.find((e) => e.event_type === 'task_classification')!;
    expect((short.payload as any).input_signature).toBe('short');

    captured.length = 0;
    await coordinator.run([{ role: 'user', content: 'this is a moderately length message that has about ten words in it' }], () => {});
    await flush();
    const med = captured.find((e) => e.event_type === 'task_classification')!;
    expect((med.payload as any).input_signature).toBe('medium');
  });
});
