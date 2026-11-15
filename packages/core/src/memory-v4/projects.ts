/**
 * Stable project ids.
 *
 * A fact that belongs to one project carries that project's id, so the id must
 * not change when the same folder is opened a slightly different way. The old
 * registry stored `C:\…\SacredCrossing` and `c:\…\SacredCrossing` as two
 * projects; here paths are normalised first (slashes, trailing slash, and case
 * on Windows, where the file system ignores it).
 *
 * A project that moves keeps its memory: its record holds every path it has
 * been opened from, and `addPath` points a new path at an existing project.
 */

import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import type { ProjectRecord } from './types.js';
import { readIfExists, writeAtomic } from './files.js';
import { slugFor } from './fact-file.js';

export function normalizeProjectPath(path: string, platform: NodeJS.Platform = process.platform): string {
  let p = resolve(path).replace(/\\/g, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return platform === 'win32' ? p.toLowerCase() : p;
}

export function projectIdForPath(path: string, platform: NodeJS.Platform = process.platform): string {
  const normalized = normalizeProjectPath(path, platform);
  const hash = createHash('sha1').update(normalized).digest('hex').slice(0, 6);
  return `${slugFor(basename(normalized)).slice(0, 40)}-${hash}`;
}

interface RegistryFile {
  version: 1;
  projects: ProjectRecord[];
}

export class ProjectRegistry {
  private readonly file: string;

  constructor(root: string) {
    this.file = join(root, 'projects.json');
  }

  async all(): Promise<ProjectRecord[]> {
    const raw = await readIfExists(this.file);
    if (!raw) return [];
    try {
      const data = JSON.parse(raw) as RegistryFile;
      return Array.isArray(data.projects) ? data.projects : [];
    } catch {
      return [];
    }
  }

  private async save(projects: ProjectRecord[]): Promise<void> {
    await writeAtomic(this.file, JSON.stringify({ version: 1, projects }, null, 2));
  }

  async get(id: string): Promise<ProjectRecord | undefined> {
    return (await this.all()).find((p) => p.id === id);
  }

  /** The project a path belongs to, if it has been seen before. */
  async find(path: string): Promise<ProjectRecord | undefined> {
    const normalized = normalizeProjectPath(path);
    return (await this.all()).find((p) => p.paths.includes(normalized));
  }

  /** The id for a path, registering the project the first time. Caller holds the lock. */
  async ensure(path: string, name?: string): Promise<ProjectRecord> {
    const projects = await this.all();
    const normalized = normalizeProjectPath(path);
    const existing = projects.find((p) => p.paths.includes(normalized));
    if (existing) return existing;
    const record: ProjectRecord = {
      id: projectIdForPath(path),
      name: name ?? basename(resolve(path)),
      paths: [normalized],
      links: [],
    };
    // Two different folders hashing to the same id would be astonishing, but
    // a silent merge of two projects' memories would be far worse than a suffix.
    while (projects.some((p) => p.id === record.id)) record.id = `${record.id}x`;
    projects.push(record);
    await this.save(projects);
    return record;
  }

  /** Point another path (the project moved) at an existing project. Caller holds the lock. */
  async addPath(id: string, path: string): Promise<boolean> {
    const projects = await this.all();
    const target = projects.find((p) => p.id === id);
    if (!target) return false;
    const normalized = normalizeProjectPath(path);
    for (const p of projects) p.paths = p.paths.filter((x) => x !== normalized);
    target.paths.push(normalized);
    await this.save(projects);
    return true;
  }

  /** Declare two projects connected (both directions). Caller holds the lock. */
  async link(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    const projects = await this.all();
    const pa = projects.find((p) => p.id === a);
    const pb = projects.find((p) => p.id === b);
    if (!pa || !pb) return false;
    if (!pa.links.includes(b)) pa.links.push(b);
    if (!pb.links.includes(a)) pb.links.push(a);
    await this.save(projects);
    return true;
  }

  async unlink(a: string, b: string): Promise<void> {
    const projects = await this.all();
    for (const p of projects) {
      if (p.id === a) p.links = p.links.filter((x) => x !== b);
      if (p.id === b) p.links = p.links.filter((x) => x !== a);
    }
    await this.save(projects);
  }
}
