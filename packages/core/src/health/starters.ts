// PORTED FROM THE COMPANION, 28 Jul. Lives in core so the extension and the IDE
// start a curated plan by exactly the same rules — what is stripped, what is
// deliberately NOT adapted, and what provenance the copy claims.
//
/**
 * Starting a curated plan.
 *
 * A curated plan is a TEMPLATE on a shelf. Starting one takes a copy — it does
 * not subscribe to it. From that moment the week belongs to the person: they
 * can swap a movement, change the numbers, duplicate a day, and none of it
 * touches the original. Equally, if the curated plan is later corrected or
 * retired, their week does not change under them halfway through.
 *
 * WHAT MUST NOT COME ACROSS. The template carries nothing personal, and the
 * copy must not invent any: no completion state, no start date from the
 * template, no id. This is the same rule that keeps shopping-list ticks from
 * travelling with a duplicated plan — a stranger's progress is not your
 * progress, and a plan that arrives claiming three sessions are already done
 * is worse than no plan.
 *
 * WHAT IS DELIBERATELY NOT DONE. The plan is copied EXACTLY. It is not adapted
 * to the profile on the way in, even though we know their injuries and their
 * equipment. Three reasons: adapting silently means nobody ever gets the plan
 * that was actually tested; it would cost credits, and free-on-day-one is the
 * whole premise; and the builder ALREADY warns about contraindications and
 * missing kit, with swap one tap away. Tell them, let them choose.
 */
import type { HealthPlanDay, HealthPlanType, HealthPlanSource, HealthPlanStatus } from './types.js';

/**
 * The plan a start produces.
 *
 * Core deliberately holds no full HealthPlan — `profile_snapshot` would drag a
 * concrete HealthProfile into core (see the note atop types.ts). This is
 * exactly the set of fields a start WRITES, and every surface's own HealthPlan
 * satisfies it structurally.
 */
export interface StartedPlan {
  schema_version: 1;
  id: string;
  type: HealthPlanType;
  title: string;
  goal: string | null;
  source: HealthPlanSource;
  status: HealthPlanStatus;
  duration_days: number;
  start_date: string;
  profile_snapshot: null;
  days: HealthPlanDay[];
  created_at: string;
  updated_at: string;
}

/** A row from /api/health/curated-plans. */
export interface CuratedPlanSummary {
  id: string;
  title: string;
  summary: string | null;
  type: 'fitness' | 'meal' | 'combined';
  goal: string | null;
  level: string | null;
  duration_days: number;
  days_per_week: number | null;
  minutes_per_session: number | null;
  tags: string[];
  equipment: string[];
  cover_image_url: string | null;
  /** Orders the shelf. NEVER shown — see the collecting route: it must not
   *  become a vanity number. Popularity is not what someone choosing a month
   *  of training needs to know. */
  start_count: number;
  /** Attached by the list endpoint, so a card can show what people thought
   *  before you commit weeks to it. */
  average_rating?: number | null;
  rating_count?: number;
}

export interface CuratedPlanDetail extends CuratedPlanSummary {
  description: string | null;
  days: HealthPlanDay[];
}

/**
 * Strip a template day back to something nobody has touched.
 *
 * Guards against the template having picked up state it should never hold —
 * a draft that was started from an existing plan in the Hub, say. Cheap
 * insurance against a class of bug that would be invisible until someone
 * opened a brand-new plan and found Tuesday already ticked off.
 */
function cleanDay(day: HealthPlanDay, index: number): HealthPlanDay {
  return {
    day_index: index,
    kind: day?.kind === 'training' || day?.kind === 'active_recovery' ? day.kind : 'rest',
    title: day?.title ?? null,
    training: Array.isArray(day?.training) ? day.training : [],
    meals: Array.isArray(day?.meals) ? day.meals : [],
    notes: day?.notes ?? null,
    // Never inherited — always a fresh start. Written even though core's
    // HealthPlanDay does not declare it: a template that picked completion
    // state up elsewhere must not hand it on, and the surfaces that DO carry
    // the field read it.
    completion: null,
  } as HealthPlanDay;
}


/** One day of a template, and the date the user put it on. */
export interface DayPlacement {
  /** day_index within the TEMPLATE. */
  day_index: number;
  /** YYYY-MM-DD, local. */
  date: string;
}

/**
 * Lay a template out on the dates the user chose.
 *
 * Every day of the plan is placed — training, rest and active recovery alike.
 * Rest is part of the prescription, so a rest day the author wrote stays a day
 * the user has been given, not a gap we infer.
 *
 * A HealthPlanDay carries no date; every surface reads
 * start_date + (day_index - 1). So a sparse placement — Monday, Thursday,
 * Saturday — is expressed by filling the days between with rest, which is what
 * they actually are. The result is an ordinary contiguous plan that the
 * calendar, day view, shopping list and prep plan all handle unchanged.
 *
 * Returns the real start date and the real length, both of which can differ
 * from what was asked for: a three-day plan spread across a week runs six days.
 */
