/**
 * Every persona request must carry its messages.
 *
 * The vision bridge returns the SAME array when the model can see images, and
 * the conductor cleared its messages before refilling them from that array —
 * emptying both. On a vision model every persona sent the provider nothing
 * ("400 Empty input messages"), three failures tripped the platform's circuit
 * breaker, and the rest of the team failed over to whatever BYOK keys were
 * saved (1 Nov 2026: Scout, Architect, Challenger, Verifier, Code-reviewer all ✗).
 */

import { describe, it, expect } from 'vitest';
import { Conductor } from '../src/personas/conductor.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import type { Provider, ChatCompletionRequest, CompletionResponse } from '../src/providers/types.js';
import type { ModelDefinition } from '../src/core/types.js';

function modelWith(supportsVision: boolean): ModelDefinition {
  return {
    id: 'test-model',
    name: 'Test',
    provider: 'mock',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsVision,
  };
}

function recordingProvider(model: ModelDefinition, sizes: number[]): Provider {
  return {
    name: 'mock',
    displayName: 'Mock',
    listModels: () => [model],
    async createCompletion(req: ChatCompletionRequest): Promise<CompletionResponse> {
      sizes.push(req.messages.length);
      return {
        choices: [{ index: 0, message: { role: 'assistant', content: 'Analysis complete.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
      };
    },
    async *createStreamingCompletion() {},
  };
}

describe('persona requests keep their messages', () => {
  for (const supportsVision of [true, false]) {
    it(`on a model that ${supportsVision ? 'can' : 'cannot'} see images`, async () => {
      const model = modelWith(supportsVision);
      const sizes: number[] = [];
      const registry = new ToolRegistry();
      registry.registerBuiltins();
      const conductor = new Conductor({
        provider: recordingProvider(model, sizes),
        model,
        toolRegistry: registry,
        cwd: '.',
        config: { parallel: false },
      });
      const errors: string[] = [];

      await conductor.orchestrate('Design the auth flow', 'plan', [], (e) => {
        if (e.type === 'persona_error') errors.push(e.error);
      }, undefined, { depth: 'full' });

      expect(errors).toEqual([]);
      expect(sizes.length).toBeGreaterThan(0);
      expect(sizes.every((n) => n > 0)).toBe(true);
    });
  }
});
