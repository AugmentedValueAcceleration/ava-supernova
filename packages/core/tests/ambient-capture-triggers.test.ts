import { describe, it, expect } from 'vitest';
import { heuristicScore, decisionEvidence } from '../src/memory/ambient-capture.js';
import { AMBIENT_PROMOTE_THRESHOLD } from '../src/memory/types.js';
import type { CaptureCandidate } from '../src/memory/types.js';

/**
 * Automatic memory capture during real work.
 *
 * REPORTED 2026-09-10: "she uses the decisions folder flawlessly but logging
 * to her own memory no so good unless asked."
 *
 * The cause was arithmetic. composite = novelty*0.35 + relevance*0.40 +
 * confidence*0.25, promote at 0.6. Confidence only moved on explicit phrases —
 * "remember", "we decided", "approved" — none of which appear in a turn where
 * Ava simply does the work correctly. So confidence sat pinned at its 0.4
 * floor contributing a fixed 0.10, relevance realistically reached ~0.5
 * contributing 0.20, and novelty had to supply 0.30 of its 0.35 alone:
 * novelty above 0.857.
 *
 * Novelty is the one signal that DECAYS as you concentrate. An evening on one
 * subsystem makes every turn resemble the last, so the deeper the work went,
 * the less was kept — and asking explicitly worked only because the request
 * supplied the missing markers.
 *
 * These tests pin the two fixes. They are written against the arithmetic
 * rather than a snapshot, so retuning the weights fails them loudly.
 */

const graphStub = {
  // Simulates a session already full of similar material — the state that
  // made capture go quiet. maxSimilarity 0.6 => novelty 0.4.
  findSimilar: () => [{ similarity: 0.6 }],
} as unknown as Parameters<typeof heuristicScore>[1];

function codingTurn(over: Partial<CaptureCandidate> = {}): CaptureCandidate {
  return {
    userMessage: 'the foot placement is popping on stairs',
    assistantMessage: 'Adjusted the pelvis offset and clamped the ankle rotation.',
    toolsUsed: ['file_edit'],
    turnIndex: 12,
    sessionId: 'sess-1',
    ...over,
  };
}

describe('ambient capture — a working coding turn', () => {
  it('used to be unreachable: with confidence pinned at 0.4, novelty had to exceed 0.857', () => {
    // Reconstructs the old behaviour by withholding filesTouched, which is
    // what every caller did before this change.
    const before = heuristicScore(codingTurn({ filesTouched: undefined }), graphStub);
    expect(before.confidence).toBeCloseTo(0.4, 2);

    // The novelty this turn would have needed, holding the other terms fixed.
    const needed = (AMBIENT_PROMOTE_THRESHOLD - before.relevance * 0.40 - 0.4 * 0.25) / 0.35;
    expect(needed).toBeGreaterThan(0.8);

    // And in a focused session novelty is nowhere near that.
    expect(before.novelty).toBeLessThan(0.5);
    expect(before.composite).toBeLessThan(AMBIENT_PROMOTE_THRESHOLD);
  });

  it('a turn that actually changed a file is no longer pinned at the confidence floor', () => {
    const before = heuristicScore(codingTurn({ filesTouched: undefined }), graphStub);
    const after = heuristicScore(codingTurn({ filesTouched: ['src/game/FootIK.cpp'] }), graphStub);

    expect(after.confidence).toBeGreaterThan(0.7);

    // The bar it must clear on novelty alone genuinely drops.
    const neededBefore = (AMBIENT_PROMOTE_THRESHOLD - before.relevance * 0.40 - before.confidence * 0.25) / 0.35;
    const neededAfter = (AMBIENT_PROMOTE_THRESHOLD - after.relevance * 0.40 - after.confidence * 0.25) / 0.35;
    expect(neededAfter).toBeLessThan(neededBefore);
  });

  it('STILL cannot promote a heavily repetitive turn, and that is the design', () => {
    // Worth being honest about, because it is easy to assume the confidence
    // fix above solved the reported problem. It did not, and no tuning of
    // that term could: at novelty 0.4 and relevance 0.4 the confidence needed
    // to reach 0.6 is 1.2, above the maximum of 1.0.
    //
    // Which is correct behaviour. Fifty near-identical memories from one
    // evening on one subsystem would poison recall rather than serve it.
    // Per-turn capture is a filter and it is doing its job.
    //
    // The work IS remembered — by end-of-session reflection, and by the
    // decision signals below. If this test ever starts failing because a
    // repetitive turn now promotes, check that memory has not started filling
    // with duplicates.
    const saturated = heuristicScore(
      codingTurn({ filesTouched: ['src/game/FootIK.cpp'] }),
      { findSimilar: () => [{ similarity: 0.6 }] } as unknown as Parameters<typeof heuristicScore>[1],
    );
    expect(saturated.composite).toBeLessThan(AMBIENT_PROMOTE_THRESHOLD);
  });
});

describe('ambient capture — decisions are facts, not guesses', () => {
  it('recognises a Decisions/ write on either path separator', () => {
    expect(decisionEvidence(codingTurn({ filesTouched: ['Decisions/records/0007-foot-ik.md'] })))
      .toBe('Decisions/ write');
    expect(decisionEvidence(codingTurn({ filesTouched: ['C:\\proj\\Decisions\\design\\palette.md'] })))
      .toBe('Decisions/ write');
  });

  it('treats an accepted plan as a decision', () => {
    expect(decisionEvidence(codingTurn({ toolsUsed: ['apply_plan'] }))).toBe('plan accepted');
  });

  it('does NOT fire on an ordinary edit', () => {
    // The whole point of keeping this narrow. Ordinary edits are frequent, and
    // promoting each one would bury the personal memories that make her feel
    // like she knows you under a wall of routine file changes.
    expect(decisionEvidence(codingTurn({ filesTouched: ['src/game/FootIK.cpp'] }))).toBeNull();
  });

  it('does NOT mistake a file merely named decisions for the convention', () => {
    // The signal is the FOLDER — the project's record of settled choices — not
    // any file whose name happens to contain the word.
    expect(decisionEvidence(codingTurn({ filesTouched: ['docs/decisions.md'] }))).toBeNull();
    expect(decisionEvidence(codingTurn({ filesTouched: ['src/my-decisions-helper.ts'] }))).toBeNull();
  });

  it('survives a turn with no file information at all', () => {
    // Callers that cannot cheaply resolve tool arguments omit filesTouched;
    // scoring must behave exactly as before rather than throwing.
    expect(decisionEvidence(codingTurn({ filesTouched: undefined }))).toBeNull();
  });
});
