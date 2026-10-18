// Repairing a conversation the provider refused.
//
// A 400 is usually a complaint about the HISTORY, not about the message just
// sent — which is why it never recovered. The user types something new, the
// same malformed history goes behind it, and it fails identically. Forever.
// Starting a new chat was the only escape, and it threw away everything the
// conversation knew.
//
// 16 Oct 2026, mid-stream: a DeepSeek thinking-mode conversation died exactly
// this way, under an error that read "that's ours to fix — try again".

import { describe, it, expect } from 'vitest';
import { repairHistory } from '../src/agent/repair-history.js';
import type { Message } from '../src/core/types.js';

const user = (content: string): Message => ({ role: 'user', content } as Message);
const assistant = (content: string): Message => ({ role: 'assistant', content } as Message);

const toolCall = (id: string, reasoning?: string): Message => ({
  role: 'assistant',
  content: '',
  ...(reasoning ? { reasoning_content: reasoning } : {}),
  tool_calls: [{ id, type: 'function', function: { name: 'read_file', arguments: '{}' } }],
} as Message);

const toolResult = (id: string, content = 'ok'): Message =>
  ({ role: 'tool', tool_call_id: id, content } as Message);

const DEEPSEEK = 'The `reasoning_content` in the thinking mode must be passed back to the API.';

describe('an unrecognised complaint gets no repair', () => {
  // Guessing at a fault we do not understand is how a "fix" eats someone's
  // conversation. Unknown stays unknown and the error surfaces.
  it('returns null rather than inventing one', () => {
    const msgs = [user('hello'), assistant('hi')];
    expect(repairHistory('some error nobody has seen before', msgs)).toBeNull();
    expect(repairHistory('', msgs)).toBeNull();
  });

  it('returns null when there is nothing to repair', () => {
    const msgs = [user('hello'), toolCall('c1', 'because'), toolResult('c1'), assistant('done')];
    expect(repairHistory(DEEPSEEK, msgs)).toBeNull();
  });
});

describe('DeepSeek thinking mode', () => {
  it('drops the tool exchange that lost its reasoning', () => {
    const msgs = [
      user('what does this do?'),
      toolCall('c1'),            // no reasoning_content — the offender
      toolResult('c1'),
      assistant('it reads a file'),
      user('and now?'),
    ];
    const repair = repairHistory(DEEPSEEK, msgs)!;
    expect(repair).not.toBeNull();
    expect(repair.kind).toBe('reasoning-reattach');
    expect(repair.messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('keeps the exchanges that DO carry their reasoning', () => {
    const msgs = [
      user('q'),
      toolCall('good', 'I looked because...'),
      toolResult('good'),
      toolCall('bad'),
      toolResult('bad'),
    ];
    const repair = repairHistory(DEEPSEEK, msgs)!;
    const ids = repair.messages
      .filter(m => m.role === 'tool')
      .map(m => (m as { tool_call_id: string }).tool_call_id);
    expect(ids).toEqual(['good']);
  });

  // Rule 1: structural only. A repair may change the SHAPE of a conversation,
  // never its meaning. Losing what the user said is data loss wearing a
  // repair's clothes, and no provider complaint justifies it.
  it('never drops anything the user said', () => {
    const msgs = [user('first'), toolCall('c1'), toolResult('c1'), user('second'), user('third')];
    const repair = repairHistory(DEEPSEEK, msgs)!;
    const said = repair.messages.filter(m => m.role === 'user').map(m => m.content);
    expect(said).toEqual(['first', 'second', 'third']);
  });
});

describe('broken tool pairing', () => {
  it('drops a result whose call is gone', () => {
    const msgs = [user('q'), toolResult('ghost'), assistant('a')];
    const repair = repairHistory('invalid_request_message_order: tool_call_id not found', msgs)!;
    expect(repair.kind).toBe('drop-orphan-tool-results');
    expect(repair.messages.some(m => m.role === 'tool')).toBe(false);
  });

  it('drops a call that never got answered', () => {
    const msgs = [user('q'), toolCall('c1', 'why')];
    const repair = repairHistory('Expected last role User or Tool but got assistant', msgs)!;
    expect(repair.kind).toBe('drop-dangling-tool-calls');
    expect(repair.messages.map(m => m.role)).toEqual(['user']);
  });

  it('leaves a properly paired exchange alone', () => {
    const msgs = [user('q'), toolCall('c1', 'why'), toolResult('c1')];
    expect(repairHistory('last role', msgs)).toBeNull();
  });
});

describe('the repair reports itself', () => {
  // Rule 3: say so. A silent repair hides the bug that made it necessary —
  // the DeepSeek fault would have been absorbed invisibly and the two files
  // that disagreed would still be disagreeing.
  it('carries a summary a person can read', () => {
    const msgs = [user('q'), toolCall('c1'), toolResult('c1')];
    const repair = repairHistory(DEEPSEEK, msgs)!;
    expect(repair.summary).toMatch(/dropped 1 tool exchange/);
    expect(repair.summary).not.toMatch(/reasoning_content|400|null/);
  });
});
