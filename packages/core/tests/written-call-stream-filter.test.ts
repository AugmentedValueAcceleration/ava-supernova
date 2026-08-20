// A written tool call must never reach the screen, not even briefly.
//
// 2026-08-19, one turn after recoverWrittenToolCalls shipped: the recovery
// worked perfectly and the operator still saw a wall of JSON. The recovery runs
// on the FINISHED message; the deltas had already painted every character of
// <present_plan>{…}</present_plan> live. He saw the syntax, then the card.
//
// Two more complaints from the same turn were the same fault wearing different
// clothes. The approval prompt arrived after the plan had finished writing —
// it could not have come sooner, because the call did not exist until the
// stream closed. And denying it did not remove the plan, because the thing on
// screen was text, already painted, and no longer ours to withdraw.
//
// So these tests drive the filter the way a provider does: in chunks, split at
// hostile places, asserting on what the USER would have seen.

import { describe, it, expect } from 'vitest';
import { WrittenCallStreamFilter } from '../src/agent/recover-written-calls.js';

const OFFERED = new Set(['present_plan', 'ask_user', 'read']);

/** Feed `text` in chunks of `size` and return everything shown, flush included. */
function stream(text: string, size: number, offered = OFFERED): string {
  const filter = new WrittenCallStreamFilter(offered);
  let seen = '';
  for (let i = 0; i < text.length; i += size) seen += filter.push(text.slice(i, i + size));
  return seen + filter.flush();
}

/** Every chunking from one character up to the whole string at once. */
function everyChunking(text: string, offered = OFFERED): string[] {
  const out: string[] = [];
  for (let size = 1; size <= text.length; size++) out.push(stream(text, size, offered));
  return [...new Set(out)];
}

describe('the block never reaches the screen', () => {
  const LIVE = `I have a clear picture of your inventory system.

<present_plan>
{"title":"Complete Inventory System Implementation - Full C++","steps":[{"description":"Create SC_ItemDefinition DataAssets","files":["Content/Items/Weapons/"],"notes":"Full C++ project"}]}
</present_plan>`;

  it('shows the prose and nothing else, however it is chunked', () => {
    // The chunk boundaries are where a naive filter breaks: mid-tag, mid-name,
    // mid-string, mid-brace. Every split must give the same answer.
    // The blank line before the tag is ordinary text and streams through; the
    // recovery trims it off the stored message. Trailing whitespace is the only
    // difference between what is shown and what is kept.
    expect(everyChunking(LIVE)).toEqual(['I have a clear picture of your inventory system.\n\n']);
  });

  it('holds the unclosed form too', () => {
    const text = 'Let me check.\n\n<read>\n{"file_path":"Decisions/design/inventory-data-model.md"}';
    expect(everyChunking(text)).toEqual(['Let me check.\n\n']);
  });

  it('holds a reply cut off mid-closing-tag', () => {
    expect(everyChunking('<present_plan>{"title":"x"}\n</present_plan')).toEqual(['']);
  });
});

describe('ordinary text is never withheld', () => {
  it('passes prose through byte-identically at every chunking', () => {
    const text = 'Use `Array<string>` and check `a < b` before the <em>tag</em>.\n\nDone.';
    expect(everyChunking(text)).toEqual([text]);
  });

  it('passes a tag that is not an offered tool', () => {
    const text = 'See <summary>{"note":"not a tool"}</summary> for details.';
    expect(everyChunking(text)).toEqual([text]);
  });

  it('gives back a tool tag wrapped around prose', () => {
    // Matches recoverWrittenToolCalls: a tag around prose is prose. If the
    // filter hid this the recovery would not lift it, and the text would vanish.
    const text = '<present_plan>I think we should start with the widget.</present_plan>';
    expect(everyChunking(text)).toEqual([text]);
  });

  it('gives back a tag left dangling at the end of the reply', () => {
    const text = 'Consider using <read';
    expect(everyChunking(text)).toEqual([text]);
  });

  it('does nothing at all when no tools were offered', () => {
    const text = '<present_plan>{"title":"x"}</present_plan>';
    expect(everyChunking(text, new Set())).toEqual([text]);
  });
});

describe('text around a call survives', () => {
  it('keeps prose on both sides', () => {
    const text = 'Before.\n\n<read>{"file_path":"a.ts"}</read>\n\nAfter.';
    expect(everyChunking(text)).toEqual(['Before.\n\n\n\nAfter.']);
  });

  it('handles two calls in one reply', () => {
    const text = 'A <ask_user>{"question":"which?"}</ask_user> B <read>{"file_path":"a.ts"}</read> C';
    expect(everyChunking(text)).toEqual(['A  B  C']);
  });
});

describe('it agrees with the recovery it fronts', () => {
  it('withholds exactly what the recovery removes', async () => {
    const { recoverWrittenToolCalls } = await import('../src/agent/recover-written-calls.js');
    for (const text of [
      'Prose.\n\n<present_plan>{"title":"x","steps":[{"description":"a"}]}</present_plan>',
      '<read>{"file_path":"src/{weird}/file.ts"}',
      '<present_plan>I think we should start with the widget.</present_plan>',
      'Use `Array<string>` here.',
      '<summary>{"note":"not a tool"}</summary>',
    ]) {
      // What the reader is left with, streamed, must match what the recovery
      // leaves in the message — otherwise the screen and the history disagree.
      const shown = stream(text, 3).replace(/\n{3,}/g, '\n\n').trim();
      expect(recoverWrittenToolCalls(text, OFFERED).text.trim()).toBe(shown);
    }
  });
});
