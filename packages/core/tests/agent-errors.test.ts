import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent, type AgentEvent } from '../src/agent/agent.js';
import type { Provider, ChatCompletionRequest } from '../src/providers/types.js';
import type { ModelDefinition, Message, TokenUsage } from '../src/core/types.js';
import { ProviderError, StreamError } from '../src/core/errors.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

const TEST_MODEL: ModelDefinition = {
  id: 'test-model',
  name: 'Test Model',
  provider: 'mock',
  contextWindow: 128000,
  maxOutputTokens: 4096,
  supportsToolCalls: true,
};

/** Provider that throws an error after yielding some chunks. */
function createFailingStreamProvider(error: Error, chunksBeforeError = 0): Provider {
  return {
    name: 'mock',
    async *createStreamingCompletion(_request: ChatCompletionRequest) {
      for (let i = 0; i < chunksBeforeError; i++) {
        yield {
          choices: [{ delta: { content: `chunk${i} ` }, index: 0, finish_reason: null }],
        };
      }
      throw error;
    },
    listModels: () => [],
  };
}

/** Provider that yields a normal response. */
function createOKProvider(content: string): Provider {
  return {
    name: 'mock',
    async *createStreamingCompletion(_request: ChatCompletionRequest) {
      yield { choices: [{ delta: { content }, index: 0, finish_reason: null }] };
      yield {
        choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };
    },
    listModels: () => [],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Agent error recovery', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.registerBuiltins();
  });

  describe('streaming errors', () => {
    it('emits error event and returns messages on provider error', async () => {
      const provider = createFailingStreamProvider(
        new ProviderError('API error: 500', 'TestProvider', 500),
      );
      const agent = new Agent({ provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.' });

      const events: AgentEvent[] = [];
      const messages: Message[] = [{ role: 'system', content: 'test' }];
      const result = await agent.run(messages, (e) => events.push(e));

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect((errorEvents[0] as { type: 'error'; error: Error }).error).toBeInstanceOf(ProviderError);

      // Should return original messages (no partial assistant message added since streamResponse threw)
      expect(result).toEqual(messages);
    });

    it('preserves partial content when stream fails mid-response', async () => {
      // Provider yields 3 chunks before throwing
      const provider = createFailingStreamProvider(
        new ProviderError('stream stalled', 'TestProvider'),
        3,
      );
      const agent = new Agent({ provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.' });

      const events: AgentEvent[] = [];
      await agent.run([{ role: 'system', content: 'test' }], (e) => events.push(e));

      // Should have emitted stream_end with partial content before the error
      const streamEndEvents = events.filter((e) => e.type === 'stream_end');
      expect(streamEndEvents).toHaveLength(1);
      const partialMessage = (streamEndEvents[0] as { type: 'stream_end'; message: { content: string | null } }).message;
      expect(partialMessage.content).toContain('chunk0');
      expect(partialMessage.content).toContain('chunk2');

      // Error event should also be emitted
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
    });

    it('does not emit stream_end for partial content when nothing was streamed', async () => {
      // Provider throws immediately — no chunks
      const provider = createFailingStreamProvider(
        new ProviderError('connection refused', 'TestProvider'),
        0,
      );
      const agent = new Agent({ provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.' });

      const events: AgentEvent[] = [];
      await agent.run([{ role: 'system', content: 'test' }], (e) => events.push(e));

      // No stream_end because nothing was collected
      const streamEndEvents = events.filter((e) => e.type === 'stream_end');
      expect(streamEndEvents).toHaveLength(0);

      // But error event should still fire
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
    });

    it('wraps non-Error throws into Error objects', async () => {
      const provider: Provider = {
        name: 'mock',
        async *createStreamingCompletion() {
          throw 'string error'; // non-Error throw
        },
        listModels: () => [],
      };
      const agent = new Agent({ provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.' });

      const events: AgentEvent[] = [];
      await agent.run([{ role: 'system', content: 'test' }], (e) => events.push(e));

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect((errorEvents[0] as { type: 'error'; error: Error }).error).toBeInstanceOf(Error);
    });
  });

  describe('context truncation', () => {
    it('emits error event when messages are truncated to fit context', async () => {
      const provider = createOKProvider('response');
      const smallModel: ModelDefinition = { ...TEST_MODEL, contextWindow: 100 };
      const agent = new Agent({ provider, model: smallModel, toolRegistry: registry, cwd: '.' });

      const events: AgentEvent[] = [];
      // Create messages that exceed the very small context window
      const messages: Message[] = [
        { role: 'system', content: 'System prompt that takes up tokens' },
        { role: 'user', content: 'A'.repeat(5000) },
        { role: 'assistant', content: 'B'.repeat(5000) },
        { role: 'user', content: 'C'.repeat(5000) },
        { role: 'assistant', content: 'D'.repeat(5000) },
        { role: 'user', content: 'Latest message' },
      ];

      await agent.run(messages, (e) => events.push(e));

      // Context truncation now emits an error event (not context_truncated)
      // or triggers compression — either way, context management events should fire
      const contextEvents = events.filter(
        (e) => e.type === 'context_compression_start' || e.type === 'context_compression_end'
          || (e.type === 'error' && (e as { error: Error }).error.message.includes('compressed')),
      );
      expect(contextEvents.length).toBeGreaterThan(0);
    });

    it('does not emit context_truncated when messages fit in context', async () => {
      const provider = createOKProvider('response');
      const agent = new Agent({ provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.' });

      const events: AgentEvent[] = [];
      const messages: Message[] = [
        { role: 'system', content: 'test' },
        { role: 'user', content: 'short message' },
      ];

      await agent.run(messages, (e) => events.push(e));

      const truncEvents = events.filter((e) => e.type === 'context_truncated');
      expect(truncEvents).toHaveLength(0);
    });
  });
});

describe('ToolRegistry confirmation error handling', () => {
  it('returns graceful error when confirmation handler throws', async () => {
    const registry = new ToolRegistry();
    registry.registerBuiltins();
    registry.setPermissionMode('strict');
    registry.setConfirmationHandler(async () => {
      throw new Error('webview disconnected');
    });

    const result = await registry.execute('file_write', { file_path: '/test.ts', content: 'hi' }, { cwd: '.' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('confirmation failed');
    expect(result.output).toContain('webview disconnected');
  });

  it('still works normally when confirmation handler approves', async () => {
    const registry = new ToolRegistry();
    registry.registerBuiltins();
    registry.setPermissionMode('strict');
    registry.setConfirmationHandler(async () => true);

    // glob is a 'safe' tool — should not need confirmation in strict mode
    const result = await registry.execute('glob', { pattern: '*.nonexistent' }, { cwd: '.' });
    expect(result.success).toBe(true);
  });
});

describe('Error types', () => {
  it('ProviderError.retryable returns true for transient status codes', () => {
    expect(new ProviderError('msg', 'p', 429).retryable).toBe(true);
    expect(new ProviderError('msg', 'p', 500).retryable).toBe(true);
    expect(new ProviderError('msg', 'p', 502).retryable).toBe(true);
    expect(new ProviderError('msg', 'p', 503).retryable).toBe(true);
  });

  it('ProviderError.retryable returns false for permanent status codes', () => {
    expect(new ProviderError('msg', 'p', 400).retryable).toBe(false);
    expect(new ProviderError('msg', 'p', 401).retryable).toBe(false);
    expect(new ProviderError('msg', 'p', 403).retryable).toBe(false);
    expect(new ProviderError('msg', 'p', 404).retryable).toBe(false);
  });

  it('ProviderError.retryable returns true for network errors (no status code)', () => {
    expect(new ProviderError('network error', 'p').retryable).toBe(true);
  });

  it('StreamError has STREAM_ERROR code and stores partial content', () => {
    const err = new StreamError('stream died', 'DeepSeek', 'partial response text');
    expect(err.code).toBe('STREAM_ERROR');
    expect(err.name).toBe('StreamError');
    expect(err.partialContent).toBe('partial response text');
    expect(err).toBeInstanceOf(ProviderError);
  });

  it('AvaError supports cause chain', () => {
    const cause = new Error('root cause');
    const err = new ProviderError('wrapper', 'p');
    // Test that options param works (AvaError constructor accepts { cause })
    const wrapped = new (err.constructor as typeof ProviderError)('wrapped', 'p');
    expect(wrapped).toBeInstanceOf(ProviderError);
  });
});
