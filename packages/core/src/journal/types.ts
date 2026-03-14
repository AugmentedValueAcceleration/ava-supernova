/** Mood rating 1-5 (1 = low, 5 = great). */
export type JournalMood = 1 | 2 | 3 | 4 | 5;

/** A single journal entry (user or Ava). */
export interface JournalEntry {
  content: string;
  mood?: JournalMood;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

/** One day's journal — both perspectives. */
export interface JournalDay {
  version: 1;
  date: string; // YYYY-MM-DD
  userEntry: JournalEntry | null;
  avaEntry: JournalEntry | null;
}

/** Lightweight summary for calendar dot indicators. */
export interface JournalDaySummary {
  date: string;
  hasUserEntry: boolean;
  hasAvaEntry: boolean;
  mood?: JournalMood;
}

/** Create an empty journal day. */
export function createEmptyJournalDay(date: string): JournalDay {
  return { version: 1, date, userEntry: null, avaEntry: null };
}
