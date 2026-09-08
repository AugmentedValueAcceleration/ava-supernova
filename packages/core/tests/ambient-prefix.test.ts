// Ambient capture must remember what the person said, not what she was told.
//
// Found 2026-09-08 in the operator's own graph: 24 nodes, each exactly 300
// characters, all of them the opening of the Work Mode prompt — written in a
// fifteen-minute window with no memory_save calls anywhere near them.
//
// Every surface prefixes the user's message with the mode prompt, so
// `userMessage` arrives as thousands of characters of instructions with the
// real question at the end. distilCandidate() slices the first 300 characters
// of the longer message, and after a prefix that is always boilerplate.
//
// The second half is worse: novelty is measured over the same text, so every
// stored copy made the next work-mode turn look less novel. It disabled itself
// against the one mode where the work happens.
//
// These drive the REAL prefix builders rather than a hand-written fake, so a
// change to the prompt shape breaks the test instead of the feature.

import { describe, it, expect } from 'vitest';
import { stripModePrefix } from '../src/memory/ambient-capture.js';
import {
  getWorkModePrefix,
  getPlanModePrefix,
  getSocialStudioPrefix,
} from '../src/agent/system-prompt.js';

const ASKED = 'add a double jump to the movement component';

describe('the mode prefix is removed before anything is remembered', () => {
  it('work mode — the shape that actually broke', () => {
    const prefixed = getWorkModePrefix(ASKED);
    expect(prefixed.length).toBeGreaterThan(1000);
    expect(stripModePrefix(prefixed)).toBe(ASKED);
  });

  it('and the first 300 characters are no longer the prompt', () => {
    // Precisely what was stored 24 times over.
    const stored = stripModePrefix(getWorkModePrefix(ASKED)).slice(0, 300);
    expect(stored).not.toContain('You are Ava the Builder');
    expect(stored).toBe(ASKED);
  });

  it('plan mode', () => {
    expect(stripModePrefix(getPlanModePrefix(ASKED))).toBe(ASKED);
  });

  it('a room prefix, which ends with a request heading instead', () => {
    // getSocialStudioPrefix closes with "## Their request\n{text}" rather than
    // a bare blank line, so the marker branch is the one under test here.
    expect(stripModePrefix(getSocialStudioPrefix(ASKED))).toBe(ASKED);
  });
});

describe('it never eats a real message', () => {
  it('leaves an ordinary message completely alone', () => {
    const plain = 'the character floats an inch above the platform';
    expect(stripModePrefix(plain)).toBe(plain);
  });

  it('leaves a multi-paragraph message alone', () => {
    // No mode tag, so nothing to strip — and taking "the last paragraph" here
    // would silently throw away most of what they wrote.
    const long = 'First thing.\n\nSecond thing.\n\nThird thing.';
    expect(stripModePrefix(long)).toBe(long);
  });

  it('does not mistake bracketed text at the start for a mode tag', () => {
    const bug = '[BUG] the idle animation restarts every frame';
    expect(stripModePrefix(bug)).toBe(bug);
  });

  it('returns the input rather than an empty string when there is no tail', () => {
    // Losing the message is worse than storing a prefix.
    const tagOnly = '[Work Mode] ';
    expect(stripModePrefix(tagOnly)).toBe(tagOnly);
  });

  it('handles an empty string without throwing', () => {
    expect(stripModePrefix('')).toBe('');
  });
});

describe('a multi-line question survives intact', () => {
  it('keeps every line the person wrote', () => {
    const multi = 'two things:\nfix the jump\nand the camera';
    const out = stripModePrefix(getSocialStudioPrefix(multi));
    expect(out).toBe(multi);
    expect(out.split('\n')).toHaveLength(3);
  });
});

// ── The prompts already in the graph ────────────────────────────────────────
//
// stripModePrefix stops new ones being written and does nothing about the ones
// already stored. That matters more than it sounds: novelty is measured over
// stored content, so on an existing install every copy keeps making the next
// work-mode turn look familiar — the fix ships and capture stays switched off.
//
// The operator's own graph held 30 of them.

describe('a graph carrying captured prompts cleans itself on load', () => {
  it('drops the prompt nodes and keeps the real memories', async () => {
    const { MemoryGraph } = await import('../src/memory/graph-engine.js');
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const dir = await mkdtemp(join(tmpdir(), 'ava-graph-'));
    const path = join(dir, 'graph.json');
    const node = (id: string, content: string) => ({
      id, content, category: 'general', scope: 'global', confidence: 0.8,
      confidenceSource: 'ambient', source: 'ambient', tags: [], createdAt: '2026-09-07T16:43:00Z',
      updatedAt: '2026-09-07T16:43:00Z', accessCount: 0, lastAccessedAt: null, sourceSessionId: null,
    });

    await writeFile(path, JSON.stringify({
      version: 4,
      nodes: [
        node('a', '[Work Mode] You are Ava the Builder. This is the coding surface'),
        node('b', '[Memory Brief]\n[Project Brain]\nStack: Next.js'),
        node('c', 'Sacred Crossing is a UE5.7 C++ game — art direction is futuristic'),
        node('d', '[BUG] the idle animation restarts every frame'),
      ],
      edges: [
        { id: 'e1', fromNodeId: 'a', toNodeId: 'c', type: 'relates_to', weight: 0.5, createdAt: '2026-09-07T16:43:00Z' },
        { id: 'e2', fromNodeId: 'c', toNodeId: 'd', type: 'relates_to', weight: 0.5, createdAt: '2026-09-07T16:43:00Z' },
      ],
      lastModified: '2026-09-07T17:10:00Z',
    }), 'utf-8');

    const graph = new MemoryGraph(dir);
    await graph.load();
    const ids = graph.getAllNodes().map(n => n.id).sort();

    // The two prompts go; the real memory stays, and so does the bug report —
    // "[BUG] ..." is something a person types and must never be swept up.
    expect(ids).toEqual(['c', 'd']);

    // The edge hanging off the removed node goes with it, or the graph keeps
    // an id that resolves to nothing.
    expect(graph.getAllEdges().map(e => e.id)).toEqual(['e2']);

    await rm(dir, { recursive: true, force: true });
  });

  it('leaves a clean graph completely alone', async () => {
    const { MemoryGraph } = await import('../src/memory/graph-engine.js');
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const dir = await mkdtemp(join(tmpdir(), 'ava-graph-'));
    const path = join(dir, 'graph.json');
    await writeFile(path, JSON.stringify({
      version: 4,
      nodes: [{
        id: 'x', content: 'He works evenings and prefers short answers',
        category: 'general', scope: 'global', confidence: 0.9, confidenceSource: 'stated',
        source: 'explicit', tags: [], createdAt: '2026-09-07T10:00:00Z',
        updatedAt: '2026-09-07T10:00:00Z', accessCount: 0, lastAccessedAt: null, sourceSessionId: null,
      }],
      edges: [], lastModified: '2026-09-07T10:00:00Z',
    }), 'utf-8');

    const graph = new MemoryGraph(dir);
    await graph.load();
    expect(graph.getAllNodes()).toHaveLength(1);

    await rm(dir, { recursive: true, force: true });
  });
});
