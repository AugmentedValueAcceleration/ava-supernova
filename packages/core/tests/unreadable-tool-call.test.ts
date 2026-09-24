// A tool call that arrives cut in half.
//
// It used to become an EMPTY call, silently. write_course then reported what
// an empty call looks like to it — "0 modules is not a course" — and the
// model spent six turns rewriting good work hunting for a punctuation bug
// that did not exist (24 Sep 2026). The arguments had been cut off at the
// output limit, which is a different problem with a different fix.

import { describe, it, expect } from 'vitest';
import { Agent, type AgentEvent } from '../src/agent/agent.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import type { Tool, ToolResult } from '../src/tools/types.js';
import type { ModelDefinition, Message, StreamChunk } from '../src/core/types.js';

const model: ModelDefinition = {
  id: 'test-model', name: 'Test', provider: 'test',
  contextWindow: 1_000_000, maxOutputTokens: 131_072,
  supportsToolCalls: true, supportsStreaming: true,
  pricing: { inputPerMillion: 0, outputPerMillion: 0 },
};

/** Records whether it ever ran, and with what. */
class SpyTool implements Tool {
  readonly name = 'write_course';
  readonly description = 'Emit a course.';
  readonly riskLevel = 'write' as const;
  readonly requiresConfirmation = false;
  readonly schema = { name: 'write_course', description: 'Emit a course.', parameters: { type: 'object', properties: {} } };
  calls: Array<Record<string, unknown>> = [];
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    this.calls.push(args);
    return { success: true, output: 'saved' };
  }
}

const frame = (delta: unknown, finish: string | null = null): StreamChunk => ({
  id: 'c', object: 'chat.completion.chunk', created: 0, model: 'test-model',
  choices: [{ index: 0, delta: delta as never, finish_reason: finish }],
});

/** Streams a tool call whose arguments stop mid-JSON, then a plain reply. */
function provider(truncatedArgs: string) {
  let call = 0;
  return {
    name: 'test',
    async *createStreamingCompletion() {
      if (call++ === 0) {
        yield frame({ tool_calls: [{ index: 0, id: 't1', type: 'function', function: { name: 'write_course', arguments: '' } }] });
        yield frame({ tool_calls: [{ index: 0, function: { arguments: truncatedArgs } }] });
        yield frame({}, 'length');
      } else {
        yield frame({ content: 'Understood.' });
        yield frame({}, 'stop');
      }
    },
    async createCompletion() { throw new Error('not used'); },
    listModels: () => [model],
  };
}

function agentWith(tool: SpyTool, args: string) {
  const registry = new ToolRegistry();
  registry.register(tool);
  return new Agent({ provider: provider(args) as never, model, toolRegistry: registry, cwd: '.' });
}

// Half a course: valid up to the point it stops.
const CUT_OFF = '{"title":"JavaScript from Scratch","modules":[{"title":"The first program","lessons":[{"title":"Var';

// Tagged, so the run is in the Classroom and write_course is a tool this
// mode is actually offered — untagged turns fall through to code mode.
const ASK: Message[] = [{ role: 'user', content: '[Classroom] write it' }];

describe('a tool call that was cut off', () => {
  it('never reaches the tool as an empty call', async () => {
    const tool = new SpyTool();
    await agentWith(tool, CUT_OFF).run(ASK, () => {});
    expect(tool.calls).toEqual([]);
  });

  it('tells the model it was cut off, how far it got, and what to do', async () => {
    const tool = new SpyTool();
    const events: AgentEvent[] = [];
    await agentWith(tool, CUT_OFF).run(ASK, (e) => events.push(e));

    const end = events.find((e) => e.type === 'tool_call_end') as { result: string; success: boolean } | undefined;
    expect(end).toBeDefined();
    expect(end!.success).toBe(false);
    expect(end!.result).toContain('cut off');
    expect(end!.result).toContain(String(CUT_OFF.length));
    // The two things that stop the six-turn hunt for a bug that isn't there.
    expect(end!.result).toContain('NOTHING was saved');
    expect(end!.result).toContain('not a formatting mistake');
    expect(end!.result).toMatch(/smaller calls/);
  });

  it('a call that parses still runs normally', async () => {
    const tool = new SpyTool();
    await agentWith(tool, '{"title":"Fine"}').run(ASK, () => {});
    expect(tool.calls).toEqual([{ title: 'Fine' }]);
  });
});
