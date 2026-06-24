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

/** How long before a task is due its reminder should fire, in minutes.
 *  0 = at the due time; 1440 = a day before. undefined = no reminder. */
export type TaskReminderLead = 0 | 10 | 30 | 60 | 1440;

/** Where a task came from — the provenance that makes it Ava's, not a
 *  generic to-do. `ref` is an opaque pointer the surface can resolve
 *  (a message id, a file path, a plan id…); `label` is the human hint. */
export interface TaskContext {
  kind: 'chat' | 'file' | 'plan' | 'lesson' | 'other';
  ref: string;
  label?: string;
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
  /** Optional time of day the task is due, 'HH:MM' (24h). Pairs with dueDate. */
  dueTime?: string;
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
  /** Minutes before due that a reminder should fire (undefined = none). */
  reminderLead?: TaskReminderLead;
  /** When a reminder last fired for this entry (ISO 8601) — dedupe guard. */
  reminderFiredAt?: string;
  /** Where this task came from. */
  context?: TaskContext;
  /** When created (ISO 8601). */
  createdAt: string;
  /** When last updated (ISO 8601). */
  updatedAt: string;
  /** When completed (ISO 8601 or undefined). */
  completedAt?: string;
}

/** The full task store persisted as JSON. */
export interface TaskStore {
  /** Schema version. v1 stores are read and forward-migrated to v2. */
  version: 1 | 2;
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
    version: 2,
    lastModified: new Date().toISOString(),
    entries: [],
  };
}
