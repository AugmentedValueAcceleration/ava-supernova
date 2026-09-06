// The only part of the single-roof change that touches somebody's source tree.
//
// Everything else is a path string. This moves real directories, so what needs
// guarding is not "does it work" but "what does it refuse to do": never
// mistake a project for a note, never clobber, never touch a user who chose
// their own path, never half-finish.
//
// avaHome() reads the real home directory, so these drive the migration
// through a temp HOME rather than the machine's — the module is imported
// fresh per test after HOME is set, since avaHome() resolves it at call time.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migrateProjectsLayout } from '../src/projects/migrate-layout.js';

let home: string;
const realHome = process.env.HOME;
const realProfile = process.env.USERPROFILE;

/** A 16-hex name is what projectHash produces — the notes' signature. */
const HASH_A = '0123456789abcdef';
const HASH_B = 'fedcba9876543210';

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'ava-layout-'));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
});

afterEach(async () => {
  process.env.HOME = realHome;
  process.env.USERPROFILE = realProfile;
  await rm(home, { recursive: true, force: true });
});

async function seedNotes(...hashes: string[]) {
  for (const h of hashes) {
    await mkdir(join(home, '.ava', 'projects', h), { recursive: true });
    await writeFile(join(home, '.ava', 'projects', h, 'trust.json'), '{}');
  }
}

async function seedLegacyProject(name: string, file = 'index.ts') {
  await mkdir(join(home, 'Ava Projects', name, 'src'), { recursive: true });
  await writeFile(join(home, 'Ava Projects', name, 'src', file), '// work');
}

describe('the notes vacate projects/', () => {
  it('moves hash-named folders into project-notes', async () => {
    await seedNotes(HASH_A, HASH_B);

    const r = await migrateProjectsLayout(undefined, home);

    expect(r.notesMoved).toBe(2);
    expect(existsSync(join(home, '.ava', 'project-notes', HASH_A, 'trust.json'))).toBe(true);
    expect(existsSync(join(home, '.ava', 'projects', HASH_A))).toBe(false);
  });

  it('LEAVES A REAL PROJECT ALONE, even sitting among notes', async () => {
    // The one that matters. After this ships `~/.ava/projects` fills up with
    // real project folders, and a migration that ran again must not sweep one
    // into the notes directory. The 16-hex test is what separates them.
    await seedNotes(HASH_A);
    await mkdir(join(home, '.ava', 'projects', 'my-game', 'src'), { recursive: true });

    await migrateProjectsLayout(undefined, home);

    expect(existsSync(join(home, '.ava', 'projects', 'my-game', 'src'))).toBe(true);
    expect(existsSync(join(home, '.ava', 'project-notes', 'my-game'))).toBe(false);
  });

  it('does not treat a nearly-hash name as a hash', async () => {
    // 15 chars, 17 chars, and one with a non-hex character. A project called
    // "deadbeefdeadbee" is unlikely; being wrong about it is unrecoverable.
    for (const name of ['0123456789abcde', '0123456789abcdef0', '0123456789abcdeg']) {
      await mkdir(join(home, '.ava', 'projects', name), { recursive: true });
    }
    await migrateProjectsLayout(undefined, home);
    for (const name of ['0123456789abcde', '0123456789abcdef0', '0123456789abcdeg']) {
      expect(existsSync(join(home, '.ava', 'projects', name))).toBe(true);
    }
  });
});

describe('the work moves in', () => {
  it('moves projects out of ~/Ava Projects and removes the empty folder', async () => {
    await seedLegacyProject('SacredCrossing');
    await seedLegacyProject('ava-test-project');

    const r = await migrateProjectsLayout(undefined, home);

    expect(r.projectsMoved.sort()).toEqual(['SacredCrossing', 'ava-test-project']);
    expect(existsSync(join(home, '.ava', 'projects', 'SacredCrossing', 'src', 'index.ts'))).toBe(true);
    expect(existsSync(join(home, 'Ava Projects'))).toBe(false);
  });

  it('NEVER overwrites a name that already exists', async () => {
    // Two different trees with one name. Silently replacing one with the other
    // loses work with no way back, so it is left where it is and reported.
    await seedLegacyProject('shared-name', 'old.ts');
    await mkdir(join(home, '.ava', 'projects', 'shared-name'), { recursive: true });
    await writeFile(join(home, '.ava', 'projects', 'shared-name', 'new.ts'), '// newer');

    const r = await migrateProjectsLayout(undefined, home);

    expect(r.projectsMoved).not.toContain('shared-name');
    expect(r.skipped.join(' ')).toContain('shared-name');
    // Both survive, in the places they were.
    expect(existsSync(join(home, '.ava', 'projects', 'shared-name', 'new.ts'))).toBe(true);
    expect(existsSync(join(home, 'Ava Projects', 'shared-name', 'src', 'old.ts'))).toBe(true);
    // And the old folder stays, because it did not empty.
    expect(existsSync(join(home, 'Ava Projects'))).toBe(true);
  });

  it('leaves a user who chose their own path completely alone', async () => {
    // A configured projectsHome is their decision. Migrating them out of it
    // would be overruling someone who already answered the question.
    await seedLegacyProject('SacredCrossing');

    const r = await migrateProjectsLayout('/work/code', home);

    expect(r.projectsMoved).toEqual([]);
    expect(existsSync(join(home, 'Ava Projects', 'SacredCrossing'))).toBe(true);
  });

  it('still moves that user\'s NOTES, which are ours either way', async () => {
    await seedNotes(HASH_A);
    const r = await migrateProjectsLayout('/work/code', home);
    expect(r.notesMoved).toBe(1);
  });
});

describe('running it again', () => {
  it('is idempotent and cheap', async () => {
    await seedNotes(HASH_A);
    await seedLegacyProject('SacredCrossing');

    const first = await migrateProjectsLayout(undefined, home);
    const second = await migrateProjectsLayout(undefined, home);

    expect(first.notesMoved).toBe(1);
    expect(first.projectsMoved).toEqual(['SacredCrossing']);
    expect(second).toEqual({ notesMoved: 0, projectsMoved: [], skipped: [] });
    expect(existsSync(join(home, '.ava', 'projects', 'SacredCrossing', 'src', 'index.ts'))).toBe(true);
  });

  it('does nothing at all on a fresh install', async () => {
    const r = await migrateProjectsLayout(undefined, home);
    expect(r).toEqual({ notesMoved: 0, projectsMoved: [], skipped: [] });
  });

  it('does not create the old folder by looking for it', async () => {
    await migrateProjectsLayout(undefined, home);
    expect(existsSync(join(home, 'Ava Projects'))).toBe(false);
  });
});

describe('nothing is destroyed', () => {
  it('a moved project keeps every file it had', async () => {
    await mkdir(join(home, 'Ava Projects', 'app', 'src', 'deep'), { recursive: true });
    await writeFile(join(home, 'Ava Projects', 'app', 'README.md'), '# app');
    await writeFile(join(home, 'Ava Projects', 'app', 'src', 'deep', 'x.ts'), 'export {};');

    await migrateProjectsLayout(undefined, home);

    const moved = join(home, '.ava', 'projects', 'app');
    expect((await readdir(moved)).sort()).toEqual(['README.md', 'src']);
    expect((await stat(join(moved, 'src', 'deep', 'x.ts'))).isFile()).toBe(true);
  });
});
