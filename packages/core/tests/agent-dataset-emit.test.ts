/**
 * Integration tests for the tool-emitter wiring in Agent.run().
 *
 * Verifies that running an Agent through a single tool-call → response
 * cycle produces tool_choice / tool_result / tool_chain_complete dataset
 * events in the right order, with a shared trajectory_id, and with no
 * raw user data leaking into the payloads.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Agent, type AgentEvent } from '../src/agent/agent.js';
import type { Provider, ChatCompletionRequest } from '../src/providers/types.js';
import type { ModelDefinition, Message } from '../src/core/types.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import { avaEvents } from '../src/dataset/emitter.js';
import type { AvaEvent } from '../src/dataset/events.js';

const TEST_MODEL: ModelDefinition = {
  id: 'test-model',
  name: 'Test Model',
  provider: 'mock',
  contextWindow: 128000,
  maxOutputTokens: 4096,
  supportsToolCalls: true,
};

function createMockProvider(responses: Array<{
  content?: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
}>): Provider {
  let i = 0;
  return {
    name: 'mock',
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
    listModels: () => [],
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('Agent → dataset event wiring', () => {
  let registry: ToolRegistry;
  let captured: AvaEvent[];

  beforeEach(() => {
    registry = new ToolRegistry();
    // Register a trivial test tool
    registry.register({
      name: 'echo',
      description: 'Echo back the input',
      schema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
      riskLevel: 'safe',
      handler: async (args) => ({
        output: `echoed: ${(args as { text: string }).text}`,
        success: true,
      }),
    });
    captured = [];
    avaEvents.clearAllHandlers();
    avaEvents.onAll((e) => captured.push(e));
  });

  it('emits tool_choice → tool_result → tool_chain_complete for a single tool call', async () => {
    const provider = createMockProvider([
      {
        tool_calls: [{
          id: 'call-1',
          function: { name: 'echo', arguments: JSON.stringify({ text: 'hello' }) },
        }],
      },
      { content: 'Done.' },
    ]);
    const agent = new Agent({
      provider,
      model: TEST_MODEL,
      toolRegistry: registry,
      cwd: '.',
      surface: 'cli',
    });

    await agent.run(
      [{ role: 'system', content: 'You are a test.' }, { role: 'user', content: 'echo hello' }],
      () => {},
    );
    await flushMicrotasks();

    const types = captured.map((e) => e.event_type);
    expect(types).toEqual(['tool_choice', 'tool_result', 'tool_chain_complete']);
  });

  it('shares trajectory_id across all events from one run', async () => {
    const provider = createMockProvider([
      {
        tool_calls: [{
          id: 'call-1',
          function: { name: 'echo', arguments: JSON.stringify({ text: 'a' }) },
        }],
      },
      { content: 'Done.' },
    ]);
    const agent = new Agent({
      provider,
      model: TEST_MODEL,
      toolRegistry: registry,
      cwd: '.',
      surface: 'cli',
    });
    await agent.run(
      [{ role: 'user', content: 'go' }],
      () => {},
    );
    await flushMicrotasks();

    const ids = new Set(captured.map((e) => e.trajectory_id));
    expect(ids.size).toBe(1);
  });

  it('tool_result references the matching tool_choice via event_id', async () => {
    const provider = createMockProvider([
      {
        tool_calls: [{
          id: 'call-1',
          function: { name: 'echo', arguments: JSON.stringify({ text: 'a' }) },
        }],
      },
      { content: 'Done.' },
    ]);
    const agent = new Agent({
      provider,
      model: TEST_MODEL,
      toolRegistry: registry,
      cwd: '.',
      surface: 'cli',
    });
    await agent.run([{ role: 'user', content: 'go' }], () => {});
    await flushMicrotasks();

    const choice = captured.find((e) => e.event_type === 'tool_choice')!;
    const result = captured.find((e) => e.event_type === 'tool_result')!;
    expect((result.payload as any).tool_choice_event_id).toBe(choice.event_id);
  });

  it('args_summary and result_summary contain shape only, not raw text', async () => {
    const provider = createMockProvider([
      {
        tool_calls: [{
          id: 'call-1',
          function: {
            name: 'echo',
            arguments: JSON.stringify({ text: 'super-secret-user-content-123' }),
          },
        }],
      },
      { content: 'Done.' },
    ]);
    const agent = new Agent({
      provider,
      model: TEST_MODEL,
      toolRegistry: registry,
      cwd: '.',
      surface: 'cli',
    });
    await agent.run([{ role: 'user', content: 'go' }], () => {});
    await flushMicrotasks();

    const choice = captured.find((e) => e.event_type === 'tool_choice')!;
    const result = captured.find((e) => e.event_type === 'tool_result')!;
    const argsSum = (choice.payload as any).args_summary as string;
    const resSum = (result.payload as any).result_summary as string;

    expect(argsSum).not.toContain('super-secret');
    expect(resSum).not.toContain('super-secret');
    expect(argsSum).toMatch(/echo\(text=\d+ch\)/);
    expect(resSum).toMatch(/^(ok|error), \d+ch$/);
  });

  it('prev_tools_in_trajectory accumulates across multiple tool calls', async () => {
    const provider = createMockProvider([
      {
        tool_calls: [
          { id: 'a', function: { name: 'echo', arguments: JSON.stringify({ text: '1' }) } },
        ],
      },
      {
        tool_calls: [
          { id: 'b', function: { name: 'echo', arguments: JSON.stringify({ text: '2' }) } },
        ],
      },
      { content: 'Done.' },
    ]);
    const agent = new Agent({
      provider,
      model: TEST_MODEL,
      toolRegistry: registry,
      cwd: '.',
      surface: 'cli',
    });
    await agent.run([{ role: 'user', content: 'go' }], () => {});
    await flushMicrotasks();

    const choices = captured.filter((e) => e.event_type === 'tool_choice');
    expect(choices).toHaveLength(2);
    expect((choices[0].payload as any).prev_tools_in_trajectory).toEqual([]);
    expect((choices[1].payload as any).prev_tools_in_trajectory).toEqual(['echo']);
  });

  it('tool_chain_complete reports tool_count and outcome', async () => {
    const provider = createMockProvider([
      {
        tool_calls: [{
          id: 'call-1',
          function: { name: 'echo', arguments: JSON.stringify({ text: 'a' }) },
        }],
      },
      { content: 'All done.' },
    ]);
    const agent = new Agent({
      provider,
      model: TEST_MODEL,
      toolRegistry: registry,
      cwd: '.',
      surface: 'cli',
    });
    await agent.run([{ role: 'user', content: 'go' }], () => {});
    await flushMicrotasks();

    const complete = captured.find((e) => e.event_type === 'tool_chain_complete')!;
    expect((complete.payload as any).tool_count).toBe(1);
    expect((complete.payload as any).outcome).toBe('task_completed');
    expect((complete.payload as any).outcome_summary).toMatch(/closed-with-text, \d+w/);
  });

  it('emits correct surface from constructor', async () => {
    const provider = createMockProvider([{ content: 'Hi.' }]);
    const agent = new Agent({
      provider,
      model: TEST_MODEL,
      toolRegistry: registry,
      cwd: '.',
      surface: 'extension',
    });
    await agent.run([{ role: 'user', content: 'hi' }], () => {});
    await flushMicrotasks();

    const complete = captured.find((e) => e.event_type === 'tool_chain_complete')!;
    expect(complete.surface).toBe('extension');
  });
});
