// A reply cut off at the output limit.
//
// Nothing read `finish_reason` on the streaming path until 23 Sep 2026, and
// no `max_tokens` was sent, so the provider's own default applied. A large
// tool call — a whole lesson of steps from the Classroom — was cut off
// mid-arguments: the call never arrived, the turn ended with the prose that
// came before it, and it looked exactly as though she had decided to stop.
// The operator saw a 16-lesson repair "fail silently".

import { describe, it, expect } from 'vitest';
import { Agent, type AgentEvent } from '../src/agent/agent.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import type { ModelDefinition, Message, StreamChunk } from '../src/core/types.js';

const model: ModelDefinition = {
  id: 'test-model',
  name: 'Test',
  provider: 'test',
  contextWindow: 1_000_000,
  maxOutputTokens: 131_072,
  supportsToolCalls: true,
  supportsStreaming: true,
  pricing: { inputPerMillion: 0, outputPerMillion: 0 },
};

function chunk(partial: Partial<StreamChunk['choices'][number]>): StreamChunk {
  return {
    id: 'c', object: 'chat.completion.chunk', created: 0, model: 'test-model',
    choices: [{ index: 0, delta: {}, finish_reason: null, ...partial }],
  };
}

/** A provider that cuts the first reply off, then answers normally. */
function cutOffProvider(replies: Array<'truncate' | 'done'>) {
  const requests: Array<{ max_tokens?: number; messages: Array<{ role: string; content?: unknown }> }> = [];
  let call = 0;
  return {
    requests,
    provider: {
      name: 'test',
      async *createStreamingCompletion(request: { max_tokens?: number; messages: Array<{ role: string; content?: unknown }> }) {
        requests.push({ max_tokens: request.max_tokens, messages: request.messages });
        const mode = replies[call++] ?? 'done';
        if (mode === 'truncate') {
          yield chunk({ delta: { content: 'Fields first. I will start with' } });
          yield chunk({ delta: {}, finish_reason: 'length' });
        } else {
          yield chunk({ delta: { content: 'Done.' } });
          yield chunk({ delta: {}, finish_reason: 'stop' });
        }
      },
      async createCompletion() { throw new Error('not used'); },
      listModels: () => [model],
    },
  };
}

function makeAgent(provider: unknown) {
  return new Agent({ provider: provider as never, model, toolRegistry: new ToolRegistry(), cwd: '.' });
}
const say = (text: string): Message[] => [{ role: 'user', content: text }];

describe('a reply cut off at the output limit', () => {
  it('asks for the room the model has instead of the provider default', async () => {
    const { provider, requests } = cutOffProvider(['done']);
    await makeAgent(provider).run(say('hello'), () => {});
    // 131_072 capped to 32_768 — enough for a large tool call, not enough for
    // one reply to eat a 1M window.
    expect(requests[0].max_tokens).toBe(32_768);
  });

  it('is REPORTED rather than ending the turn in silence', async () => {
    const { provider } = cutOffProvider(['truncate', 'done']);
    const events: AgentEvent[] = [];
    await makeAgent(provider).run(say('repair this course'), (e) => events.push(e));
    const truncated = events.find((e) => e.type === 'response_truncated');
    expect(truncated).toBeDefined();
    expect((truncated as { hadToolCall: boolean }).hadToolCall).toBe(false);
  });

  it('continues in smaller pieces rather than stopping mid-sentence', async () => {
    const { provider, requests } = cutOffProvider(['truncate', 'done']);
    await makeAgent(provider).run(say('repair this course'), () => {});

    // The follow-up call carries the partial text AND the nudge, so she
    // resumes instead of the turn ending where the model ran out of room.
    const follow = requests[1];
    expect(follow).toBeDefined();
    const texts = follow.messages.map((m) => String(m.content ?? ''));
    expect(texts.some((t) => t.includes('Fields first. I will start with'))).toBe(true);
    expect(texts.some((t) => t.includes('cut off at the output limit'))).toBe(true);
    expect(texts.some((t) => t.includes('one lesson, one module, one tool call at a time'))).toBe(true);
  });

  it('nudges ONCE — a second cut-off ends the turn rather than looping', async () => {
    const { provider, requests } = cutOffProvider(['truncate', 'truncate', 'done']);
    await makeAgent(provider).run(say('repair this course'), () => {});
    // Truncated, nudged, truncated again — and then it stops. Without the
    // once-per-run flag this is an infinite loop against a model that
    // cannot fit its reply.
    expect(requests.length).toBe(2);
    const nudges = requests.flatMap((r) => r.messages).filter((m) => String(m.content ?? '').includes('cut off at the output limit'));
    expect(nudges.length).toBe(1);
  });
});
