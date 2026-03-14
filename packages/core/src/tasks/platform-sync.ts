/**
 * Syncs local tasks to/from the Ava platform (Supabase).
 * Follows the same pattern as PlatformMemorySync.
 */

import type { TaskEntry } from './types.js';
import type { PlatformTaskSync } from './task-manager.js';

interface PlatformTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  category: string;
  source: string;
  project: string;
  recurrence: string;
  subtasks: Array<{ id: string; title: string; done: boolean }>;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export class PlatformTaskSyncImpl implements PlatformTaskSync {
  private readonly apiBase: string;
  private readonly platformKey: string;

  constructor(apiBase: string, platformKey: string) {
    this.apiBase = apiBase.replace(/\/+$/, '');
    this.platformKey = platformKey;
  }

  /** Push local tasks to the platform — upserts by matching title+project, deletes stale remotes. */
  async pushTasks(tasks: TaskEntry[]): Promise<void> {
    const remote = await this.pullRemote();
    const remoteById = new Map(remote.map(t => [t.id, t]));
    const localIds = new Set(tasks.map(t => t.id));

    for (const task of tasks) {
      const existing = remoteById.get(task.id);

      if (existing) {
        // Update if local is newer
        if (new Date(task.updatedAt) > new Date(existing.updated_at)) {
          await this.update(existing.id, task);
        }
      } else {
        // Create new
        await this.create(task);
      }
    }

    // Delete remote tasks that no longer exist locally
    for (const rt of remote) {
      if (!localIds.has(rt.id)) {
        await this.delete(rt.id);
      }
    }
  }

  /** Pull tasks from the platform. */
  async pullTasks(): Promise<TaskEntry[]> {
    const remote = await this.pullRemote();
    return remote.map(this.toLocal);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async pullRemote(): Promise<PlatformTask[]> {
    try {
      const res = await fetch(`${this.apiBase}/tasks`, {
        headers: this.headers(),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  private async create(task: TaskEntry): Promise<void> {
    try {
      await fetch(`${this.apiBase}/tasks`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          title: task.title,
          description: task.description || null,
          priority: task.priority,
          status: task.status,
          due_date: task.dueDate || null,
          category: task.category,
          source: task.source,
          project: task.project,
          recurrence: task.recurrence,
          subtasks: task.subtasks,
        }),
      });
    } catch { /* fire-and-forget */ }
  }

  private async update(id: string, task: TaskEntry): Promise<void> {
    try {
      await fetch(`${this.apiBase}/tasks/${id}`, {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify({
          title: task.title,
          description: task.description || null,
          priority: task.priority,
          status: task.status,
          due_date: task.dueDate || null,
          category: task.category,
          recurrence: task.recurrence,
          subtasks: task.subtasks,
          completed_at: task.completedAt || null,
        }),
      });
    } catch { /* fire-and-forget */ }
  }

  private async delete(id: string): Promise<void> {
    try {
      await fetch(`${this.apiBase}/tasks/${id}`, {
        method: 'DELETE',
        headers: this.headers(),
      });
    } catch { /* fire-and-forget */ }
  }

  private toLocal(remote: PlatformTask): TaskEntry {
    return {
      id: remote.id,
      title: remote.title,
      description: remote.description ?? undefined,
      priority: remote.priority as TaskEntry['priority'],
      status: remote.status as TaskEntry['status'],
      dueDate: remote.due_date ?? undefined,
      category: remote.category as TaskEntry['category'],
      source: remote.source as TaskEntry['source'],
      project: remote.project,
      recurrence: remote.recurrence as TaskEntry['recurrence'],
      subtasks: remote.subtasks ?? [],
      createdAt: remote.created_at,
      updatedAt: remote.updated_at,
      completedAt: remote.completed_at ?? undefined,
    };
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.platformKey}`,
      'Content-Type': 'application/json',
    };
  }
}
