// Node's own ceiling on silence, which sat under every budget we had.
//
// Node's HTTP layer destroys a response body that goes 300 seconds without a
// byte, with `TypeError: terminated` and no other detail. A whole course in
// one tool call is silent for longer than that: measured 24 Sep 2026 against
// the real provider — 307.5s to failure, and 144.7s to success once the
// limit was lifted. Our own budgets (300s first byte, 90s between chunks of
// prose, 420s while a tool call is being written) never got a say, and the
// operator saw a turn end with the single word "terminated".

import { describe, it, expect, vi, afterEach } from 'vitest';
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

afterEach(() => { vi.unstubAllGlobals(); });

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('the HTTP layer is told to be patient', () => {
  it('sends a dispatcher whose body timeout outlasts every budget we enforce', async () => {
    const seen: Array<Record<string, any>> = [];
    vi.stubGlobal('fetch', async (_url: string, init: Record<string, any>) => {
      seen.push(init);
      return new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    });

    const provider = new TestProvider({ apiKey: 'k', models: [model] });
    for await (const _ of provider.createStreamingCompletion({ model: 'test-model', messages: [], stream: true })) { /* drain */ }

    expect(seen).toHaveLength(1);
    const dispatcher = seen[0].dispatcher;
    // In a Node that exposes its internals this is set; anywhere else the
    // request runs on the default and nothing breaks — so the assertion is
    // conditional on being able to build one at all.
    const B = BaseProvider as any;
    if (B.getPatientDispatcher()) {
      expect(dispatcher).toBeDefined();
      expect(B.HTTP_BODY_TIMEOUT_MS).toBeGreaterThan(B.STREAM_TOOL_CALL_TIMEOUT_MS);
      expect(B.HTTP_BODY_TIMEOUT_MS).toBeGreaterThan(B.STREAM_FIRST_CHUNK_TIMEOUT_MS);
    }
  });

  it('builds the dispatcher once and reuses it', async () => {
    const B = BaseProvider as any;
    const first = B.getPatientDispatcher();
    const second = B.getPatientDispatcher();
    expect(second).toBe(first);
  });

  it('an environment that cannot provide one runs on the default rather than throwing', () => {
    // A browser, or a Node that moves its internals: the build fails, the
    // failure is remembered as "none", and every request after it goes out
    // plainly instead of erroring. (The global symbol is non-configurable, so
    // that environment is simulated at the cache rather than at globalThis.)
    const B = BaseProvider as any;
    const savedCache = B.patientDispatcher;
    try {
      B.patientDispatcher = null;
      expect(() => B.getPatientDispatcher()).not.toThrow();
      expect(B.getPatientDispatcher()).toBeUndefined();
    } finally {
      B.patientDispatcher = savedCache;
    }
  });
});
