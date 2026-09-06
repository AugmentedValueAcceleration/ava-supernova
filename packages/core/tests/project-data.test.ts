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
import { projectsHomeFrom, PROJECTS_DIRNAME } from '../src/projects/projects-home.js';
import { PROJECT_NOTES_DIRNAME } from '../src/projects/project-data.js';
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
  it('defaults to ~/.ava/projects — one roof', () => {
    // This asserted the OPPOSITE until 2026-09-06: that projects must live in
    // a VISIBLE folder outside `.ava`, because source in a dotfolder gets lost
    // and backup tools skip it. What that produced was two folders called
    // "projects" on one machine — the user's work at ~/Ava Projects and Ava's
    // notes at ~/.ava/projects — indistinguishable from the outside. Operator,
    // and he was right. The safety half did not survive checking either:
    // nothing in this codebase deletes ~/.ava wholesale.
    expect(projectsHomeFrom('/home/sam')).toBe('/home/sam/.ava/projects');
  });

  it('never collides with the notes folder', () => {
    // The whole point of the rename. If these two were ever equal again, Ava's
    // trust records and somebody's source tree would share a directory.
    expect(PROJECTS_DIRNAME).not.toBe(PROJECT_NOTES_DIRNAME);
    expect(projectsHomeFrom('/home/sam')).not.toContain(PROJECT_NOTES_DIRNAME);
  });

  it('yields to a path the user chose', () => {
    expect(projectsHomeFrom('/home/sam', '/work/code')).toBe('/work/code');
    expect(projectsHomeFrom('/home/sam', '  /work/code/  ')).toBe('/work/code');
  });

  it('falls back when the setting is empty rather than producing a bare name', () => {
    // An empty string in config must not resolve to '' or to the folder name
    // on its own — both would put projects somewhere unpredictable.
    for (const empty of ['', '   ', null, undefined]) {
      expect(projectsHomeFrom('/home/sam', empty)).toBe('/home/sam/.ava/projects');
    }
  });

  it('keeps the platform separator it was given', () => {
    expect(projectsHomeFrom('C:\\Users\\sam')).toBe('C:\\Users\\sam\\.ava\\projects');
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
