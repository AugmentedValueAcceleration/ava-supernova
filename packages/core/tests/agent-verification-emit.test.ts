/**
 * Integration tests for verification_decision and correction_received.
 *
 * verification_decision fires once per Agent.run() in the finally
 * block, capturing whether Ava called any verification-shaped tool
 * before answering. correction_received fires at the START of a run
 * when the user's latest message looks like a correction of the
 * prior trajectory's response.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Agent } from '../src/agent/agent.js';
import type { Provider, ChatCompletionRequest } from '../src/providers/types.js';
import type { ModelDefinition, Message } from '../src/core/types.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import { avaEvents } from '../src/dataset/emitter.js';
import type { AvaEvent } from '../src/dataset/events.js';
import { categorizeCorrection } from '../src/dataset/verification.js';

const TEST_MODEL: ModelDefinition = {
  id: 'test-model',
  name: 'Test',
  provider: 'mock',
  contextWindow: 128000,
  maxOutputTokens: 4096,
  supportsToolCalls: true,
};

function mockProvider(responses: Array<{
  content?: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
}>): Provider {
  let i = 0;
  return {
    name: 'mock',
    displayName: 'Mock',
    listModels: () => [TEST_MODEL],
    async createCompletion() {
      return {
        choices: [{ index: 0, message: { role: 'assistant', content: 'noop' }, finish_reason: 'stop' as const }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
    },
    async *createStreamingCompletion(_req: ChatCompletionRequest) {
      const r = responses[i++] ?? responses[responses.length - 1];
      if (r.content) {
        yield { choices: [{ delta: { content: r.content }, index: 0, finish_reason: null }] };
      }
      if (r.tool_calls) {
        for (let j = 0; j < r.tool_calls.length; j++) {
          const tc = r.tool_calls[j];
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  index: j,
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
      yield {
        choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('Agent → verification + correction events', () => {
  let registry: ToolRegistry;
  let captured: AvaEvent[];

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.registerBuiltins();
    captured = [];
    avaEvents.clearAllHandlers();
    avaEvents.onAll((e) => captured.push(e));
  });

  it('verification_decision = false when no read tools were used', async () => {
    const provider = mockProvider([{ content: 'I think the answer is 42.' }]);
    const agent = new Agent({
      provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });

    await agent.run([{ role: 'user', content: 'what is the meaning of life' }], () => {});
    await flushMicrotasks();

    const verif = captured.find((e) => e.event_type === 'verification_decision');
    expect(verif).toBeDefined();
    const p = verif!.payload as any;
    expect(p.verified).toBe(false);
    expect(p.verification_tools_used).toEqual([]);
    expect(p.response_word_count).toBeGreaterThan(0);
    expect(p.question_signature).toBe('imperative');
  });

  it('verification_decision = true when grep was used before answering', async () => {
    const provider = mockProvider([
      {
        tool_calls: [{
          id: 'c1',
          function: { name: 'grep', arguments: JSON.stringify({ pattern: 'auth', path: '.' }) },
        }],
      },
      { content: 'Found 3 auth functions.' },
    ]);
    const agent = new Agent({
      provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });

    await agent.run([{ role: 'user', content: 'where is auth handled?' }], () => {});
    await flushMicrotasks();

    const verif = captured.find((e) => e.event_type === 'verification_decision');
    expect(verif).toBeDefined();
    const p = verif!.payload as any;
    expect(p.verified).toBe(true);
    expect(p.verification_tools_used).toContain('grep');
    expect(p.question_signature).toBe('question');
  });

  it('correction_received fires when next user message looks like a correction', async () => {
    const provider = mockProvider([
      { content: 'Wrong answer.' },
      { content: 'Apologies, here is a better one.' },
    ]);
    const agent = new Agent({
      provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });

    // First turn: agent gives an answer.
    let history: Message[] = [{ role: 'user', content: 'tell me about React hooks' }];
    history = await agent.run(history, () => {});
    await flushMicrotasks();

    // Second turn: user pushes back with a correction signal.
    captured.length = 0; // focus on this run's events
    history.push({ role: 'user', content: "no that's wrong, hooks were added in 16.8" });
    await agent.run(history, () => {});
    await flushMicrotasks();

    const correction = captured.find((e) => e.event_type === 'correction_received');
    expect(correction).toBeDefined();
    const p = correction!.payload as any;
    expect(p.corrected_trajectory_id).toBeTruthy();
    expect(['factual-error', 'rejection']).toContain(p.correction_signature);
  });

  it('correction_received does NOT fire on a normal follow-up', async () => {
    const provider = mockProvider([
      { content: 'First answer.' },
      { content: 'Follow-up answer.' },
    ]);
    const agent = new Agent({
      provider, model: TEST_MODEL, toolRegistry: registry, cwd: '.', surface: 'cli',
    });

    let history: Message[] = [{ role: 'user', content: 'first question' }];
    history = await agent.run(history, () => {});
    await flushMicrotasks();

    captured.length = 0;
    history.push({ role: 'user', content: 'cool, can you also add tests for it?' });
    await agent.run(history, () => {});
    await flushMicrotasks();

    expect(captured.find((e) => e.event_type === 'correction_received')).toBeUndefined();
  });

  it('categorizeCorrection returns the right kind for each pattern', () => {
    expect(categorizeCorrection("no that's wrong")).toBe('factual-error');
    expect(categorizeCorrection("won't work")).toBe('approach-flaw');
    expect(categorizeCorrection("that doesn't exist")).toBe('hallucination');
    expect(categorizeCorrection("actually, it's the other way")).toBe('soft-correction');
    expect(categorizeCorrection('no')).toBe('rejection');
    expect(categorizeCorrection('thanks, can you also...')).toBe(null);
    expect(categorizeCorrection('')).toBe(null);
  });
});
