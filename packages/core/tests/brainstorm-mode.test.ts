// Brainstorm mode, Phase 1 of plan 2026-11-17-brainstorm: what the mode is told
// must match what it can do, and its team must follow its own rules.
//
// Seven things had drifted apart, each one quietly:
//  - the prompt said "do NOT create it inside ~/.ava" while projects live in
//    ~/.ava/projects (and the prompt's own default was ~/.ava/projects);
//  - it promised to scaffold Decisions/overview.md and a first record in a
//    mode that can only make an empty folder;
//  - its tool list left out create_project, the tool that makes that folder;
//  - create_project itself said "~/Ava Projects by default";
//  - the Researcher hunted market gaps BEFORE any idea existed — the mode says
//    "research after, never before";
//  - the Challenger asked "is this fundable?" — the mode says that question
//    discourages someone who just wants to build;
//  - the Refiner saved ideas into memory — the mode says memory is for the
//    person, ideas go in the brainstorm session.

import { describe, it, expect } from 'vitest';
import { getBrainstormModePrefix } from '../src/agent/system-prompt.js';
import { MODE_ALLOWED_TOOLS } from '../src/agent/agent.js';
import {
  BRAINSTORM_PERSONAS, BRAINSTORM_PERSONAS_LIGHT, BRAINSTORM_RESEARCHER, IDEATOR, BRAINSTORM_CHALLENGER, REFINER,
} from '../src/personas/definitions.js';
import { CreateProjectTool } from '../src/tools/create-project.js';

const prefix = getBrainstormModePrefix('x');
const advertised = new Set(
  (/## Tools available\s*\n([^\n]+)/.exec(prefix)?.[1] ?? '').split(',').map((s) => s.trim().replace(/\.$/, '')),
);

describe('what Brainstorm is told matches what it can do', () => {
  it('names every tool it is offered (a tool she is never told about is one she never uses)', () => {
    const missing = [...MODE_ALLOWED_TOOLS.brainstorm].filter((t) => !advertised.has(t));
    expect(missing).toEqual([]);
  });

  it('puts new projects where projects live, and never says otherwise', () => {
    expect(prefix).toContain('~/.ava/projects');
    expect(prefix).not.toMatch(/do not create it inside/i);
    expect(new CreateProjectTool().schema.description).toContain('~/.ava/projects by default');
    expect(new CreateProjectTool().schema.description).not.toContain('Ava Projects');
  });

  it('promises only an empty folder, because that is all it can make', () => {
    expect(prefix).toMatch(/That is ALL it makes — an empty folder/);
    expect(prefix).not.toMatch(/offer to scaffold/i);
    expect(MODE_ALLOWED_TOOLS.brainstorm.has('write')).toBe(false);
    expect(MODE_ALLOWED_TOOLS.brainstorm.has('edit')).toBe(false);
  });
});

describe("Brainstorm's team follows the mode's rules", () => {
  it('has ideas first and research after', () => {
    expect(IDEATOR.dependsOn).toEqual(['explorer']);
    expect(BRAINSTORM_RESEARCHER.dependsOn).toEqual(['ideator']);
    expect(BRAINSTORM_CHALLENGER.dependsOn).toContain('brainstorm_researcher');
    const order = BRAINSTORM_PERSONAS.map((p) => p.id);
    expect(order.indexOf('ideator')).toBeLessThan(order.indexOf('brainstorm_researcher'));
    // The light team has no Researcher; its dependency is simply ignored there.
    expect(BRAINSTORM_PERSONAS_LIGHT.map((p) => p.id)).toEqual(['explorer', 'ideator', 'brainstorm_challenger']);
  });

  it('never opens with markets: the Researcher sharpens ideas that exist, business questions only for a business', () => {
    expect(BRAINSTORM_RESEARCHER.prompt).not.toMatch(/Demand signals|Timing windows|Competitive landscape/);
    expect(BRAINSTORM_RESEARCHER.prompt).toMatch(/Only if they are launching a business/);
    expect(IDEATOR.prompt).not.toMatch(/market findings/);
  });

  it('challenges on whether it gets built, not whether it is fundable', () => {
    expect(BRAINSTORM_CHALLENGER.prompt).toMatch(/Can they start this today/);
    expect(BRAINSTORM_CHALLENGER.prompt).toMatch(/still care about it on Thursday/);
    expect(BRAINSTORM_CHALLENGER.prompt).not.toMatch(/fundable/);
  });

  it('keeps ideas in the brainstorm session, not in memory', () => {
    expect(REFINER.allowedTools).toContain('brainstorm_session');
    expect(REFINER.prompt).toMatch(/brainstorm_session action="save"/);
    expect(REFINER.prompt).toMatch(/Memory is NOT for ideas/);
  });
});
