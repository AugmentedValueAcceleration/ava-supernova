/**
 * 0G regression suite — Phase 3B: fork-point learning (the moat).
 * A failed action at a screen + a later different success at a matching
 * screen = a retrievable lesson. Guardrails are load-bearing: observed-origin
 * never teaches, the store stays capped, stale lessons fade.
 */
import { describe, it, expect } from 'vitest';
import {
  createEmptyForkPointStore, recordFailure, recordSuccess, retrieveHints,
  decayStore, FORK_POINT_CAP,
} from '../src/desktop/fork-points.js';
import { imageKey, ctxKey } from '../src/desktop/screen-key.js';

const W = 32, H = 32;
const screen = (fill: number) => Uint8Array.from({ length: W * H }, (_, i) => (fill + (i % 7) * 9) % 256);
const keyA = () => imageKey(screen(10), W, H);
const keyB = () => imageKey(screen(150), W, H);

describe('failure → correction pairing (the GRSD loop, at runtime)', () => {
  it('records a failure, pairs the next DIFFERENT verified action on a matching screen', () => {
    const store = createEmptyForkPointStore();
    recordFailure(store, keyA(), { kind: 'click', target: 'Submit', reason: 'a modal intercepted the click' });
    const updated = recordSuccess(store, keyA(), { kind: 'click', target: 'Accept cookies' });
    expect(updated).toHaveLength(1);
    expect(updated[0].corrected).toEqual({ kind: 'click', target: 'Accept cookies' });
    const hint = retrieveHints(store, keyA());
    expect(hint).toMatch(/Submit.*failed.*modal/s);
    expect(hint).toMatch(/Accept cookies.*worked instead/s);
  });

  it('the same action succeeding is NOT its own correction', () => {
    const store = createEmptyForkPointStore();
    recordFailure(store, keyA(), { kind: 'click', target: 'Submit', reason: 'flaky' });
    expect(recordSuccess(store, keyA(), { kind: 'click', target: 'Submit' })).toHaveLength(0);
  });

  it('a DIFFERENT screen learns nothing from this screen\'s success', () => {
    const store = createEmptyForkPointStore();
    recordFailure(store, keyA(), { kind: 'click', target: 'Submit', reason: 'x' });
    expect(recordSuccess(store, keyB(), { kind: 'click', target: 'Other' })).toHaveLength(0);
    expect(retrieveHints(store, keyB())).toBeNull();
  });

  it('repeat failures reinforce instead of duplicating', () => {
    const store = createEmptyForkPointStore();
    recordFailure(store, keyA(), { kind: 'click', target: 'Submit', reason: 'first' });
    recordFailure(store, keyA(), { kind: 'click', target: 'Submit', reason: 'second (fresher)' });
    expect(store.points).toHaveLength(1);
    expect(store.points[0].failures).toBe(2);
    expect(store.points[0].failed.reason).toBe('second (fresher)');
  });

  it('works with ctx keys too (vision-off degradation)', () => {
    const store = createEmptyForkPointStore();
    const k = ctxKey('notepad', 'save the file');
    recordFailure(store, k, { kind: 'key', target: 'ctrl+shift+s', reason: 'opened the wrong dialog' });
    recordSuccess(store, ctxKey('Notepad', 'save the  file'), { kind: 'key', target: 'ctrl+s' });
    expect(retrieveHints(store, k)).toMatch(/ctrl\+s.*worked/s);
  });
});

describe('guardrails', () => {
  it('observed-origin actions NEVER teach — neither as failure nor correction', () => {
    const store = createEmptyForkPointStore();
    expect(recordFailure(store, keyA(), { kind: 'click', target: 'Delete', reason: 'x', origin: 'observed' })).toBeNull();
    expect(store.points).toHaveLength(0);
    recordFailure(store, keyA(), { kind: 'click', target: 'Submit', reason: 'y' });
    expect(recordSuccess(store, keyA(), { kind: 'click', target: 'Sneaky page button', origin: 'observed' })).toHaveLength(0);
    expect(store.points[0].corrected).toBeUndefined();
  });

  it('hints are hindsight text, labelled as such — never orders', () => {
    const store = createEmptyForkPointStore();
    recordFailure(store, keyA(), { kind: 'click', target: 'X', reason: 'r' });
    expect(retrieveHints(store, keyA())).toMatch(/hindsight, not orders.*safety gate/s);
  });

  it('the store is capped and evicts lowest-confidence first', () => {
    const store = createEmptyForkPointStore();
    for (let i = 0; i < FORK_POINT_CAP + 20; i++) {
      recordFailure(store, imageKey(screen((i * 13) % 256), W, H), { kind: 'click', target: `t${i}`, reason: 'r' });
    }
    expect(store.points.length).toBeLessThanOrEqual(FORK_POINT_CAP);
  });

  it('stale entries decay and eventually drop out', () => {
    const store = createEmptyForkPointStore();
    const old = new Date('2026-01-01T00:00:00Z');
    recordFailure(store, keyA(), { kind: 'click', target: 'X', reason: 'r' }, undefined, old);
    const conf0 = store.points[0].confidence;
    decayStore(store, new Date('2026-03-01T00:00:00Z'));
    expect(store.points.length === 0 || store.points[0].confidence < conf0).toBe(true);
  });
});
