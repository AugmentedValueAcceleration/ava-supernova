/**
 * Where brainstorm sessions live.
 *
 * Unattached:  ~/.ava/brainstorm/<id>.json
 * Attached:    ~/.ava/projects/<hash>/brainstorm/<id>.json
 *
 * Both under `~/.ava`, never in the repo — see types.ts for why gitignoring
 * inside the project was rejected.
 *
 * The project hash matches `verification-trust.ts` rather than inventing a
 * second scheme: sha256 of the canonicalised path, first 16 chars. Same project
 * therefore means the same folder for trust and for brainstorming, and a
 * trailing slash or a different drive-letter case cannot split one project into
 * two buckets.
 *
 * Writes go through a temp file and a rename, like the journal, so a crash
 * mid-write cannot leave a half-written session behind.
 */
import { readFile, writeFile, rename, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  BrainstormIdea,
  BrainstormKind,
  BrainstormSession,
  BrainstormSessionSummary,
} from './types.js';

const BRAINSTORM_DIR = 'brainstorm';

// The hash lives in one place now. It used to be implemented here AND in
// verification-trust.ts, byte-identical and separately maintained — if either
// had drifted, one project would have silently become two folders and lost its
// history to the split.
import { projectHash, ensureProjectData } from '../projects/project-data.js';
export { projectHash };

export interface BrainstormStoreOptions {
  /** Root for local data. Defaults to ~/.ava — injected so tests use a tmpdir. */
  globalDir?: string;
}

export class BrainstormStore {
  private readonly globalDir: string;

  constructor(opts: BrainstormStoreOptions = {}) {
    this.globalDir = opts.globalDir ?? join(homedir(), '.ava');
  }

  /** Unattached sessions — the general pile. */
  private looseDir(): string {
    return join(this.globalDir, BRAINSTORM_DIR);
  }

  /** Sessions belonging to a project. */
  private projectDir(projectPath: string): string {
    return join(this.globalDir, 'projects', projectHash(projectPath), BRAINSTORM_DIR);
  }

  private dirFor(session: Pick<BrainstormSession, 'projectPath'>): string {
    return session.projectPath ? this.projectDir(session.projectPath) : this.looseDir();
  }

  /** Start a session. Not written until something is put in it. */
  create(kind: BrainstormKind, headline: string, projectPath?: string): BrainstormSession {
    const now = new Date().toISOString();
    return {
      version: 1,
      id: randomUUID().slice(0, 8),
      kind,
      headline,
      ideas: [],
      notes: [],
      ...(projectPath ? { projectPath } : {}),
      startedAt: now,
      updatedAt: now,
    };
  }

  /** Write a session, creating its directory if needed. */
  async save(session: BrainstormSession): Promise<void> {
    session.updatedAt = new Date().toISOString();
    const dir = this.dirFor(session);
    // An attached session also records which project it belongs to — the hash
    // is one-way, so without that the directory can never be traced back.
    if (session.projectPath) await ensureProjectData(session.projectPath, this.globalDir);
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${session.id}.json`);
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(session, null, 2), 'utf-8');
    await rename(tmp, file);
  }

  /** Read one session by id, wherever it lives. */
  async get(id: string, projectPath?: string): Promise<BrainstormSession | null> {
    const dirs = projectPath ? [this.projectDir(projectPath), this.looseDir()] : [this.looseDir()];
    for (const dir of dirs) {
      const file = join(dir, `${id}.json`);
      if (!existsSync(file)) continue;
      try {
        return JSON.parse(await readFile(file, 'utf-8')) as BrainstormSession;
      } catch {
        return null; // unreadable or truncated — treat as absent
      }
    }
    return null;
  }

  /**
   * Sessions, newest first.
   *
   * With a project path, returns that project's sessions AND the loose pile —
   * a blank-page session that later became this project is still the thinking
   * that produced it, and someone who has been circling an idea for weeks
   * should hear about it whether or not they had a folder at the time.
   */
  async list(projectPath?: string): Promise<BrainstormSessionSummary[]> {
    const dirs = projectPath ? [this.projectDir(projectPath), this.looseDir()] : [this.looseDir()];
    const out: BrainstormSessionSummary[] = [];

    for (const dir of dirs) {
      let names: string[];
      try {
        names = (await readdir(dir)).filter((n) => n.endsWith('.json'));
      } catch {
        continue; // directory does not exist yet
      }
      for (const name of names) {
        try {
          const s = JSON.parse(await readFile(join(dir, name), 'utf-8')) as BrainstormSession;
          out.push({
            id: s.id,
            kind: s.kind,
            headline: s.headline,
            ideaCount: s.ideas.length,
            openCount: s.ideas.filter((i) => i.status === 'candidate' || i.status === 'parked').length,
            attached: !!s.projectPath,
            startedAt: s.startedAt,
            updatedAt: s.updatedAt,
          });
        } catch {
          continue; // skip a corrupt file rather than failing the whole list
        }
      }
    }

    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Add an idea to a session. */
  addIdea(
    session: BrainstormSession,
    idea: Omit<BrainstormIdea, 'id' | 'createdAt' | 'updatedAt'>,
  ): BrainstormIdea {
    const now = new Date().toISOString();
    const entry: BrainstormIdea = { ...idea, id: randomUUID().slice(0, 8), createdAt: now, updatedAt: now };
    session.ideas.push(entry);
    return entry;
  }

  /**
   * Attach a loose session to a project — the moment a folder gets created.
   *
   * Moves the file rather than copying it, so a session can never exist in two
   * places disagreeing with each other. Returns the updated session, or null if
   * there was nothing to move.
   */
  async attach(id: string, projectPath: string): Promise<BrainstormSession | null> {
    const session = await this.get(id);
    if (!session) return null;

    const oldFile = join(this.looseDir(), `${id}.json`);
    session.projectPath = projectPath;
    await this.save(session);

    // Only unlink AFTER the new copy is safely written.
    try {
      if (existsSync(oldFile)) await unlink(oldFile);
    } catch {
      /* best effort — a stale loose copy is better than losing the session */
    }
    return session;
  }
}
