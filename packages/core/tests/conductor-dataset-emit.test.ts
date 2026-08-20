/**
 * Integration tests for persona event wiring in the Conductor.
 *
 * Runs the Conductor through a multi-persona team and asserts that
 * persona_decision / persona_handoff / persona_complete events emit
 * with the right shape, team listing, and handoff chain.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Conductor } from '../src/personas/conductor.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import type { Provider, ChatCompletionRequest, CompletionResponse } from '../src/providers/types.js';
import type { ModelDefinition } from '../src/core/types.js';
import { avaEvents, withTrajectory } from '../src/dataset/emitter.js';
import type { AvaEvent } from '../src/dataset/events.js';

const TEST_MODEL: ModelDefinition = {
  id: 'test-model',
  name: 'Test',
  provider: 'mock',
  contextWindow: 128000,
  maxOutputTokens: 4096,
  supportsToolCalls: true,
};

function mockProvider(respText = 'Analysis complete.'): Provider {
  return {
    name: 'mock',
    displayName: 'Mock',
    listModels: () => [TEST_MODEL],
    async createCompletion(_req: ChatCompletionRequest): Promise<CompletionResponse> {
      return {
        choices: [{
          index: 0,
          message: { role: 'assistant', content: respText },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
      };
    },
    async *createStreamingCompletion() {},
  };
}

const baseCtx = {
  session_id: 'sess-test',
  surface: 'cli' as const,
  mode: 'plan' as const,
  model_id: 'test-model',
};

async function flushMicrotasks(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('Conductor → dataset event wiring', () => {
  let registry: ToolRegistry;
  let captured: AvaEvent[];

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.registerBuiltins();
    captured = [];
    avaEvents.clearAllHandlers();
    avaEvents.onAll((e) => captured.push(e));
  });

  it('emits persona_decision at orchestrate start with the selected team', async () => {
    const conductor = new Conductor({
      provider: mockProvider(),
      model: TEST_MODEL,
      toolRegistry: registry,
      cwd: '.',
      config: { parallel: false },
    });

    await withTrajectory(baseCtx, () => conductor.orchestrate(
      'Design the auth flow',
      'plan',
      [],
      () => {},
      undefined,
      // Pin the depth. These tests are about EVENT WIRING, not about which
      // personas plan happens to field — they need a team big enough to
      // produce handoffs. Plan gained a light team on 2026-08-20 and the
      // default flipped to two personas, which broke four tests that were
      // never about rosters. Asking for what the test needs makes it immune
      // to the next roster change.
      { depth: 'full' },
    ));
    await flushMicrotasks();

    const decision = captured.find((e) => e.event_type === 'persona_decision');
    expect(decision).toBeDefined();
    const p = decision!.payload as any;
    expect(p.task_classification).toBe('plan');
    // PLAN_PERSONAS = [Researcher, Architect, Challenger]; builder excluded.
    expect(p.chosen_team).toEqual(['researcher', 'architect', 'challenger']);
    expect(typeof p.reasoning_summary).toBe('string');
  });

  it('emits persona_complete for each persona run', async () => {
    const conductor = new Conductor({
      provider: mockProvider('Here are the findings.'),
      model: TEST_MODEL,
      toolRegistry: registry,
      cwd: '.',
      config: { parallel: false },
    });

    await withTrajectory(baseCtx, () => conductor.orchestrate(
      'Design the auth flow',
      'plan',
      [],
      () => {},
      undefined,
      // Pin the depth. These tests are about EVENT WIRING, not about which
      // personas plan happens to field — they need a team big enough to
      // produce handoffs. Plan gained a light team on 2026-08-20 and the
      // default flipped to two personas, which broke four tests that were
      // never about rosters. Asking for what the test needs makes it immune
      // to the next roster change.
      { depth: 'full' },
    ));
    await flushMicrotasks();

    const completes = captured.filter((e) => e.event_type === 'persona_complete');
    expect(completes.length).toBeGreaterThanOrEqual(3);
    const ids = completes.map((e) => (e.payload as any).persona);
    expect(ids).toContain('researcher');
    expect(ids).toContain('architect');
    expect(ids).toContain('challenger');
    // Each should carry timing + shape-only summary
    for (const c of completes) {
      const p = c.payload as any;
      expect(typeof p.duration_ms).toBe('number');
      expect(p.output_summary).toMatch(/produced, \d+ch|no-output|failed/);
    }
  });

  it('emits persona_handoff N-1 times for N personas in sequential mode', async () => {
    const conductor = new Conductor({
      provider: mockProvider('Output'),
      model: TEST_MODEL,
      toolRegistry: registry,
      cwd: '.',
      config: { parallel: false, challengerCanVeto: false },
    });

    await withTrajectory(baseCtx, () => conductor.orchestrate(
      'Design',
      'plan',
      [],
      () => {},
      undefined,
      // Pin the depth. These tests are about EVENT WIRING, not about which
      // personas plan happens to field — they need a team big enough to
      // produce handoffs. Plan gained a light team on 2026-08-20 and the
      // default flipped to two personas, which broke four tests that were
      // never about rosters. Asking for what the test needs makes it immune
      // to the next roster change.
      { depth: 'full' },
    ));
    await flushMicrotasks();

    const handoffs = captured.filter((e) => e.event_type === 'persona_handoff');
    // 3 personas → 2 handoffs
    expect(handoffs).toHaveLength(2);
    expect((handoffs[0].payload as any).from_persona).toBe('researcher');
    expect((handoffs[0].payload as any).to_persona).toBe('architect');
    expect((handoffs[1].payload as any).from_persona).toBe('architect');
    expect((handoffs[1].payload as any).to_persona).toBe('challenger');
  });

  it('persona events share the trajectory_id of the orchestrate call', async () => {
    const conductor = new Conductor({
      provider: mockProvider(),
      model: TEST_MODEL,
      toolRegistry: registry,
      cwd: '.',
      config: { parallel: false },
    });
    await withTrajectory(baseCtx, () => conductor.orchestrate(
      'Design',
      'plan',
      [],
      () => {},
      undefined,
      // Pin the depth. These tests are about EVENT WIRING, not about which
      // personas plan happens to field — they need a team big enough to
      // produce handoffs. Plan gained a light team on 2026-08-20 and the
      // default flipped to two personas, which broke four tests that were
      // never about rosters. Asking for what the test needs makes it immune
      // to the next roster change.
      { depth: 'full' },
    ));
    await flushMicrotasks();

    const personaEvents = captured.filter((e) =>
      e.event_type === 'persona_decision' ||
      e.event_type === 'persona_handoff' ||
      e.event_type === 'persona_complete',
    );
    const trajs = new Set(personaEvents.map((e) => e.trajectory_id));
    expect(trajs.size).toBe(1);
  });

  it('handoff artifacts_produced reflects previous persona output', async () => {
    const conductor = new Conductor({
      provider: mockProvider('Findings text'),
      model: TEST_MODEL,
      toolRegistry: registry,
      cwd: '.',
      config: { parallel: false, challengerCanVeto: false },
    });

    await withTrajectory(baseCtx, () => conductor.orchestrate(
      'Design',
      'plan',
      [],
      () => {},
      undefined,
      // Pin the depth. These tests are about EVENT WIRING, not about which
      // personas plan happens to field — they need a team big enough to
      // produce handoffs. Plan gained a light team on 2026-08-20 and the
      // default flipped to two personas, which broke four tests that were
      // never about rosters. Asking for what the test needs makes it immune
      // to the next roster change.
      { depth: 'full' },
    ));
    await flushMicrotasks();

    const handoffs = captured.filter((e) => e.event_type === 'persona_handoff');
    expect(handoffs.length).toBeGreaterThan(0);
    const first = handoffs[0].payload as any;
    expect(first.artifacts_produced).toContain('researcher-output');
    expect(typeof first.context_word_count).toBe('number');
  });
});
