// A half-finished reply must not 400 the next request.
//
// Mistral refuses a conversation ending in an assistant turn:
//   "Expected last role User or Tool (or Assistant with prefix True) for
//    serving but got assistant"
//
// The agent can produce exactly that. It appends a PARTIAL assistant reply and
// loops when a stream is interrupted mid-answer, expecting the interjection
// drain to put a user message behind it — and the queue can be emptied in
// between. Interrupting a stream became a button people press on 2026-08-17,
// so this went from theoretical to reachable in one release.
//
// `prefix: true` is Mistral's own answer, named in its error: continue this
// message rather than reply to it. That is what a half-finished reply IS, and
// it keeps the text the user already watched appear on screen.

import { describe, it, expect } from 'vitest';
import { shapeMessages, markTrailingAssistantPrefix } from '../src/providers/request-shaping/messages.js';

const user = (content: string) => ({ role: 'user', content });
const assistant = (content: string) => ({ role: 'assistant', content });

describe('trailing assistant message', () => {
  it('is marked as a prefix continuation for Mistral', () => {
    const out = shapeMessages('mistral', [user('hi'), assistant('Let me pull the rele')]);
    expect(out.at(-1)).toMatchObject({ role: 'assistant', prefix: true });
  });

  it('keeps the partial text rather than dropping it', () => {
    // The user watched this stream onto their screen. Discarding it to make
    // the request valid would be tidier for us and a lie to them.
    const out = shapeMessages('mistral', [user('hi'), assistant('Let me pull the rele')]);
    expect(out.at(-1)).toMatchObject({ content: 'Let me pull the rele' });
  });

  it('leaves a conversation that already ends correctly alone', () => {
    for (const last of [user('hi'), { role: 'tool', content: 'ok', tool_call_id: 't1' }]) {
      const out = shapeMessages('mistral', [assistant('earlier'), last]);
      expect(out.at(-1)).not.toHaveProperty('prefix');
    }
  });

  it('does not touch an assistant turn in the MIDDLE', () => {
    const out = shapeMessages('mistral', [user('a'), assistant('b'), user('c')]);
    expect(out[1]).not.toHaveProperty('prefix');
  });

  it('marks a trailing assistant WITH tool_calls too', () => {
    // REVERSED on 2026-08-19. This used to assert the opposite — that dangling
    // tool_calls were left alone "so they fail loudly", on the reasoning that
    // prefix would not rescue them and would hide the fault a layer deeper.
    //
    // It failed loudly and rescued nothing. The operator hit it after a
    // present_plan turn and got the raw provider error at the end of work that
    // had otherwise succeeded:
    //
    //   Expected last role User or Tool (or Assistant with prefix True)
    //   for serving but got assistant
    //
    // Mistral's own message names prefix:true as accepted and does not exclude
    // assistant turns carrying tool_calls. A continuation is a better outcome
    // than a 400 the user has to read, and the shaper logs the state so it is
    // visible rather than silent.
    const out = markTrailingAssistantPrefix('mistral', [
      user('go'),
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'x', arguments: '{}' } }] },
    ]);
    expect(out.at(-1)).toHaveProperty('prefix', true);
  });

  it('only applies to Mistral — the others accept a trailing assistant', () => {
    for (const p of ['qwen', 'deepseek', 'kimi', 'minimax', 'nvidia']) {
      const out = shapeMessages(p, [user('hi'), assistant('partial')]);
      expect(out.at(-1), `${p} should be untouched`).not.toHaveProperty('prefix');
    }
  });

  it('is idempotent, so shaping twice cannot double-apply', () => {
    const once = shapeMessages('mistral', [user('hi'), assistant('partial')]);
    const twice = shapeMessages('mistral', once);
    expect(twice).toEqual(once);
  });

  it('survives an empty array', () => {
    expect(shapeMessages('mistral', [])).toEqual([]);
  });
});
