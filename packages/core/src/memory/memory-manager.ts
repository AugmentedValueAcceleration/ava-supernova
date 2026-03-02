import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const MEMORY_FILENAME = 'memory.md';

export class MemoryManager {
  private readonly globalPath: string;
  private readonly projectPath: string | null;

  constructor(opts: { globalDir: string; projectRoot?: string }) {
    this.globalPath = join(opts.globalDir, MEMORY_FILENAME);
    this.projectPath = opts.projectRoot
      ? join(opts.projectRoot, '.ava', MEMORY_FILENAME)
      : null;
  }

  /** Read global memory (~/.ava/memory.md). Returns null if not found. */
  async loadGlobalMemory(): Promise<string | null> {
    return this.readSafe(this.globalPath);
  }

  /** Read project memory (<projectRoot>/.ava/memory.md). Returns null if not found. */
  async loadProjectMemory(): Promise<string | null> {
    if (!this.projectPath) return null;
    return this.readSafe(this.projectPath);
  }

  /** Load both memories, formatted for system prompt injection. Empty string if no memories. */
  async loadAll(): Promise<string> {
    const [global, project] = await Promise.all([
      this.loadGlobalMemory(),
      this.loadProjectMemory(),
    ]);

    const sections: string[] = [];

    if (global?.trim()) {
      sections.push(`### Global Memory\n${global.trim()}`);
    }
    if (project?.trim()) {
      sections.push(`### Project Memory\n${project.trim()}`);
    }

    return sections.join('\n\n');
  }

  /** Overwrite global memory with new content. */
  async saveGlobalMemory(content: string): Promise<void> {
    await this.writeSafe(this.globalPath, content);
  }

  /** Overwrite project memory with new content. Creates .ava/ dir if needed. */
  async saveProjectMemory(content: string): Promise<void> {
    if (!this.projectPath) {
      throw new Error('No project root configured — cannot save project memory.');
    }
    const dir = join(this.projectPath, '..');
    await mkdir(dir, { recursive: true });
    await this.writeSafe(this.projectPath, content);
  }

  /** Append an entry to global memory. */
  async appendGlobal(entry: string): Promise<void> {
    const existing = (await this.loadGlobalMemory()) ?? '';
    const updated = existing ? `${existing.trimEnd()}\n\n${entry}` : entry;
    await this.saveGlobalMemory(updated);
  }

  /** Append an entry to project memory. */
  async appendProject(entry: string): Promise<void> {
    const existing = (await this.loadProjectMemory()) ?? '';
    const updated = existing ? `${existing.trimEnd()}\n\n${entry}` : entry;
    await this.saveProjectMemory(updated);
  }

  /** Get the file path for a given scope (for display purposes). */
  getPath(scope: 'global' | 'project'): string | null {
    return scope === 'global' ? this.globalPath : this.projectPath;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async readSafe(path: string): Promise<string | null> {
    try {
      const content = await readFile(path, 'utf-8');
      return content || null;
    } catch {
      return null;
    }
  }

  /** Atomic write: temp file → rename. */
  private async writeSafe(path: string, content: string): Promise<void> {
    const tmpPath = path + '.tmp';
    await writeFile(tmpPath, content, 'utf-8');
    try {
      await rename(tmpPath, path);
    } catch (err) {
      await unlink(tmpPath).catch(() => {});
      throw err;
    }
  }
}
