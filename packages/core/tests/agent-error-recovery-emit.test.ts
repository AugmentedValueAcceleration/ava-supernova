/**
 * Integration tests for tool_error / error_guidance_applied / recovery_action.
 *
 * The flow we're verifying:
 *   tool_choice → tool_result(success=false) → tool_error
 *     → error_guidance_applied (if pattern matches)
 *     → tool_choice (next) → recovery_action (linked back to the error)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Agent } from '../src/agent/agent.js';
import type { Provider, ChatCompletionRequest } from '../src/providers/types.js';
import type { ModelDefinition } from '../src/core/types.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import { avaEvents } from '../src/dataset/emitter.js';
import type { AvaEvent } from '../src/dataset/events.js';
import { matchToolError } from '../src/tools/error-guidance.js';

const TEST_MODEL: ModelDefinition = {
  id: 'test-model',
  name: 'Test',
  provider: 'mock',
  contextWindow: 128000,
  maxOutputTokens: 4096,
  supportsToolCalls: true,
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
                  index: j,
                  id: tc.id,
                  function: { name: tc.function.name, arguments: tc.function.arguments },
                }],
              },
              index: 0,
              finish_reason: null,
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

async function flushMicrotasks(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('Agent → error recovery events', () => {
  let registry: ToolRegistry;
  let captured: AvaEvent[];

  beforeEach(() => {
    registry = new ToolRegistry();
    // Tool that always fails with a recognisable pattern (port-in-use)
    registry.register({
      name: 'always_fails_port',
      description: 'Always returns a port-in-use error',
      schema: { type: 'object', properties: {}, required: [] },
      riskLevel: 'safe',
      requiresConfirmation: false,
      execute: async () => ({
        output: 'Error: EADDRINUSE address already in use :::3000',
        success: false,
      }),
    });
    // Tool that fails with no recognised pattern
    registry.register({
      name: 'fails_unknown',
      description: 'Fails with a generic message',
      schema: { type: 'object', properties: {}, required: [] },
      riskLevel: 'safe',
      requiresConfirmation: false,
      execute: async () => ({
        output: 'something weird happened',
        success: false,
      }),
    });
    // Tool that succeeds — used as the "recovery" choice
    registry.register({
      name: 'works_fine',
      description: 'Always succeeds',
      schema: { type: 'object', properties: {}, required: [] },
      riskLevel: 'safe',
      requiresConfirmation: false,
      execute: async () => ({ output: 'ok', success: true }),
    });

    captured = [];
    avaEvents.clearAllHandlers();
    avaEvents.onAll((e) => captured.push(e));
  });

  it('emits tool_error with pattern_key when guidance pattern matches', async () => {
    const provider = mockProvider([
      {
        tool_calls: [{
          id: 'c1',
          function: { name: 'always_fails_port', arguments: '{}' },
        }],
      },
      { content: 'gave up' },
    ]);
    const agent = new Agent({
      provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });

    await agent.run([{ role: 'user', content: 'go' }], () => {});
    await flushMicrotasks();

    const err = captured.find((e) => e.event_type === 'tool_error');
    expect(err).toBeDefined();
    const p = err!.payload as any;
    expect(p.tool_name).toBe('always_fails_port');
    expect(p.error_pattern_match).toBe('port-in-use');
    expect(p.tool_result_event_id).toBeTruthy();
  });

  it('emits error_guidance_applied when a pattern matches, omits when none does', async () => {
    const provider = mockProvider([
      {
        tool_calls: [{
          id: 'c1',
          function: { name: 'always_fails_port', arguments: '{}' },
        }],
      },
      { content: 'done' },
    ]);
    const agent = new Agent({
      provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });
    await agent.run([{ role: 'user', content: 'go' }], () => {});
    await flushMicrotasks();

    const guidance = captured.find((e) => e.event_type === 'error_guidance_applied');
    expect(guidance).toBeDefined();
    expect((guidance!.payload as any).pattern).toBe('port-in-use');
    expect(typeof (guidance!.payload as any).guidance_summary).toBe('string');
  });

  it('does NOT emit error_guidance_applied for unknown error patterns', async () => {
    const provider = mockProvider([
      {
        tool_calls: [{
          id: 'c1',
          function: { name: 'fails_unknown', arguments: '{}' },
        }],
      },
      { content: 'done' },
    ]);
    const agent = new Agent({
      provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });
    await agent.run([{ role: 'user', content: 'go' }], () => {});
    await flushMicrotasks();

    // tool_error still fires (failure happened) but with no pattern_match
    const err = captured.find((e) => e.event_type === 'tool_error');
    expect(err).toBeDefined();
    expect((err!.payload as any).error_pattern_match).toBeUndefined();
    // No guidance event
    expect(captured.find((e) => e.event_type === 'error_guidance_applied')).toBeUndefined();
  });

  it('emits recovery_action linked back to the prior tool_error', async () => {
    const provider = mockProvider([
      {
        tool_calls: [{
          id: 'c1',
          function: { name: 'always_fails_port', arguments: '{}' },
        }],
      },
      {
        tool_calls: [{
          id: 'c2',
          function: { name: 'works_fine', arguments: '{}' },
        }],
      },
      { content: 'recovered' },
    ]);
    const agent = new Agent({
      provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });
    await agent.run([{ role: 'user', content: 'go' }], () => {});
    await flushMicrotasks();

    const err = captured.find((e) => e.event_type === 'tool_error')!;
    const recovery = captured.find((e) => e.event_type === 'recovery_action');
    expect(recovery).toBeDefined();
    const p = recovery!.payload as any;
    expect(p.tool_error_event_id).toBe(err.event_id);
    expect(p.next_tool).toBe('works_fine');
    expect(p.recovery_kind).toBe('switch_tool');
  });

  it('recovery_kind = retry_same when next call uses the same tool', async () => {
    const provider = mockProvider([
      {
        tool_calls: [{
          id: 'c1',
          function: { name: 'always_fails_port', arguments: '{}' },
        }],
      },
      {
        tool_calls: [{
          id: 'c2',
          function: { name: 'always_fails_port', arguments: '{}' },
        }],
      },
      { content: 'still failing' },
    ]);
    const agent = new Agent({
      provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });
    await agent.run([{ role: 'user', content: 'go' }], () => {});
    await flushMicrotasks();

    const recovery = captured.find((e) => e.event_type === 'recovery_action');
    expect(recovery).toBeDefined();
    expect((recovery!.payload as any).recovery_kind).toBe('retry_same');
  });

  it('matchToolError pattern keys are stable for known patterns', () => {
    expect(matchToolError('Error: EADDRINUSE :::3000')?.pattern_key).toBe('port-in-use');
    expect(matchToolError('ENOENT no such file or directory')?.pattern_key).toBe('file-not-found');
    expect(matchToolError('something nobody wrote a pattern for')).toBeNull();
  });
});
