// The room a caller opened beats the tag it hopes is in the text.
//
// 24 Sep 2026: a Classroom turn ran as code mode. The [Classroom] tag did not
// reach the detector, so every course tool left the turn — and instead of
// being told she had no way to write a course, Ava produced a report of one
// that did not exist, with an id, a module count and a gate verdict, none of
// it real. The platform knew which room it had opened the whole time.

import { describe, it, expect } from 'vitest';
import { Agent } from '../src/agent/agent.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import type { ModelDefinition, Message, StreamChunk } from '../src/core/types.js';

const model: ModelDefinition = {
  id: 'test-model', name: 'Test', provider: 'test',
  contextWindow: 1_000_000, maxOutputTokens: 131_072,
  supportsToolCalls: true, supportsStreaming: true,
  pricing: { inputPerMillion: 0, outputPerMillion: 0 },
};

const frame = (delta: unknown, finish: string | null = null): StreamChunk => ({
  id: 'c', object: 'chat.completion.chunk', created: 0, model: 'test-model',
  choices: [{ index: 0, delta: delta as never, finish_reason: finish }],
});

/** Captures the tool schemas the turn was actually offered. */
function capturingProvider() {
  const offered: string[][] = [];
  return {
    offered,
    provider: {
      name: 'test',
      async *createStreamingCompletion(request: { tools?: Array<{ function: { name: string } }> }) {
        offered.push((request.tools ?? []).map((t) => t.function.name));
        yield frame({ content: 'ok' });
        yield frame({}, 'stop');
      },
      async createCompletion() { throw new Error('not used'); },
      listModels: () => [model],
    },
  };
}

function run(mode: 'classroom' | undefined, text: string) {
  const { provider, offered } = capturingProvider();
  const registry = new ToolRegistry();
  registry.registerBuiltins();
  const agent = new Agent({ provider: provider as never, model, toolRegistry: registry, cwd: '.', ...(mode ? { mode } : {}) });
  return agent.run([{ role: 'user', content: text }] as Message[], () => {}).then(() => offered[0] ?? []);
}

describe('the room a caller declares', () => {
  it('binds the Classroom tools even when the tag never made it into the text', async () => {
    const names = await run('classroom', 'Write the course "APIs: Talking to the Web" (seed id a68196e3).');
    expect(names).toContain('write_course');
    expect(names).toContain('find_course');
    // And it is really the room, not code mode with extras bolted on.
    expect(names).not.toContain('propose_tool');
  });

  it('without it, the same untagged message falls through to code mode', async () => {
    const names = await run(undefined, 'Write the course "APIs: Talking to the Web" (seed id a68196e3).');
    expect(names).not.toContain('write_course');
    // Exactly what she reached for that day, because it was all she had.
    expect(names).toContain('propose_tool');
  });

  it('a tagged message still works for callers that declare nothing', async () => {
    const names = await run(undefined, '[Classroom] Write the course "APIs: Talking to the Web".');
    expect(names).toContain('write_course');
  });
});
