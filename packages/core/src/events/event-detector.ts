/**
 * Event Detector — Ava's proactive awareness system.
 *
 * Scans current state (tasks, journal, memory, errors) and fires events
 * when conditions are met. Not a cron — runs on-demand during normal usage
 * (extension activation, briefing, or explicit check).
 */

import type { TaskManager } from '../tasks/task-manager.js';
import type { JournalManager } from '../journal/journal-manager.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import type { AvaEvent, AvaEventHandler, EventDetectorState } from './types.js';

export class EventDetector {
  private handlers: AvaEventHandler[] = [];
  private state: EventDetectorState;

  constructor() {
    this.state = {
      version: 1,
      firedToday: {},
      lastCheckDate: this.todayDate(),
      journalStreak: 0,
      errorCounts: {},
    };
  }

  /** Register an event handler. */
  on(handler: AvaEventHandler): void {
    this.handlers.push(handler);
  }

  /** Remove an event handler. */
  off(handler: AvaEventHandler): void {
    this.handlers = this.handlers.filter(h => h !== handler);
  }

  /**
   * Run all detectors and fire events.
   * Call this during briefing, activation, or periodically.
   */
  async detect(opts: {
    taskManager?: TaskManager;
    journalManager?: JournalManager;
    memoryManager?: MemoryManager;
  }): Promise<AvaEvent[]> {
    const events: AvaEvent[] = [];
    const today = this.todayDate();

    // Reset if new day
    if (this.state.lastCheckDate !== today) {
      this.state.firedToday = {};
      this.state.lastCheckDate = today;
    }

    // Run detectors in parallel
    const detectors: Promise<AvaEvent[]>[] = [];

    if (opts.taskManager) {
      detectors.push(this.detectTaskEvents(opts.taskManager, today));
    }
    if (opts.journalManager) {
      detectors.push(this.detectJournalEvents(opts.journalManager, today));
    }
    if (opts.memoryManager) {
      detectors.push(this.detectMemoryEvents(opts.memoryManager));
    }

    const results = await Promise.allSettled(detectors);
    for (const result of results) {
      if (result.status === 'fulfilled') {
        events.push(...result.value);
      }
    }

    // Fire handlers for new events only
    for (const event of events) {
      const key = `${event.type}:${event.message.slice(0, 50)}`;
      if (!this.state.firedToday[key]) {
        this.state.firedToday[key] = event.detectedAt;
        for (const handler of this.handlers) {
          try { handler(event); } catch { /* non-fatal */ }
        }
      }
    }

    return events;
  }

  /** Track an error occurrence (call from agent error handler). */
  trackError(errorMessage: string): AvaEvent | null {
    const key = errorMessage.slice(0, 100);
    this.state.errorCounts[key] = (this.state.errorCounts[key] || 0) + 1;

    if (this.state.errorCounts[key] >= 3) {
      const event: AvaEvent = {
        type: 'error_repeated',
        message: `Same error repeated ${this.state.errorCounts[key]} times: ${key}`,
        severity: 'warning',
        detectedAt: new Date().toISOString(),
        data: { error: key, count: this.state.errorCounts[key] },
      };

      for (const handler of this.handlers) {
        try { handler(event); } catch { /* non-fatal */ }
      }

      return event;
    }

    return null;
  }

  /** Reset error counts (e.g. on new session). */
  resetErrors(): void {
    this.state.errorCounts = {};
  }

  // ── Task Detectors ──────────────────────────────────────────────────────────

  private async detectTaskEvents(taskManager: TaskManager, today: string): Promise<AvaEvent[]> {
    const events: AvaEvent[] = [];
    const now = new Date().toISOString();

    try {
      const allTasks = await taskManager.listTasks();

      // Overdue tasks
      const overdue = allTasks.filter(t =>
        t.dueDate && t.dueDate < today &&
        t.status !== 'done' && t.status !== 'archived'
      );

      for (const task of overdue.slice(0, 5)) {
        events.push({
          type: 'task_overdue',
          message: `"${task.title}" was due ${task.dueDate}`,
          severity: task.priority === 'urgent' ? 'urgent' : 'warning',
          detectedAt: now,
          data: { taskId: task.id, title: task.title, dueDate: task.dueDate, priority: task.priority },
        });
      }

      // Due soon (today)
      const dueSoon = allTasks.filter(t =>
        t.dueDate === today &&
        t.status !== 'done' && t.status !== 'archived'
      );

      if (dueSoon.length > 0) {
        events.push({
          type: 'task_due_soon',
          message: `${dueSoon.length} ${dueSoon.length === 1 ? 'task' : 'tasks'} due today`,
          severity: 'info',
          detectedAt: now,
          data: { count: dueSoon.length, tasks: dueSoon.map(t => t.title) },
        });
      }

      // Completion streak (positive reinforcement)
      const yesterday = this.offsetDate(today, -1);
      const completedYesterday = allTasks.filter(t =>
        t.completedAt && t.completedAt.startsWith(yesterday)
      ).length;

      if (completedYesterday >= 3) {
        events.push({
          type: 'tasks_completed_streak',
          message: `You completed ${completedYesterday} tasks yesterday. Keep it up.`,
          severity: 'info',
          detectedAt: now,
          data: { count: completedYesterday },
        });
      }
    } catch { /* non-fatal */ }

    return events;
  }

  // ── Journal Detectors ───────────────────────────────────────────────────────

  private async detectJournalEvents(journalManager: JournalManager, today: string): Promise<AvaEvent[]> {
    const events: AvaEvent[] = [];
    const now = new Date().toISOString();

    try {
      // Check for journal streak
      let streak = 0;
      for (let i = 1; i <= 7; i++) {
        const date = this.offsetDate(today, -i);
        const day = await journalManager.getDay(date);
        if (day?.userEntry) {
          streak++;
        } else {
          break;
        }
      }

      this.state.journalStreak = streak;

      if (streak >= 3) {
        events.push({
          type: 'journal_streak',
          message: `${streak}-day journal streak. Nice consistency.`,
          severity: 'info',
          detectedAt: now,
          data: { streak },
        });
      }

      // Missed journal (had a streak, now broke it)
      if (streak === 0) {
        const twoDaysAgo = this.offsetDate(today, -2);
        const hadEntry = await journalManager.getDay(twoDaysAgo);
        if (hadEntry?.userEntry) {
          events.push({
            type: 'journal_missed',
            message: 'You missed your journal yesterday. Want to write a quick entry?',
            severity: 'info',
            detectedAt: now,
          });
        }
      }
    } catch { /* non-fatal */ }

    return events;
  }

  // ── Memory Detectors ────────────────────────────────────────────────────────

  private async detectMemoryEvents(memoryManager: MemoryManager): Promise<AvaEvent[]> {
    const events: AvaEvent[] = [];
    const now = new Date().toISOString();

    try {
      const store = await memoryManager.loadGlobalStore();
      const staleThreshold = new Date();
      staleThreshold.setDate(staleThreshold.getDate() - 90);

      const staleCount = store.entries.filter(e =>
        !e.archived &&
        new Date(e.updatedAt) < staleThreshold &&
        (!e.lastRecalledAt || new Date(e.lastRecalledAt) < staleThreshold)
      ).length;

      if (staleCount >= 5) {
        events.push({
          type: 'memory_stale',
          message: `${staleCount} memories haven't been used in 90+ days. Want to review and clean up?`,
          severity: 'info',
          detectedAt: now,
          data: { staleCount },
        });
      }
    } catch { /* non-fatal */ }

    return events;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private todayDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private offsetDate(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
}
