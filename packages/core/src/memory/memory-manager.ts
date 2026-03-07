import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { PlatformMemorySync, SemanticMatch } from './platform-sync.js';

const MEMORY_FILENAME = 'memory.md';

export class MemoryManager {
  private readonly globalPath: string;
  private readonly projectPath: string | null;
  private readonly sync?: PlatformMemorySync;

  constructor(opts: { globalDir: string; projectRoot?: string; sync?: PlatformMemorySync }) {
    this.globalPath = join(opts.globalDir, MEMORY_FILENAME);
    this.projectPath = opts.projectRoot
      ? join(opts.projectRoot, '.ava', MEMORY_FILENAME)
      : null;
    this.sync = opts.sync;
  }

  /** Read global memory (~/.ava/memory.md). Falls back to platform if local is empty. */
  async loadGlobalMemory(): Promise<string | null> {
    const local = await this.readSafe(this.globalPath);
    if (local) return local;

    // Bootstrap from platform if local doesn't exist
    if (this.sync) {
      try {
        const remote = await this.sync.pull('global');
        if (remote.length > 0) {
          const content = remote.map((m) => m.content).join('\n\n');
          await this.writeSafe(this.globalPath, content);
          return content;
        }
      } catch { /* platform unavailable — not fatal */ }
    }
    return null;
  }

  /** Read project memory (<projectRoot>/.ava/memory.md). Falls back to platform if local is empty. */
  async loadProjectMemory(): Promise<string | null> {
    if (!this.projectPath) return null;
    const local = await this.readSafe(this.projectPath);
    if (local) return local;

    // Bootstrap from platform if local doesn't exist
    if (this.sync) {
      try {
        const remote = await this.sync.pull('project');
        if (remote.length > 0) {
          const content = remote.map((m) => m.content).join('\n\n');
          const dir = join(this.projectPath, '..');
          await mkdir(dir, { recursive: true });
          await this.writeSafe(this.projectPath, content);
          return content;
        }
      } catch { /* platform unavailable — not fatal */ }
    }
    return null;
  }

  /** Load both memories, formatted for system prompt injection. Empty string if no memories. */
  async loadAll(context?: string): Promise<string> {
    const [global, project, episodic] = await Promise.all([
      this.loadGlobalMemory(),
      this.loadProjectMemory(),
      context ? this.loadRelevantMemories(context) : Promise.resolve([]),
    ]);

    const sections: string[] = [];

    if (global?.trim()) {
      sections.push(`### Global Memory\n${global.trim()}`);
    }
    if (project?.trim()) {
      sections.push(`### Project Memory\n${project.trim()}`);
    }
    if (episodic.length > 0) {
      const items = episodic
        .map((m) => `- **${m.key}** (${m.scope}, ${Math.round(m.similarity * 100)}% match): ${m.content}`)
        .join('\n');
      sections.push(`### Relevant Memories\n${items}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Semantic search for memories relevant to the current context.
   * Requires platform sync with embeddings. Returns empty if unavailable.
   */
  async loadRelevantMemories(context: string, limit = 5): Promise<SemanticMatch[]> {
    if (!this.sync) return [];
    try {
      return await this.sync.semanticSearch(context, { threshold: 0.65, limit });
    } catch {
      return [];
    }
  }

  /** Overwrite global memory with new content. Syncs to platform if available. */
  async saveGlobalMemory(content: string): Promise<void> {
    await this.writeSafe(this.globalPath, content);
    this.syncPush('global', 'memory.md', content);
  }

  /** Overwrite project memory with new content. Creates .ava/ dir if needed. */
  async saveProjectMemory(content: string): Promise<void> {
    if (!this.projectPath) {
      throw new Error('No project root configured — cannot save project memory.');
    }
    const dir = join(this.projectPath, '..');
    await mkdir(dir, { recursive: true });
    await this.writeSafe(this.projectPath, content);
    this.syncPush('project', 'memory.md', content);
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

  /** Fire-and-forget push to platform. Never throws. */
  private syncPush(scope: 'global' | 'project', key: string, content: string): void {
    if (!this.sync) return;
    this.sync.push(scope, key, content).catch(() => {
      /* platform unavailable — local is source of truth */
    });
  }
}
