/**
 * Where brainstorms live: ~/.ava/brainstorm/<id>.json — every one of them,
 * assigned to a project or not (plan 2026-11-17-brainstorm: "plans outside of
 * a project"). Assigning records the project's path in the file; the file
 * never moves.
 *
 * Until 17 Nov 2026 "attach" MOVED a session into the project's notes
 * (~/.ava/project-notes/<hash>/brainstorm). Those are brought back here the
 * first time the store looks, keeping their project as the assignment.
 *
 * Writes go through a temp file and a rename, like the journal, so a crash
 * mid-write cannot leave a half-written brainstorm behind.
 */
import { readFile, writeFile, rename, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  BrainstormChange,
  BrainstormExperience,
  BrainstormIdea,
  BrainstormKind,
  BrainstormSession,
  BrainstormSessionSummary,
  BrainstormStep,
  LegacyBrainstormKind,
} from './types.js';
import { BRAINSTORM_KINDS } from './types.js';

const BRAINSTORM_DIR = 'brainstorm';

// The hash lives in one place (project-data.ts); re-exported for old callers.
import { projectHash } from '../projects/project-data.js';
export { projectHash };

export interface BrainstormStoreOptions {
  /** Root for local data. Defaults to ~/.ava — injected so tests use a tmpdir. */
  globalDir?: string;
}

/** Old kinds read as new ones: a blank page was a project; evolving was a direction. */
export function normaliseKind(kind: unknown): BrainstormKind {
  if (typeof kind === 'string' && (BRAINSTORM_KINDS as string[]).includes(kind)) return kind as BrainstormKind;
  const legacy: Record<LegacyBrainstormKind, BrainstormKind> = { blank: 'project', evolve: 'direction' };
  return legacy[kind as LegacyBrainstormKind] ?? 'unsure';
}

/** Any version on disk, as today's shape. */
function upgrade(raw: Record<string, unknown>): BrainstormSession {
  const s = raw as unknown as BrainstormSession;
  return {
    ...s,
    version: 2,
    kind: normaliseKind(raw.kind),
    ideas: Array.isArray(s.ideas) ? s.ideas : [],
    notes: Array.isArray(s.notes) ? s.notes : [],
  };
}

/** One project folder, however it's spelled: case, slash direction, a trailing slash. */
const folderKey = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
export const sameProject = (a?: string, b?: string | null) => !!a && !!b && folderKey(a) === folderKey(b);

export class BrainstormStore {
  private readonly globalDir: string;
  private migrated = false;

  constructor(opts: BrainstormStoreOptions = {}) {
    this.globalDir = opts.globalDir ?? join(homedir(), '.ava');
  }

  /** The one folder every brainstorm lives in. */
  private dir(): string {
    return join(this.globalDir, BRAINSTORM_DIR);
  }

  private file(id: string): string {
    return join(this.dir(), `${id}.json`);
  }

  /**
   * Bring back sessions the old "attach" moved into project notes. Once per
   * store; a file already here with the same id wins only if it's newer.
   */
  private async bringBackAttached(): Promise<void> {
    if (this.migrated) return;
    this.migrated = true;
    const notesRoot = join(this.globalDir, 'project-notes');
    let hashes: string[];
    try { hashes = await readdir(notesRoot); } catch { return; }
    for (const h of hashes) {
      const old = join(notesRoot, h, BRAINSTORM_DIR);
      let names: string[];
      try { names = (await readdir(old)).filter((n) => n.endsWith('.json')); } catch { continue; }
      for (const name of names) {
        try {
          const moved = upgrade(JSON.parse(await readFile(join(old, name), 'utf-8')));
          const here = await this.read(moved.id);
          if (!here || here.updatedAt < moved.updatedAt) await this.write(moved);
          await unlink(join(old, name));
        } catch { /* leave a file we can't read where it is */ }
      }
    }
  }

  private async read(id: string): Promise<BrainstormSession | null> {
    const file = this.file(id);
    if (!existsSync(file)) return null;
    try {
      return upgrade(JSON.parse(await readFile(file, 'utf-8')));
    } catch {
      return null; // unreadable or truncated — treat as absent
    }
  }

