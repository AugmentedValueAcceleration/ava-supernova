/**
 * A refused tool call stays on the reply, answered by its refusal.
 *
 * With the Talk switch on, Ava sometimes reaches for a tool that changes the
 * project. The gate answers "Tool is off" — and used to take the call off her
 * reply while keeping that answer. The next request then carried an answer to
 * a call that no longer existed, and DeepSeek rejected it ("the
 * reasoning_content in the thinking mode must be passed back"): an error on
 * screen every time, cleared only by pressing Continue (3 Nov 2026).
 */

import { describe, it, expect } from 'vitest';
import { Agent } from '../src/agent/agent.js';
import type { Provider, ChatCompletionRequest } from '../src/providers/types.js';
import type { ModelDefinition, Message } from '../src/core/types.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';

const MODEL: ModelDefinition = {
  id: 'test-model', name: 'Test', provider: 'mock',
  contextWindow: 128000, maxOutputTokens: 4096, supportsToolCalls: true,
};

type Call = { id: string; function: { name: string; arguments: string } };

function provider(responses: Array<{ content?: string; reasoning?: string; tool_calls?: Call[] }>, seen: ChatCompletionRequest[]): Provider {
  let i = 0;
  return {
    name: 'mock', displayName: 'Mock', listModels: () => [MODEL],
    async createCompletion() {
      return { choices: [{ index: 0, message: { role: 'assistant', content: 'noop' }, finish_reason: 'stop' as const }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
    },
    async *createStreamingCompletion(req: ChatCompletionRequest) {
      seen.push(JSON.parse(JSON.stringify(req)));
      const r = responses[i++] ?? responses[responses.length - 1];
      if (r.reasoning) yield { choices: [{ delta: { reasoning_content: r.reasoning } as any, index: 0, finish_reason: null }] };
      if (r.content) yield { choices: [{ delta: { content: r.content }, index: 0, finish_reason: null }] };
      for (const [j, tc] of (r.tool_calls ?? []).entries()) {
        yield { choices: [{ delta: { tool_calls: [{ index: j, id: tc.id, function: tc.function }] }, index: 0, finish_reason: null }] };
      }
      yield { choices: [{ delta: {}, index: 0, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
    },
  };
}

function registry(ran: string[]): ToolRegistry {
  const reg = new ToolRegistry();
  for (const name of ['bash', 'read']) {
    reg.register({
      name, description: name, schema: { type: 'object', properties: {}, required: [] },
      riskLevel: 'safe', requiresConfirmation: false,
      execute: async () => { ran.push(name); return { output: `${name} ran`, success: true }; },
    });
  }
  return reg;
}

/** Every tool result answers a call on the assistant reply right before it. */
function everyResultHasItsCall(messages: Message[]): void {
  let open = new Set<string>();
  for (const m of messages) {
    if (m.role === 'assistant') open = new Set(((m as any).tool_calls ?? []).map((c: Call) => c.id));
    if (m.role === 'tool') expect(open.has((m as any).tool_call_id), `result ${(m as any).tool_call_id} has no call`).toBe(true);
  }
}

describe('a refused tool call', () => {
  it('stays on the reply with its refusal, and nothing refused runs', async () => {
    const seen: ChatCompletionRequest[] = [];
    const ran: string[] = [];
    const agent = new Agent({
      provider: provider([
        { reasoning: 'he asked about bindings; let me check', tool_calls: [{ id: 'c1', function: { name: 'bash', arguments: '{}' } }] },
        { content: 'Here is how the bindings would work.' },
      ], seen),
      model: MODEL, toolRegistry: registry(ran), cwd: '.', surface: 'cli',
    });
    const started: string[] = [];
    await agent.run([{ role: 'user', content: '[Work Mode: Talk] we need the bindings for the inventory panel' }], (e: any) => { if (e.type === 'tool_call_start') started.push(e.toolCall.function.name); });

    expect(started).toEqual([]);
    expect(ran).toEqual([]);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    const next = seen[1].messages as Message[];
    const reply = next.find(m => m.role === 'assistant' && (m as any).tool_calls?.some((c: Call) => c.id === 'c1'));
    expect(reply, 'the refused call was taken off the reply').toBeDefined();
    expect(next.some(m => m.role === 'tool' && (m as any).tool_call_id === 'c1' && String(m.content).includes('Talk switch'))).toBe(true);
    everyResultHasItsCall(next);
  });

  it('runs the allowed call and keeps both on the reply', async () => {
    const seen: ChatCompletionRequest[] = [];
    const ran: string[] = [];
    const agent = new Agent({
      provider: provider([
        { tool_calls: [
          { id: 'r1', function: { name: 'read', arguments: '{}' } },
          { id: 'b1', function: { name: 'bash', arguments: '{}' } },
        ] },
        { content: 'Read it; here is the plan.' },
      ], seen),
      model: MODEL, toolRegistry: registry(ran), cwd: '.', surface: 'cli',
    });
    const started: string[] = [];
    await agent.run([{ role: 'user', content: '[Work Mode: Talk] look at the panel' }], (e: any) => { if (e.type === 'tool_call_start') started.push(e.toolCall.function.name); });

    // Only the allowed call is started; the refused one never is.
    expect(started).toEqual(['read']);
    expect(ran).not.toContain('bash');
    const next = seen[1].messages as Message[];
    const reply = next.find(m => m.role === 'assistant' && (m as any).tool_calls?.length);
    expect(((reply as any).tool_calls as Call[]).map(c => c.id).sort()).toEqual(['b1', 'r1']);
    expect(next.filter(m => m.role === 'tool').map(m => (m as any).tool_call_id).sort()).toEqual(['b1', 'r1']);
    everyResultHasItsCall(next);
  });
});
