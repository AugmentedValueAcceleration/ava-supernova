// Every X-Ava-* header a client sends must be allowed by the server.
//
// These are two hand-written lists in two different repositories that must
// agree, and nothing connected them. On 2026-08-18 X-Ava-Timezone was added to
// apiFetch on both the extension and the IDE without being added to the CORS
// allow-list in web's middleware. The browser then failed the preflight and
// the real request never left — which surfaces as a dead panel, not as
// anything resembling a CORS error.
//
// The direction matters and is asymmetric: the server may allow a header
// nobody sends yet (harmless), but a client must never send one the server
// does not allow. So this asserts one-way containment, and it is also the
// deploy order — widen the server, deploy, THEN ship the client.
//
// Paths are read off disk rather than imported: web and ide are submodules, so
// a checkout without them should skip rather than fail. A file that IS present
// and disagrees is a hard failure.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');

const MIDDLEWARE = join(repoRoot, 'packages', 'web', 'src', 'middleware.ts');
const CLIENTS = [
  join(repoRoot, 'packages', 'extension', 'src', 'utils', 'platform-api.ts'),
  join(repoRoot, 'packages', 'ide', 'src', 'lib', 'api.ts'),
];

/** The X-Ava-* names in Access-Control-Allow-Headers, lowercased. */
function allowedHeaders(): Set<string> {
  const src = readFileSync(MIDDLEWARE, 'utf8');
  const line = src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))       // ignore the explanatory comment
    .find((l) => l.includes('Access-Control-Allow-Headers'));
  if (!line) throw new Error('Access-Control-Allow-Headers not found in middleware.ts');
  const value = line.slice(line.indexOf(':') + 1);
  return new Set(
    (value.match(/X-Ava-[A-Za-z-]+/g) ?? []).map((h) => h.toLowerCase()),
  );
}

/** The X-Ava-* headers a client file actually sets, lowercased. */
function sentHeaders(file: string): Set<string> {
  const src = readFileSync(file, 'utf8');
  const names = src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .flatMap((l) => l.match(/['"](X-Ava-[A-Za-z-]+)['"]\s*:/g) ?? [])
    .map((m) => m.replace(/['":\s]/g, '').toLowerCase());
  return new Set(names);
}

describe('CORS allow-list covers every header the clients send', () => {
  it('finds the middleware allow-list', () => {
    if (!existsSync(MIDDLEWARE)) return; // submodule not checked out
    expect(allowedHeaders().size).toBeGreaterThan(0);
  });

  for (const file of CLIENTS) {
    const label = file.split(/[\/]/).slice(-4).join('/');

    it(`${label} sends nothing the server would reject`, () => {
      if (!existsSync(MIDDLEWARE) || !existsSync(file)) return; // submodule absent
      const allowed = allowedHeaders();
      const sent = sentHeaders(file);
      expect(sent.size).toBeGreaterThan(0); // the parse itself must still work
      const missing = [...sent].filter((h) => !allowed.has(h));
      expect(
        missing,
        `${label} sends ${missing.join(', ')} but middleware.ts does not allow it. ` +
        'Add it to Access-Control-Allow-Headers and DEPLOY WEB FIRST — until then ' +
        'the browser fails the preflight and every call from this client dies silently.',
      ).toEqual([]);
    });
  }

  it('specifically covers X-Ava-Timezone, the one that caused this', () => {
    if (!existsSync(MIDDLEWARE)) return;
    expect(allowedHeaders().has('x-ava-timezone')).toBe(true);
  });
});
