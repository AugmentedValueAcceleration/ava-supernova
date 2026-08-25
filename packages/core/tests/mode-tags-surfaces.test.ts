// The surfaces must spell the mode tags the way the agent reads them.
//
// A mode announces itself by a literal bracket tag at the head of the user's
// message. Nine files used to carry a hand-written copy of that list, and
// every disagreement between them was silent — a short list does not fail,
// it just quietly does less:
//
//   the sidebar's strip list carried the legacy '[Security Mode]' and not the
//   live '[Security Audit Mode]', so a restored security conversation showed
//   the user the whole internal briefing where their own message belonged
//
//   dataset/capture.ts knew 5 tags where the agent knew 11, so six modes of
//   captured training data were labelled 'work'
//
// Core's own copies are now derived from agent/mode-tags.ts and cannot drift.
// The two surfaces that cannot import core — the sidebar UI bundle, which has
// no @ava/core dependency, and the IDE's sidecar — are held to it from here,
// by reading their source.
//
// Reading across packages in a test is not tidy. It is what runs, though: a
// standalone script that has to be remembered is not a guard. When the
// sibling package is absent (core installed on its own from npm) the check
// skips rather than failing on something it cannot see.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODE_TAGS, ALL_SCAFFOLD_TAGS, tagForMode, modeForTaggedText } from '../src/agent/mode-tags.js';

const SIDEBAR = join(__dirname, '../../extension/webview-ui/src/App.tsx');
const SIDECAR = join(__dirname, '../../ide/sidecar/index.mjs');

/** Bracket tags written as string literals in a source file. */
function literalTags(src: string): Set<string> {
  return new Set([...src.matchAll(/'(\[[A-Z][^'\]]*\])'/g)].map((m) => m[1]));
}

describe('the leaf itself', () => {
  it('every mode has exactly one emitted spelling', () => {
    const tags = MODE_TAGS.map((m) => m.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('no tag is a prefix of another', () => {
    // startsWith() decides the mode, so '[Security Mode]' shadowing
    // '[Security Audit Mode]' would silently mis-detect every audit turn.
    for (const a of ALL_SCAFFOLD_TAGS) {
      for (const b of ALL_SCAFFOLD_TAGS) {
        if (a === b) continue;
        expect(b.startsWith(a), `${a} shadows ${b}`).toBe(false);
      }
    }
  });

  it('code mode has a tag again', () => {
    // Its absence is the whole reason MODE_ALLOWED_TOOLS.work never ran.
    expect(tagForMode('work')).toBe('[Work Mode]');
    expect(modeForTaggedText('[Work Mode] fix the build')).toBe('work');
  });

  it('an untagged message is not a mode', () => {
    expect(modeForTaggedText('fix the build')).toBeNull();
  });

  it('legacy spellings still resolve', () => {
    expect(modeForTaggedText('[Security Mode] audit this')).toBe('security');
  });
});

describe('surfaces that keep their own copy', () => {
  it.runIf(existsSync(SIDEBAR))('the sidebar strips every tag the agent can see', () => {
    const src = readFileSync(SIDEBAR, 'utf8');
    const start = src.indexOf('const prefixes = [');
    expect(start, 'sidebar strip list not found — has it been renamed?').toBeGreaterThan(-1);
    const listed = literalTags(src.slice(start, src.indexOf('];', start)));
    const missing = ALL_SCAFFOLD_TAGS.filter((t) => !listed.has(t));
    expect(
      missing,
      `the sidebar would show these tags to the user instead of stripping them: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it.runIf(existsSync(SIDECAR))('the sidecar emits only real spellings', () => {
    const src = readFileSync(SIDECAR, 'utf8');
    const start = src.indexOf('const MODE_PREFIX_TAG = {');
    expect(start, 'sidecar tag map not found — has it been renamed?').toBeGreaterThan(-1);
    const emitted = literalTags(src.slice(start, src.indexOf('};', start)));
    const known = new Set(ALL_SCAFFOLD_TAGS);
    const unknown = [...emitted].filter((t) => !known.has(t));
    expect(
      unknown,
      `the sidecar emits tags the agent does not detect, so the mode is lost: ${unknown.join(', ')}`,
    ).toEqual([]);
  });
});
