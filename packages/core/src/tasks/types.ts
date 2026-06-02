/**
 * Task Management — Structured task types.
 *
 * Supports user-created tasks and Ava session tasks,
 * with priorities, categories, recurrence, and subtasks.
 */

/** Priority levels for tasks. */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

/** Status of a task. */
export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'archived' | 'blocked';

/** Category for a task. The values in TASK_CATEGORIES are common presets, but
 *  any custom label is allowed — not everyone's life fits five buckets
 *  (fitness, study, garden… all get their own identity). */
export type TaskCategory = string;

/** Recurrence options.
 *  - daily: every day
 *  - weekdays: every Mon–Fri
 *  - weekly: same weekday each week
 *  - monthly: same date each month */
export type TaskRecurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';

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

/** Suggested preset categories surfaced in pickers. Not exhaustive — any
 *  custom label is valid; these just seed the dropdown for the common cases
 *  (deliberately broad so non-coders feel at home). */
export const TASK_CATEGORIES: TaskCategory[] = [
  'personal', 'coding', 'admin', 'meeting', 'health', 'finance', 'errands', 'study', 'home',
];

/** Default empty task store. */
export function createEmptyTaskStore(): TaskStore {
  return {
    version: 1,
    lastModified: new Date().toISOString(),
    entries: [],
  };
}
