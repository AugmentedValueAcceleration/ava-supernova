// 20 Oct 2026: a system note appended after the operator's tagged message
// made room detection read the note, find no tag, and run every Posts turn
// with no room — and so with none of the room's tools.

import { describe, it, expect } from 'vitest';
import { detectModeFromMessages } from '../src/agent/agent.js';

const user = (content: string) => ({ role: 'user' as const, content });

describe('room detection reads past system notes', () => {
  it('finds the room under a trailing [What exists] note', () => {
    expect(detectModeFromMessages([
      user('[Social Studio] plan today'),
      user('[What exists] Today so far: 0 text posts, 2 video posts.'),
    ] as never)).toBe('social');
  });

  it('finds it under [Talking] and the retry note too', () => {
    expect(detectModeFromMessages([
      user('[Social Studio] why lead with that?'),
      user('[What exists] Nothing has been written today yet.'),
      user('[Talking] This turn is a conversation.'),
    ] as never)).toBe('social');
    expect(detectModeFromMessages([
      user('[Social Studio] make the posts'),
      { role: 'assistant' as const, content: 'I said I had made something.' },
      user('[System note — you must read this] You said you made a text post…'),
    ] as never)).toBe('social');
  });

  it('still reads a real untagged message as no room', () => {
    expect(detectModeFromMessages([user('[Social Studio] hi'), user('just a plain message')] as never)).toBe(null);
  });
});
