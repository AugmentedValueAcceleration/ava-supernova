import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeepSeekProvider } from '../src/providers/deepseek/index.js';
import { KimiProvider } from '../src/providers/kimi/index.js';
import { ZhipuProvider } from '../src/providers/zhipu/index.js';
import { QwenProvider } from '../src/providers/qwen/index.js';
import { MistralProvider } from '../src/providers/mistral/index.js';
import { AnthropicProvider } from '../src/providers/anthropic/index.js';
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
    mockFetch.mockResolvedValue(jsonResponse(makeCompletion('glm-4.5-air')));
    const p = new ZhipuProvider({ apiKey: 'sk-test' });
    await p.createCompletion({ ...baseRequest, model: 'glm-4.5-air' });
    expect(lastFetchBody().enable_thinking).toBe(false);
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
// Anthropic — completely different API format
// ═══════════════════════════════════════════════════════════════════════════════

describe('Anthropic contract', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => vi.useRealTimers());

  // ── Request format ──────────────────────────────────────────────────────

  it('sends requests to /v1/messages (not /chat/completions)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello!' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    }));
    const p = new AnthropicProvider({ apiKey: 'sk-ant-FAKE-TEST-KEY' });
    await p.createCompletion({ ...baseRequest, model: 'claude-sonnet-4-6-20250514' });
    expect(lastFetchUrl()).toBe('https://api.anthropic.com/v1/messages');
  });

  it('uses x-api-key header (not Bearer)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 'msg_1', type: 'message', role: 'assistant',
      content: [{ type: 'text', text: 'Hi' }],
      stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 3 },
    }));
    const p = new AnthropicProvider({ apiKey: 'sk-ant-FAKE-TEST-KEY-2' });
    await p.createCompletion({ ...baseRequest, model: 'claude-sonnet-4-6-20250514' });
    const headers = lastFetchHeaders();
    expect(headers['x-api-key']).toBe('sk-ant-FAKE-TEST-KEY-2');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers.Authorization).toBeUndefined();
  });

  it('extracts system messages to top-level system field with cache_control', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 'msg_1', type: 'message', role: 'assistant',
      content: [{ type: 'text', text: 'OK' }],
      stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 2 },
    }));
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    await p.createCompletion({
      model: 'claude-sonnet-4-6-20250514',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'hello' },
      ],
    });
    const body = lastFetchBody();
    // System is promoted to a structured content-block array so we can tag
    // it with cache_control: ephemeral — this is what gives every
    // subsequent turn the ~90% prompt-cache discount.
    expect(Array.isArray(body.system)).toBe(true);
    const systemBlocks = body.system as Array<{ type: string; text: string; cache_control?: unknown }>;
    expect(systemBlocks).toHaveLength(1);
    expect(systemBlocks[0].type).toBe('text');
    expect(systemBlocks[0].text).toBe('You are helpful.');
    expect(systemBlocks[0].cache_control).toEqual({ type: 'ephemeral' });
    // System message should not appear in messages array
    const msgs = body.messages as any[];
    expect(msgs.every((m: any) => m.role !== 'system')).toBe(true);
  });

  it('tags the last tool with cache_control so tool schemas are cached', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 'msg_1', type: 'message', role: 'assistant',
      content: [{ type: 'text', text: 'OK' }],
      stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 2 },
    }));
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    await p.createCompletion({
      model: 'claude-sonnet-4-6-20250514',
      messages: [{ role: 'user', content: 'go' }],
      tools: [
        { type: 'function', function: { name: 'a', description: 'A', parameters: { type: 'object', properties: {} } } },
        { type: 'function', function: { name: 'b', description: 'B', parameters: { type: 'object', properties: {} } } },
      ],
    });
    const body = lastFetchBody();
    const tools = body.tools as Array<{ name: string; cache_control?: unknown }>;
    expect(tools).toHaveLength(2);
    // One breakpoint on the final tool caches the whole tool block + system.
    expect(tools[0].cache_control).toBeUndefined();
    expect(tools[1].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('converts tools to Anthropic format (input_schema)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 'msg_1', type: 'message', role: 'assistant',
      content: [{ type: 'text', text: 'Done' }],
      stop_reason: 'end_turn', usage: { input_tokens: 20, output_tokens: 3 },
    }));
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    await p.createCompletion({
      model: 'claude-sonnet-4-6-20250514',
      messages: [{ role: 'user', content: 'read file' }],
      tools: [{
        type: 'function',
        function: {
          name: 'file_read',
          description: 'Read a file',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
        },
      }],
    });
    const body = lastFetchBody();
    const tools = body.tools as any[];
    expect(tools[0].name).toBe('file_read');
    expect(tools[0].input_schema).toBeDefined();
    expect(tools[0].input_schema.properties.path.type).toBe('string');
    // Should NOT have nested function format
    expect(tools[0].function).toBeUndefined();
  });

  it('converts tool_choice values to Anthropic format', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 'msg_1', type: 'message', role: 'assistant',
      content: [{ type: 'text', text: 'OK' }],
      stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 2 },
    }));
    const p = new AnthropicProvider({ apiKey: 'sk-test' });

    // "required" → { type: "any" }
    await p.createCompletion({
      ...baseRequest,
      model: 'claude-sonnet-4-6-20250514',
      tool_choice: 'required',
      tools: [{ type: 'function', function: { name: 'test', description: 'test', parameters: {} } }],
    } as any);
    expect(lastFetchBody().tool_choice).toEqual({ type: 'any' });
  });

  // ── Response normalization ──────────────────────────────────────────────

  it('converts Anthropic text response to OpenAI format', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 'msg_abc',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello world!' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    }));
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    const result = await p.createCompletion({ ...baseRequest, model: 'claude-sonnet-4-6-20250514' });

    expect(result.object).toBe('chat.completion');
    expect(result.choices[0].message.role).toBe('assistant');
    expect(result.choices[0].message.content).toBe('Hello world!');
    expect(result.choices[0].finish_reason).toBe('stop');
    expect(result.usage.prompt_tokens).toBe(10);
    expect(result.usage.completion_tokens).toBe(5);
  });

  it('converts Anthropic tool_use response to OpenAI tool_calls format', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 'msg_abc',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me read that file.' },
        { type: 'tool_use', id: 'toolu_1', name: 'file_read', input: { file_path: '/test.ts' } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 20, output_tokens: 15 },
    }));
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    const result = await p.createCompletion({ ...baseRequest, model: 'claude-sonnet-4-6-20250514' });

    expect(result.choices[0].finish_reason).toBe('tool_calls');
    expect(result.choices[0].message.content).toBe('Let me read that file.');
    const tc = result.choices[0].message.tool_calls![0];
    expect(tc.id).toBe('toolu_1');
    expect(tc.type).toBe('function');
    expect(tc.function.name).toBe('file_read');
    expect(JSON.parse(tc.function.arguments)).toEqual({ file_path: '/test.ts' });
  });

  it('maps stop_reason "max_tokens" to finish_reason "length"', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      id: 'msg_abc', type: 'message', role: 'assistant',
      content: [{ type: 'text', text: 'Truncated...' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 10, output_tokens: 4096 },
    }));
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    const result = await p.createCompletion({ ...baseRequest, model: 'claude-sonnet-4-6-20250514' });
    expect(result.choices[0].finish_reason).toBe('length');
  });

  // ── Streaming ───────────────────────────────────────────────────────────

  it('parses Anthropic SSE events and converts to OpenAI chunks', async () => {
    mockFetch.mockResolvedValue(streamResponse([
      `data: ${JSON.stringify({ type: 'message_start', message: { id: 'msg_1', usage: { input_tokens: 10 } } })}`,
      `data: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } })}`,
      `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })}`,
      'data: [DONE]',
    ]));
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    const chunks = await collectChunks(p.createStreamingCompletion({ ...baseRequest, model: 'claude-sonnet-4-6-20250514' }));

    // content_block_start (text) + 2 text_deltas + message_delta = 4 chunks
    expect(chunks.length).toBeGreaterThanOrEqual(3);

    // Find the text delta chunks
    const textChunks = chunks.filter((c: any) => c.choices[0].delta.content !== undefined);
    expect(textChunks.length).toBeGreaterThanOrEqual(2);

    // Find the final chunk with finish_reason
    const final = chunks.find((c: any) => c.choices[0].finish_reason !== null) as any;
    expect(final).toBeDefined();
    expect(final.choices[0].finish_reason).toBe('stop');
  });

  it('parses tool_use events in streaming', async () => {
    mockFetch.mockResolvedValue(streamResponse([
      `data: ${JSON.stringify({ type: 'message_start', message: { id: 'msg_1', usage: { input_tokens: 10 } } })}`,
      `data: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'file_read' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"file' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '_path":"/test.ts"}' } })}`,
      `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 15 } })}`,
      'data: [DONE]',
    ]));
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    const chunks = await collectChunks(p.createStreamingCompletion({ ...baseRequest, model: 'claude-sonnet-4-6-20250514' }));

    // Should have a chunk that starts the tool call
    const toolStart = chunks.find((c: any) => c.choices[0].delta.tool_calls?.[0]?.id === 'toolu_1') as any;
    expect(toolStart).toBeDefined();
    expect(toolStart.choices[0].delta.tool_calls[0].function.name).toBe('file_read');

    // Final chunk should have finish_reason = tool_calls
    const final = chunks.find((c: any) => c.choices[0].finish_reason === 'tool_calls') as any;
    expect(final).toBeDefined();
  });

  it('tracks token usage across stream events', async () => {
    mockFetch.mockResolvedValue(streamResponse([
      `data: ${JSON.stringify({ type: 'message_start', message: { id: 'msg_1', usage: { input_tokens: 42 } } })}`,
      `data: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } })}`,
      `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } })}`,
    ]));
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    const chunks = await collectChunks(p.createStreamingCompletion({ ...baseRequest, model: 'claude-sonnet-4-6-20250514' }));

    const final = chunks.find((c: any) => c.usage) as any;
    expect(final).toBeDefined();
    expect(final.usage.prompt_tokens).toBe(42);
    expect(final.usage.completion_tokens).toBe(7);
    expect(final.usage.total_tokens).toBe(49);
  });

  it('exposes correct provider metadata', () => {
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    expect(p.name).toBe('anthropic');
    expect(p.displayName).toBe('Anthropic');
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
      new AnthropicProvider({ apiKey: 'sk-test' }),
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
      new AnthropicProvider({ apiKey: 'sk-test' }),
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
