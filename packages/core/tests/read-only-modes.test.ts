// A read-only mode cannot write. Not "does not" — cannot.
//
// The operator's question on 2026-08-19, after the Builder hand-off was gated:
// "can plan mode simply only plan never code?" Answering it meant auditing
// every path that could reach a file, not just the one that had already
// failed. There were three, and only two were closed.
//
//   1. The tool schemas offered to the planner — MODE_ALLOWED_TOOLS.plan has
//      no write, edit, bash, git or apply_plan. Closed.
//   2. The Builder hand-off — gated on modeCanEditFiles. Closed that day.
//   3. The PERSONA team — the conductor scoped each persona by its own
//      allowedTools taken from the FULL registry, and never consulted the
//      mode at all.
//
// Plan's team happened to be read-only, so the guarantee held by luck of the
// roster rather than by structure: one write-capable persona added to the plan
// team and Plan mode could code again, silently, with every existing test
// still green. That is what these tests are for.

import { describe, it, expect } from 'vitest';
import { modeCanEditFiles, readOnlyModeToolCeiling } from '../src/agent/agent.js';
import { MODE_PERSONAS, MODE_PERSONAS_LIGHT } from '../src/personas/definitions.js';

/** Tools that can put bytes on disk. `bash` counts — `echo x > file` is a write. */
const CAN_WRITE = ['write', 'edit', 'multi_edit', 'apply_plan', 'bash', 'git_commit', 'desktop_action'];

const READ_ONLY_MODES = ['plan', 'chat', 'brainstorm', 'security'];

describe('the read-only modes are read-only', () => {
  it('names them, so a silent pass means something', () => {
    for (const mode of READ_ONLY_MODES) {
      expect(modeCanEditFiles(mode), `${mode} should be read-only`).toBe(false);
    }
  });

  it('gives each a tool ceiling', () => {
    for (const mode of READ_ONLY_MODES) {
      expect(readOnlyModeToolCeiling(mode), `${mode} has no ceiling`).not.toBeNull();
    }
  });

  it('gives the editing modes NO ceiling, on purpose', () => {
    // Work's allowlist is stale and has never applied — it has no prefix, so
    // the filter never runs. Clamping the Builder to it here would enforce a
    // list nobody has checked and land as a breakage dressed as a tightening.
    for (const mode of ['work', 'write', 'teach']) {
      expect(readOnlyModeToolCeiling(mode), `${mode} should not be clamped`).toBeNull();
    }
  });
});

describe('Plan mode cannot reach a file, by any route', () => {
  it('is offered no tool that writes', () => {
    const ceiling = readOnlyModeToolCeiling('plan')!;
    for (const tool of CAN_WRITE) {
      expect(ceiling.has(tool), `plan mode is offered ${tool}`).toBe(false);
    }
  });

  it('can still read, research and propose', () => {
    // The other half of the guarantee. A mode that cannot read is not
    // read-only, it is useless — and that is exactly what the dead
    // `file_read` name did to this mode once already.
    const ceiling = readOnlyModeToolCeiling('plan')!;
    for (const tool of ['read', 'glob', 'grep', 'web_search', 'present_plan', 'ask_user']) {
      expect(ceiling.has(tool), `plan mode cannot ${tool}`).toBe(true);
    }
  });

  it('cannot dispatch the Builder', () => {
    expect(modeCanEditFiles('plan')).toBe(false);
  });
});

