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
