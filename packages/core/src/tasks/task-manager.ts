import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  TaskEntry,
  TaskStore,
  TaskStatus,
  TaskPriority,
  TaskCategory,
  TaskSource,
  TaskRecurrence,
  TaskSubtask,
  TaskListOptions,
} from './types.js';
import { createEmptyTaskStore } from './types.js';

const TASKS_FILENAME = 'tasks.json';

/** Optional platform sync interface — mirrors PlatformMemorySync pattern. */
export interface PlatformTaskSync {
  pushTasks(tasks: TaskEntry[]): Promise<void>;
  pullTasks(): Promise<TaskEntry[]>;
}

/** Options for creating a new task. */
export interface TaskCreateOptions {
  title: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string;
  category?: TaskCategory;
  source?: TaskSource;
  project?: string;
  recurrence?: TaskRecurrence;
  subtasks?: TaskSubtask[];
  scope?: 'global' | 'project';
}

/** Options for updating a task. */
export interface TaskUpdateOptions {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string;
  category?: TaskCategory;
  recurrence?: TaskRecurrence;
  subtasks?: TaskSubtask[];
}

export class TaskManager {
  private readonly globalDir: string;
  private readonly projectDir: string | null;
  private readonly projectRoot: string | null;
  private readonly sync?: PlatformTaskSync;

  // In-memory caches
  private globalStore: TaskStore | null = null;
  private projectStore: TaskStore | null = null;

  /** When true, skip all platform sync. Default: true (local-first). */
  private localOnly = true;

  // Session tasks — in-memory only until flushed
  private sessionTasks: TaskEntry[] = [];

  constructor(opts: { globalDir: string; projectRoot?: string; sync?: PlatformTaskSync; localOnly?: boolean }) {
    this.globalDir = opts.globalDir;
    this.projectRoot = opts.projectRoot ?? null;
    this.projectDir = opts.projectRoot ? join(opts.projectRoot, '.ava') : null;
    this.sync = opts.sync;
    this.localOnly = opts.localOnly ?? true;
  }

  /** Toggle cloud sync at runtime. */
  setLocalOnly(value: boolean): void {
    this.localOnly = value;
  }

  // ── Public API — Load ──────────────────────────────────────────────────────

  /** Load global task store. */
  async loadGlobalStore(): Promise<TaskStore> {
    if (this.globalStore) return this.globalStore;
    this.globalStore = await this.loadStore(this.globalDir);
    return this.globalStore;
  }

  /** Load project task store. */
  async loadProjectStore(): Promise<TaskStore | null> {
    if (!this.projectDir) return null;
    if (this.projectStore) return this.projectStore;
    this.projectStore = await this.loadStore(this.projectDir);
    return this.projectStore;
  }

  // ── Public API — CRUD ──────────────────────────────────────────────────────

  /** Add a new task. Returns the created entry. */
  async addTask(opts: TaskCreateOptions): Promise<TaskEntry> {
    const scope = opts.scope ?? 'project';
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore() ?? await this.ensureProjectStore();

    const now = new Date().toISOString();
    const entry: TaskEntry = {
      id: randomUUID(),
      title: opts.title,
      description: opts.description,
      priority: opts.priority ?? 'medium',
      status: opts.status ?? 'todo',
      dueDate: opts.dueDate,
      category: opts.category ?? 'coding',
      source: opts.source ?? 'user',
      project: opts.project ?? (this.projectDir ? basename(join(this.projectDir, '..')) : 'global'),
      recurrence: opts.recurrence ?? 'none',
      subtasks: opts.subtasks ?? [],
      createdAt: now,
      updatedAt: now,
    };

    store.entries.push(entry);
    store.lastModified = now;

    if (scope === 'global') {
      this.globalStore = store;
      await this.persistStore(this.globalDir, store);
    } else {
      this.projectStore = store;
      if (this.projectDir) await this.persistStore(this.projectDir, store);
    }

    this.syncTasks(scope, store.entries);
    return entry;
  }

  /** Update an existing task by ID. Searches both stores. */
  async updateTask(id: string, updates: TaskUpdateOptions): Promise<TaskEntry | null> {
    // Try global first, then project
    let result = await this.updateInStore('global', id, updates);
    if (!result) result = await this.updateInStore('project', id, updates);
    return result;
  }

