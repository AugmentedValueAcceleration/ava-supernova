import { describe, it, expect, vi } from 'vitest';
import { ResilientProvider } from '../src/providers/resilient-provider.js';
import { ProviderHealthTracker } from '../src/providers/health-tracker.js';
import { ProviderError } from '../src/core/errors.js';
import type { Provider } from '../src/providers/types.js';
import type { ModelDefinition, CompletionResponse, StreamChunk } from '../src/core/types.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeModel(id: string, provider: string): ModelDefinition {
  return {
    id,
    name: id,
    provider,
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsStreaming: true,
  };
}

function makeCompletion(model: string, content = 'Hello'): CompletionResponse {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 1234567890,
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function makeChunk(content: string): StreamChunk {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1234567890,
    model: 'test',
    choices: [{
      index: 0,
      delta: { content },
      finish_reason: null,
    }],
  };
}

function createMockProvider(
  name: string,
  opts: {
    completionResult?: CompletionResponse;
    completionError?: Error;
    streamChunks?: StreamChunk[];
    streamError?: Error;
  } = {},
): Provider {
  const model = makeModel(`${name}-model`, name);

  return {
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    listModels: () => [model],
    createCompletion: vi.fn(async () => {
      if (opts.completionError) throw opts.completionError;
      return opts.completionResult ?? makeCompletion(`${name}-model`);
    }),
    createStreamingCompletion: vi.fn(async function* () {
      if (opts.streamError) throw opts.streamError;
      for (const chunk of opts.streamChunks ?? [makeChunk(`from-${name}`)]) {
        yield chunk;
      }
    }),
  };
}

