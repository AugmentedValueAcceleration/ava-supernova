/**
 * Event Detection — Types for Ava's proactive awareness system.
 *
 * Events fire when conditions are met during normal usage:
 * overdue tasks, repeated errors, long idle gaps, etc.
 */

/** All event types Ava can detect. */
export type AvaEventType =
  | 'task_overdue'
  | 'task_due_soon'
  | 'tasks_completed_streak'
  | 'idle_detected'
  | 'error_repeated'
  | 'memory_stale'
  | 'journal_streak'
  | 'journal_missed';

/** An event detected by the system. */
export interface AvaEvent {
  type: AvaEventType;
  /** Human-readable description. */
  message: string;
  /** Severity for notification routing. */
  severity: 'info' | 'warning' | 'urgent';
  /** When this event was detected. */
  detectedAt: string;
  /** Additional data for the event. */
  data?: Record<string, unknown>;
}

/** Handler for detected events. */
export type AvaEventHandler = (event: AvaEvent) => void;

/** Persistent state for event detection (avoids repeat alerts). */
export interface EventDetectorState {
  version: 1;
  /** Events already fired today (keyed by type:detail). */
  firedToday: Record<string, string>;
  /** Last date we checked (YYYY-MM-DD). */
  lastCheckDate: string;
  /** Count of consecutive journal days. */
  journalStreak: number;
  /** Count of repeated errors in this session. */
  errorCounts: Record<string, number>;
}
