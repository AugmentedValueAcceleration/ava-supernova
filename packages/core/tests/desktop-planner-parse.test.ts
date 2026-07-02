/**
 * 0G regression suite — Planner output parsing.
 *
 * The Planner is an LLM; its JSON arrives in every shape models produce.
 * Every case here was observed live. A parse failure doesn't crash — it
 * becomes a controlled 'stuck' — but a FALSE parse failure kills a valid
 * plan ("Stuck: invalid planner output" on a perfectly good recovery).
 */
import { describe, it, expect } from 'vitest';
import { coerceAction, parseJson } from '../src/desktop/conductor.js';
import { ACTION_KINDS } from '../src/desktop/personas.js';
import type { ProposedAction } from '../src/desktop/types.js';

const parse = (text: string) => coerceAction(parseJson<ProposedAction>(text));

describe('parseJson tolerance', () => {
  it('parses bare JSON', () => {
    expect(parseJson('{"kind":"wait"}')).toEqual({ kind: 'wait' });
  });

  it('strips markdown fences', () => {
    expect(parseJson('```json\n{"kind":"wait"}\n```')).toEqual({ kind: 'wait' });
  });

  it('grabs the JSON object out of surrounding prose', () => {
    expect(parseJson('Here is my plan:\n{"kind":"wait"}\nHope that helps!')).toEqual({ kind: 'wait' });
  });

  it('returns null for empty / non-JSON text', () => {
    expect(parseJson('')).toBeNull();
    expect(parseJson('I cannot decide.')).toBeNull();
  });
});

describe('coerceAction', () => {
  // Caught live 2026-07-02: the model wrapped the action — kind inside an
  // "action" object, siblings outside — and a valid minimize_all recovery
  // died as "invalid planner output".
  it('unwraps {"action": {...}} wrappers, merging outer siblings', () => {
    const a = parse(JSON.stringify({
      action: { kind: 'minimize_all' },
      riskClass: 'navigational',
      expectedPostState: 'Desktop revealed.',
    }));
    expect(a.kind).toBe('minimize_all');
    expect(a.riskClass).toBe('navigational');
    expect(a.expectedPostState).toBe('Desktop revealed.');
  });

  it('inner wrapper fields win over outer duplicates', () => {
    const a = parse(JSON.stringify({
      action: { kind: 'click', target: 'Recycle Bin' },
      target: 'WRONG',
    }));
    expect(a.kind).toBe('click');
    expect(a.target).toBe('Recycle Bin');
  });

  it('garbage becomes a controlled stuck, never a crash', () => {
    const a = parse('utter nonsense');
    expect(a.kind).toBe('stuck');
    expect(a.params?.reason).toBe('invalid planner output');
  });

  it('unknown kinds become stuck', () => {
    const a = parse('{"kind":"summon_demon"}');
    expect(a.kind).toBe('stuck');
  });

  it('defaults a missing riskClass to mutative-reversible (conservative)', () => {
    const a = parse('{"kind":"click","target":"OK"}');
    expect(a.riskClass).toBe('mutative-reversible');
  });
});

describe('action-kind drift guard', () => {
  // Caught live 2026-07-02: the conductor kept its own hand-maintained copy
  // of the action list; 'drag' and 'minimize_all' were ADVERTISED to the
  // model but rejected by coerceAction as invalid. The validation set now
  // derives from the Planner vocabulary — this test fails if anyone ever
  // reintroduces a second list.
  it.each(ACTION_KINDS)('every advertised Planner kind is accepted: "%s"', (kind) => {
    const a = parse(JSON.stringify({ kind, target: 'x', params: { reason: 'r', dropTarget: 'y' } }));
    expect(a.kind).toBe(kind);
  });
});
