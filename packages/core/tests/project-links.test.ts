// Projects can be declared related, and recall can follow the link.
//
// Cross-project search already existed as `all_projects`, but it was all or
// nothing: this project, or every project ever opened, every hit weighted the
// same. There was no way to say core and web are related, so a match from an
// unrelated side project ranked level with a genuine sibling.
//
// The operator's own setup is the case: core, web, ide, extension and hub
// constantly affect each other. "Editing a guide does nothing until the
// extractor runs in another package" is a fact about the SEAM between two
// projects, and had nowhere to live.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryManager } from '../src/memory/memory-manager.js';

let root: string;
let globalDir: string;

/**
 * A real project with one memory in it, written through the manager's own API.
 *
 * An earlier version of this hand-wrote .ava/memory.json, which the v2->v3
 * migration promptly renamed to memory-v2-backup.json during the manager's
 * async init — so the fixture deleted itself and the test failed for a reason
 * that had nothing to do with what it was testing. Going through saveEntry
 * means the fixture is whatever the system actually produces.
 */
async function makeProject(name: string, content: string): Promise<string> {
  const projectRoot = join(root, name);
  await mkdir(join(projectRoot, '.ava'), { recursive: true });
  const m = new MemoryManager({ globalDir, projectRoot });
  await m.saveEntry({ scope: 'project', content, category: 'decision' });
  return projectRoot;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ava-links-'));
  globalDir = join(root, 'global');
  await mkdir(globalDir, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true }).catch(() => {});
});

describe('linking projects', () => {
  it('links both ways, because the useful question runs both ways', async () => {
    const a = await makeProject('core', 'core decides the contract');
    const b = await makeProject('web', 'web pins a published core');
    const m = new MemoryManager({ globalDir, projectRoot: a });

    await m.linkProjects(a, b);

    expect(await m.getRelatedProjects(a)).toContain(b);
    expect(await m.getRelatedProjects(b)).toContain(a);
  });

  it('is idempotent — linking twice does not duplicate', async () => {
    const a = await makeProject('core', 'x');
    const b = await makeProject('web', 'y');
    const m = new MemoryManager({ globalDir, projectRoot: a });

    await m.linkProjects(a, b);
    await m.linkProjects(a, b);

    expect(await m.getRelatedProjects(a)).toEqual([b]);
  });

  it('refuses to link a project to itself', async () => {
    const a = await makeProject('core', 'x');
    const m = new MemoryManager({ globalDir, projectRoot: a });
    await m.linkProjects(a, a);
    expect(await m.getRelatedProjects(a)).toEqual([]);
  });

  it('unlinks both ways', async () => {
    const a = await makeProject('core', 'x');
    const b = await makeProject('web', 'y');
    const m = new MemoryManager({ globalDir, projectRoot: a });

    await m.linkProjects(a, b);
    await m.unlinkProjects(a, b);

    expect(await m.getRelatedProjects(a)).toEqual([]);
    expect(await m.getRelatedProjects(b)).toEqual([]);
  });

  // registerProject rebuilds the entry wholesale on every load. Without
  // carrying the links across they would last exactly one session, which is
  // the kind of bug that looks like the feature never worked.
  it('survives the project being opened again', async () => {
    const a = await makeProject('core', 'x');
    const b = await makeProject('web', 'y');
    const m1 = new MemoryManager({ globalDir, projectRoot: a });
    await m1.linkProjects(a, b);

    // A fresh manager for the same project re-registers it on construction.
    const m2 = new MemoryManager({ globalDir, projectRoot: a });
    await new Promise(r => setTimeout(r, 50)); // registration is fire-and-forget

    const registry = JSON.parse(await readFile(join(globalDir, 'projects.json'), 'utf-8'));
    const entry = registry.find((p: { path: string }) => p.path === a);
    expect(entry.relatedProjects).toContain(b);
    expect(await m2.getRelatedProjects(a)).toContain(b);
  });
});

describe('recall across the link', () => {
  it('reaches a related project, and says where the hit came from', async () => {
    const a = await makeProject('core', 'the contract lives here');
    const b = await makeProject('web', 'thermodynamics of the pinned contract');
    const m = new MemoryManager({ globalDir, projectRoot: a });
    await m.linkProjects(a, b);

    const hits = await m.recall({ query: 'thermodynamics', scope: 'related' });
    expect(hits.some(h => h.scope === 'project:web')).toBe(true);
  });

  it('does NOT reach an unrelated project under "related"', async () => {
    const a = await makeProject('core', 'x');
    const b = await makeProject('web', 'thermodynamics');
    const c = await makeProject('unrelated', 'thermodynamics');
    const m = new MemoryManager({ globalDir, projectRoot: a });
    await m.linkProjects(a, b);
    // c is registered but never linked
    new MemoryManager({ globalDir, projectRoot: c });
    await new Promise(r => setTimeout(r, 50));

    const hits = await m.recall({ query: 'thermodynamics', scope: 'related' });
    expect(hits.some(h => h.scope === 'project:unrelated')).toBe(false);
  });

  // Weighted down, not filtered out — the whole point of looking next door is
  // that a much better match there can still be the right answer.
  it('ranks a related hit below the same hit at home', async () => {
    const a = await makeProject('core', 'thermodynamics');
    const b = await makeProject('web', 'thermodynamics');
    const m = new MemoryManager({ globalDir, projectRoot: a });
    await m.linkProjects(a, b);

    const hits = await m.recall({ query: 'thermodynamics', scope: 'related' });
    const home = hits.find(h => h.scope === 'project');
    const sibling = hits.find(h => h.scope === 'project:web');
    expect(home).toBeDefined();
    expect(sibling).toBeDefined();
    expect(home!.relevance).toBeGreaterThan(sibling!.relevance);
  });
});
