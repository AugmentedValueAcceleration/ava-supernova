// Three silences, three meanings.
//
// Measured against DashScope on 23 Sep 2026, same model back to back:
// plain text streams 1459 chunks with a largest gap of 279ms; a large tool
// call streams 10 chunks with a largest gap of 114,880ms, because the
// provider buffers the arguments and ships them at the end. One 90-second
// budget was being asked to cover prefill, that buffering, AND a dead
// connection — so a Classroom turn writing a whole course was aborted as
// "stream stalled" while it was working perfectly.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { BaseProvider } from '../src/providers/base-provider.js';
import type { ModelDefinition } from '../src/core/types.js';

const model: ModelDefinition = {
  id: 'test-model', name: 'Test', provider: 'test',
  contextWindow: 1_000_000, maxOutputTokens: 131_072,
  supportsToolCalls: true, supportsStreaming: true,
  pricing: { inputPerMillion: 0, outputPerMillion: 0 },
};

class TestProvider extends BaseProvider {
  readonly name = 'test';
  readonly displayName = 'Test Provider';
  protected getDefaultBaseUrl() { return 'https://example.invalid/v1'; }
  listModels() { return [model]; }
}

/** An SSE body that emits the given frames, pausing `gapMs` before each. */
function sseBody(frames: Array<{ gapMs: number; data: unknown }>) {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i >= frames.length) { controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); controller.close(); return; }
      const f = frames[i++];
      await new Promise((r) => setTimeout(r, f.gapMs));
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(f.data)}\n\n`));
    },
  });
}

const frame = (delta: unknown) => ({
  id: 'c', object: 'chat.completion.chunk', created: 0, model: 'test-model',
  choices: [{ index: 0, delta, finish_reason: null }],
});

async function drain(frames: Array<{ gapMs: number; data: unknown }>) {
  vi.stubGlobal('fetch', async () => new Response(sseBody(frames), {
    status: 200, headers: { 'Content-Type': 'text/event-stream' },
  }));
  const provider = new TestProvider({ apiKey: 'k', models: [model] });
  const out = [];
  for await (const c of provider.createStreamingCompletion({ model: 'test-model', messages: [], stream: true })) out.push(c);
  return out;
}

// Real timers, tiny budgets. Faking time fights the stream's own setTimeout,
// and the thing under test IS the timing, so the budgets are shrunk rather
// than the clock bent: 1s to answer at all, 0.2s between text chunks, 2s
// while a tool call is being written.
/* eslint-disable @typescript-eslint/no-explicit-any */
const B = BaseProvider as any;
const REAL = { first: B.STREAM_FIRST_CHUNK_TIMEOUT_MS, read: B.STREAM_READ_TIMEOUT_MS, tool: B.STREAM_TOOL_CALL_TIMEOUT_MS };
beforeEach(() => {
  B.STREAM_FIRST_CHUNK_TIMEOUT_MS = 1_000;
  B.STREAM_READ_TIMEOUT_MS = 200;
  B.STREAM_TOOL_CALL_TIMEOUT_MS = 2_000;
});
afterEach(() => {
  B.STREAM_FIRST_CHUNK_TIMEOUT_MS = REAL.first;
  B.STREAM_READ_TIMEOUT_MS = REAL.read;
  B.STREAM_TOOL_CALL_TIMEOUT_MS = REAL.tool;
  vi.unstubAllGlobals();
});

describe('how long silence is allowed to last', () => {
  it('a long silence AFTER a tool call has started is not a stall', async () => {
    // The gap between the call's name and its arguments. Longer than the text
    // budget, shorter than the tool-call one — under a single budget this
    // turn died while it was working.
    const chunks = await drain([
      { gapMs: 0, data: frame({ tool_calls: [{ index: 0, id: 't1', type: 'function', function: { name: 'write_course', arguments: '' } }] }) },
      { gapMs: 600, data: frame({ tool_calls: [{ index: 0, function: { arguments: '{"title":"JavaScript from Scratch"}' } }] }) },
    ]);
    expect(chunks).toHaveLength(2);
    expect(chunks[1].choices[0].delta.tool_calls?.[0].function?.arguments).toContain('JavaScript');
  });

  it('the same silence with no tool call in flight IS a stall', async () => {
    await expect(drain([
      { gapMs: 0, data: frame({ content: 'thinking about it' }) },
      { gapMs: 600, data: frame({ content: ' more' }) },
    ])).rejects.toThrow(/stream stalled/);
  });

  it('says which silence it was — a stall and a dead request read differently', async () => {
    // Nothing at all, ever: that is the request never being answered, and it
    // must not be reported as a stalled stream.
    await expect(drain([{ gapMs: 1_400, data: frame({ content: 'too late' }) }]))
      .rejects.toThrow(/sent nothing for 1s/);
  });
});
