/**
 * Syncs local memory to/from the Ava platform (Supabase).
 * Uses native fetch — no extra dependencies.
 */

export interface PlatformMemory {
  id: string;
  key: string;
  content: string;
  scope: 'global' | 'project';
  project_id: string | null;
  updated_at: string;
}

export interface SemanticMatch {
  id: string;
  key: string;
  content: string;
  scope: 'global' | 'project';
  similarity: number;
}

export class PlatformMemorySync {
  private readonly apiBase: string;
  private readonly platformKey: string;
  private readonly projectId?: string;

  constructor(apiBase: string, platformKey: string, projectId?: string) {
    this.apiBase = apiBase.replace(/\/+$/, '');
    this.platformKey = platformKey;
    this.projectId = projectId;
  }

  /** Fetch all memories for a given scope from the platform. */
  async pull(scope: 'global' | 'project'): Promise<PlatformMemory[]> {
    const params = new URLSearchParams({ scope });
    if (scope === 'project' && this.projectId) {
      params.set('project_id', this.projectId);
    }

    const res = await fetch(`${this.apiBase}/memories?${params}`, {
      headers: this.headers(),
    });

    if (!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  /** Push a memory entry to the platform (upsert by key + scope). */
  async push(scope: 'global' | 'project', key: string, content: string): Promise<void> {
    // Check if a memory with this key+scope already exists
    const existing = await this.pull(scope);
    const match = existing.find((m) => m.key === key);

    if (match) {
      // Update existing
      await fetch(`${this.apiBase}/memories/${match.id}`, {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify({ content }),
      });
    } else {
      // Create new
      await fetch(`${this.apiBase}/memories`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          key,
          content,
          scope,
          project_id: scope === 'project' ? this.projectId : null,
        }),
      });
    }
  }

  /** Push individual memory entries to the platform (one Supabase row per entry). */
  async pushEntries(
    scope: 'global' | 'project',
    entries: Array<{ id: string; content: string; category?: string; tags?: string[]; archived?: boolean }>,
  ): Promise<void> {
    // Pull existing to map local IDs → remote IDs
    const existing = await this.pull(scope);
    const remoteByKey = new Map(existing.map((m) => [m.key, m]));

    for (const entry of entries) {
      const remote = remoteByKey.get(entry.id);

      if (remote) {
        // Update existing
        await fetch(`${this.apiBase}/memories/${remote.id}`, {
          method: 'PATCH',
          headers: this.headers(),
          body: JSON.stringify({
            content: entry.content,
            category: entry.category ?? null,
            archived: entry.archived ?? false,
          }),
        });
      } else {
        // Create new — use the local entry ID as the key for dedup
        await fetch(`${this.apiBase}/memories`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({
            key: entry.id,
            content: entry.content,
            scope,
            project_id: scope === 'project' ? this.projectId : null,
            category: entry.category ?? null,
          }),
        });
      }
    }

    // Clean up: delete remote entries that no longer exist locally
    const localIds = new Set(entries.map((e) => e.id));
    for (const remote of existing) {
      // Only clean up entries keyed by UUID (skip legacy 'memory.json' key)
      if (remote.key === 'memory.json') continue;
      if (!localIds.has(remote.key)) {
        await this.delete(remote.id);
      }
    }
  }

  /**
   * Semantic search across memories using vector similarity.
   * Pass `allProjects: true` to search across every project the user has worked in.
   */
  async semanticSearch(
    query: string,
    opts?: { scope?: 'global' | 'project'; threshold?: number; limit?: number; allProjects?: boolean },
  ): Promise<SemanticMatch[]> {
    try {
      const res = await fetch(`${this.apiBase}/memories/search`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          query,
          scope: opts?.allProjects ? null : (opts?.scope || null),
          project_id: opts?.allProjects ? null : (opts?.scope === 'project' ? this.projectId : null),
          all_projects: opts?.allProjects ?? false,
          threshold: opts?.threshold ?? 0.7,
          limit: opts?.limit ?? 10,
        }),
      });

      if (!res.ok) return [];

      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /** Delete a memory by ID. */
  async delete(id: string): Promise<void> {
    await fetch(`${this.apiBase}/memories/${id}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.platformKey}`,
      'Content-Type': 'application/json',
    };
  }
}
