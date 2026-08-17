// Anything added to ChatCompletionRequest must actually reach the provider.
//
// transformRequest forwards an EXPLICIT LIST of fields. A field that exists on
// the type but is missing from that list is dropped in silence: no error, no
// warning, no failed test — the caller sets it, the provider never sees it,
// and the behaviour is simply the default. That failure is invisible from
// every direction except measuring the provider's response.
//
// It has bitten repeatedly. enable_thinking was set by the intent gate and
// dropped, so the gate was paying for a reasoning pass it had explicitly
// turned off — 1,294 output tokens instead of 9, on every prompt. Then
// chat_template_kwargs, without which Nemotron 3.5 Lightning answers a plain
// question with 300 tokens of its own scratchpad. Same shape both times, found
// both times by accident.
//
// So this test derives the field list from the TYPE rather than restating it.
// A hardcoded list would be one more thing to forget, and would not know about
// the field somebody just added — which is the entire failure mode.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', 'src', 'providers');
const types = readFileSync(join(SRC, 'types.ts'), 'utf8');
const baseProvider = readFileSync(join(SRC, 'base-provider.ts'), 'utf8');

/** Field names declared on ChatCompletionRequest. */
function requestFields(): string[] {
  const start = types.indexOf('interface ChatCompletionRequest');
  expect(start, 'ChatCompletionRequest not found — did it move or get renamed?').toBeGreaterThan(-1);
  // Walk to the closing brace of the interface, tracking depth so nested
  // object types ({ include_usage: boolean }) do not end it early.
  let depth = 0, i = types.indexOf('{', start), end = -1;
  for (; i < types.length; i++) {
    if (types[i] === '{') depth++;
    else if (types[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = types.slice(start, end);
  // Top-level members only: two-space indent, then name, then ? or :.
  return [...body.matchAll(/^ {2}([a-zA-Z_][a-zA-Z0-9_]*)\??:/gm)].map((m) => m[1]);
}

/** The object literal transformRequest hands to the shaper. */
function forwardedFields(): string[] {
  const start = baseProvider.indexOf('shapeOpenAICompatBody({');
  expect(start, 'transformRequest no longer calls shapeOpenAICompatBody — this test needs updating').toBeGreaterThan(-1);
  const end = baseProvider.indexOf('});', start);
  const block = baseProvider.slice(start, end);
  return [...block.matchAll(/^ {6}([a-zA-Z_][a-zA-Z0-9_]*):/gm)].map((m) => m[1]);
}

// Fields that deliberately do NOT travel in the request body. Each needs a
// reason, and adding to this list should feel like a decision.
const NOT_A_BODY_FIELD: Record<string, string> = {
  // Sent as the X-Ava-Turn-Id header. An unknown body key risks rejection on
  // strict providers, and this is metadata about the call, not part of it.
  turnId: 'header — asserted separately below',
};

describe('ChatCompletionRequest reaches the provider', () => {
  it('parses both sides (guards the parsing itself)', () => {
    // If either regex silently matches nothing, every assertion below passes
    // vacuously — which would look like agreement rather than a broken test.
    expect(requestFields().length).toBeGreaterThan(8);
    expect(forwardedFields().length).toBeGreaterThan(8);
  });

  it('forwards every field, or names it as deliberately not a body field', () => {
    const forwarded = new Set(forwardedFields());
    const dropped = requestFields().filter((f) => !forwarded.has(f) && !(f in NOT_A_BODY_FIELD));

    // The message matters more than the assertion here: whoever trips this is
    // about to lose an afternoon to a parameter that "does nothing".
    expect(
      dropped,
      `These exist on ChatCompletionRequest but are NOT forwarded by transformRequest, so a caller `
      + `setting them gets silence: ${dropped.join(', ')}. Either add them to the object passed to `
      + `shapeOpenAICompatBody, or add them to NOT_A_BODY_FIELD with the reason they travel some other way.`,
    ).toEqual([]);
  });

  it('sends the turn id as a header, since it is exempt from the body', () => {
    // The exemption above is only honest if the field genuinely goes somewhere.
    // Without this, "it's a header" becomes a way to silence the test.
    expect(baseProvider).toContain('X-Ava-Turn-Id');
    expect(baseProvider).toMatch(/request\.turnId/);
  });

  it('every exempt field still exists on the type', () => {
    // Stops the exemption list rotting into a record of fields that were
    // renamed or removed years ago.
    const fields = new Set(requestFields());
    const stale = Object.keys(NOT_A_BODY_FIELD).filter((f) => !fields.has(f));
    expect(stale, `NOT_A_BODY_FIELD names fields that no longer exist: ${stale.join(', ')}`).toEqual([]);
  });
});
