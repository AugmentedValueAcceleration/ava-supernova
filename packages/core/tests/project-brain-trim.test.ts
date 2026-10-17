// The project brief must fail LOUDLY when it will not fit.
//
// It used to end with:
//
//   // Trim from the bottom (patterns and issues are least critical)
//   brief = brief.slice(0, MAX_BRIEF_CHARS).trimEnd() + '…';
//
// A byte-offset cut, under a comment describing a priority cut. Those are the
// same thing only while the least important text happens to sit last, and
// nothing enforced that. A long Decisions block took Patterns, Issues and the
// stats with it and then stopped mid-sentence, leaving a brief that reads as
// complete.
//
// That matters more here than almost anywhere else, because the symptom of a
// lost memory is ABSENCE — and absence is indistinguishable from never having
// known. The operator's own memory index did exactly this and quietly dropped
// its last line for days.

import { describe, it, expect } from 'vitest';
import { synthesiseProjectBrain } from '../src/memory/project-brain.js';

const MAX = 800;

// The brain groups by `category`, not `type`, caps each entry at 100 chars,
// and takes the top 3-5 per category. A fixture has to respect all three or
// the brief comes out tiny and proves nothing.
function node(id: string, category: string, content: string, tags: string[] = []) {
  const now = new Date().toISOString();
  return {
    id,
    category,
    type: category,
    content,
    confidence: 0.9,
    createdAt: now,
    updatedAt: now,
    tags,
    metadata: {} as Record<string, unknown>,
  };
}

/** Minimal graph the brain is happy with. */
function graphOf(nodes: ReturnType<typeof node>[]) {
  return {
    getActiveNodes: () => nodes,
    getEdgesFrom: () => [],
    getGraphHash: () => 'hash',
    getEffectiveConfidence: (n: { confidence: number }) => n.confidence,
    getStats: () => ({ activeNodes: nodes.length, avgConfidence: 0.9 }),
  } as never;
}

/** A graph fat enough to blow the 800-char cap: architecture for Stack,
 *  decisions, and session-tagged nodes for Recent. */
const LONG = (label: string, i: number) => `${label} ${i} ${'and then a further consideration '.repeat(6)}`;

const fatNodes = () => [
  ...Array.from({ length: 5 }, (_, i) =>
    node(`a${i}`, 'architecture', `TypeScript Rust Tauri Supabase pnpm Vite React ${LONG('arch', i)}`)),
  ...Array.from({ length: 5 }, (_, i) => node(`d${i}`, 'decision', LONG('decision', i))),
  ...Array.from({ length: 3 }, (_, i) =>
    node(`s${i}`, 'general', LONG('session', i), ['session-context'])),
  ...Array.from({ length: 3 }, (_, i) => node(`b${i}`, 'bug', LONG('bug', i))),
];

describe('the project brief trims by importance, and admits it', () => {
  it('leaves a brief that fits under the cap', () => {
    const b = synthesiseProjectBrain(graphOf(fatNodes()), 'C:/demo/my-project');
    expect(b.brief.length).toBeLessThanOrEqual(MAX);
  });

  it('SAYS something was trimmed rather than going quiet', () => {
    const b = synthesiseProjectBrain(graphOf(fatNodes()), 'C:/demo/my-project');
    expect(b.brief).toMatch(/trimmed to fit/);
  });

  it('never drops the line that says which project this is', () => {
    const b = synthesiseProjectBrain(graphOf(fatNodes()), 'C:/demo/my-project');
    expect(b.brief).toContain('[Project: my-project]');
  });

  it('sacrifices the diagnostics before the decisions', () => {
    const b = synthesiseProjectBrain(graphOf(fatNodes()), 'C:/demo/my-project');
    // "Nodes:" is the stats line — the first thing that should go.
    expect(b.brief.startsWith('[Project:')).toBe(true);
    expect(b.brief).not.toMatch(/\nNodes: /);
  });

  it('does not cut a section off mid-sentence', () => {
    const b = synthesiseProjectBrain(graphOf(fatNodes()), 'C:/demo/my-project');
    // Every line kept is a whole labelled section, not a fragment of one.
    const body = b.brief.replace(/ \(\d+ sections? trimmed to fit:[^)]*\)$/, '');
    for (const line of body.split('\n')) {
      expect(line).toMatch(/^(\[Project: |Stack: |Decisions: |Recent: |Patterns: |Open issues: |Nodes: )/);
    }
  });

  it('leaves a small brief completely alone', () => {
    const b = synthesiseProjectBrain(graphOf([node('d1', 'decision', 'use pnpm')]), 'C:/demo/my-project');
    expect(b.brief).not.toMatch(/trimmed to fit/);
    expect(b.brief).not.toMatch(/…$/);
  });

  // The cap holds whatever it is handed. Note the single-section overflow
  // branch in fitBrief is DEFENSIVE and currently unreachable through this
  // API: every section caps its own entries (decisions at 100 chars x 5,
  // issues at 60 x 3, stack at 8 names), so none can pass 800 alone. It stays
  // because that is a property of today's inputs, not of the function, and
  // the day someone raises one of those caps is not the day to discover the
  // brief can be cut mid-word again.
  it('never exceeds the cap, whatever it is given', () => {
    const shapes = [
      [],
      [node('d1', 'decision', 'use pnpm')],
      fatNodes(),
      [...fatNodes(), ...fatNodes(), ...fatNodes()],
      [node('a1', 'architecture', `TypeScript ${'x'.repeat(MAX * 3)}`)],
    ];
    for (const nodes of shapes) {
      const b = synthesiseProjectBrain(graphOf(nodes), 'C:/demo/my-project');
      expect(b.brief.length).toBeLessThanOrEqual(MAX);
      expect(b.brief).toContain('[Project: my-project]');
    }
  });
});
