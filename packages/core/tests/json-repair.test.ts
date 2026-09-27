// An escape lost to double parsing is recoverable, and always was.
//
// 27 Sep 2026: five calls in one run died with "malformed at character N,
// and the rest of it is still there". The break contexts read as ordinary
// prose — "…n# then open the live URL", "…What do you do first?" — because
// every one was a control character sitting where an escape used to be.
//
// A tool call's arguments are JSON. When one of its values is ITSELF JSON,
// that inner document is parsed twice, and the outer parse turns an escaped
// \n into a real newline. A real newline inside a JSON string literal is
// invalid, so the inner parse dies exactly there with thousands of valid
// characters still after it. Nothing was wrong with the writing.

import { describe, it, expect } from 'vitest';
import { escapeRawControlChars, parseJsonForgivingly } from '../src/utils/json-repair.js';

describe('a control character where an escape used to be', () => {
  it('recovers the real failure shape, prose and all', () => {
    // Her break context verbatim in spirit: a newline before a shell comment.
    const authored = JSON.stringify([{
      title: 'Deploy it and keep it deployed',
      lessons: [{ title: 'Push and watch', steps: [{ teach: 'Run this:\n# deploy\ngit push\n\nthen open the live URL and check your change is there.' }] }],
    }]);
    const mangled = authored.replace(/\\n/g, '\n');

    expect(() => JSON.parse(mangled)).toThrow(/control character/i);

    const r = parseJsonForgivingly<Array<{ lessons: Array<{ steps: Array<{ teach: string }> }> }>>(mangled);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.repaired).toBe(true);
    // The text comes back intact, newlines and all — not flattened.
    expect(r.value[0].lessons[0].steps[0].teach).toContain('\n# deploy\n');
    expect(r.value[0].lessons[0].steps[0].teach).toContain('check your change is there.');
  });

  it('leaves valid JSON exactly alone and says it did not repair', () => {
    const good = JSON.stringify({ teach: 'line one\nline two', n: 3, deep: [{ a: null }] });
    const r = parseJsonForgivingly<Record<string, unknown>>(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.repaired).toBe(false);
    expect(r.value).toEqual({ teach: 'line one\nline two', n: 3, deep: [{ a: null }] });
  });

  it('does not touch what is OUTSIDE a string literal', () => {
    // Structural newlines are legal and must survive untouched.
    const pretty = '{\n  "a": 1,\n  "b": [\n    2\n  ]\n}';
    expect(escapeRawControlChars(pretty)).toBe(pretty);
  });

  it('is not fooled by a quote that is escaped inside a string', () => {
    const tricky = '{"teach":"she said \\"run it\\" then\nthe build failed"}';
    const r = parseJsonForgivingly<{ teach: string }>(tricky);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.teach).toBe('she said "run it" then\nthe build failed');
  });

  it('a genuinely broken document still fails, with the ORIGINAL position', () => {
    // An unescaped quote ends the string early; no repair can know the intent.
    const broken = '[{"title":"M","lessons":"he said "no" to that"}]';
    const r = parseJsonForgivingly(broken);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.position).not.toBeNull();
  });

  it('a truncated document still fails rather than being half-recovered', () => {
    const cut = '[{"title":"M","lessons":[{"title":"L","steps":[{"teach":"Run';
    expect(parseJsonForgivingly(cut).ok).toBe(false);
  });

  it('tabs and carriage returns are repaired the same way', () => {
    const r = parseJsonForgivingly<{ a: string }>('{"a":"col\tone\r\nnext"}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.a).toBe('col\tone\r\nnext');
  });
});
