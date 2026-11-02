import { describe, it, expect } from 'vitest';
import { SUPERNOVA_INTENT_GATE_ID } from '../src/auto/supernova-router.js';
import { LONGXIANG_INTENT_GATE_ID } from '../src/auto/longxiang-router.js';
import { AURORA_INTENT_GATE_ID } from '../src/auto/aurora-router.js';

/**
 * The intent gate seat, pinned.
 *
 * Nothing guarded this. Moving the gate from Qwen 3.5 Flash to 3.7 Flash on
 * 2026-09-10 changed a model that runs BEFORE EVERY TURN in two fleets, and
 * the full suite passed identically either side of the change — 1156 before,
 * 1156 after. A seat that important should not be silently movable.
 *
 * This is meant to fail when the seat moves. That is the point: the failure
 * is the prompt to re-run scripts/gate-bench.mjs and update the numbers in
 * the routers, rather than discovering months later that nobody measured it.
 *
 * Chosen on 280 measured calls per candidate:
 *
 *              accuracy   p50     p95     p99      worst
 *   3.5 Flash  92.9%      538ms   672ms   847ms    1310ms
 *   3.7 Flash  99.6%      570ms   790ms   1284ms   1667ms
 *   3.8 Flash  96.8%      698ms   2532ms  27038ms  51700ms
 */
describe('intent gate seat', () => {
  it('runs on Qwen 3.7 Flash in the Qwen-bearing fleets', () => {
    expect(SUPERNOVA_INTENT_GATE_ID).toBe('qwen3.7-flash');
    expect(LONGXIANG_INTENT_GATE_ID).toBe('qwen3.7-flash');
  });

  it('leaves Aurora on Mistral — the EU stack never routes outside Mistral', () => {
    // Aurora's whole promise is that no call leaves Mistral. A gate is still a
    // call, so it must not quietly become a Qwen model along with the others.
    expect(AURORA_INTENT_GATE_ID).toBe('mistral-small-4');
  });

  it('keeps a fallback that is a DIFFERENT model', () => {
    // Supernova's brainstorm route once listed its own primary as its
    // fallback, so an outage degraded to nothing at all. Same trap applies
    // here: a gate whose fallback is itself has no fallback.
    expect(SUPERNOVA_INTENT_GATE_ID).not.toBe('qwen3.5-flash');
    expect(LONGXIANG_INTENT_GATE_ID).not.toBe('deepseek-flash');
  });
});
