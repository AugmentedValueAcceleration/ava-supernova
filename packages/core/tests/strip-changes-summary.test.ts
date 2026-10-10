import { describe, it, expect } from 'vitest';
import { stripChangesSummary, extractChangesSummary } from '../src/auto/changes-summary.js';

const BLOCK = `<changes-summary>
files: [Source/Characters/APD_BaseCharacter.h, Decisions/progress.md]
categories: [prose]
notes: Exhaustion handling.
</changes-summary>`;

describe('stripChangesSummary', () => {
  it('removes a complete block and leaves the answer', () => {
    const out = stripChangesSummary(`Done — sprint is refused when you are spent.\n\n${BLOCK}`);
    expect(out).toBe('Done — sprint is refused when you are spent.');
    expect(out).not.toContain('changes-summary');
  });

  it('removes an UNTERMINATED block', () => {
    // The reply is streamed. A block only closed at the very end would
    // otherwise appear character by character and then vanish, so anything
    // from the opening tag onward is cut while it is still arriving.
    const mid = 'Done — that closes it.\n\n<changes-summary>\nfiles: [a.ts, b.ts';
    expect(stripChangesSummary(mid)).toBe('Done — that closes it.');
  });

  it('leaves a message that has no block untouched', () => {
    const plain = 'Verified: builds and links.\nNot verified: it has not run.';
    expect(stripChangesSummary(plain)).toBe(plain);
  });

  it('handles more than one block', () => {
    expect(stripChangesSummary(`a\n${BLOCK}\nb\n${BLOCK}`)).toBe('a\n\nb');
  });

  it('does not collapse ordinary paragraph breaks', () => {
    // Only the gap the removal leaves behind is tidied; the author's own
    // blank line between paragraphs has to survive.
    expect(stripChangesSummary('one\n\ntwo')).toBe('one\n\ntwo');
  });

  it('is display-only — the parser still reads the original', () => {
    // The whole point: verification keeps working off the raw message, and
    // only the copy shown to a person loses the block.
    const msg = `Shipped it.\n\n${BLOCK}`;
    expect(stripChangesSummary(msg)).toBe('Shipped it.');
    const parsed = extractChangesSummary(msg);
    expect(parsed?.files).toEqual(['Source/Characters/APD_BaseCharacter.h', 'Decisions/progress.md']);
  });

  it('survives empty input', () => {
    expect(stripChangesSummary('')).toBe('');
  });
});
