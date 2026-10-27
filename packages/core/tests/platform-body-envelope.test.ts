// A coding agent's history is full of shell commands, and the edge firewall in
// front of the platform refuses bodies containing text like `| python -c`.
// One ordinary command locked a conversation on 27 Oct 2026: every later turn
// was refused in a tenth of a second, as a bare 403 that blamed the API key.
// These pin the two halves of the fix: the platform packs its bodies, and a
// firewall's HTML 403 says what actually happened.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { PlatformProvider } from '../src/providers/platform/index.js';
import { ProviderError } from '../src/core/errors.js';

afterEach(() => vi.unstubAllGlobals());

function captureBody(): { sent: () => string } {
  let body = '';
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    body = String(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }));
  return { sent: () => body };
}

describe('platform request body', () => {
  it('goes on the wire packed, with no shell command readable in it', async () => {
    const cap = captureBody();
    const provider = new PlatformProvider({ apiKey: 'sk-ava-test' });
    const command = 'ls x || python -c "print(1)" | python -c "import os"';
    await provider.createCompletion({
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: command }],
    } as never);

    const wire = cap.sent();
    expect(wire).not.toContain('python -c');
    const env = JSON.parse(wire) as { encoding: string; payload: string };
    expect(env.encoding).toBe('gzip+base64');

    const inner = JSON.parse(gunzipSync(Buffer.from(env.payload, 'base64')).toString('utf8'));
    expect(JSON.stringify(inner.messages)).toContain(command.replace(/"/g, '\\"'));
  });
});

describe('a 403 from a firewall', () => {
  it('says a firewall refused it, not that the key is wrong', () => {
    const html = '<!DOCTYPE html>\n<html lang="en"><head><title>Attention Required</title></head></html>';
    const m = new ProviderError('raw', 'platform', 403, html).humanMessage;
    expect(m).toMatch(/firewall/i);
    expect(m).not.toMatch(/API key may not have/);
  });

  it('a JSON 403 still reads as a permissions problem', () => {
    const m = new ProviderError('raw', 'platform', 403, { error: { message: 'Workspace access denied.' } }).humanMessage;
    expect(m).toMatch(/permissions/);
  });
});