export function planDaysFromPlacements(
  templateDays: HealthPlanDay[],
  placements: DayPlacement[],
): { days: HealthPlanDay[]; startDate: string } | null {
  const byIndex = new Map(templateDays.map(d => [d.day_index, d]));
  const placed = placements
    .filter(p => byIndex.has(p.day_index) && /^\d{4}-\d{2}-\d{2}$/.test(p.date))
    .map(p => ({ day: byIndex.get(p.day_index)!, ms: new Date(`${p.date}T00:00:00`).getTime(), date: p.date }))
    .filter(p => !Number.isNaN(p.ms))
    .sort((a, b) => a.ms - b.ms);

  if (!placed.length) return null;

  // Two of the template's days on one date would mean one silently replacing
  // the other. Refuse rather than pick a winner.
  for (let i = 1; i < placed.length; i++) {
    if (placed[i].ms === placed[i - 1].ms) return null;
  }

  const DAY_MS = 86400000;
  const first = placed[0].ms;
  const out: HealthPlanDay[] = [];

  for (const p of placed) {
    const offset = Math.round((p.ms - first) / DAY_MS);
    // Fill any untouched dates between the last placed day and this one. These
    // are genuinely rest: the user chose not to train on them.
    while (out.length < offset) {
      out.push({
        day_index: out.length + 1,
        kind: 'rest',
        title: null,
        training: [],
        meals: [],
        notes: null,
      } as HealthPlanDay);
    }
    out.push({ ...p.day, day_index: out.length + 1 });
  }

  return { days: out, startDate: placed[0].date };
}

export interface StartOptions {
  /** Defaults to today. Present so back-dating and tests are possible. */
  startDate: string;
  /** Generated by the caller, so this stays pure. */
  id: string;
  now?: string;
  /**
   * Weekdays the person trains, 0=Sunday … 6=Saturday.
   *
   * Superseded by `placements`, which lets the user place EVERY day rather than
   * having us assign sessions to weekdays in order. Kept for callers not yet
   * moved across; `placements` wins when both are given.
   */
  trainingDays?: number[];
  /**
   * A date for every day of the template, chosen by the user.
   *
   * The whole plan is theirs to place — rest days included, because rest is
   * prescribed rather than absent.
   */
  placements?: DayPlacement[];
}

/**
 * Spread a template's sessions across the days somebody actually trains.
 *
 * A template is a sequence — session, session, rest, session. Laid down from a
 * start date it becomes whatever days happen to follow, so a three-session week
 * started on a Wednesday runs Wed/Thu/Fri. For someone who trains Mon/Wed/Fri
 * that is every session on the wrong day, from the first one.
 *
 * The template's own rest days are DROPPED rather than placed as well: they
 * encode the spacing of a week you are not doing, and keeping them alongside
 * your own gaps would rest you twice.
 *
 * Returns days re-indexed from 1, with rest days filling the space between
 * sessions, so the result is still an ordinary contiguous plan — nothing
 * downstream needs to know it was rearranged.
 *
 * ALSO returns the date it actually starts, which is the first chosen weekday
 * on or after `startDate` — not `startDate` itself. Day 1 of a plan is always
 * its start_date, so a plan that skips forward to Saturday must SAY Saturday;
 * keeping the requested Wednesday would put Saturday's session on Wednesday and
 * mislabel every day after it.
 */
/**
 * The profile stores training days as 'mon' | 'tue' | …; placement needs
 * JavaScript weekday numbers. One mapping, here, rather than one per surface —
 * three copies of a lookup like this is how Sunday ends up meaning 0 on two
 * screens and 7 on the third.
 */
const WEEKDAY_NUMBER: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

export function weekdayNumbers(days: readonly string[] | null | undefined): number[] {
  if (!days?.length) return [];
  return [...new Set(
    days.map(d => WEEKDAY_NUMBER[String(d).slice(0, 3).toLowerCase()])
      .filter((n): n is number => typeof n === 'number'),
  )].sort((a, b) => a - b);
}

/**
 * A calendar day as YYYY-MM-DD, in LOCAL terms.
 *
 * NOT toISOString().slice(0,10) — that renders the instant in UTC, so a date
 * built at local midnight comes back as the previous day everywhere east of
 * Greenwich. A plan's dates are calendar days, not moments in time, and must
 * never round-trip through a timezone.
 */
