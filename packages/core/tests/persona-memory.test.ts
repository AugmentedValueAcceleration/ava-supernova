// Every persona can read and record memory.
//
// Operator's rule, 2026-08-20: "each persona should be able to record and read
// memories too."
//
// Twenty-two of twenty-seven already could. The five that could not —
// code-reviewer, design-reviewer, tester, scanner and the CVE researcher —
// were an omission rather than a policy: nothing anywhere argues that a
// reviewer should forget.
//
// It matters most for the reviewers. `code-reviewer` joined the work team the
// same day, and a reviewer with no memory re-learns the project's conventions
// on every turn, then raises the same settled choices as problems again. That
// is the fastest way to teach someone to stop reading review comments.
//
// A persona is one hat on one intelligence. A hat that cannot remember what
// the others learned is a different person wearing the same face.

import { describe, it, expect } from 'vitest';
import * as personas from '../src/personas/definitions.js';

interface Persona { id: string; allowedTools?: string[] }

/** Every distinct persona, however it is exported (singly or in a team array). */
function allPersonas(): Persona[] {
  const seen = new Map<string, Persona>();
  for (const value of Object.values(personas as Record<string, unknown>)) {
    const items = Array.isArray(value) ? value : [value];
    for (const p of items as Persona[]) {
      if (p?.id && Array.isArray(p.allowedTools) && !seen.has(p.id)) seen.set(p.id, p);
    }
  }
  return [...seen.values()];
}

describe('every persona shares the same memory', () => {
  it('finds the personas, so a silent pass means something', () => {
    expect(allPersonas().length).toBeGreaterThanOrEqual(25);
  });

  it('can RECALL what was learned before', () => {
    const blind = allPersonas().filter((p) => !p.allowedTools!.includes('memory_recall')).map((p) => p.id);
    expect(
      blind,
      `These personas cannot read memory, so they start every turn knowing ` +
      `nothing about the user or the project: ${blind.join(', ')}`,
    ).toEqual([]);
  });

  it('can RECORD what it learns', () => {
    const mute = allPersonas().filter((p) => !p.allowedTools!.includes('memory_save')).map((p) => p.id);
    expect(
      mute,
      `These personas cannot write memory, so whatever they work out dies with ` +
      `the turn: ${mute.join(', ')}`,
    ).toEqual([]);
  });

  it('the reviewers specifically, because they are the ones it hurts most', () => {
    // Named so a future refactor that drops memory from a reviewer fails here
    // with the reason attached rather than as an anonymous list entry.
    for (const id of ['code-reviewer', 'design-reviewer', 'tester']) {
      const p = allPersonas().find((x) => x.id === id);
      expect(p, `${id} is missing entirely`).toBeDefined();
      expect(p!.allowedTools, `${id} cannot recall`).toContain('memory_recall');
      expect(p!.allowedTools, `${id} cannot record`).toContain('memory_save');
    }
  });
});
