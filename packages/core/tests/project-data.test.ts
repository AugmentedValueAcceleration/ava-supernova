// Where Ava's per-project data lives, and which project it belongs to.
//
// Two faults this holds down. The hash was implemented twice — once in
// brainstorm-store, once in verification-trust — byte-identical and separately
// maintained; had either drifted, one project would have become two folders
// and lost its history with nothing failing loudly. And the hash is one-way,
// so until `project.json` existed nothing could answer "which projects do I
// know about?".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  projectHash, projectDataDir, ensureProjectData, listKnownProjects,
} from '../src/projects/project-data.js';
import { projectsHomeFrom, DEFAULT_PROJECTS_DIRNAME } from '../src/projects/projects-home.js';
import { projectHash as brainstormHash } from '../src/brainstorm/brainstorm-store.js';
import { _internals as trustInternals } from '../src/tools/verification-trust.js';

describe('the project hash', () => {
  it('is one implementation, not three', () => {
    // The two modules that used to carry their own copy now re-export this
    // one. If someone reintroduces a local hash, these stop matching.
    const path = '/some/project';
    expect(brainstormHash(path)).toBe(projectHash(path));
    expect(trustInternals.projectHash(path)).toBe(projectHash(path));
  });

  it('canonicalises so one project cannot become two folders', () => {
    // A trailing slash and Windows drive-letter casing are the two ways the
    // same project used to arrive looking different.
    const base = projectHash(join('/work', 'thing'));
    expect(projectHash(join('/work', 'thing') + '/')).toBe(base);
    expect(projectHash(join('/work', 'thing').toUpperCase())).toBe(base);
  });

  it('separates genuinely different projects', () => {
    expect(projectHash('/work/a')).not.toBe(projectHash('/work/b'));
  });
});

describe('the projects home', () => {
  it('defaults to a visible folder in the home directory, not inside .ava', () => {
    const home = projectsHomeFrom('/home/sam');
    expect(home).toBe('/home/sam/' + DEFAULT_PROJECTS_DIRNAME);
    // The whole point: source code must not live in a hidden app-data folder,
    // where people lose it and backup tools skip it.
    expect(home).not.toContain('.ava');
    expect(DEFAULT_PROJECTS_DIRNAME.startsWith('.')).toBe(false);
  });

  it('yields to a path the user chose', () => {
    expect(projectsHomeFrom('/home/sam', '/work/code')).toBe('/work/code');
    expect(projectsHomeFrom('/home/sam', '  /work/code/  ')).toBe('/work/code');
  });

  it('falls back when the setting is empty rather than producing a bare name', () => {
    // An empty string in config must not resolve to '' or to the folder name
    // on its own — both would put projects somewhere unpredictable.
    for (const empty of ['', '   ', null, undefined]) {
      expect(projectsHomeFrom('/home/sam', empty)).toBe('/home/sam/' + DEFAULT_PROJECTS_DIRNAME);
    }
  });

  it('keeps the platform separator it was given', () => {
    expect(projectsHomeFrom('C:\\Users\\sam')).toBe('C:\\Users\\sam\\' + DEFAULT_PROJECTS_DIRNAME);
  });
});

describe('project records', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'ava-projdata-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('writes the path beside the hash, so the directory says what it is', async () => {
    const project = join(dir, 'my-project');
    const out = await ensureProjectData(project, dir);

    expect(out).toBe(projectDataDir(project, dir));
    const rec = JSON.parse(await readFile(join(out, 'project.json'), 'utf8'));
    expect(rec.path.toLowerCase()).toContain('my-project');
    expect(rec.firstSeenAt).toBeTruthy();
  });

  it('keeps the original first-seen date on a later visit', async () => {
    const project = join(dir, 'p');
    const first = await ensureProjectData(project, dir);
    const before = JSON.parse(await readFile(join(first, 'project.json'), 'utf8'));

    await new Promise((r) => setTimeout(r, 5));
    await ensureProjectData(project, dir);
    const after = JSON.parse(await readFile(join(first, 'project.json'), 'utf8'));

    // A project you return to is not a new project.
    expect(after.firstSeenAt).toBe(before.firstSeenAt);
    expect(after.lastSeenAt >= before.lastSeenAt).toBe(true);
  });

  it('lists every project it has a record for', async () => {
    await ensureProjectData(join(dir, 'alpha'), dir);
    await ensureProjectData(join(dir, 'beta'), dir);

    const found = (await listKnownProjects(dir)).map((r) => r.path.toLowerCase());
    expect(found.some((p) => p.includes('alpha'))).toBe(true);
    expect(found.some((p) => p.includes('beta'))).toBe(true);
  });

  it('skips directories that predate the record rather than failing', async () => {
    // Everything written before project.json existed. The hash is one-way, so
    // those paths are genuinely unrecoverable — not listable, not an error.
    await mkdir(join(dir, 'projects', 'deadbeefdeadbeef'), { recursive: true });
    await writeFile(join(dir, 'projects', 'deadbeefdeadbeef', 'trust.json'), '{}');
    await ensureProjectData(join(dir, 'known'), dir);

    const found = await listKnownProjects(dir);
    expect(found).toHaveLength(1);
    expect(found[0].path.toLowerCase()).toContain('known');
  });

  it('returns nothing when there is no projects folder at all', async () => {
    expect(await listKnownProjects(join(dir, 'nope'))).toEqual([]);
  });
});
