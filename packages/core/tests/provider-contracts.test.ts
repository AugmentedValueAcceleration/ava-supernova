import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeepSeekProvider } from '../src/providers/deepseek/index.js';
import { KimiProvider } from '../src/providers/kimi/index.js';
import { ZhipuProvider } from '../src/providers/zhipu/index.js';
import { QwenProvider } from '../src/providers/qwen/index.js';
import { MistralProvider } from '../src/providers/mistral/index.js';
import { GenericProvider } from '../src/providers/generic/index.js';

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

// ── Shared fixtures ──────────────────────────────────────────────────────────

/** Standard OpenAI-format completion response */
function makeCompletion(model: string, content = 'Hello!') {
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

/** Standard OpenAI-format completion with tool calls */
function makeToolCompletion(model: string, toolArgs: string | object) {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 1234567890,
    model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'tc1',
          type: 'function',
          function: { name: 'file_read', arguments: toolArgs },
        }],
      },
      finish_reason: 'tool_calls',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

/** Standard OpenAI-format stream chunk */
function makeChunk(model: string, content: string) {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1234567890,
    model,
    choices: [{
      index: 0,
      delta: { content },
      finish_reason: null,
    }],
  };
}

/** Stream chunk with tool call delta */
function makeToolChunk(model: string, args: string | object) {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1234567890,
    model,
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index: 0,
          id: 'tc1',
          type: 'function',
          function: { name: 'file_read', arguments: args },
        }],
      },
      finish_reason: null,
    }],
  };
}

/** Standard request payload */
const baseRequest = {
  model: 'test-model',
  messages: [{ role: 'user' as const, content: 'hello' }],
};

/** Collect all chunks from an async generator */
async function collectChunks(gen: AsyncGenerator<unknown>) {
  const chunks = [];
  for await (const chunk of gen) chunks.push(chunk);
  return chunks;
}

// ── Helpers to inspect fetch calls ───────────────────────────────────────────

function lastFetchUrl(): string {
  return mockFetch.mock.calls[0][0];
}

function lastFetchInit(): RequestInit {
  return mockFetch.mock.calls[0][1];
}

function lastFetchBody(): Record<string, unknown> {
  return JSON.parse(lastFetchInit().body as string);
}