function localYmd(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function placeOnWeekdays(
  days: HealthPlanDay[],
  startDate: string,
  trainingDays: number[],
): { days: HealthPlanDay[]; startDate: string } {
  const wanted = [...new Set(trainingDays)].filter(d => d >= 0 && d <= 6).sort((a, b) => a - b);
  const sessions = days.filter(d => (d?.training?.length ?? 0) > 0);
  // Nothing to place, or nowhere to put it: leave the plan exactly as it was
  // rather than inventing a shape nobody asked for.
  if (!wanted.length || !sessions.length) return { days, startDate };

  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return { days, startDate };

  // Walk forward to the first day they train. At most six days: one of any
  // seven consecutive days matches a non-empty set of weekdays.
  let leadIn = 0;
  while (leadIn < 7) {
    const probe = new Date(start);
    probe.setDate(probe.getDate() + leadIn);
    if (wanted.includes(probe.getDay())) break;
    leadIn++;
  }
  const effectiveStart = new Date(start);
  effectiveStart.setDate(effectiveStart.getDate() + leadIn);

  const out: HealthPlanDay[] = [];
  let placed = 0;
  let offset = 0;
  // A guard, not a limit: seven days per session is the worst case for one
  // training day a week, and the +7 covers a start date that has to wait for
  // the first matching weekday.
  const maxDays = sessions.length * 7 + 7;

  while (placed < sessions.length && offset < maxDays) {
    const d = new Date(effectiveStart);
    d.setDate(d.getDate() + offset);
    const isTrainingDay = wanted.includes(d.getDay());

    if (isTrainingDay) {
      out.push({ ...sessions[placed], day_index: out.length + 1 });
      placed++;
    } else if (out.length > 0) {
      // Rest only BETWEEN sessions — the walk already began on a training day,
      // so there is no leading gap to fill.
      out.push({
        day_index: out.length + 1,
        kind: 'rest',
        title: null,
        training: [],
        meals: [],
        notes: null,
      } as HealthPlanDay);
    }
    offset++;
  }

  return out.length
    ? { days: out, startDate: localYmd(effectiveStart) }
    : { days, startDate };
}

/**
 * Build the local plan a person actually gets.
 *
 * Lands ACTIVE rather than as a draft: the promise is a good week on day one,
 * and a starter sitting in drafts helps nobody. That is only fair because the
 * browse sheet shows the whole plan before the button is pressed — starting is
 * an informed act, not a blind one.
 */
export function planFromCurated(
  curated: CuratedPlanDetail,
  opts: StartOptions,
): StartedPlan {
  const now = opts.now ?? new Date().toISOString();
  const duration = Math.max(1, Number(curated.duration_days) || 1);
  const source = Array.isArray(curated.days) ? curated.days : [];

  // Index by day_index rather than array position: a template with days out of
  // order should not produce a shuffled week.
  const byIndex = new Map<number, HealthPlanDay>();
  for (const d of source) {
    if (d && typeof d.day_index === 'number') byIndex.set(d.day_index, d);
  }

  const sequential: HealthPlanDay[] = Array.from({ length: duration }, (_, i) => {
    const found = byIndex.get(i + 1);
    return found
      ? cleanDay(found, i + 1)
      : cleanDay({ day_index: i + 1, kind: 'rest', title: null, training: [], meals: [], notes: null } as HealthPlanDay, i + 1);
  });

  // Onto the days they actually train, when they have told us which.
  // The user's own placement first: every day on the date they chose.
  const placed =
    (opts.placements?.length ? planDaysFromPlacements(sequential, opts.placements) : null)
    ?? (opts.trainingDays?.length
      ? placeOnWeekdays(sequential, opts.startDate, opts.trainingDays)
      : { days: sequential, startDate: opts.startDate });
  const days = placed.days;

  return {
    schema_version: 1,
    id: opts.id,
    type: curated.type,
    title: curated.title,
    goal: curated.goal,
    // Its own provenance. "Ava wrote this for you" and "this is a
    // professionally built starter" are different claims and a plan card
    // should not show them identically.
    source: 'curated',
    status: 'active',
    // The REAL length after placement — spreading three sessions across a
    // Mon/Wed/Fri week takes five days, not three, and a plan claiming its
    // template's duration would end before its own last session.
    duration_days: days.length,
    // The date it ACTUALLY begins. Placing onto chosen weekdays can move it
    // forward to the first of them, and day 1 is always start_date.
    start_date: placed.startDate,
    // The template has no profile behind it — it was written for strangers.
    // Claiming a snapshot would be inventing one.
    profile_snapshot: null,
    days,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Order the shelf for THIS person.
 *
 * Their stated goal first, then whatever others exist. Not a filter: someone
 * whose profile says muscle gain should still be able to see the recovery
 * week, because the reason they need it may be the reason they stopped
 * training. Sorting answers "what is most likely for you" without hiding
 * anything.
 */
export function orderForProfile(
  plans: CuratedPlanSummary[],
  primaryGoal: string | null,
): CuratedPlanSummary[] {
  if (!primaryGoal) return plans;
  return [...plans].sort((a, b) => {
    const am = a.goal === primaryGoal ? 0 : 1;
    const bm = b.goal === primaryGoal ? 0 : 1;
    return am - bm;
  });
}

/** "3 days · 2 sessions" — what the week actually asks of you, counted from
 *  the plan rather than from what it claims about itself. */
export function shapeOf(days: HealthPlanDay[]): { training: number; rest: number; exercises: number } {
  let training = 0, rest = 0, exercises = 0;
  for (const d of days ?? []) {
    if ((d?.training?.length ?? 0) > 0) training++; else rest++;
    exercises += d?.training?.length ?? 0;
  }
  return { training, rest, exercises };
}
