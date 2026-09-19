// compressContext used to send the whole compress zone to the model in one
// request. At the 400K threshold that request failed or timed out, the
// failure was swallowed, and the turn fell through to truncation while the
// banner said "summarised". Now the zone is summarised in bounded chunks and
// folded into one header — and a failure is a logged failure.
import { describe, it, expect } from 'vitest';
import { Agent } from '../src/agent/agent.js';
import type { Provider, ChatCompletionRequest } from '../src/providers/types.js';
import type { ModelDefinition, Message } from '../src/core/types.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';

const TEST_MODEL: ModelDefinition = {
  id: 'test-model', name: 'Test', provider: 'mock',
  contextWindow: 1_000_000, maxOutputTokens: 4096, supportsToolCalls: true,
};

/** A provider that records every completion prompt's size and answers a
 *  plausible summary. */
function recordingProvider(fail = false): { provider: Provider; prompts: number[] } {
  const prompts: number[] = [];
  const provider: Provider = {
    name: 'mock', displayName: 'Mock', listModels: () => [TEST_MODEL],
    async createCompletion(req: ChatCompletionRequest) {
      const text = req.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('');
      prompts.push(Math.ceil(text.length / 3));
      if (fail) throw new Error('413 request too large');
      const content = text.includes('working notes')
        ? '- decided X\n- wrote a.ts\n- in flight: y'
        : 'CURRENT_TASK: finish y\nLAST_STEP: wrote a.ts\nNEXT_STEP: run tests\nBLOCKERS: none\nSUMMARY:\n- decided X';
      return { choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' as const }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
    },
    async *createStreamingCompletion() { yield { choices: [{ delta: {}, index: 0, finish_reason: 'stop' }] }; },
  } as unknown as Provider;
  return { provider, prompts };
}

/** ~tokens of filler per message so the zone lands where we want it. */
function longConversation(messages: number, tokensEach: number): Message[] {
  const filler = 'lorem ipsum dolor sit amet '.repeat(Math.ceil((tokensEach * 3) / 27));
  const out: Message[] = [{ role: 'system', content: 'SYS' }];
  for (let i = 0; i < messages; i++) out.push({ role: i % 2 ? 'assistant' : 'user', content: `${i}: ${filler}` });
  return out;
}

describe('chunked compression', () => {
  it('a zone that fits takes one call', async () => {
    const { provider, prompts } = recordingProvider();
    const agent = new Agent({ provider, model: TEST_MODEL, toolRegistry: new ToolRegistry(), cwd: '.', surface: 'cli' });
    const msgs = longConversation(30, 500);          // ~15K tokens
    const { result, compaction } = await agent.compact(msgs, () => {});
    expect(prompts).toHaveLength(1);
    expect(compaction).not.toBeNull();
    expect(result.length).toBeLessThan(msgs.length);
  });

  it('a zone far over one chunk is summarised in pieces, none over the chunk cap', async () => {
    const { provider, prompts } = recordingProvider();
    const agent = new Agent({ provider, model: TEST_MODEL, toolRegistry: new ToolRegistry(), cwd: '.', surface: 'cli' });
    const msgs = longConversation(120, 2_500);        // ~300K tokens — the shape that failed live
    const { compaction } = await agent.compact(msgs, () => {});
    expect(compaction).not.toBeNull();
    expect(prompts.length).toBeGreaterThan(3);        // several note calls + one fold
    for (const p of prompts) expect(p).toBeLessThan(70_000);
  });

  it('a failed summary returns the input untouched and no boundary', async () => {
    const { provider } = recordingProvider(true);
    const agent = new Agent({ provider, model: TEST_MODEL, toolRegistry: new ToolRegistry(), cwd: '.', surface: 'cli' });
    const msgs = longConversation(30, 500);
    const { result, compaction } = await agent.compact(msgs, () => {});
    expect(compaction).toBeNull();
    expect(result).toBe(msgs);
  });
});
