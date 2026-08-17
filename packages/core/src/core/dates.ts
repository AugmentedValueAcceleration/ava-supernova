/**
 * Calendar days, in the terms the person using Ava lives in.
 *
 * `new Date().toISOString().slice(0, 10)` renders an INSTANT in UTC. A
 * calendar day is not an instant — it is where somebody is standing — and the
 * two disagree for most of the world for part of every day:
 *
 *   New York, 20:00 on the 17th   → UTC is the 18th. "Due today" hides today's
 *                                   tasks and shows tomorrow's.
 *   Sydney,   08:00 on the 18th   → UTC is the 17th. Today's tasks are missing
 *                                   until mid-morning.
 *   London in summer, 00:30       → UTC is still yesterday. The journal files
 *                                   the entry under the wrong day, and the
 *                                   briefing thinks it has already run.
 *
 * That last one is why this went unnoticed: on GMT it is right, and on BST it
 * is only wrong for an hour after midnight — which is exactly when nobody is
 * checking, and exactly when this project tends to be worked on.
 *
 * Use this for anything a person would call a day: a journal entry, a due
 * date, a plan's dates, a date printed into a document. Keep toISOString for
 * anything that is genuinely a moment — a log timestamp, an audit row, a
 * partition key — where UTC is the point rather than the mistake.
 */

/** A Date rendered as YYYY-MM-DD in the LOCAL timezone. */
export function localYmd(d: Date = new Date()): string {
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Today, locally, as YYYY-MM-DD. */
export function todayLocal(): string {
  return localYmd();
}

/** `days` from today (negative for the past), locally, as YYYY-MM-DD.
 *
 *  Adds to the DATE rather than to the millisecond value, so it stays correct
 *  across a daylight-saving boundary — where a day is 23 or 25 hours long and
 *  adding 86,400,000ms lands on the wrong date or the same one twice. */
export function addDaysLocal(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localYmd(d);
}
