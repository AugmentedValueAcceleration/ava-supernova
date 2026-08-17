/**
 * Daily Briefing Engine — Ava's proactive morning greeting.
 *
 * Gathers context from tasks, journal, memory, and time to produce
 * a natural, personalised greeting when the user opens the extension or CLI.
 *
 * This is the JARVIS transition — Ava stops being reactive and becomes proactive.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TaskManager } from '../tasks/task-manager.js';
import type { JournalManager } from '../journal/journal-manager.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import type { MemoryEntry } from '../memory/types.js';
import type { BriefingData, Briefing, BriefingState, TimeOfDay } from './types.js';
import { localYmd, todayLocal } from '../core/dates.js';

const BRIEFING_STATE_FILE = 'briefing-state.json';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export class BriefingEngine {
  private readonly globalDir: string;
  private state: BriefingState | null = null;

  constructor(opts: { globalDir: string }) {
    this.globalDir = opts.globalDir;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Check whether a briefing should be shown right now.
   * Returns true if no briefing has been shown today.
   */
  async shouldShowBriefing(): Promise<boolean> {
    const state = await this.loadState();
    const today = this.todayDate();
    return state.lastBriefingDate !== today;
  }

  /**
   * Generate a full daily briefing from all available context.
   * Call this only after shouldShowBriefing() returns true.
   */
  async generateBriefing(
    taskManager: TaskManager,
    journalManager: JournalManager,
    memoryManager: MemoryManager,
  ): Promise<Briefing> {
    const data = await this.gatherData(taskManager, journalManager, memoryManager);
    const text = this.formatBriefing(data);

    // Mark briefing as shown
    await this.markShown();

    return {
      text,
      data,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate briefing data without marking as shown.
   * Useful for previewing or refreshing the dashboard widget.
   */
  async generateBriefingData(
    taskManager: TaskManager,
    journalManager: JournalManager,
    memoryManager: MemoryManager,
  ): Promise<BriefingData> {
    return this.gatherData(taskManager, journalManager, memoryManager);
  }

  /** Reset briefing state (for testing or manual refresh). */
  async reset(): Promise<void> {
    this.state = { lastBriefingDate: null, lastBriefingAt: null };
    await this.saveState(this.state);
  }

  // ── Data Gathering ──────────────────────────────────────────────────────────

  private async gatherData(
    taskManager: TaskManager,
    journalManager: JournalManager,
    memoryManager: MemoryManager,
  ): Promise<BriefingData> {
    const now = new Date();
    const today = this.todayDate();
    const yesterday = this.offsetDate(today, -1);

    // Gather all data in parallel
    const [
      todayTasks,
      allTasks,
      yesterdayJournal,
      recentMemories,
    ] = await Promise.all([
      taskManager.getTodayTasks(),
      taskManager.listTasks(),
      journalManager.getDay(yesterday),
      this.getRecentMemories(memoryManager),
    ]);

    // Find overdue tasks (due before today, not done/archived)
    const overdueTasks = allTasks.filter(t =>
      t.dueDate &&
      t.dueDate < today &&
      t.status !== 'done' &&
      t.status !== 'archived'
    );

    // Count tasks completed yesterday
    const completedYesterday = allTasks.filter(t =>
      t.completedAt && t.completedAt.startsWith(yesterday)
    ).length;

    // Total active (not done/archived)
    const totalActiveTasks = allTasks.filter(t =>
      t.status !== 'done' && t.status !== 'archived'
    ).length;

    return {
      date: today,
      timeOfDay: this.getTimeOfDay(now),
      dayOfWeek: DAYS[now.getDay()],
      todayTasks,
      overdueTasks,
      yesterdayJournal,
      recentMemories,
      totalActiveTasks,
      completedYesterday,
    };
  }

  private async getRecentMemories(memoryManager: MemoryManager): Promise<MemoryEntry[]> {
    try {
      const globalStore = await memoryManager.loadGlobalStore();
      const projectStore = await memoryManager.loadProjectStore();

      const allEntries = [
        ...globalStore.entries,
        ...(projectStore?.entries ?? []),
      ];

      // Sort by most recently updated, take top 5 non-archived
      return allEntries
        .filter(e => !e.archived)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5);
    } catch {
      return [];
    }
  }

  // ── Formatting ──────────────────────────────────────────────────────────────

  private formatBriefing(data: BriefingData): string {
    const parts: string[] = [];

    // Greeting
    parts.push(this.formatGreeting(data));

    // Tasks overview
    const taskSection = this.formatTasks(data);
    if (taskSection) parts.push(taskSection);

    // Yesterday's journal
    const journalSection = this.formatJournal(data);
    if (journalSection) parts.push(journalSection);

    // Recent memory context
    const memorySection = this.formatMemories(data);
    if (memorySection) parts.push(memorySection);

    // Closing
    parts.push(this.formatClosing(data));

    return parts.join('\n\n');
  }

  private formatGreeting(data: BriefingData): string {
    const greetings: Record<TimeOfDay, string[]> = {
      morning: ['Good morning.', 'Morning.'],
      afternoon: ['Good afternoon.', 'Afternoon.'],
      evening: ['Good evening.', 'Evening.'],
      night: ['Burning the midnight oil.', 'Late one tonight.'],
    };

    const options = greetings[data.timeOfDay];
    const greeting = options[Math.floor(Math.random() * options.length)];

    return `${greeting} It's ${data.dayOfWeek}.`;
  }

  private formatTasks(data: BriefingData): string | null {
    const lines: string[] = [];

    // Overdue first — these need attention
    if (data.overdueTasks.length > 0) {
      const count = data.overdueTasks.length;
      lines.push(`**${count} overdue ${count === 1 ? 'task' : 'tasks'}** need attention:`);
      for (const task of data.overdueTasks.slice(0, 3)) {
        const priority = task.priority === 'urgent' || task.priority === 'high' ? ` [${task.priority}]` : '';
        lines.push(`- ${task.title}${priority} (due ${task.dueDate})`);
      }
      if (data.overdueTasks.length > 3) {
        lines.push(`- ...and ${data.overdueTasks.length - 3} more`);
      }
    }

    // Today's tasks
    if (data.todayTasks.length > 0) {
      if (lines.length > 0) lines.push('');
      const count = data.todayTasks.length;
      lines.push(`**${count} ${count === 1 ? 'task' : 'tasks'} for today:**`);
      for (const task of data.todayTasks.slice(0, 5)) {
        const status = task.status === 'in-progress' ? ' (in progress)' : '';
        lines.push(`- ${task.title}${status}`);
      }
      if (data.todayTasks.length > 5) {
        lines.push(`- ...and ${data.todayTasks.length - 5} more`);
      }
    }

    // Completed yesterday (positive reinforcement)
    if (data.completedYesterday > 0) {
      if (lines.length > 0) lines.push('');
      lines.push(`You completed ${data.completedYesterday} ${data.completedYesterday === 1 ? 'task' : 'tasks'} yesterday.`);
    }

    // Nothing at all
    if (lines.length === 0 && data.totalActiveTasks === 0) {
      return null;
    }

    if (lines.length === 0) {
      lines.push(`${data.totalActiveTasks} active ${data.totalActiveTasks === 1 ? 'task' : 'tasks'} across your boards. Nothing due today.`);
    }

    return lines.join('\n');
  }

  private formatJournal(data: BriefingData): string | null {
    if (!data.yesterdayJournal) return null;

    const entries = data.yesterdayJournal.entries;
    const userEntry = entries.find((e) => e.author === 'user');
    const entry = userEntry ?? entries[0];
    if (!entry) return null;

    // Extract first meaningful line as a summary
    const content = entry.content.trim();
    const firstLine = content.split('\n')[0].slice(0, 120);
    const source = userEntry ? 'your journal' : "yesterday's session";

    return `From ${source}: "${firstLine}"${content.length > 120 ? '...' : ''}`;
  }

  private formatMemories(data: BriefingData): string | null {
    if (data.recentMemories.length === 0) return null;

    // Only surface the most recent memory as context for "where you left off"
    const latest = data.recentMemories[0];
    const content = latest.content.split('\n')[0].slice(0, 100);
    return `Last thing on your mind: ${content}${latest.content.length > 100 ? '...' : ''}`;
  }

  private formatClosing(data: BriefingData): string {
    // Context-aware closing
    if (data.overdueTasks.length > 0) {
      return 'Want to tackle the overdue items first, or pick up where you left off?';
    }

    if (data.todayTasks.length > 0) {
      const first = data.todayTasks[0];
      if (first.status === 'in-progress') {
        return `You were working on "${first.title}". Want to continue?`;
      }
      return 'Ready when you are.';
    }

    return 'What are we working on today?';
  }

  // ── Time Helpers ────────────────────────────────────────────────────────────

  private getTimeOfDay(date: Date): TimeOfDay {
    const hour = date.getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
  }

  private todayDate(): string {
    return todayLocal();
  }

  private offsetDate(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return localYmd(d);
  }

  // ── State Persistence ───────────────────────────────────────────────────────

  private async loadState(): Promise<BriefingState> {
    if (this.state) return this.state;

    const filePath = join(this.globalDir, BRIEFING_STATE_FILE);
    if (!existsSync(filePath)) {
      this.state = { lastBriefingDate: null, lastBriefingAt: null };
      return this.state;
    }

    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      // Validate shape — don't trust corrupted state
      if (typeof parsed === 'object' && parsed !== null &&
          (parsed.lastBriefingDate === null || typeof parsed.lastBriefingDate === 'string')) {
        this.state = parsed as BriefingState;
        return this.state;
      }
      // Invalid shape — reset
      this.state = { lastBriefingDate: null, lastBriefingAt: null };
      return this.state;
    } catch {
      this.state = { lastBriefingDate: null, lastBriefingAt: null };
      return this.state;
    }
  }

  private async markShown(): Promise<void> {
    const now = new Date();
    this.state = {
      lastBriefingDate: localYmd(now),
      lastBriefingAt: now.toISOString(),
    };
    await this.saveState(this.state);
  }

  private async saveState(state: BriefingState): Promise<void> {
    await mkdir(this.globalDir, { recursive: true });
    const filePath = join(this.globalDir, BRIEFING_STATE_FILE);
    // Atomic write with lock — prevents race between show and persist
    const { withLock } = await import('../core/file-lock.js');
    await withLock(filePath, async () => {
      const tmpPath = filePath + '.tmp';
      await writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
      const { rename } = await import('node:fs/promises');
      await rename(tmpPath, filePath);
    });
  }
}
