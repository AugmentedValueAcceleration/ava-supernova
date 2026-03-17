/**
 * Daily Briefing — Types for Ava's proactive morning greeting.
 *
 * The briefing gathers tasks, journal, memory, and time context
 * to produce a natural, context-aware greeting when the user starts their day.
 */

import type { TaskEntry } from '../tasks/types.js';
import type { JournalDay } from '../journal/types.js';
import type { MemoryEntry } from '../memory/types.js';

/** Time-of-day segment for greeting tone. */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

/** Raw data gathered before formatting. */
export interface BriefingData {
  /** Current date (YYYY-MM-DD). */
  date: string;
  /** Time of day for greeting tone. */
  timeOfDay: TimeOfDay;
  /** Day of week (e.g. "Monday"). */
  dayOfWeek: string;
  /** Tasks due today or currently in-progress. */
  todayTasks: TaskEntry[];
  /** Tasks past their due date and not done. */
  overdueTasks: TaskEntry[];
  /** Yesterday's journal (user + Ava entries). */
  yesterdayJournal: JournalDay | null;
  /** Recent memory entries (last 5, most relevant). */
  recentMemories: MemoryEntry[];
  /** Total active tasks (not archived/done). */
  totalActiveTasks: number;
  /** Tasks completed yesterday. */
  completedYesterday: number;
}

/** The formatted briefing ready for display. */
export interface Briefing {
  /** The natural-language greeting text (markdown). */
  text: string;
  /** Raw data used to generate the briefing (for UI widgets). */
  data: BriefingData;
  /** When this briefing was generated (ISO 8601). */
  generatedAt: string;
}

/** Persistent state to avoid repeating briefings. */
export interface BriefingState {
  /** Last date a briefing was shown (YYYY-MM-DD). */
  lastBriefingDate: string | null;
  /** Last time a briefing was shown (ISO 8601). */
  lastBriefingAt: string | null;
}