  private async write(session: BrainstormSession): Promise<void> {
    await mkdir(this.dir(), { recursive: true });
    const file = this.file(session.id);
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(session, null, 2), 'utf-8');
    await rename(tmp, file);
  }

  /** Start a brainstorm. Not written until something is put in it. */
  create(kind: BrainstormKind | LegacyBrainstormKind, headline: string, projectPath?: string): BrainstormSession {
    const now = new Date().toISOString();
    return {
      version: 2,
      id: randomUUID().slice(0, 8),
      kind: normaliseKind(kind),
      headline,
      ideas: [],
      notes: [],
      ...(projectPath ? { projectPath } : {}),
      startedAt: now,
      updatedAt: now,
    };
  }

  /** Write a brainstorm. */
  async save(session: BrainstormSession): Promise<void> {
    session.version = 2;
    session.updatedAt = new Date().toISOString();
    await this.write(session);
  }

  /** One brainstorm by id. (The second argument is ignored: they all live in one place now.) */
  async get(id: string, _projectPath?: string): Promise<BrainstormSession | null> {
    await this.bringBackAttached();
    return this.read(id);
  }

  /**
   * Brainstorms, newest first. With a project: those assigned to it first, then
   * the rest — a brainstorm that later became this project is still the
   * thinking that produced it, and someone circling an idea for weeks should
   * hear about it whether or not it has a home yet.
   */
  async list(projectPath?: string): Promise<BrainstormSessionSummary[]> {
    await this.bringBackAttached();
    let names: string[];
    try {
      names = (await readdir(this.dir())).filter((n) => n.endsWith('.json'));
    } catch {
      return []; // nothing saved yet
    }
    const out: BrainstormSessionSummary[] = [];
    for (const name of names) {
      try {
        out.push(summarise(upgrade(JSON.parse(await readFile(join(this.dir(), name), 'utf-8')))));
      } catch {
        continue; // skip a corrupt file rather than failing the whole list
      }
    }
    out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (!projectPath) return out;
    return [...out.filter((s) => sameProject(s.projectPath, projectPath)), ...out.filter((s) => !sameProject(s.projectPath, projectPath))];
  }

  /** Brainstorms assigned to one project. */
  async forProject(projectPath: string): Promise<BrainstormSessionSummary[]> {
    return (await this.list()).filter((s) => sameProject(s.projectPath, projectPath));
  }

  /** Add an idea to a brainstorm. */
  addIdea(session: BrainstormSession, idea: Omit<BrainstormIdea, 'id' | 'createdAt' | 'updatedAt'>): BrainstormIdea {
    const now = new Date().toISOString();
    const entry: BrainstormIdea = { ...idea, id: randomUUID().slice(0, 8), createdAt: now, updatedAt: now };
    session.ideas.push(entry);
    return entry;
  }

  /** Assign a brainstorm to a project (a link — nothing moves), or null to unassign. */
  async assign(id: string, projectPath: string | null): Promise<BrainstormSession | null> {
    const session = await this.get(id);
    if (!session) return null;
    if (projectPath) session.projectPath = projectPath;
    else delete session.projectPath;
    await this.save(session);
    return session;
  }

  /** @deprecated The old name. Assigning no longer moves anything. */
  attach(id: string, projectPath: string): Promise<BrainstormSession | null> {
    return this.assign(id, projectPath);
  }

  async delete(id: string): Promise<boolean> {
    const file = this.file(id);
    if (!existsSync(file)) return false;
    await unlink(file);
    return true;
  }
}

// ── The plan and the experience ─────────────────────────────────────────────

const newId = () => randomUUID().slice(0, 8);
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Set the plan's summary and steps. Existing steps keep their ticks; matched by text. */
export function setPlan(session: BrainstormSession, plan: { summary?: string; steps?: Array<{ text: string; tier?: 'small' | 'ambitious'; done?: boolean }> }): void {
  const p = session.plan ?? { steps: [], changes: [] };
  if (typeof plan.summary === 'string' && plan.summary.trim()) p.summary = plan.summary.trim();
  if (Array.isArray(plan.steps)) {
    const before = new Map(p.steps.map((s) => [norm(s.text), s]));
    p.steps = plan.steps.filter((s) => s?.text?.trim()).map((s) => {
      const had = before.get(norm(s.text));
      const done = s.done ?? had?.done ?? false;
      return {
        id: had?.id ?? newId(),
        text: s.text.trim(),
        tier: s.tier === 'ambitious' ? 'ambitious' : (s.tier ?? had?.tier ?? 'small'),
        done,
        ...(done ? { doneAt: had?.doneAt ?? new Date().toISOString() } : {}),
      } satisfies BrainstormStep;
    });
  }
  session.plan = p;
}

/** Tick (or untick) steps by id or by their text. Returns how many changed. */
export function tickSteps(session: BrainstormSession, refs: string[], done = true): number {
  if (!session.plan) return 0;
  let n = 0;
  for (const ref of refs) {
    const step = session.plan.steps.find((s) => s.id === ref || norm(s.text) === norm(ref));
    if (step && step.done !== done) {
      step.done = done;
      if (done) step.doneAt = new Date().toISOString(); else delete step.doneAt;
      n++;
    }
  }
  return n;
}

/** Note what happened to the plan: what changed and why, a new idea, anything else. */
export function addChange(session: BrainstormSession, change: Omit<BrainstormChange, 'at'>): void {
  const p = session.plan ?? { steps: [], changes: [] };
  if (change.text?.trim()) p.changes.push({ ...change, text: change.text.trim(), at: new Date().toISOString() });
  session.plan = p;
}

/** Set the experience (what their users should feel). Fields left out are kept. */
export function setExperience(session: BrainstormSession, exp: Partial<Omit<BrainstormExperience, 'kitId'>>): void {
  const e = session.experience ?? { words: [], notWords: [], principles: [] };
  const clean = (a: unknown) => (Array.isArray(a) ? a.map(String).map((s) => s.trim()).filter(Boolean) : undefined);
  e.words = clean(exp.words) ?? e.words;
  e.notWords = clean(exp.notWords) ?? e.notWords;
  if (Array.isArray(exp.principles)) {
    e.principles = exp.principles
      .filter((p) => p && String(p.title ?? '').trim())
      .map((p) => ({ title: String(p.title).trim(), do: String(p.do ?? '').trim(), dont: String(p.dont ?? '').trim() }));
  }
  session.experience = e;
}

export function summarise(s: BrainstormSession): BrainstormSessionSummary {
  const steps = s.plan?.steps ?? [];
  return {
    id: s.id,
    kind: s.kind,
    headline: s.headline,
    ideaCount: s.ideas.length,
    openCount: s.ideas.filter((i) => i.status === 'candidate' || i.status === 'parked').length,
    stepsDone: steps.filter((x) => x.done).length,
    stepsTotal: steps.length,
    hasExperience: !!s.experience && (s.experience.words.length > 0 || s.experience.principles.length > 0),
    ...(s.projectPath ? { projectPath: s.projectPath } : {}),
    attached: !!s.projectPath,
    startedAt: s.startedAt,
    updatedAt: s.updatedAt,
  };
}