describe('no persona can exceed its mode', () => {
  const teams = () => [
    ...Object.entries(MODE_PERSONAS).map(([m, t]) => [m, t, 'full'] as const),
    ...Object.entries(MODE_PERSONAS_LIGHT).map(([m, t]) => [m, t, 'light'] as const),
  ];

  it('finds the teams, so a silent pass means something', () => {
    expect(teams().length).toBeGreaterThanOrEqual(8);
  });

  // The guard that matters. Not "today's rosters are clean" — that was already
  // true and was not protection. This asserts the CEILING removes anything a
  // future roster adds, which is the thing that actually holds.
  for (const [mode, team, depth] of [
    ...Object.entries(MODE_PERSONAS).map(([m, t]) => [m, t, 'full'] as const),
    ...Object.entries(MODE_PERSONAS_LIGHT).map(([m, t]) => [m, t, 'light'] as const),
  ]) {
    if (modeCanEditFiles(mode)) continue;
    it(`${mode} (${depth}) hands no persona a tool the mode lacks`, () => {
      const ceiling = readOnlyModeToolCeiling(mode)!;
      // The rule is "no MORE than the mode", not "no write tools anywhere".
      // Security's allowlist declares `bash` on purpose — its auditors run
      // scanners — so forbidding it here would disarm the mode rather than
      // contain it. What must never happen is a persona reaching a writer the
      // MODE does not itself declare.
      const forbidden = CAN_WRITE.filter((t) => !ceiling.has(t));
      const escapes: string[] = [];
      for (const persona of team) {
        // What the conductor actually offers: persona list ∩ mode ceiling.
        const offered = (persona.allowedTools ?? []).filter((t) => ceiling.has(t));
        for (const tool of offered) {
          if (forbidden.includes(tool)) escapes.push(`${persona.id}: ${tool}`);
        }
      }
      expect(escapes, `${mode} mode would let these write:\n  ${escapes.join('\n  ')}`).toEqual([]);
    });

    it(`${mode} (${depth}) strips a writer a persona asks for but the mode lacks`, () => {
      // The filter must BITE, not merely agree with today's rosters. Every
      // persona on the team is re-run with the write tools bolted onto its
      // list; none may survive the ceiling unless the mode declares it.
      const ceiling = readOnlyModeToolCeiling(mode)!;
      for (const persona of team) {
        const greedy = [...(persona.allowedTools ?? []), ...CAN_WRITE];
        const survived = greedy.filter((t) => ceiling.has(t) && CAN_WRITE.includes(t));
        expect(
          survived.filter((t) => !ceiling.has(t)),
          `${persona.id} kept a tool ${mode} does not declare`,
        ).toEqual([]);
        for (const tool of survived) {
          expect(ceiling.has(tool), `${mode} let ${persona.id} keep ${tool}`).toBe(true);
        }
      }
    });
  }

  it('the ceiling actually removes a write tool a roster asks for', () => {
    // Proves the filter bites rather than merely agreeing with today's data.
    // A hypothetical persona asking for bash and write in Plan mode gets
    // neither, whatever its own list says.
    const ceiling = readOnlyModeToolCeiling('plan')!;
    const greedy = ['read', 'write', 'edit', 'bash', 'grep'];
    expect(greedy.filter((t) => ceiling.has(t))).toEqual(['read', 'grep']);
  });
});

describe('a read-only mode can still produce the thing it exists to produce', () => {
  // Read-only must not mean toothless. Each of these modes ends in an artefact,
  // and withholding the tool that makes it turns the mode into prose.
  //
  // Security was exactly that until 2026-08-20: it could find vulnerabilities
  // and describe them, and had no present_plan, so an audit ended in a list and
  // nothing carried forward — no plan, no task list, and no record of a risk
  // consciously accepted. The next audit then re-raised what you had already
  // decided to live with, which is how people learn to stop running audits.
  it('security can turn findings into a plan and a task list', () => {
    const ceiling = readOnlyModeToolCeiling('security')!;
    expect(ceiling.has('present_plan'), 'security cannot propose a response').toBe(true);
    expect(ceiling.has('todo_write'), 'security cannot produce a task list').toBe(true);
  });

  it('plan can present a plan', () => {
    expect(readOnlyModeToolCeiling('plan')!.has('present_plan')).toBe(true);
  });

  it('brainstorm can present a plan and keep its session', () => {
    const ceiling = readOnlyModeToolCeiling('brainstorm')!;
    expect(ceiling.has('present_plan'), 'brainstorm cannot propose the project').toBe(true);
    expect(ceiling.has('brainstorm_session'), 'brainstorm cannot keep the session').toBe(true);
  });

  it('and none of them gained a writer on the way', () => {
    // The whole point of widening these modes is that it must not widen THIS.
    for (const mode of ['plan', 'security', 'brainstorm']) {
      const ceiling = readOnlyModeToolCeiling(mode)!;
      const forbidden = CAN_WRITE.filter((t) => !ceiling.has(t));
      // `bash` is declared by security on purpose; everything else must be out.
      const writers = CAN_WRITE.filter((t) => ceiling.has(t) && forbidden.indexOf(t) === -1);
      const unexpected = writers.filter((t) => !(mode === 'security' && t === 'bash'));
      expect(unexpected, `${mode} reached a writer: ${unexpected.join(', ')}`).toEqual([]);
    }
  });
});

describe('Security mode keeps the tools it declares', () => {
  it('still has bash, because its allowlist says so', () => {
    // Security audits run scanners. Its allowlist declares bash deliberately,
    // so the ceiling must not quietly disarm the auditor — the rule is "no
    // MORE than the mode", not "no write tools anywhere".
    expect(readOnlyModeToolCeiling('security')!.has('bash')).toBe(true);
    expect(readOnlyModeToolCeiling('security')!.has('write')).toBe(false);
  });
});
