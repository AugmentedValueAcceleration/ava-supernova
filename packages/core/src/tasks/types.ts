/**
 * Task Management — Structured task types.
 *
 * Supports user-created tasks and Ava session tasks,
 * with priorities, categories, recurrence, and subtasks.
 */

/** Priority levels for tasks. */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

/** Status of a task. */
export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'archived';

/** Categories for task entries. */
export type TaskCategory = 'coding' | 'personal' | 'admin' | 'meeting' | 'custom';

/** Recurrence options. */
export type TaskRecurrence = 'none' | 'daily' | 'weekly';

/** Who created the task. */
export type TaskSource = 'user' | 'ava';

/** A subtask within a task. */
export interface TaskSubtask {
  id: string;
  title: string;
  done: boolean;
}

/** A single task entry. */
export interface TaskEntry {
  /** Unique identifier (UUID v4). */
  id: string;
  /** Task title. */
  title: string;
  /** Optional description with details. */
  description?: string;
  /** Priority level. */
  priority: TaskPriority;
  /** Current status. */
  status: TaskStatus;
  /** Optional due date (ISO 8601 date string, e.g. "2026-03-15"). */
  dueDate?: string;
  /** Category for grouping. */
  category: TaskCategory;
  /** Who created this task. */
  source: TaskSource;
  /** Which workspace this belongs to, or 'global'. */
  project: string;
  /** Recurrence pattern. */
  recurrence: TaskRecurrence;
  /** Subtasks for breaking down work. */
  subtasks: TaskSubtask[];
  /** When created (ISO 8601). */
  createdAt: string;
  /** When last updated (ISO 8601). */
  updatedAt: string;
  /** When completed (ISO 8601 or undefined). */
  completedAt?: string;
}

/** The full task store persisted as JSON. */
export interface TaskStore {
  /** Schema version for future migrations. */
  version: 1;
  /** When this store was last modified (ISO 8601). */
  lastModified: string;
  /** The task entries. */
  entries: TaskEntry[];
}

/** Options for listing tasks with filters. */
export interface TaskListOptions {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority;
  category?: TaskCategory;
  source?: TaskSource;
  /** If true, include archived tasks. Default: false. */
  includeArchived?: boolean;
}

/** All valid priorities as an array. */
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

/** All valid categories as an array. */
export const TASK_CATEGORIES: TaskCategory[] = ['coding', 'personal', 'admin', 'meeting', 'custom'];

/** Default empty task store. */
export function createEmptyTaskStore(): TaskStore {
  return {
    version: 1,
    lastModified: new Date().toISOString(),
    entries: [],
  };
}