  /** Delete a task by ID. Returns true if found and deleted. */
  async deleteTask(id: string): Promise<boolean> {
    const deletedGlobal = await this.deleteFromStore('global', id);
    if (deletedGlobal) return true;
    return this.deleteFromStore('project', id);
  }

  /** Get a single task by ID. */
  async getTask(id: string): Promise<TaskEntry | null> {
    const globalStore = await this.loadGlobalStore();
    const found = globalStore.entries.find(e => e.id === id);
    if (found) return found;

    const projectStore = await this.loadProjectStore();
    return projectStore?.entries.find(e => e.id === id) ?? null;
  }

  /** List tasks with optional filters. Returns from both stores. */
  async listTasks(opts?: TaskListOptions): Promise<TaskEntry[]> {
    const globalStore = await this.loadGlobalStore();
    const projectStore = await this.loadProjectStore();

    let all = [
      ...globalStore.entries,
      ...(projectStore?.entries ?? []),
    ];

    if (opts) {
      if (!opts.includeArchived) {
        all = all.filter(e => e.status !== 'archived');
      }
      if (opts.status) {
        const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
        all = all.filter(e => statuses.includes(e.status));
      }
      if (opts.priority) {
        all = all.filter(e => e.priority === opts.priority);
      }
      if (opts.category) {
        all = all.filter(e => e.category === opts.category);
      }
      if (opts.source) {
        all = all.filter(e => e.source === opts.source);
      }
    }

    // Sort by priority (urgent first) then by creation date (newest first)
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    all.sort((a, b) => {
      const pDiff = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
      if (pDiff !== 0) return pDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return all;
  }

  /** Get today's tasks — due today OR status in-progress. */
  async getTodayTasks(): Promise<TaskEntry[]> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const all = await this.listTasks();
    return all.filter(e =>
      e.status === 'in-progress' ||
      (e.dueDate && e.dueDate === today && e.status !== 'done' && e.status !== 'archived')
    );
  }

  /** Complete a task — sets status to 'done' and records completedAt. */
  async completeTask(id: string): Promise<TaskEntry | null> {
    const entry = await this.getTask(id);
    if (!entry) return null;

    return this.updateTask(id, { status: 'done' });
  }

  /** Archive a task. */
  async archiveTask(id: string): Promise<TaskEntry | null> {
    return this.updateTask(id, { status: 'archived' });
  }

  /** Restore an archived task to todo. */
  async restoreTask(id: string): Promise<TaskEntry | null> {
    return this.updateTask(id, { status: 'todo' });
  }

  // ── Session Tasks (in-memory) ──────────────────────────────────────────────

  /** Add a session task (in-memory only, from Ava's todo_write). */
  addSessionTask(task: { id: string; title: string; status: TaskStatus }): void {
    const existing = this.sessionTasks.find(t => t.id === task.id);
    if (existing) {
      existing.title = task.title;
      existing.status = task.status;
      existing.updatedAt = new Date().toISOString();
      if (task.status === 'done' && !existing.completedAt) {
        existing.completedAt = new Date().toISOString();
      }
      return;
    }

    const now = new Date().toISOString();
    this.sessionTasks.push({
      id: task.id,
      title: task.title,
      priority: 'medium',
      status: task.status,
      category: 'coding',
      source: 'ava',
      project: this.projectDir ? basename(join(this.projectDir, '..')) : 'global',
      recurrence: 'none',
      subtasks: [],
      createdAt: now,
      updatedAt: now,
      completedAt: task.status === 'done' ? now : undefined,
    });
  }

  /** Update a session task status. */
  updateSessionTask(id: string, status: TaskStatus): void {
    const task = this.sessionTasks.find(t => t.id === id);
    if (task) {
      task.status = status;
      task.updatedAt = new Date().toISOString();
      if (status === 'done' && !task.completedAt) {
        task.completedAt = new Date().toISOString();
      }
    }
  }

  /** Get all session tasks. */
  getSessionTasks(): TaskEntry[] {
    return [...this.sessionTasks];
  }

  /** Flush session tasks to the project store (persists them). */
  async flushSessionTasks(): Promise<void> {
    if (this.sessionTasks.length === 0) return;

    const store = await this.loadProjectStore() ?? await this.ensureProjectStore();

    for (const task of this.sessionTasks) {
      const existing = store.entries.find(e => e.id === task.id);
      if (existing) {
        existing.status = task.status;
        existing.updatedAt = task.updatedAt;
        existing.completedAt = task.completedAt;
      } else {
        store.entries.push({ ...task });
      }
    }

    store.lastModified = new Date().toISOString();
    this.projectStore = store;
    if (this.projectDir) await this.persistStore(this.projectDir, store);
  }

  /** Clear session tasks from memory. */
  clearSessionTasks(): void {
    this.sessionTasks = [];
  }

  // ── Recurrence ─────────────────────────────────────────────────────────────

  /** Process recurring tasks — create new instances for completed recurring tasks. */
  async processRecurrence(): Promise<number> {
    const today = new Date();
    let created = 0;

    for (const scope of ['global', 'project'] as const) {
      const store = scope === 'global'
        ? await this.loadGlobalStore()
        : await this.loadProjectStore();
      if (!store) continue;

      const toArchive: string[] = [];
      const toAdd: TaskEntry[] = [];

      for (const entry of store.entries) {
        if (entry.recurrence === 'none' || entry.status !== 'done') continue;
        if (!entry.completedAt) continue;

        // Calculate next due date
        const completedDate = new Date(entry.completedAt);
        let nextDue: Date;

        if (entry.recurrence === 'daily') {
          nextDue = new Date(completedDate);
          nextDue.setDate(nextDue.getDate() + 1);
        } else {
          // weekly
          nextDue = new Date(completedDate);
          nextDue.setDate(nextDue.getDate() + 7);
        }

        // Cap at 7 days catchup
        const diffDays = Math.floor((today.getTime() - nextDue.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 7) continue;

        // Only create if not already existing for this due date
        const nextDueStr = nextDue.toISOString().slice(0, 10);
        const alreadyExists = store.entries.some(e =>
          e.title === entry.title && e.dueDate === nextDueStr && e.status !== 'archived'
        );
        if (alreadyExists) continue;

        const now = new Date().toISOString();
        toAdd.push({
          id: randomUUID(),
          title: entry.title,
          description: entry.description,
          priority: entry.priority,
          status: 'todo',
          dueDate: nextDueStr,
          category: entry.category,
          source: entry.source,
          project: entry.project,
          recurrence: entry.recurrence,
          subtasks: entry.subtasks.map(s => ({ ...s, done: false })),
          createdAt: now,
          updatedAt: now,
        });

        toArchive.push(entry.id);
        created++;
      }

      if (toAdd.length > 0 || toArchive.length > 0) {
        for (const id of toArchive) {
          const entry = store.entries.find(e => e.id === id);
          if (entry) entry.status = 'archived';
        }
        store.entries.push(...toAdd);
        store.lastModified = new Date().toISOString();

        if (scope === 'global') {
          this.globalStore = store;
          await this.persistStore(this.globalDir, store);
        } else if (this.projectDir) {
          this.projectStore = store;
          await this.persistStore(this.projectDir, store);
        }
      }
    }

    return created;
  }

  // ── Private — Store I/O ────────────────────────────────────────────────────

  private async loadStore(dir: string): Promise<TaskStore> {
    const filePath = join(dir, TASKS_FILENAME);
    if (!existsSync(filePath)) return createEmptyTaskStore();

    try {
      const raw = await readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as TaskStore;
      if (data.version === 1 && Array.isArray(data.entries)) {
        return data;
      }
      return createEmptyTaskStore();
    } catch {
      return createEmptyTaskStore();
    }
  }

  private async persistStore(dir: string, store: TaskStore): Promise<void> {
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, TASKS_FILENAME);
    const content = JSON.stringify(store, null, 2);
    await this.writeSafe(filePath, content);
  }

  private async writeSafe(path: string, content: string): Promise<void> {
    const { withLock } = await import('../core/file-lock.js');
    await withLock(path, async () => {
      const tmpPath = path + '.tmp';
      await writeFile(tmpPath, content, 'utf-8');
      try {
        await rename(tmpPath, path);
      } catch (err) {
        await unlink(tmpPath).catch(() => {});
        throw err;
      }
    });
  }

  private async ensureProjectStore(): Promise<TaskStore> {
    if (this.projectDir) {
      await mkdir(this.projectDir, { recursive: true });
    }
    const store = createEmptyTaskStore();
    this.projectStore = store;
    return store;
  }

  private async updateInStore(scope: 'global' | 'project', id: string, updates: TaskUpdateOptions): Promise<TaskEntry | null> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    if (!store) return null;

    const entry = store.entries.find(e => e.id === id);
    if (!entry) return null;

    if (updates.title !== undefined) entry.title = updates.title;
    if (updates.description !== undefined) entry.description = updates.description;
    if (updates.priority !== undefined) entry.priority = updates.priority;
    if (updates.status !== undefined) {
      const wasNotDone = entry.status !== 'done';
      entry.status = updates.status;
      if (updates.status === 'done' && wasNotDone) {
        entry.completedAt = new Date().toISOString();
      } else if (updates.status !== 'done') {
        entry.completedAt = undefined;
      }
    }
    if (updates.dueDate !== undefined) entry.dueDate = updates.dueDate;
    if (updates.category !== undefined) entry.category = updates.category;
    if (updates.recurrence !== undefined) entry.recurrence = updates.recurrence;
    if (updates.subtasks !== undefined) entry.subtasks = updates.subtasks;
    entry.updatedAt = new Date().toISOString();
    store.lastModified = new Date().toISOString();

    if (scope === 'global') {
      this.globalStore = store;
      await this.persistStore(this.globalDir, store);
    } else if (this.projectDir) {
      this.projectStore = store;
      await this.persistStore(this.projectDir, store);
    }

    this.syncTasks(scope, store.entries);
    return entry;
  }

