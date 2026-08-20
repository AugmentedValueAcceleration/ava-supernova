// What Ava is told when a plan is approved.
//
// 2026-08-19: a plan offered "all eleven tasks" or "a minimal four-task core
// loop first", recommended the second, and asked which the operator wanted. The
// IDE had no plan card, so the question was never put to him — and eleven tasks
// were dispatched. From outside it read as her choosing for him, or splicing
// the two approaches together.
//
// Two surfaces used to write this sentence by hand: the extension built its own
// string, the IDE passed the user's free text through untouched. Neither told
// her to stick to the approach that was chosen. One formatter now, tested on
// the wording that matters.

import { describe, it, expect } from 'vitest';
import { formatPlanDecision } from '../src/tools/present-plan.js';

describe('a plan approved with a chosen approach', () => {
  const out = formatPlanDecision({ selection: 'Minimal First' });

  it('names the approach', () => {
    expect(out).toContain('"Minimal First"');
  });

  it('rules out the approaches that were not picked', () => {
    // The whole point. Without this she is free to read the other alternative's
    // steps as part of the plan, which is what eleven tasks looked like.
    expect(out).toMatch(/do not carry over/i);
    expect(out).toMatch(/do not combine/i);
  });
});

describe('a plan approved without alternatives', () => {
  it('says nothing about choosing', () => {
    // A single-path plan never asked a question; a sentence about approaches
    // would invent one.
    const out = formatPlanDecision();
    expect(out).toBe('Plan approved. Execute the steps.');
  });
});

describe('the note rides along with the decision', () => {
  it('carries it alongside a choice', () => {
    const out = formatPlanDecision({ selection: 'Minimal First', note: 'keep the console command' });
    expect(out).toContain('"Minimal First"');
    expect(out).toContain('They added: "keep the console command"');
  });

  it('carries it on its own', () => {
    const out = formatPlanDecision({ note: 'start with the widget' });
    expect(out).toContain('They added: "start with the widget"');
    expect(out).not.toMatch(/approach/i);
  });

  it('ignores whitespace-only input rather than quoting it', () => {
    expect(formatPlanDecision({ selection: '  ', note: '\n ' }))
      .toBe('Plan approved. Execute the steps.');
  });

  it('trims what it quotes', () => {
    expect(formatPlanDecision({ selection: '  Minimal First  ' })).toContain('"Minimal First"');
  });
});
