// The compaction boundary: the transcript the user scrolls is never touched;
// the model's view is system + middle + the tail from the boundary. A second
// compaction of an already-compacted context must land on the transcript in
// the right place, and an append-in-disguise must not drop the boundary.
import { describe, it, expect } from 'vitest';
import { Conversation } from '../src/agent/conversation.js';
import type { Message } from '../src/core/types.js';

const u = (t: string): Message => ({ role: 'user', content: t });
const a = (t: string): Message => ({ role: 'assistant', content: t });

function seeded(n: number): Conversation {
  const c = new Conversation();
  c.setSystemPrompt('SYS');
  for (let i = 1; i <= n; i++) { c.addUserMessage(`u${i}`); c.appendMessages([a(`a${i}`)]); }
  return c;
}

describe('Conversation compaction boundary', () => {
  it('without a boundary, context is the transcript', () => {
    const c = seeded(3);
    expect(c.getContextMessages()).toEqual(c.getMessages());
  });

  it('a boundary replaces the head for the model and leaves the transcript alone', () => {
    const c = seeded(6);                       // 1 system + 12
    // Agent compacted getContextMessages() (13 long) keeping the last 4.
    c.applyCompaction({ middle: [u('[summary]')], systemNote: '\n\n[note]', keptFromContext: 13 - 4 });
    expect(c.getMessages()).toHaveLength(13);   // transcript intact
    const ctx = c.getContextMessages();
    expect(ctx.map((m) => (typeof m.content === 'string' ? m.content : ''))).toEqual(['SYS\n\n[note]', '[summary]', 'u5', 'a5', 'u6', 'a6']);
  });

  it('appending keeps the boundary; a real replace drops it', () => {
    const c = seeded(6);
    c.applyCompaction({ middle: [u('[summary]')], systemNote: '', keptFromContext: 9 });
    c.appendMessages([u('u7'), a('a7')]);
    expect(c.getCompaction()?.keptFrom).toBe(9);
    // The two "push onto the copy and set it back" callers.
    const copy = c.getMessages(); copy.push(u('[Internal Planning]'));
    c.setMessages(copy);
    expect(c.getCompaction()?.keptFrom).toBe(9);
    expect(c.getContextMessages().at(-1)?.content).toBe('[Internal Planning]');
    // A different conversation entirely.
    c.setMessages([{ role: 'system', content: 'SYS' }, u('fresh')]);
    expect(c.getCompaction()).toBeNull();
  });

  it('a second compaction of the compacted context maps back onto the transcript', () => {
    const c = seeded(10);                      // 1 system + 20
    c.applyCompaction({ middle: [u('[summary 1]'), u('[verbatim]')], systemNote: '\n\n[note]', keptFromContext: 21 - 8 }); // keptFrom 13 → u7..a10
    expect(c.getCompaction()?.keptFrom).toBe(13);
    c.appendMessages([u('u11'), a('a11'), u('u12'), a('a12')]);
    // Context is now: system, [summary 1], [verbatim], u7..a12 (12 msgs) = 15 long.
    expect(c.getContextMessages()).toHaveLength(15);
    // Agent compacts THAT, keeping its last 4 (u11..a12): keptFromContext = 11.
    c.applyCompaction({ middle: [u('[summary 2]')], systemNote: '\n\n[note]', keptFromContext: 11 });
    const comp = c.getCompaction()!;
    expect(comp.keptFrom).toBe(21);            // transcript index of u11
    expect(comp.systemNote).toBe('\n\n[note]');  // same note, not doubled
    expect(c.getContextMessages().map((m) => m.content)).toEqual(['SYS\n\n[note]', '[summary 2]', 'u11', 'a11', 'u12', 'a12']);
    expect(c.getMessages()).toHaveLength(25);  // still everything
  });

  it('clear drops the boundary', () => {
    const c = seeded(4);
    c.applyCompaction({ middle: [u('[s]')], systemNote: '', keptFromContext: 5 });
    c.clear();
    expect(c.getCompaction()).toBeNull();
    expect(c.getContextMessages()).toHaveLength(1);
  });
});