  private async deleteFromStore(scope: 'global' | 'project', id: string): Promise<boolean> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    if (!store) return false;

    const idx = store.entries.findIndex(e => e.id === id);
    if (idx === -1) return false;

    store.entries.splice(idx, 1);
    store.lastModified = new Date().toISOString();

    if (scope === 'global') {
      this.globalStore = store;
      await this.persistStore(this.globalDir, store);
    } else if (this.projectDir) {
      this.projectStore = store;
      await this.persistStore(this.projectDir, store);
    }

    this.syncTasks(scope, store.entries);
    return true;
  }

  /** Fire-and-forget platform sync. */
  private syncTasks(_scope: string, entries: TaskEntry[]): void {
    if (this.localOnly || !this.sync) return;
    this.sync.pushTasks(entries).catch(() => {});
  }

  /**
   * Pull the latest tasks from the platform and merge into local
   * stores. Tasks are split by their `project` field — 'global' goes
   * to the global store; entries matching the current workspace's
   * basename go to the project store; entries belonging to other
   * workspaces are ignored (they'll sync when the user opens that
   * workspace). Remote wins on newer updatedAt, consistent with push
   * semantics. Returns the total count of new + updated tasks.
   */
  async pullLatest(): Promise<number> {
    if (!this.sync || this.localOnly) return 0;
    try {
      const remote = await this.sync.pullTasks();
      if (remote.length === 0) return 0;

      const globalStore = await this.loadGlobalStore();
      const projectStore = this.projectDir ? await this.loadProjectStore() : null;
      // Local tasks tag their `project` field with basename(projectRoot)
      // (see construction at line ~111). Match the same shape here.
      const projectName = this.projectRoot ? basename(this.projectRoot) : null;

      const mergeInto = (store: TaskStore, r: TaskEntry) => {
        const existing = store.entries.find(e => e.id === r.id);
        if (existing) {
          if (r.updatedAt > existing.updatedAt) {
            Object.assign(existing, r);
            return 1;
          }
          return 0;
        }
        store.entries.push(r);
        return 1;
      };

      let updatedGlobal = 0;
      let updatedProject = 0;
      for (const r of remote) {
        if (r.project === 'global') {
          updatedGlobal += mergeInto(globalStore, r);
        } else if (projectStore && projectName && r.project === projectName) {
          updatedProject += mergeInto(projectStore, r);
        }
      }

      if (updatedGlobal > 0) {
        globalStore.lastModified = new Date().toISOString();
        await this.persistStore(this.globalDir, globalStore);
      }
      if (projectStore && updatedProject > 0 && this.projectDir) {
        projectStore.lastModified = new Date().toISOString();
        await this.persistStore(this.projectDir, projectStore);
      }

      return updatedGlobal + updatedProject;
    } catch {
      return 0;
    }
  }
}
