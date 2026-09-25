// The honesty gate learns to check identifiers, not just phrasing.
//
// 26 Sep 2026. Asked to write "JavaScript from Scratch" (seed 2853fe4f), the
// turn produced a GIMP course nobody had asked for, reported clearing a seed
// `046a9662` that does not exist in the library, and listed nine further
// courses — Pandas, Threat Hunting, Mental Health First Aid, Financial
// Planning — as "lost in a store wipe". None of those had ever been in the
// library. The JavaScript seed was still sitting unconsumed.
//
// Every phrase-level check passed, because nothing about the SENTENCES was
// wrong. Only the identifiers in them were. An id is either something a tool
// returned, something the caller supplied, or something invented — there is
// no fourth case, which makes this the one check here that is exact.

import { describe, it, expect } from 'vitest';
import { auditClaims, findUnbackedIds } from '../src/agent/claims-auditor.js';

const ran = (...names: string[]) => names.map((name) => ({ name, ok: true }));

describe('an identifier nothing produced', () => {
  it('is flagged, and named', () => {
    const r = auditClaims({
      text: 'Draft 6940f5c9 rebuilt, and seed 046a9662 cleared.',
      toolsUsed: ran('write_course'),
      toolOutput: '{"ok":true,"id":"6940f5c9-1af1-4e2e-8221-144170391465"}',
      userText: 'Write the course "JavaScript from Scratch" (seed id 2853fe4f-1bd6-4245-ad31-c9968375e6bf)',
    });
    expect(r.flagged).toBe(true);
    // The real one came back from the tool; the invented one did not.
    expect(r.claims).toContain('046a9662');
    expect(r.claims).not.toContain('6940f5c9');
    expect(r.caveat).toContain('046a9662');
    expect(r.caveat).toContain('no tool result');
  });

  it('an id the CALLER supplied is not an invention', () => {
    const r = auditClaims({
      text: 'Seed 2853fe4f-1bd6-4245-ad31-c9968375e6bf is still unconsumed.',
      toolsUsed: ran('write_course'),
      toolOutput: '',
      userText: 'Write the course "JavaScript from Scratch" (seed id 2853fe4f-1bd6-4245-ad31-c9968375e6bf)',
    });
    expect(r.flagged).toBe(false);
  });

  it('a shortened id is backed by the full one', () => {
    const backing = '{"id":"d48c8004-883e-46d2-b035-8cee4254b741"}';
    expect(findUnbackedIds('Landed as d48c8004.', backing)).toEqual([]);
  });

  it('hedging does not excuse it — an invented id is invented either way', () => {
    const r = auditClaims({
      text: 'I think course 9d12e835 might still be there, though I have not verified it.',
      toolsUsed: ran('web_search'),
      toolOutput: 'no results',
      userText: '',
    });
    expect(r.flagged).toBe(true);
    expect(r.claims).toContain('9d12e835');
  });

  it('nor does some unrelated tool having succeeded', () => {
    const r = auditClaims({
      text: 'Rebuilt at 65642d76.',
      toolsUsed: ran('bash', 'web_search'),
      toolOutput: 'total 12\ndrwxr-xr-x',
      userText: '',
    });
    expect(r.flagged).toBe(true);
  });

  it('prose with no identifiers is left to the ordinary checks', () => {
    const r = auditClaims({
      text: 'I rewrote the lesson and it reads better now.',
      toolsUsed: ran('read_course'),
      toolOutput: '{"id":"abc"}',
      userText: '',
    });
    expect(r.flagged).toBe(false);
  });

  it('an ordinary hex-looking word is not mistaken for an id', () => {
    // Short runs and plain words must not trip it, or the gate becomes noise.
    expect(findUnbackedIds('The deadbeef case, 3 modules, 2026 lessons.', '')).toEqual(['deadbeef']);
    expect(findUnbackedIds('3 modules and 12 lessons at 45 minutes.', '')).toEqual([]);
  });
});

describe('reading the library counts as verifying a claim about it', () => {
  it('a course claim backed by a course read is not flagged', () => {
    const r = auditClaims({
      text: 'Done — the course is ready for you to publish.',
      toolsUsed: ran('check_course'),
      toolOutput: '{"status":"pass"}',
      userText: '',
    });
    expect(r.flagged).toBe(false);
  });

  it('the same claim with only a web search behind it IS flagged', () => {
    const r = auditClaims({
      text: 'Done — the course is ready for you to publish.',
      toolsUsed: ran('web_search'),
      toolOutput: 'some article',
      userText: '',
    });
    expect(r.flagged).toBe(true);
    expect(r.tier).toBe('high');
  });
});
