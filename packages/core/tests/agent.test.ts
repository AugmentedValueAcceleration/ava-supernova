import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent, type AgentEvent, type AgentEventHandler } from '../src/agent/agent.js';
import type { Provider, ChatCompletionRequest } from '../src/providers/types.js';
import type { ModelDefinition, Message, TokenUsage } from '../src/core/types.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';

// ── Mock Provider ────────────────────────────────────────────────────────────

function createMockProvider(responses: Array<{
  content?: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  usage?: TokenUsage;
}>): Provider {
  let callIndex = 0;

  return {
    name: 'mock',
    async *createStreamingCompletion(_request: ChatCompletionRequest) {
      const response = responses[callIndex++] ?? responses[responses.length - 1];

      // Yield content as a single chunk
      if (response.content) {
        yield {
          choices: [{
            delta: { content: response.content },
            index: 0,
            finish_reason: null,
          }],
        };
      }

      // Yield tool calls
      if (response.tool_calls) {
        for (let i = 0; i < response.tool_calls.length; i++) {
          const tc = response.tool_calls[i];
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  index: i,
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

      // Yield usage
      yield {
        choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
        usage: response.usage ?? { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };
    },
    listModels: () => [],
  };
}

const TEST_MODEL: ModelDefinition = {
  id: 'test-model',
  name: 'Test Model',
  provider: 'mock',
  contextWindow: 128000,
  maxOutputTokens: 4096,
  supportsToolCalls: true,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Agent', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.registerBuiltins();
  });

  it('streams a simple text response and emits correct events', async () => {
    const provider = createMockProvider([{ content: 'Hello world!' }]);
    const agent = new Agent({ provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.' });

    const events: AgentEvent[] = [];
    const messages: Message[] = [{ role: 'system', content: 'You are a test.' }];

    const result = await agent.run(messages, (e) => events.push(e));

    const types = events.map((e) => e.type);
    expect(types).toContain('stream_start');
    expect(types).toContain('stream_delta');
    expect(types).toContain('stream_end');
    expect(types).toContain('usage');
    expect(types).toContain('done');

    // Result should include original messages + assistant response
    expect(result.length).toBeGreaterThan(messages.length);
    const lastMsg = result[result.length - 1];
    expect(lastMsg.role).toBe('assistant');
  });

  it('handles empty response from model', async () => {
    const provider = createMockProvider([{ content: '' }]);
    const agent = new Agent({
      provider,
      model: TEST_MODEL,
      toolRegistry: registry,
      cwd: '.',
    });

    const events: AgentEvent[] = [];
    await agent.run([{ role: 'system', content: 'test' }], (e) => events.push(e));

    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents.length).toBe(1);
    expect((errorEvents[0] as { type: 'error'; error: Error }).error.message).toContain('didn\'t send a response');
  });

  it('stops when abort signal is triggered', async () => {
    const controller = new AbortController();
    // Abort immediately
    controller.abort();

    const provider = createMockProvider([{ content: 'Should not appear' }]);
    const agent = new Agent({ provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.' });

    const events: AgentEvent[] = [];
    const result = await agent.run(
      [{ role: 'system', content: 'test' }],
      (e) => events.push(e),
      controller.signal,
    );

    const types = events.map((e) => e.type);
    expect(types).toContain('done');
    // Should not have streamed anything
    expect(types).not.toContain('stream_delta');
  });

  it('executes tool calls and continues the loop', async () => {
    // First response has a tool call, second response is final text
    const provider = createMockProvider([
      {
        tool_calls: [{
          id: 'tc-1',
          function: { name: 'glob', arguments: JSON.stringify({ pattern: '*.ts' }) },
        }],
      },
      { content: 'Found some files.' },
    ]);

    const agent = new Agent({ provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.' });

    const events: AgentEvent[] = [];
    await agent.run([{ role: 'system', content: 'test' }], (e) => events.push(e));

    const types = events.map((e) => e.type);
    expect(types).toContain('tool_call_start');
    expect(types).toContain('tool_call_end');
    expect(types).toContain('done');
  });

  it('does not send tool schemas when model does not support tools', async () => {
    const noToolModel: ModelDefinition = { ...TEST_MODEL, supportsToolCalls: false };
    const capturedRequests: ChatCompletionRequest[] = [];

    const provider: Provider = {
      name: 'mock',
      async *createStreamingCompletion(request: ChatCompletionRequest) {
        capturedRequests.push(request);
        yield {
          choices: [{ delta: { content: 'No tools here' }, index: 0, finish_reason: null }],
        };
        yield {
          choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        };
      },
      listModels: () => [],
    };

    const agent = new Agent({ provider, model: noToolModel, toolRegistry: registry, cwd: '.' });
    await agent.run([{ role: 'system', content: 'test' }], () => {});

    expect(capturedRequests[0].tools).toBeUndefined();
  });
});

describe('Agent.truncateMessages', () => {
  // Access the private method via casting for testing
  function createAgentForTruncation() {
    const provider = createMockProvider([]);
    const registry = new ToolRegistry();
    const agent = new Agent({
      provider,
      model: { ...TEST_MODEL, contextWindow: 1000 },
      toolRegistry: registry,
      cwd: '.',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return agent as any;
  }

  it('preserves system message during truncation', () => {
    const agent = createAgentForTruncation();

    const messages: Message[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'A'.repeat(3000) }, // ~1000 tokens at length/3
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Latest message' },
      { role: 'assistant', content: 'Latest response' },
    ];

    const result = agent.truncateMessages(messages, 200);

    // System message should always be first
    expect(result[0].role).toBe('system');
    expect(result[0].content).toBe('System prompt');

    // Most recent messages should be kept
    const lastMsg = result[result.length - 1];
    expect(lastMsg.content).toBe('Latest response');
  });

  it('returns messages unchanged when under budget', () => {
    const agent = createAgentForTruncation();

    const messages: Message[] = [
      { role: 'system', content: 'Hi' },
      { role: 'user', content: 'Short' },
    ];

    const result = agent.truncateMessages(messages, 10000);
    expect(result).toEqual(messages);
  });
});
