// ─── The training log, as a few lines Ava can read ──────────────────────────
//
// She is told to read the log before planning and to say what she SAW rather
// than what the plan asked for. This is what she reads.
//
// Two things it deliberately gets right, because the rules that govern what she
// writes depend on them:
//
//   1. SKIPPED AND UNRECORDED ARE DIFFERENT, and stay different all the way to
//      the prompt. Skipped is a fact somebody entered. Unrecorded is silence —
//      it might have been a brilliant session nobody logged. Collapsing them
//      would let "you have been struggling" be said to someone who simply does
//      not use the log.
//   2. IT REPORTS, IT DOES NOT JUDGE. No "consistency: poor", no completion
//      percentage. Those are scorecards, and a scorecard read back to somebody
//      about their own body is the failure mode this whole feature is built to
//      avoid. Facts, in her words, and the person decides what they mean.
//
// English / model-facing, like summariseCookingTime. Shared by the extension
// host and the IDE sidecar so the two can never drift.

import type { GymSession, GymExercise } from './session-types.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Sets actually recorded, and the heaviest load among them. */
function performed(ex: GymExercise): { sets: number; topWeight: number | null; reps: number[] } {
  const sets = ex.sets ?? [];
  const weights = sets.map((s) => s.weight).filter((w): w is number => typeof w === 'number');
  return {
    sets: sets.length,
    topWeight: weights.length ? Math.max(...weights) : null,
    reps: sets.map((s) => s.reps).filter((r): r is number => typeof r === 'number'),
  };
}

/**
 * "Squat 3×8 @ 40kg (asked 3×8)" — what happened beside what was asked, so she
 * can see completion without being handed a verdict about it.
 */
function describeExercise(ex: GymExercise): string | null {
  if (ex.notes === 'skipped') return `${ex.name} — SKIPPED`;
  const p = performed(ex);
  if (p.sets === 0) return null; // untouched: silence, not a zero

  const did = [`${p.sets} set${p.sets === 1 ? '' : 's'}`];
  if (p.reps.length) {
    const lo = Math.min(...p.reps), hi = Math.max(...p.reps);
    did.push(lo === hi ? `× ${lo}` : `× ${lo}–${hi}`);
  }
  if (p.topWeight != null) did.push(`@ ${p.topWeight}kg`);

  const asked = ex.target_sets != null
    ? ` (asked ${ex.target_sets}×${ex.target_reps ?? '?'}${ex.target_weight ? ` @ ${ex.target_weight}` : ''})`
    : '';
  return `${ex.name} — ${did.join(' ')}${asked}`;
}

/**
 * The recent training log, or null when there is nothing to say.
 *
 * `days` bounds it because the prompt has a budget and because a month-old
 * session says little about this week. Newest first: what happened yesterday
 * matters more than what happened a fortnight ago.
 */
export function summariseTrainingLog(
  sessions: GymSession[],
  todayIso: string,
  days = 21,
): string | null {
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(today)) return null;
  const cutoff = today - days * 86_400_000;

  const recent = (sessions ?? [])
    .filter((s) => {
      const t = Date.parse(`${s.date}T00:00:00Z`);
      return !Number.isNaN(t) && t >= cutoff && t <= today;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!recent.length) return null;

  const lines: string[] = [];
  for (const s of recent) {
    const dow = DAY_NAMES[new Date(`${s.date}T00:00:00Z`).getUTCDay()];
    const parts = (s.exercises ?? []).map(describeExercise).filter(Boolean) as string[];

    // Recorded but empty is worth saying — it is not the same as never having
    // opened it.
    lines.push(parts.length
      ? `${s.date} (${dow})${s.title ? ` ${s.title}` : ''}: ${parts.join('; ')}`
      : `${s.date} (${dow})${s.title ? ` ${s.title}` : ''}: nothing recorded`);
    // Their own words, ALWAYS — including on a session with nothing logged,
    // which is exactly when the note carries the whole story ("lower back
    // tight, cut it short"). An early return here dropped precisely the line
    // that explained why the session was empty.
    if (s.notes) lines.push(`  their note: "${s.notes}"`);
  }

  return `Training log, last ${days} days (newest first). Only sessions they RECORDED appear here — a day that is absent was not necessarily missed, it may simply not have been logged, so never treat absence as evidence:\n${lines.join('\n')}`;
}
