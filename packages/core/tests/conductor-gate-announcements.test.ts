// The persona-team gate reads keywords; a keyword is not a request. The
// operator's "stop take a breath and we are going to plan this again ok"
// spawned five personas (19 Sep 2026).
import { describe, it, expect } from 'vitest';
import { Conductor } from '../src/personas/conductor.js';

function gate(): (m: string, mode: string) => boolean {
  const c = Object.create(Conductor.prototype) as Conductor;
  return (m, mode) => c.needsOrchestration(m, mode);
}

describe('persona-team gate: announcements and stops are not requests', () => {
  const needs = gate();
  it('a message with STOP in it never orchestrates', () => {
    expect(needs('ive just made a few changes right so stop take a breath and we are going to plan this again ok', 'work')).toBe(false);
    expect(needs('wait — plan this out later', 'work')).toBe(false);
    expect(needs('hold on, full plan later', 'plan')).toBe(false);
  });
  it('announcing a plan is not asking for one', () => {
    expect(needs("we're going to plan this again tomorrow", 'work')).toBe(false);
    expect(needs('after that we will plan the combat', 'work')).toBe(false);
    expect(needs("then we'll plan this out properly", 'plan')).toBe(false);
    expect(needs('next, plan this out', 'plan')).toBe(true);   // a direct ask, comma or not
  });
  it('a direct ask still gets the team', () => {
    expect(needs('plan this out for me', 'work')).toBe(true);
    expect(needs("let's plan the new MMORPG direction", 'work')).toBe(true);
    expect(needs('create a plan for the combat rework', 'work')).toBe(true);
    expect(needs('full plan please', 'plan')).toBe(true);
  });
});
