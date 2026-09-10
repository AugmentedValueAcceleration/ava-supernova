import { describe, it, expect } from 'vitest';
import { SUPERNOVA_INTENT_GATE_ID } from '../src/auto/supernova-router.js';
import { LONGXIANG_INTENT_GATE_ID } from '../src/auto/longxiang-router.js';
import { AURORA_INTENT_GATE_ID } from '../src/auto/aurora-router.js';
import { modelCostMultiplier, CREDIT_COST } from '../src/billing/credits.js';

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

  it('costs the user no more than the model it replaced', () => {
    // The move was justified on accuracy, not price — 3.7 Flash carries a
    // higher multiplier than 3.5 Flash. It stays free to the user because a
    // gate call is one bracket and the 1-credit floor absorbs the difference.
    // If that ever stops being true, this seat became a real cost increase on
    // every turn and someone should have to say so out loud.
    const charge = (id: string) =>
      Math.max(1, Math.round(CREDIT_COST.light_call * modelCostMultiplier(id)));

    expect(charge('qwen3.7-flash')).toBe(charge('qwen3.5-flash'));
  });

  it('keeps a fallback that is a DIFFERENT model', () => {
    // Supernova's brainstorm route once listed its own primary as its
    // fallback, so an outage degraded to nothing at all. Same trap applies
    // here: a gate whose fallback is itself has no fallback.
    expect(SUPERNOVA_INTENT_GATE_ID).not.toBe('qwen3.5-flash');
    expect(LONGXIANG_INTENT_GATE_ID).not.toBe('deepseek-flash');
  });
});
