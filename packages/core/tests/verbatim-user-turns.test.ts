import { describe, it, expect } from 'vitest';
import { buildVerbatimUserTurnsBlock } from '../src/agent/context-continuity.js';
import type { Message } from '../src/core/types.js';

describe('buildVerbatimUserTurnsBlock', () => {
  it('returns null when there are no real user turns', () => {
    const msgs: Message[] = [
      { role: 'assistant', content: 'hi' },
      { role: 'tool', content: 'result', tool_call_id: 't1' },
    ];
    expect(buildVerbatimUserTurnsBlock(msgs)).toBeNull();
  });

  it('keeps user turns verbatim and numbered', () => {
    const msgs: Message[] = [
      { role: 'user', content: 'First ask about the schema.' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'Second ask about the calendar.' },
    ];
    const block = buildVerbatimUserTurnsBlock(msgs)!;
    expect(block).not.toBeNull();
    expect(block.role).toBe('user');
    expect(block.content).toContain('First ask about the schema.');
    expect(block.content).toContain('Second ask about the calendar.');
    expect(block.content).toContain('NOT new requests');
  });

  it('excludes meta-injection user messages', () => {
    const msgs: Message[] = [
      { role: 'user', content: '[CONTEXT WAS COMPRESSED. RESUME.]' },
      { role: 'user', content: 'A genuine question.' },
    ];
    const block = buildVerbatimUserTurnsBlock(msgs)!;
    expect(block.content).toContain('A genuine question.');
    expect(block.content).not.toContain('CONTEXT WAS COMPRESSED');
  });

  it('caps an over-long single turn', () => {
    const long = 'x'.repeat(900);
    const block = buildVerbatimUserTurnsBlock([{ role: 'user', content: long }])!;
    expect(block.content).toContain('…');
    expect(block.content.length).toBeLessThan(900);
  });

  it('drops oldest turns past the total budget and notes the omission', () => {
    // Many large-ish turns to blow the ~6000 char total budget.
    const msgs: Message[] = Array.from({ length: 40 }, (_, i) => ({
      role: 'user' as const,
      content: `Turn ${i}: ` + 'word '.repeat(60),
    }));
    const block = buildVerbatimUserTurnsBlock(msgs)!;
    expect(block.content).toMatch(/omitted here/);
    // The most recent turn must survive; the very first should be dropped.
    expect(block.content).toContain('Turn 39:');
  });
});
