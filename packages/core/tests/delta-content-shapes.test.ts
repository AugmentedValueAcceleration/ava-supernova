// A streamed reply must never render as [object Object].
//
// Seen live on 2026-08-18: a self_inspect turn came back as
//
//   [object Object][object Object][object Object]… ×20
//
// where the answer should have been. delta.content was assumed to be a string
// and concatenated straight on, so a provider streaming it as a content-part
// object produced one "[object Object]" per chunk.
//
// It is worse than a display glitch. By the time it reaches `content` the real
// text is gone — so the transcript keeps it, the history file keeps it, and
// the next request sends it back to the model as what Ava said.
//
// These test the coercion rule directly. Driving the full stream loop would
// need a fake provider and would test plumbing rather than the thing that
// broke, which is the shape handling.

import { describe, it, expect } from 'vitest';
import { getTextContent } from '../src/core/types.js';
import type { ContentPart } from '../src/core/types.js';

/** The exact coercion agent.ts applies to each delta. */
function coerce(raw: unknown): string {
  return typeof raw === 'string'
    ? raw
    : getTextContent((Array.isArray(raw) ? raw : [raw]) as unknown as ContentPart[]);
}

describe('delta.content shapes', () => {
  it('passes a plain string straight through — the common case', () => {
    expect(coerce('Hello')).toBe('Hello');
  });

  it('extracts text from a single content-part object', () => {
    // This is the shape that produced the wall of [object Object].
    expect(coerce({ type: 'text', text: 'The self-inspect tool works.' }))
      .toBe('The self-inspect tool works.');
  });

  it('extracts and joins an array of parts', () => {
    expect(coerce([
      { type: 'text', text: 'across all four bases ' },
      { type: 'text', text: '(core, extension, ide, mobile)' },
    ])).toBe('across all four bases (core, extension, ide, mobile)');
  });

  it('never yields the string "[object Object]"', () => {
    // The regression itself, stated plainly.
    for (const shape of [
      { type: 'text', text: 'fine' },
      [{ type: 'text', text: 'fine' }],
      [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }],
    ]) {
      expect(coerce(shape)).not.toContain('[object Object]');
    }
  });

  it('drops non-text parts rather than stringifying them', () => {
    // An image part has no text to show. Rendering "[object Object]" for it
    // would be the same bug wearing a different hat.
    expect(coerce([
      { type: 'text', text: 'Look: ' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
    ])).toBe('Look: ');
  });

  it('yields empty string for shapes with no text at all', () => {
    // Empty is correct: the caller skips the chunk. It must not fall back to
    // String(x), which is precisely how this started.
    expect(coerce({ type: 'image_url', image_url: { url: 'x' } })).toBe('');
    expect(coerce([])).toBe('');
  });
});