const baseRequest = {
  model: 'primary-model',
  messages: [{ role: 'user' as const, content: 'hello' }],
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ResilientProvider', () => {
  // ── Basic passthrough ─────────────────────────────────────────────────

  describe('when primary is healthy', () => {
    it('uses the primary provider', async () => {
      const primary = createMockProvider('primary');
      const fallback = createMockProvider('fallback');
      const tracker = new ProviderHealthTracker();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('primary-model', 'primary') },
        fallbacks: [{ provider: fallback, model: makeModel('fallback-model', 'fallback') }],
        healthTracker: tracker,
      });

      const result = await resilient.createCompletion(baseRequest);
      expect(result.choices[0].message.content).toBe('Hello');
      expect(primary.createCompletion).toHaveBeenCalledTimes(1);
      expect(fallback.createCompletion).not.toHaveBeenCalled();
    });

    it('rewrites model ID in the request', async () => {
      const primary = createMockProvider('primary');
      const tracker = new ProviderHealthTracker();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('actual-model-id', 'primary') },
        fallbacks: [],
        healthTracker: tracker,
      });

      await resilient.createCompletion({ ...baseRequest, model: 'whatever' });
      expect(primary.createCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'actual-model-id' }),
        undefined,
      );
    });

    it('exposes primary provider metadata', () => {
      const primary = createMockProvider('deepseek');
      const tracker = new ProviderHealthTracker();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('deepseek-chat', 'deepseek') },
        fallbacks: [],
        healthTracker: tracker,
      });

      expect(resilient.name).toBe('deepseek');
      expect(resilient.displayName).toBe('Deepseek');
      expect(resilient.listModels()).toEqual(primary.listModels());
    });
  });

  // ── Failover on transient errors ──────────────────────────────────────

  describe('failover on transient errors', () => {
    it('falls back when primary throws retryable ProviderError', async () => {
      const primary = createMockProvider('primary', {
        completionError: new ProviderError('Server error', 'primary', 500),
      });
      const fallback = createMockProvider('fallback');
      const tracker = new ProviderHealthTracker();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('p-model', 'primary') },
        fallbacks: [{ provider: fallback, model: makeModel('f-model', 'fallback') }],
        healthTracker: tracker,
      });

      const result = await resilient.createCompletion(baseRequest);
      expect(result.choices[0].message.content).toBe('Hello');
      expect(primary.createCompletion).toHaveBeenCalledTimes(1);
      expect(fallback.createCompletion).toHaveBeenCalledTimes(1);
    });

    it('rewrites model ID for fallback provider', async () => {
      const primary = createMockProvider('primary', {
        completionError: new ProviderError('Down', 'primary', 503),
      });
      const fallback = createMockProvider('fallback');
      const tracker = new ProviderHealthTracker();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('p-model', 'primary') },
        fallbacks: [{ provider: fallback, model: makeModel('fallback-model-v2', 'fallback') }],
        healthTracker: tracker,
      });

      await resilient.createCompletion(baseRequest);
      expect(fallback.createCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'fallback-model-v2' }),
        undefined,
      );
    });

    it('calls onFallback callback', async () => {
      const primary = createMockProvider('primary', {
        completionError: new ProviderError('Rate limited', 'primary', 429),
      });
      const fallback = createMockProvider('fallback');
      const tracker = new ProviderHealthTracker();
      const onFallback = vi.fn();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('p', 'primary') },
        fallbacks: [{ provider: fallback, model: makeModel('f', 'fallback') }],
        healthTracker: tracker,
        onFallback,
      });

      await resilient.createCompletion(baseRequest);
      expect(onFallback).toHaveBeenCalledTimes(1);
      expect(onFallback).toHaveBeenCalledWith(
        expect.objectContaining({ provider: primary }),
        expect.objectContaining({ provider: fallback }),
        expect.any(ProviderError),
      );
    });

    it('updates activeModel after failover', async () => {
      const primary = createMockProvider('primary', {
        completionError: new ProviderError('Down', 'primary', 502),
      });
      const fallback = createMockProvider('fallback');
      const tracker = new ProviderHealthTracker();
      const fbModel = makeModel('fallback-chat', 'fallback');

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('p', 'primary') },
        fallbacks: [{ provider: fallback, model: fbModel }],
        healthTracker: tracker,
      });

      await resilient.createCompletion(baseRequest);
      expect(resilient.activeModel).toBe(fbModel);
    });

    it('tries multiple fallbacks in order', async () => {
      const primary = createMockProvider('p', {
        completionError: new ProviderError('Down', 'p', 500),
      });
      const fb1 = createMockProvider('fb1', {
        completionError: new ProviderError('Also down', 'fb1', 502),
      });
      const fb2 = createMockProvider('fb2');
      const tracker = new ProviderHealthTracker();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('pm', 'p') },
        fallbacks: [
          { provider: fb1, model: makeModel('fm1', 'fb1') },
          { provider: fb2, model: makeModel('fm2', 'fb2') },
        ],
        healthTracker: tracker,
      });

      const result = await resilient.createCompletion(baseRequest);
      expect(result.choices[0].message.content).toBe('Hello');
      expect(primary.createCompletion).toHaveBeenCalledTimes(1);
      expect(fb1.createCompletion).toHaveBeenCalledTimes(1);
      expect(fb2.createCompletion).toHaveBeenCalledTimes(1);
    });
  });

  // ── Non-retryable errors ──────────────────────────────────────────────

  describe('non-retryable errors', () => {
    it('throws immediately on 401 (bad API key)', async () => {
      const primary = createMockProvider('primary', {
        completionError: new ProviderError('Unauthorized', 'primary', 401),
      });
      const fallback = createMockProvider('fallback');
      const tracker = new ProviderHealthTracker();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('p', 'primary') },
        fallbacks: [{ provider: fallback, model: makeModel('f', 'fallback') }],
        healthTracker: tracker,
      });

      await expect(resilient.createCompletion(baseRequest)).rejects.toThrow('Unauthorized');
      expect(fallback.createCompletion).not.toHaveBeenCalled();
    });

    it('throws immediately on 404 (model not found)', async () => {
      const primary = createMockProvider('primary', {
        completionError: new ProviderError('Not found', 'primary', 404),
      });
      const fallback = createMockProvider('fallback');
      const tracker = new ProviderHealthTracker();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('p', 'primary') },
        fallbacks: [{ provider: fallback, model: makeModel('f', 'fallback') }],
        healthTracker: tracker,
      });

      await expect(resilient.createCompletion(baseRequest)).rejects.toThrow('Not found');
      expect(fallback.createCompletion).not.toHaveBeenCalled();
    });
  });

  // ── All providers fail ────────────────────────────────────────────────

  describe('all providers fail', () => {
    it('throws last error when all entries exhausted', async () => {
      const primary = createMockProvider('p', {
        completionError: new ProviderError('Down', 'p', 500),
      });
      const fallback = createMockProvider('fb', {
        completionError: new ProviderError('Also down', 'fb', 503),
      });
      const tracker = new ProviderHealthTracker();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('pm', 'p') },
        fallbacks: [{ provider: fallback, model: makeModel('fm', 'fb') }],
        healthTracker: tracker,
      });

      await expect(resilient.createCompletion(baseRequest)).rejects.toThrow('Also down');
    });
  });

  // ── Health-aware chain building ───────────────────────────────────────

  describe('health-aware chain building', () => {
    it('skips unhealthy providers', async () => {
      const primary = createMockProvider('primary');
      const fallback = createMockProvider('fallback');
      const tracker = new ProviderHealthTracker();

      // Trip primary's circuit breaker
      tracker.recordFailure('primary');
      tracker.recordFailure('primary');
      tracker.recordFailure('primary');

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('pm', 'primary') },
        fallbacks: [{ provider: fallback, model: makeModel('fm', 'fallback') }],
        healthTracker: tracker,
      });

      await resilient.createCompletion(baseRequest);
      // Primary was skipped (unhealthy), fallback was used directly
      expect(primary.createCompletion).not.toHaveBeenCalled();
      expect(fallback.createCompletion).toHaveBeenCalledTimes(1);
    });

    it('falls back to primary when all are unhealthy', async () => {
      const primary = createMockProvider('primary');
      const fallback = createMockProvider('fallback');
      const tracker = new ProviderHealthTracker();

      // Trip both circuits
      tracker.recordFailure('primary');
      tracker.recordFailure('primary');
      tracker.recordFailure('primary');
      tracker.recordFailure('fallback');
      tracker.recordFailure('fallback');
      tracker.recordFailure('fallback');

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('pm', 'primary') },
        fallbacks: [{ provider: fallback, model: makeModel('fm', 'fallback') }],
        healthTracker: tracker,
      });

      await resilient.createCompletion(baseRequest);
      // Primary is still tried as last resort
      expect(primary.createCompletion).toHaveBeenCalledTimes(1);
    });
  });

  // ── Streaming failover ────────────────────────────────────────────────

  describe('streaming', () => {
    it('streams from primary when healthy', async () => {
      const primary = createMockProvider('primary', {
        streamChunks: [makeChunk('Hello'), makeChunk(' world')],
      });
      const fallback = createMockProvider('fallback');
      const tracker = new ProviderHealthTracker();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('pm', 'primary') },
        fallbacks: [{ provider: fallback, model: makeModel('fm', 'fallback') }],
        healthTracker: tracker,
      });

      const chunks = [];
      for await (const chunk of resilient.createStreamingCompletion(baseRequest)) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(2);
      expect(chunks[0].choices[0].delta.content).toBe('Hello');
      expect(chunks[1].choices[0].delta.content).toBe(' world');
    });

    it('falls back on streaming connection error', async () => {
      const primary = createMockProvider('primary', {
        streamError: new ProviderError('Connection failed', 'primary', 502),
      });
      const fallback = createMockProvider('fallback', {
        streamChunks: [makeChunk('fallback-content')],
      });
      const tracker = new ProviderHealthTracker();
      const onFallback = vi.fn();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('pm', 'primary') },
        fallbacks: [{ provider: fallback, model: makeModel('fm', 'fallback') }],
        healthTracker: tracker,
        onFallback,
      });

      const chunks = [];
      for await (const chunk of resilient.createStreamingCompletion(baseRequest)) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(1);
      expect(chunks[0].choices[0].delta.content).toBe('fallback-content');
      expect(onFallback).toHaveBeenCalledTimes(1);
    });

    it('throws on non-retryable streaming error', async () => {
      const primary = createMockProvider('primary', {
        streamError: new ProviderError('Bad key', 'primary', 401),
      });
      const fallback = createMockProvider('fallback');
      const tracker = new ProviderHealthTracker();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('pm', 'primary') },
        fallbacks: [{ provider: fallback, model: makeModel('fm', 'fallback') }],
        healthTracker: tracker,
      });

      await expect(async () => {
        for await (const _ of resilient.createStreamingCompletion(baseRequest)) {
          // consume
        }
      }).rejects.toThrow('Bad key');
      expect(fallback.createStreamingCompletion).not.toHaveBeenCalled();
    });
  });

  // ── Records health data ───────────────────────────────────────────────

  describe('health tracking', () => {
    it('records success on primary', async () => {
      const primary = createMockProvider('primary');
      const tracker = new ProviderHealthTracker();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('pm', 'primary') },
        fallbacks: [],
        healthTracker: tracker,
      });

      await resilient.createCompletion(baseRequest);
      const snap = tracker.getSnapshot('primary');
      expect(snap).toBeDefined();
      expect(snap!.successes).toBe(1);
    });

    it('records failure on primary and success on fallback', async () => {
      const primary = createMockProvider('primary', {
        completionError: new ProviderError('Down', 'primary', 500),
      });
      const fallback = createMockProvider('fallback');
      const tracker = new ProviderHealthTracker();

      const resilient = new ResilientProvider({
        primary: { provider: primary, model: makeModel('pm', 'primary') },
        fallbacks: [{ provider: fallback, model: makeModel('fm', 'fallback') }],
        healthTracker: tracker,
      });

      await resilient.createCompletion(baseRequest);
      expect(tracker.getSnapshot('primary')!.failures).toBe(1);
      expect(tracker.getSnapshot('fallback')!.successes).toBe(1);
    });
  });
});