function lastFetchHeaders(): Record<string, string> {
  return lastFetchInit().headers as Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DeepSeek — pure defaults, no overrides
// ═══════════════════════════════════════════════════════════════════════════════

describe('DeepSeek contract', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => vi.useRealTimers());

  it('sends requests to the correct URL', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('deepseek-chat')));
    const p = new DeepSeekProvider({ apiKey: 'sk-test' });
    await p.createCompletion({ ...baseRequest, model: 'deepseek-chat' });
    expect(lastFetchUrl()).toBe('https://api.deepseek.com/v1/chat/completions');
  });

  it('sends Bearer auth header', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('deepseek-chat')));
    const p = new DeepSeekProvider({ apiKey: 'sk-deep' });
    await p.createCompletion({ ...baseRequest, model: 'deepseek-chat' });
    expect(lastFetchHeaders().Authorization).toBe('Bearer sk-deep');
  });

  it('passes request body unchanged (no transforms)', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('deepseek-chat')));
    const p = new DeepSeekProvider({ apiKey: 'sk-test' });
    const req = { model: 'deepseek-chat', messages: [{ role: 'user' as const, content: 'hi' }], temperature: 0.7 };
    await p.createCompletion(req);
    const body = lastFetchBody();
    expect(body.model).toBe('deepseek-chat');
    expect(body.temperature).toBe(0.7);
  });

  it('streams standard SSE chunks', async () => {
    const chunk = makeChunk('deepseek-chat', 'Hi');
    mockFetch.mockResolvedValue(streamResponse([
      `data: ${JSON.stringify(chunk)}`,
      'data: [DONE]',
    ]));
    const p = new DeepSeekProvider({ apiKey: 'sk-test' });
    const chunks = await collectChunks(p.createStreamingCompletion({ ...baseRequest, model: 'deepseek-chat' }));
    expect(chunks).toHaveLength(1);
    expect((chunks[0] as any).choices[0].delta.content).toBe('Hi');
  });

  it('allows custom baseUrl', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('deepseek-chat')));
    const p = new DeepSeekProvider({ apiKey: 'sk-test', baseUrl: 'https://custom.deep.com' });
    await p.createCompletion({ ...baseRequest, model: 'deepseek-chat' });
    expect(lastFetchUrl()).toBe('https://custom.deep.com/chat/completions');
  });

  it('exposes correct provider metadata', () => {
    const p = new DeepSeekProvider({ apiKey: 'sk-test' });
    expect(p.name).toBe('deepseek');
    expect(p.displayName).toBe('DeepSeek');
    expect(p.listModels().length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Kimi (Moonshot) — pure defaults, different URL
// ═══════════════════════════════════════════════════════════════════════════════

describe('Kimi (Moonshot) contract', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => vi.useRealTimers());

  it('sends requests to Moonshot API', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('kimi-k2.5')));
    const p = new KimiProvider({ apiKey: 'sk-test' });
    await p.createCompletion({ ...baseRequest, model: 'kimi-k2.5' });
    expect(lastFetchUrl()).toBe('https://api.moonshot.ai/v1/chat/completions');
  });

  it('sends Bearer auth header', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('kimi-k2.5')));
    const p = new KimiProvider({ apiKey: 'sk-moon' });
    await p.createCompletion({ ...baseRequest, model: 'kimi-k2.5' });
    expect(lastFetchHeaders().Authorization).toBe('Bearer sk-moon');
  });

  it('passes tool_choice unchanged (no transform)', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('kimi-k2.5')));
    const p = new KimiProvider({ apiKey: 'sk-test' });
    await p.createCompletion({ ...baseRequest, model: 'kimi-k2.5', tool_choice: 'required' } as any);
    expect(lastFetchBody().tool_choice).toBe('required');
  });

  it('streams SSE and parses chunks', async () => {
    const chunk = makeChunk('kimi-k2.5', 'World');
    mockFetch.mockResolvedValue(streamResponse([
      `data: ${JSON.stringify(chunk)}`,
      'data: [DONE]',
    ]));
    const p = new KimiProvider({ apiKey: 'sk-test' });
    const chunks = await collectChunks(p.createStreamingCompletion({ ...baseRequest, model: 'kimi-k2.5' }));
    expect(chunks).toHaveLength(1);
    expect((chunks[0] as any).choices[0].delta.content).toBe('World');
  });

  it('exposes correct provider metadata', () => {
    const p = new KimiProvider({ apiKey: 'sk-test' });
    expect(p.name).toBe('kimi');
    expect(p.displayName).toContain('Moonshot');
    expect(p.listModels().length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Zhipu AI — thinking toggle + tool arg normalization
// ═══════════════════════════════════════════════════════════════════════════════

describe('Zhipu AI contract', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => vi.useRealTimers());

  it('sends requests to the international endpoint', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('glm-5')));
    const p = new ZhipuProvider({ apiKey: 'sk-test' });
    await p.createCompletion({ ...baseRequest, model: 'glm-5' });
    expect(lastFetchUrl()).toBe('https://api.z.ai/api/paas/v4/chat/completions');
  });

  it('disables thinking for Flash models', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('glm-5-flash')));
    const p = new ZhipuProvider({ apiKey: 'sk-test' });
    await p.createCompletion({ ...baseRequest, model: 'glm-5-flash' });
    expect(lastFetchBody().enable_thinking).toBe(false);
  });

  it('leaves GLM-5.3 Flash its thinking, despite the name', async () => {
    // "Flash" is the price tier on a 320B-A18B reasoning MoE. Disabling
    // thinking here would degrade a frontier model silently - no error, no
    // log line, just worse answers - so it is proved at the wire and not
    // only in the predicate.
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('glm-5.3-flash')));
    const p = new ZhipuProvider({ apiKey: 'sk-test' });
    await p.createCompletion({ ...baseRequest, model: 'glm-5.3-flash' });
    expect(lastFetchBody().enable_thinking).toBeUndefined();
  });

  it('does NOT set enable_thinking for non-Flash models', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('glm-5')));
    const p = new ZhipuProvider({ apiKey: 'sk-test' });
    await p.createCompletion({ ...baseRequest, model: 'glm-5' });
    expect(lastFetchBody().enable_thinking).toBeUndefined();
  });

  it('normalizes tool_call arguments from object to string (non-streaming)', async () => {
    // Zhipu returns arguments as objects — must be stringified
    mockFetch.mockResolvedValue(jsonResponse(makeToolCompletion('glm-5', { file_path: '/test.ts' })));
    const p = new ZhipuProvider({ apiKey: 'sk-test' });
    const result = await p.createCompletion({ ...baseRequest, model: 'glm-5' });
    const args = result.choices[0].message.tool_calls![0].function.arguments;
    expect(typeof args).toBe('string');
    expect(JSON.parse(args)).toEqual({ file_path: '/test.ts' });
  });

  it('normalizes tool_call arguments in streaming chunks', async () => {
    const chunk = makeToolChunk('glm-5', { file_path: '/test.ts' });
    mockFetch.mockResolvedValue(streamResponse([
      `data: ${JSON.stringify(chunk)}`,
      'data: [DONE]',
    ]));
    const p = new ZhipuProvider({ apiKey: 'sk-test' });
    const chunks = await collectChunks(p.createStreamingCompletion({ ...baseRequest, model: 'glm-5' }));
    const args = (chunks[0] as any).choices[0].delta.tool_calls[0].function.arguments;
    expect(typeof args).toBe('string');
  });

  it('passes string arguments unchanged', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeToolCompletion('glm-5', '{"file_path":"/test.ts"}')));
    const p = new ZhipuProvider({ apiKey: 'sk-test' });
    const result = await p.createCompletion({ ...baseRequest, model: 'glm-5' });
    const args = result.choices[0].message.tool_calls![0].function.arguments;
    expect(args).toBe('{"file_path":"/test.ts"}');
  });

  it('exposes correct provider metadata', () => {
    const p = new ZhipuProvider({ apiKey: 'sk-test' });
    expect(p.name).toBe('zhipu');
    expect(p.displayName).toContain('Zhipu');
    expect(p.listModels().length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Qwen (Alibaba Cloud) — frequency_penalty strip + reasoning_content strip
// ═══════════════════════════════════════════════════════════════════════════════

describe('Qwen (Alibaba Cloud) contract', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => vi.useRealTimers());

  it('sends requests to DashScope international endpoint', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('qwen-3.5-plus')));
    const p = new QwenProvider({ apiKey: 'sk-test' });
    await p.createCompletion({ ...baseRequest, model: 'qwen-3.5-plus' });
    expect(lastFetchUrl()).toBe('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');
  });

  it('strips frequency_penalty from request', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('qwen-3.5-plus')));
    const p = new QwenProvider({ apiKey: 'sk-test' });
    await p.createCompletion({
      ...baseRequest,
      model: 'qwen-3.5-plus',
      frequency_penalty: 0.5,
    } as any);
    expect(lastFetchBody().frequency_penalty).toBeUndefined();
  });

  it('strips reasoning_content from messages', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('qwen-3.5-plus')));
    const p = new QwenProvider({ apiKey: 'sk-test' });
    await p.createCompletion({
      model: 'qwen-3.5-plus',
      messages: [
        { role: 'assistant', content: 'thinking...', reasoning_content: 'deep thoughts' } as any,
        { role: 'user', content: 'hello' },
      ],
    });
    const body = lastFetchBody();
    const messages = body.messages as any[];
    for (const msg of messages) {
      expect(msg.reasoning_content).toBeUndefined();
    }
  });

  it('preserves other request fields', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('qwen-3.5-plus')));
    const p = new QwenProvider({ apiKey: 'sk-test' });
    await p.createCompletion({
      ...baseRequest,
      model: 'qwen-3.5-plus',
      temperature: 0.8,
    });
    const body = lastFetchBody();
    expect(body.temperature).toBe(0.8);
    expect(body.model).toBe('qwen-3.5-plus');
  });

  it('streams standard SSE format', async () => {
    const chunk = makeChunk('qwen-3.5-plus', 'Hi');
    mockFetch.mockResolvedValue(streamResponse([
      `data: ${JSON.stringify(chunk)}`,
      'data: [DONE]',
    ]));
    const p = new QwenProvider({ apiKey: 'sk-test' });
    const chunks = await collectChunks(p.createStreamingCompletion({ ...baseRequest, model: 'qwen-3.5-plus' }));
    expect(chunks).toHaveLength(1);
  });

  it('exposes correct provider metadata', () => {
    const p = new QwenProvider({ apiKey: 'sk-test' });
    expect(p.name).toBe('qwen');
    expect(p.displayName).toContain('Alibaba');
    expect(p.listModels().length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Mistral AI — tool_choice "required" → "any"
// ═══════════════════════════════════════════════════════════════════════════════

describe('Mistral AI contract', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => vi.useRealTimers());

  it('sends requests to Mistral API', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('mistral-large-3')));
    const p = new MistralProvider({ apiKey: 'sk-test' });
    await p.createCompletion({ ...baseRequest, model: 'mistral-large-3' });
    expect(lastFetchUrl()).toBe('https://api.mistral.ai/v1/chat/completions');
  });

  it('transforms tool_choice "required" to "any"', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('mistral-large-3')));
    const p = new MistralProvider({ apiKey: 'sk-test' });
    await p.createCompletion({
      ...baseRequest,
      model: 'mistral-large-3',
      tool_choice: 'required',
    } as any);
    expect(lastFetchBody().tool_choice).toBe('any');
  });

  it('leaves tool_choice "auto" unchanged', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('mistral-large-3')));
    const p = new MistralProvider({ apiKey: 'sk-test' });
    await p.createCompletion({
      ...baseRequest,
      model: 'mistral-large-3',
      tool_choice: 'auto',
    } as any);
    expect(lastFetchBody().tool_choice).toBe('auto');
  });

  it('leaves tool_choice "none" unchanged', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('mistral-large-3')));
    const p = new MistralProvider({ apiKey: 'sk-test' });
    await p.createCompletion({
      ...baseRequest,
      model: 'mistral-large-3',
      tool_choice: 'none',
    } as any);
    expect(lastFetchBody().tool_choice).toBe('none');
  });

  it('streams standard SSE format', async () => {
    const chunk = makeChunk('mistral-large-3', 'Bonjour');
    mockFetch.mockResolvedValue(streamResponse([
      `data: ${JSON.stringify(chunk)}`,
      'data: [DONE]',
    ]));
    const p = new MistralProvider({ apiKey: 'sk-test' });
    const chunks = await collectChunks(p.createStreamingCompletion({ ...baseRequest, model: 'mistral-large-3' }));
    expect(chunks).toHaveLength(1);
    expect((chunks[0] as any).choices[0].delta.content).toBe('Bonjour');
  });

  it('exposes correct provider metadata', () => {
    const p = new MistralProvider({ apiKey: 'sk-test' });
    expect(p.name).toBe('mistral');
    expect(p.displayName).toContain('Mistral');
    expect(p.listModels().length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Generic — optional auth, custom models, configurable baseUrl
// ═══════════════════════════════════════════════════════════════════════════════

describe('Generic provider contract', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => vi.useRealTimers());

  it('defaults to Ollama URL', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('llama3')));
    const p = new GenericProvider({ apiKey: '' });
    await p.createCompletion({ ...baseRequest, model: 'llama3' });
    expect(lastFetchUrl()).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('omits Authorization header when apiKey is empty', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('llama3')));
    const p = new GenericProvider({ apiKey: '' });
    await p.createCompletion({ ...baseRequest, model: 'llama3' });
    expect(lastFetchHeaders().Authorization).toBeUndefined();
    expect(lastFetchHeaders()['Content-Type']).toBe('application/json');
  });

  it('includes Authorization header when apiKey is provided', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('llama3')));
    const p = new GenericProvider({ apiKey: 'lm-key' });
    await p.createCompletion({ ...baseRequest, model: 'llama3' });
    expect(lastFetchHeaders().Authorization).toBe('Bearer lm-key');
  });

  it('uses custom baseUrl', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('my-model')));
    const p = new GenericProvider({ apiKey: '', baseUrl: 'http://192.168.1.100:8080/v1' });
    await p.createCompletion({ ...baseRequest, model: 'my-model' });
    expect(lastFetchUrl()).toBe('http://192.168.1.100:8080/v1/chat/completions');
  });

  it('accepts custom model definitions', () => {
    const customModels = [{
      id: 'my-local-model',
      name: 'My Local Model',
      provider: 'generic',
      contextWindow: 8192,
      maxOutputTokens: 2048,
      supportsToolCalls: false,
      supportsStreaming: true,
    }];
    const p = new GenericProvider({ apiKey: '', models: customModels });
    expect(p.listModels()).toEqual(customModels);
  });

  it('streams standard SSE format', async () => {
    const chunk = makeChunk('llama3', 'Hey');
    mockFetch.mockResolvedValue(streamResponse([
      `data: ${JSON.stringify(chunk)}`,
      'data: [DONE]',
    ]));
    const p = new GenericProvider({ apiKey: '' });
    const chunks = await collectChunks(p.createStreamingCompletion({ ...baseRequest, model: 'llama3' }));
    expect(chunks).toHaveLength(1);
    expect((chunks[0] as any).choices[0].delta.content).toBe('Hey');
  });

  it('exposes correct provider metadata', () => {
    const p = new GenericProvider({ apiKey: '' });
    expect(p.name).toBe('generic');
    expect(p.displayName).toContain('Custom');
    expect(p.listModels().length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cross-provider contract validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cross-provider contracts', () => {
  it('all providers implement required interface', () => {
    const providers = [
      new DeepSeekProvider({ apiKey: 'sk-test' }),
      new KimiProvider({ apiKey: 'sk-test' }),
      new ZhipuProvider({ apiKey: 'sk-test' }),
      new QwenProvider({ apiKey: 'sk-test' }),
      new MistralProvider({ apiKey: 'sk-test' }),
      new GenericProvider({ apiKey: '' }),
    ];

    for (const p of providers) {
      expect(typeof p.name).toBe('string');
      expect(typeof p.displayName).toBe('string');
      expect(typeof p.createCompletion).toBe('function');
      expect(typeof p.createStreamingCompletion).toBe('function');
      expect(typeof p.listModels).toBe('function');
      expect(Array.isArray(p.listModels())).toBe(true);
    }
  });

  it('all model definitions have required fields', () => {
    const providers = [
      new DeepSeekProvider({ apiKey: 'sk-test' }),
      new KimiProvider({ apiKey: 'sk-test' }),
      new ZhipuProvider({ apiKey: 'sk-test' }),
      new QwenProvider({ apiKey: 'sk-test' }),
      new MistralProvider({ apiKey: 'sk-test' }),
      new GenericProvider({ apiKey: '' }),
    ];

    for (const p of providers) {
      for (const m of p.listModels()) {
        expect(m.id).toBeTruthy();
        expect(m.name).toBeTruthy();
        expect(m.provider).toBeTruthy();
        expect(typeof m.contextWindow).toBe('number');
        expect(typeof m.maxOutputTokens).toBe('number');
        expect(typeof m.supportsToolCalls).toBe('boolean');
        expect(typeof m.supportsStreaming).toBe('boolean');
      }
    }
  });
});
