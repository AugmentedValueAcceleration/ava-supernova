// An error a non-programmer can act on.
//
// What the operator was shown on 2026-08-17:
//
//   Ava Platform API error: 400 Bad Request — {"error":"Provider mistral
//   returned 400: {\"object\":\"error\",\"message\":\"Expected last role User
//   or Tool (or Assistant with prefix True) for serving but got
//   assistant\",\"type\":\"invalid_request_message_order\",...}"}
//
// Two failures in one. The platform wraps the upstream error in its own JSON,
// so `body.error` is a STRING containing more JSON — a single parse leaves
// `body.error.message` undefined, the reader gave up, and the whole blob was
// printed. And nothing translated it, so a person who does not read JSON
// learned only that something broke and not whether they had caused it.
//
// AI is bringing people in who have never seen a stack trace. An error should
// say what happened, whose fault it is, and what to do.

import { describe, it, expect } from 'vitest';
import { ProviderError } from '../src/core/errors.js';

/** The platform's real double-wrapped shape. */
const wrapped = (upstream: Record<string, unknown>) =>
  JSON.stringify({ error: `Provider mistral returned 400: ${JSON.stringify(upstream)}` });

const err = (body: string) => new ProviderError('raw', 'platform', 400, body);

describe('the message-order 400', () => {
  const body = wrapped({
    object: 'error',
    message: 'Expected last role User or Tool (or Assistant with prefix True) for serving but got assistant',
    type: 'invalid_request_message_order',
    code: '3230',
  });

  it('is explained in plain English', () => {
    const m = err(body).humanMessage;
    expect(m).toMatch(/out of order/i);
    expect(m).toMatch(/again/i);
  });

  it('says it is OUR fault, because the user cannot tell', () => {
    expect(err(body).humanMessage).toMatch(/our side|not something you did/i);
  });

  it('shows no JSON, braces or field names', () => {
    const m = err(body).humanMessage;
    expect(m).not.toMatch(/[{}]/);
    expect(m).not.toMatch(/invalid_request_message_order|raw_status_code|"object"/);
  });
});

describe('digging the real sentence out', () => {
  it('reaches through the platform wrapper a single parse cannot', () => {
    // body.error is a string containing JSON — the old reader returned ''
    // here and printed the entire blob instead.
    const m = err(wrapped({ message: 'Some upstream complaint we do not recognise' })).humanMessage;
    expect(m).toContain('Some upstream complaint we do not recognise');
    expect(m).not.toContain('Provider mistral returned');
  });

  it('still works on a plain, unwrapped provider body', () => {
    const m = err(JSON.stringify({ error: { message: 'Straightforward complaint' } })).humanMessage;
    expect(m).toContain('Straightforward complaint');
  });

  it('does not invent an explanation for an error it does not know', () => {
    // Silence would be worse than the raw text: a reassuring guess about an
    // unknown fault is how people get told to retry something that will never
    // work. Unknown errors keep their real words.
    const m = err(wrapped({ message: 'Quota exceeded for tenant 42' })).humanMessage;
    expect(m).toContain('Quota exceeded for tenant 42');
    expect(m).not.toMatch(/our side/i);
  });

  it('survives a body that is not JSON at all', () => {
    expect(() => err('<html>502 Bad Gateway</html>').humanMessage).not.toThrow();
    expect(err('<html>502 Bad Gateway</html>').humanMessage).toContain('502');
  });

  it('survives an empty body', () => {
    expect(() => new ProviderError('raw', 'platform', 400, '').humanMessage).not.toThrow();
  });
});

describe('the other conditions people actually hit', () => {
  const cases: Array<[string, RegExp]> = [
    ['This model maximum context length is 8192 tokens', /longer than the model can hold|new chat/i],
    ['This model does not support image input', /can't see images|vision/i],
    ['extra_forbidden: reasoning_content', /ours to fix|try again/i],
  ];

  for (const [upstream, expected] of cases) {
    it(`explains: ${upstream.slice(0, 40)}…`, () => {
      expect(err(wrapped({ message: upstream })).humanMessage).toMatch(expected);
    });
  }

  it('tells the user what to DO, not just what broke', () => {
    const m = err(wrapped({ message: 'This model maximum context length is 8192 tokens' })).humanMessage;
    expect(m).toMatch(/start a new chat|compress/i);
  });
});
