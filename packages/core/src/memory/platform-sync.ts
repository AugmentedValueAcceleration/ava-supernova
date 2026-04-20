/**
 * Syncs local memory to/from the Ava platform (Supabase).
 * Uses native fetch — no extra dependencies.
 */

/** Retry a fetch with exponential backoff */
async function fetchWithRetry(url: string, opts: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok || res.status < 500) return res; // Don't retry client errors
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return fetch(url, opts); // Final attempt
}

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
    const params = new URLSearchParams({ scope, limit: '1000' });
    if (scope === 'project' && this.projectId) {
      params.set('project_id', this.projectId);
    }

    const res = await fetchWithRetry(`${this.apiBase}/memories?${params}`, {
      headers: this.headers(),
    });

    if (!res.ok) return [];

    const data = await res.json();
    // GET /api/memories returns { memories, total, limit, offset, hasMore }.
    // Older response shape was a bare array — tolerate both so we keep
    // working if the server shape changes again.
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.memories)) return data.memories;
    return [];
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
    entries: Array<{ id: string; content: string; category?: string; tags?: string[]; archived?: boolean; layer?: string; branch?: string; directoryScope?: string }>,
  ): Promise<void> {
    // Pull existing to map local IDs → remote IDs
    const existing = await this.pull(scope);
    const remoteByKey = new Map(existing.map((m) => [m.key, m]));

    for (const entry of entries) {
      const remote = remoteByKey.get(entry.id);

      if (remote) {
        // Update existing — include layer/branch/scope metadata
        await fetch(`${this.apiBase}/memories/${remote.id}`, {
          method: 'PATCH',
          headers: this.headers(),
          body: JSON.stringify({
            content: entry.content,
            category: entry.category ?? null,
            archived: entry.archived ?? false,
            layer: entry.layer ?? null,
            branch: entry.branch ?? null,
            directory_scope: entry.directoryScope ?? null,
            tags: entry.tags ?? [],
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
            layer: entry.layer ?? null,
            branch: entry.branch ?? null,
            directory_scope: entry.directoryScope ?? null,
            tags: entry.tags ?? [],
          }),
        });
      }
    }

    // Clean up legacy 'memory.json' blob records from the old sync format.
    // Previously this block also deleted any remote row whose key wasn't in
    // the current local store — that was catastrophic once the local store
    // was ever wiped or regenerated with fresh UUIDs (every surviving cloud
    // memory would be deleted on next push). Memory is additive: if the user
    // wants a cloud row gone, they delete it explicitly.
    for (const remote of existing) {
      if (remote.key === 'memory.json') {
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
