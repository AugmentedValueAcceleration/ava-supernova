/**
 * Today, as the person using Ava would say it.
 *
 * A deliberate copy of core's `localYmd` — the webview is a browser bundle and
 * does not depend on @ava/core, the same reason secret-patterns.ts is
 * duplicated here. core/src/core/dates.ts is the source of truth; if this ever
 * needs changing, change it there first.
 *
 * `new Date().toISOString().slice(0, 10)` renders an INSTANT in UTC, and a
 * calendar day is not an instant. In New York at 20:00 it already says
 * tomorrow; in London at 00:30 in summer it still says yesterday. Due dates
 * are compared as strings against exactly this format, so getting it wrong
 * hides today's tasks and shows tomorrow's.
 */
export function todayLocal(d: Date = new Date()): string {
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}
