import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderError } from '../src/core/errors.js';
import { MistralProvider } from '../src/providers/mistral/index.js';
import { ZhipuProvider } from '../src/providers/zhipu/index.js';
import { DeepSeekProvider } from '../src/providers/deepseek/index.js';

// ── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

function sseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + '\n'));
      }
      controller.close();
    },
  });
}

function streamResponse(lines: string[]) {
  return new Response(sseStream(lines), {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

// We use DeepSeek as our test provider since it uses all BaseProvider defaults.
function createProvider(apiKey = 'sk-test') {
  return new DeepSeekProvider({ apiKey });
}

const sampleChunk = {
  id: 'chatcmpl-1',
  object: 'chat.completion.chunk',
  created: 1234567890,
  model: 'deepseek-chat',
  choices: [{
    index: 0,
    delta: { content: 'Hello' },
    finish_reason: null,
  }],
};

const sampleCompletion = {
  id: 'chatcmpl-1',
  object: 'chat.completion',
  created: 1234567890,
  model: 'deepseek-chat',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: 'Hello!' },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BaseProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('fetchWithRetry', () => {
    it('returns response on 200 OK', async () => {
      mockFetch.mockResolvedValue(jsonResponse(sampleCompletion));
      const provider = createProvider();
      const result = await provider.createCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect(result.choices[0].message.content).toBe('Hello!');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on 429 (rate limited)', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
        .mockResolvedValueOnce(jsonResponse(sampleCompletion));

      const provider = createProvider();
      const result = await provider.createCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect(result.choices[0].message.content).toBe('Hello!');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 500/502/503', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('error', { status: 500 }))
        .mockResolvedValueOnce(new Response('error', { status: 502 }))
        .mockResolvedValueOnce(jsonResponse(sampleCompletion));

      const provider = createProvider();
      const result = await provider.createCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect(result.choices[0].message.content).toBe('Hello!');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('does NOT retry on 400 (throws immediately)', async () => {
      mockFetch.mockResolvedValue(new Response('bad request', { status: 400 }));
      const provider = createProvider();
      await expect(provider.createCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
      })).rejects.toThrow(ProviderError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry on 401 (throws immediately)', async () => {
      mockFetch.mockResolvedValue(new Response('unauthorized', { status: 401 }));
      const provider = createProvider();
      await expect(provider.createCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
      })).rejects.toThrow(ProviderError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws ProviderError with status code on non-retryable failure', async () => {
      mockFetch.mockResolvedValue(new Response('forbidden', { status: 403 }));
      const provider = createProvider();
      try {
        await provider.createCompletion({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'hi' }],
        });
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderError);
        expect((err as ProviderError).statusCode).toBe(403);
      }
    });

    it('throws ProviderError on network error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      const provider = createProvider();
      await expect(provider.createCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
      })).rejects.toThrow(ProviderError);
    });
  });

  describe('createStreamingCompletion', () => {
    it('parses SSE stream and yields StreamChunks', async () => {
      mockFetch.mockResolvedValue(streamResponse([
        `data: ${JSON.stringify(sampleChunk)}`,
        'data: [DONE]',
      ]));

      const provider = createProvider();
      const chunks = [];
      for await (const chunk of provider.createStreamingCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
      })) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(1);
      expect(chunks[0].choices[0].delta.content).toBe('Hello');
    });

    it('stops on data: [DONE] sentinel', async () => {
      const chunk2 = { ...sampleChunk, choices: [{ index: 0, delta: { content: ' World' }, finish_reason: null }] };
      mockFetch.mockResolvedValue(streamResponse([
        `data: ${JSON.stringify(sampleChunk)}`,
        'data: [DONE]',
        `data: ${JSON.stringify(chunk2)}`, // should never be yielded
      ]));

      const provider = createProvider();
      const chunks = [];
      for await (const chunk of provider.createStreamingCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
      })) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(1);
    });

    it('skips malformed JSON chunks', async () => {
      mockFetch.mockResolvedValue(streamResponse([
        'data: {not valid json}',
        `data: ${JSON.stringify(sampleChunk)}`,
        'data: [DONE]',
      ]));

      const provider = createProvider();
      const chunks = [];
      for await (const chunk of provider.createStreamingCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
      })) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(1);
    });

    it('throws ProviderError for error objects in SSE stream', async () => {
      mockFetch.mockResolvedValue(streamResponse([
        `data: ${JSON.stringify({ error: { message: 'context length exceeded', code: 400 } })}`,
      ]));

      const provider = createProvider();
      await expect(async () => {
        for await (const _ of provider.createStreamingCompletion({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'hi' }],
        })) {
          // consume
        }
      }).rejects.toThrow(ProviderError);
    });

    it('handles empty/blank lines in SSE data', async () => {
      mockFetch.mockResolvedValue(streamResponse([
        '',
        `data: ${JSON.stringify(sampleChunk)}`,
        '   ',
        'data: [DONE]',
      ]));

      const provider = createProvider();
      const chunks = [];
      for await (const chunk of provider.createStreamingCompletion({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
      })) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(1);
    });
  });

  describe('provider-specific overrides', () => {
    it('MistralProvider transforms tool_choice "required" to "any"', () => {
      vi.useRealTimers(); // No timers needed for sync test
      const provider = new MistralProvider({ apiKey: 'sk-test' });
      const transformed = (provider as any).transformRequest({
        model: 'mistral-large-3',
        messages: [],
        tool_choice: 'required',
      });
      expect(transformed.tool_choice).toBe('any');
    });

    it('MistralProvider leaves "auto" tool_choice unchanged', () => {
      vi.useRealTimers();
      const provider = new MistralProvider({ apiKey: 'sk-test' });
      const transformed = (provider as any).transformRequest({
        model: 'mistral-large-3',
        messages: [],
        tool_choice: 'auto',
      });
      expect(transformed.tool_choice).toBe('auto');
    });

    it('ZhipuProvider normalizes tool_call arguments from object to string', () => {
      vi.useRealTimers();
      const provider = new ZhipuProvider({ apiKey: 'sk-test' });
      const raw = {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'tc1',
              type: 'function',
              function: {
                name: 'file_read',
                arguments: { file_path: '/test.ts' }, // object instead of string
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      const normalized = (provider as any).normalizeResponse(raw);
      expect(typeof normalized.choices[0].message.tool_calls[0].function.arguments).toBe('string');
      expect(JSON.parse(normalized.choices[0].message.tool_calls[0].function.arguments)).toEqual({ file_path: '/test.ts' });
    });
  });

  describe('baseUrl', () => {
    it('uses default base URL when config does not specify one', () => {
      // Default deliberately includes /v1 so BaseProvider's
      // `${baseUrl}/chat/completions` resolves correctly — see deepseek/index.ts.
      const provider = createProvider();
      expect((provider as any).baseUrl).toBe('https://api.deepseek.com/v1');
    });

    it('uses config base URL when specified', () => {
      const provider = new DeepSeekProvider({ apiKey: 'sk-test', baseUrl: 'https://custom.api.com' });
      expect((provider as any).baseUrl).toBe('https://custom.api.com');
    });
  });
});
