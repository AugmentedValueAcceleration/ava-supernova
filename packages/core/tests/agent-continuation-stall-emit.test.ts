/**
 * Integration test for continuation_stall_detected and continuation_nudge_fired.
 *
 * Drives the agent through a stall scenario (model returns "Let me rewrite..."
 * with no tool calls) and asserts the dataset events fire with the expected
 * stall_pattern and recovered status.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Agent } from '../src/agent/agent.js';
import type { Provider, ChatCompletionRequest } from '../src/providers/types.js';
import type { ModelDefinition } from '../src/core/types.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import { avaEvents } from '../src/dataset/emitter.js';
import type { AvaEvent } from '../src/dataset/events.js';

const TEST_MODEL: ModelDefinition = {
  id: 'test-model', name: 'Test', provider: 'mock',
  contextWindow: 128000, maxOutputTokens: 4096, supportsToolCalls: true,
};

function mockProvider(responses: Array<{
  content?: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
}>): Provider {
  let i = 0;
  return {
    name: 'mock',
    displayName: 'Mock',
    listModels: () => [TEST_MODEL],
    async createCompletion() {
      return {
        choices: [{ index: 0, message: { role: 'assistant', content: 'noop' }, finish_reason: 'stop' as const }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
    },
    async *createStreamingCompletion(_req: ChatCompletionRequest) {
      const r = responses[i++] ?? responses[responses.length - 1];
      if (r.content) {
        yield { choices: [{ delta: { content: r.content }, index: 0, finish_reason: null }] };
      }
      if (r.tool_calls) {
        for (let j = 0; j < r.tool_calls.length; j++) {
          const tc = r.tool_calls[j];
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  index: j, id: tc.id,
                  function: { name: tc.function.name, arguments: tc.function.arguments },
                }],
              },
              index: 0, finish_reason: null,
            }],
          };
        }
      }
      yield {
        choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };
    },
  };
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('Agent → continuation stall events', () => {
  let registry: ToolRegistry;
  let captured: AvaEvent[];

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register({
      name: 'noop',
      description: 'no-op',
      schema: { type: 'object', properties: {}, required: [] },
      riskLevel: 'safe',
      requiresConfirmation: false,
      execute: async () => ({ output: 'ok', success: true }),
    });
    captured = [];
    avaEvents.clearAllHandlers();
    avaEvents.onAll((e) => captured.push(e));
  });

  it('emits continuation_stall_detected when model narrates intent without acting', async () => {
    // First response: stall-shaped narration with no tool calls.
    // Second response (after nudge): produce a tool call so the nudge succeeds.
    // Third response: clean text ending.
    const provider = mockProvider([
      { content: "Let me rewrite the sidebar." }, // stall — matches prefix
      { tool_calls: [{ id: 't1', function: { name: 'noop', arguments: '{}' } }] }, // nudged action
      { content: 'Done.' },
    ]);
    const agent = new Agent({
      provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });

    await agent.run([{ role: 'user', content: 'fix it' }], () => {});
    await flush();

    const stall = captured.find((e) => e.event_type === 'continuation_stall_detected');
    expect(stall).toBeDefined();
    const sp = stall!.payload as any;
    expect(sp.stall_pattern).toBe('continuation-narration');
    expect(typeof sp.response_summary).toBe('string');
  });

  it('emits continuation_nudge_fired with recovered=true when nudge gets tool calls', async () => {
    const provider = mockProvider([
      { content: "Let me rewrite the sidebar." },
      { tool_calls: [{ id: 't1', function: { name: 'noop', arguments: '{}' } }] },
      { content: 'Done.' },
    ]);
    const agent = new Agent({
      provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });
    await agent.run([{ role: 'user', content: 'fix it' }], () => {});
    await flush();

    const nudge = captured.find((e) => e.event_type === 'continuation_nudge_fired');
    expect(nudge).toBeDefined();
    const np = nudge!.payload as any;
    expect(np.recovered).toBe(true);
    // Cross-references the stall event
    const stall = captured.find((e) => e.event_type === 'continuation_stall_detected')!;
    expect(np.stall_event_id).toBe(stall.event_id);
  });

  it('does NOT emit stall events on a normal response', async () => {
    const provider = mockProvider([{ content: 'Here is the answer to your question.' }]);
    const agent = new Agent({
      provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });
    await agent.run([{ role: 'user', content: 'tell me' }], () => {});
    await flush();

    expect(captured.find((e) => e.event_type === 'continuation_stall_detected')).toBeUndefined();
    expect(captured.find((e) => e.event_type === 'continuation_nudge_fired')).toBeUndefined();
  });
});
