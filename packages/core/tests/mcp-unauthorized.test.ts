import { describe, it, expect } from 'vitest';
import { isUnauthorized } from '../src/mcp/connection.js';

// The message check held BACKSPACE characters where the regex word boundary
// \b was meant, so a server's "401" error was never recognised by its message,
// only by the word "unauthorized" (found by lint, 26 Nov 2026).
describe('isUnauthorized', () => {
  it('recognises a 401 in the message', () => {
    expect(isUnauthorized(new Error('HTTP 401 from server'))).toBe(true);
    expect(isUnauthorized(new Error('Streamable HTTP error: Error POSTing to endpoint (HTTP 401)'))).toBe(true);
  });

  it('recognises the word, the name and the code', () => {
    expect(isUnauthorized(new Error('Unauthorised'))).toBe(true);
    expect(isUnauthorized({ name: 'UnauthorizedError' })).toBe(true);
    expect(isUnauthorized({ code: 401 })).toBe(true);
  });

  it('does not mistake other numbers for a 401', () => {
    expect(isUnauthorized(new Error('listening on port 54012'))).toBe(false);
    expect(isUnauthorized(new Error('HTTP 4010'))).toBe(false);
    expect(isUnauthorized(new Error('HTTP 500'))).toBe(false);
    expect(isUnauthorized(null)).toBe(false);
  });
});
