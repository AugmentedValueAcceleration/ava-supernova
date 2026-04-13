/**
 * Integration test for the mode_switch dataset event.
 *
 * mode_switch fires only when consecutive Agent.run() calls in the same
 * Agent instance detect different modes from the latest user message.
 * No event on first run; no event when mode is unchanged.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Agent } from '../src/agent/agent.js';
import type { Provider, ChatCompletionRequest } from '../src/providers/types.js';
import type { ModelDefinition, Message } from '../src/core/types.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import { avaEvents } from '../src/dataset/emitter.js';
import type { AvaEvent } from '../src/dataset/events.js';

const TEST_MODEL: ModelDefinition = {
  id: 'test-model', name: 'Test', provider: 'mock',
  contextWindow: 128000, maxOutputTokens: 4096, supportsToolCalls: true,
};

function mockProvider(content = 'ok'): Provider {
  return {
    name: 'mock',
    displayName: 'Mock',
    listModels: () => [TEST_MODEL],
    async createCompletion() {
      return {
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' as const }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
    },
    async *createStreamingCompletion(_req: ChatCompletionRequest) {
      yield { choices: [{ delta: { content }, index: 0, finish_reason: null }] };
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

describe('Agent → mode_switch event', () => {
  let registry: ToolRegistry;
  let captured: AvaEvent[];

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.registerBuiltins();
    captured = [];
    avaEvents.clearAllHandlers();
    avaEvents.onAll((e) => captured.push(e));
  });

  it('does NOT emit mode_switch on the first run', async () => {
    const agent = new Agent({
      provider: mockProvider(), model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });
    await agent.run([{ role: 'user', content: 'hi' }], () => {});
    await flush();

    expect(captured.find((e) => e.event_type === 'mode_switch')).toBeUndefined();
  });

  it('emits mode_switch when the user changes mode prefix between turns', async () => {
    const agent = new Agent({
      provider: mockProvider(), model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });

    let history: Message[] = [{ role: 'user', content: 'normal work message' }];
    history = await agent.run(history, () => {});
    await flush();
    expect(captured.find((e) => e.event_type === 'mode_switch')).toBeUndefined();

    captured.length = 0;
    history.push({ role: 'user', content: '[Plan Mode] design the auth flow' });
    await agent.run(history, () => {});
    await flush();

    const sw = captured.find((e) => e.event_type === 'mode_switch');
    expect(sw).toBeDefined();
    const p = sw!.payload as any;
    expect(p.from_mode).toBe('work');
    expect(p.to_mode).toBe('plan');
    expect(p.trigger).toBe('user_prefix');
  });

  it('does NOT emit mode_switch when consecutive runs are the same mode', async () => {
    const agent = new Agent({
      provider: mockProvider(), model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });

    let history: Message[] = [{ role: 'user', content: '[Chat Mode] hi' }];
    history = await agent.run(history, () => {});
    await flush();
    captured.length = 0;

    history.push({ role: 'user', content: '[Chat Mode] still chatting' });
    await agent.run(history, () => {});
    await flush();

    expect(captured.find((e) => e.event_type === 'mode_switch')).toBeUndefined();
  });
});
