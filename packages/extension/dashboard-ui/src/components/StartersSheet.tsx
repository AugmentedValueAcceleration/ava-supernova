// ─── Starter plans ──────────────────────────────────────────────────────────
//
// A shelf of plans somebody can start on day one, for free, without describing
// themselves to anything first. The alternative — an empty builder and a blank
// week — is where most people stop.
//
// Starting takes a COPY. It does not subscribe. From that moment the week
// belongs to them: swap a movement, change the numbers, none of it touches the
// original — and if the template is later corrected or retired, their week does
// not change under them halfway through.
//
// The copy rules (what is stripped, what provenance the copy claims, what is
// deliberately NOT adapted) live in @ava/core health/starters, shared with the
// IDE. This file shows the shelf and asks.

import { useState, useEffect, useMemo } from 'react';
import { t, useLocale } from '../i18n';
import { Icon } from './Icon';
import { Sheet } from './ShoppingListSheet';
import { DateField } from './DateField';
import { planFromCurated, orderForProfile, shapeOf, weekdayNumbers } from '../../../../core/dist/health/starters.js';
import type { CuratedPlanSummary, CuratedPlanDetail, HealthPlan, HealthProfile } from '../types/messages';

/** YYYY-MM-DD in LOCAL terms. NOT toISOString().slice(0,10) — that renders the
 *  instant in UTC, so local midnight comes back as yesterday east of Greenwich
 *  and the plan starts a day early. */
function localYmd(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localYmd(d);
}

/** The next Monday strictly after today — "next Monday" on a Monday means the
 *  one coming, not this morning. */
function nextMonday(from: string): string {
  const d = new Date(`${from}T00:00:00`);
  const delta = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return localYmd(d);
}

function durationLabel(days: number): string {
  if (days === 1) return t('health.starters.single_session');
  if (days === 7) return t('health.starters.one_week');
  return `${days} ${t('health.starters.days')}`;
}

export function StartersSheet({
  plans, loading, error, detail, detailLoading, profile,
  onLoad, onLoadDetail, onStart, onClose, initialOpenId = null,
}: {
  plans: CuratedPlanSummary[];
  loading: boolean;
  error: string | null;
  /** The open template, in full. Nobody starts a plan they have not seen. */
  detail: CuratedPlanDetail | null;
  detailLoading: boolean;
  profile: HealthProfile | null;
  onLoad: () => void;
  onLoadDetail: (id: string) => void;
  /** Saves the copy and reports the start. The caller owns id generation and
   *  persistence, which keeps the copy rules themselves pure. */
  onStart: (plan: HealthPlan, curatedId: string) => void;
  onClose: () => void;
  /** Opened straight onto this template — a card on the shelf leads to the
   *  plan it shows, not back to a list of all of them. */
  initialOpenId?: string | null;
}) {
  useLocale();
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [starting, setStarting] = useState(false);

  useEffect(() => { if (!plans.length && !loading && !error) onLoad(); }, [plans.length, loading, error, onLoad]);

  // Their stated goal first — NOT a filter. Somebody whose profile says muscle
  // gain should still see the recovery week, because the reason they need it
  // may be the reason they stopped training.
  const ordered = useMemo(
    () => orderForProfile(plans, profile?.goals?.primary ?? null),
    [plans, profile],
  );

  const open = openId && detail?.id === openId ? detail : null;

  // ── One template, in full ───────────────────────────────────────────────
  if (openId) {
    return (
      <Sheet
        title={t('health.starters.title')}
        subtitle={null}
        onClose={onClose}
      >
        <button
          type="button"
          onClick={() => setOpenId(null)}
          className="mb-3 cursor-pointer border-none bg-transparent text-[11px] text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          ← {t('health.starters.back')}
        </button>

        <StarterDetailBody
          open={open}
          detailLoading={detailLoading}
          profile={profile}
          starting={starting}
          onStart={(placements) => {
            if (!open || starting) return;
            setStarting(true);
            const plan = planFromCurated(open, {
              id: `plan${Date.now()}${Math.floor(Math.random() * 1000)}`,
              // start_date is derived from the earliest placement; this is the
              // fallback for a template with nothing placeable in it.
              startDate: placements[0]?.date ?? localYmd(new Date()),
              placements,
            });
            onStart(plan as unknown as HealthPlan, open.id);
            onClose();
          }}
        />
      </Sheet>
    );
  }

  // ── The shelf ───────────────────────────────────────────────────────────
  return (
    <Sheet title={t('health.starters.title')} subtitle={t('health.starters.subtitle')} onClose={onClose}>
      {loading ? (
        <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">{t('health.starters.loading')}</div>
      ) : error ? (
        <div className="py-10 text-center">
          <p className="text-[12px] text-[var(--text-muted)]">{t('health.starters.failed')}</p>
          <button type="button" onClick={onLoad}
            className="mt-2 cursor-pointer border-none bg-transparent text-[11px] text-[var(--accent)]">
            {t('health.starters.retry')}
          </button>
        </div>
      ) : !ordered.length ? (
        <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">{t('health.starters.empty')}</div>
      ) : (
        <ul className="space-y-2">
          {ordered.map(p => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => { setOpenId(p.id); onLoadDetail(p.id); }}
                className="flex w-full cursor-pointer gap-3 rounded-lg border border-[var(--border)] bg-transparent p-3 text-left transition hover:border-[var(--accent)]/40"
              >
                {p.cover_image_url && (
                  <img src={p.cover_image_url} alt=""
                    className="h-14 w-14 shrink-0 rounded-lg border border-[var(--border)] object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-[var(--text-primary)]">{p.title}</span>
                  {p.summary && <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--text-muted)]">{p.summary}</span>}
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    {[
                      durationLabel(p.duration_days),
                      p.days_per_week ? `${p.days_per_week}/wk` : null,
                      p.level,
                      // start_count is NOT shown. It exists to order the shelf,
                      // and the route that collects it says so in as many words:
                      // "it cannot be a vanity number shown to users". The
                      // companion does not show it either.
                    ].filter(Boolean).map(bit => (
                      <span key={bit as string} className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{bit}</span>
                    ))}
                  </span>
                </span>
                <Icon.fitness size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/**
 * The shelf itself — cards, on the page, not behind a button.
 *
 * Shares its helpers with the sheet above rather than restating them: the
 * duration wording and the profile ordering are the same decisions whether you
 * are browsing or committing, and two copies of them is how they drift.
 */
export function StarterShelf({
  plans, loading, error, profile, onOpen, onLoad,
}: {
  plans: CuratedPlanSummary[];
  loading: boolean;
  error: string | null;
  profile: HealthProfile | null;
  onOpen: (id: string) => void;
  onLoad: () => void;
}) {
  useLocale();
  useEffect(() => { if (!plans.length && !loading && !error) onLoad(); }, [plans.length, loading, error, onLoad]);

  // Their stated goal first, NOT a filter — the same rule the sheet uses, and
  // for the same reason: the week someone needs may be the one they would not
  // have gone looking for.
  const ordered = useMemo(
    () => orderForProfile(plans, profile?.goals?.primary ?? null),
    [plans, profile],
  );

  if (error) return null;
  if (!loading && !ordered.length) return null;

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-medium text-[var(--text-primary)]">{t('health.starters.shelf_title')}</h3>
        <span className="text-[10px] text-[var(--text-muted)]">{t('health.starters.shelf_hint')}</span>
      </div>

      {loading && !ordered.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-[132px] animate-pulse rounded-lg border border-[var(--border)] bg-[var(--bg-input)]/40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpen(p.id)}
                className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-transparent text-left transition hover:border-[var(--accent)]/40"
              >
                <span className="flex h-[74px] w-full items-center justify-center overflow-hidden bg-black/20">
                  {p.cover_image_url
                    ? <img src={p.cover_image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    : <Icon.fitness size={18} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col p-2.5">
                  <span className="block truncate text-[12px] font-medium text-[var(--text-primary)]">{p.title}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {[
                      durationLabel(p.duration_days),
                      p.days_per_week ? `${p.days_per_week}/wk` : null,
                      p.minutes_per_session ? `${p.minutes_per_session} min` : null,
                    ].filter(Boolean).map(bit => (
                      <span key={bit as string} className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">{bit}</span>
                    ))}
                  </span>
                  {/* Rating where there is one; the start count regardless.
                      A plan nobody has rated yet has only the second, and
                      "0/5" on its own reads as judged rather than as new. */}
                  <span className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                    <span style={{ color: p.average_rating ? '#fbbf24' : 'var(--text-muted)' }}>{'\u2605'}</span>
                    {p.average_rating ?? 0}/5
                    {p.rating_count ? ` (${p.rating_count})` : ''}
                    {p.start_count > 0 && (
                      <span className="ml-1.5 border-l border-[var(--border)] pl-1.5">
                        {t('health.starters.started', { count: p.start_count })}
                      </span>
                    )}
                  </span>
                </span>
              </button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One ready-made plan, in full — the same content whether it is shown in a
 * sheet (the "New plan" flow) or in page (the room's Ready-made tab, where a
 * recipe or an exercise would appear the same way).
 *
 * Extracted rather than written twice: the copy note, the "not adapted" note,
 * the day list and the start picker are all decisions about what somebody is
 * agreeing to, and two copies of that is how one of them ends up out of date.
 */
export function StarterDetailBody({
  open, detailLoading, profile, starting, onStart, onOpenExercise, thumbnails,
}: {
  open: CuratedPlanDetail | null;
  detailLoading: boolean;
  profile: HealthProfile | null;
  starting: boolean;
  /** A date for every session, in template order. Rest is derived from the
   *  gaps, so it is not passed. */
  onStart: (placements: Array<{ day_index: number; date: string }>) => void;
  /** Opens the catalogue exercise behind a movement. Omitted where there is
   *  nowhere to show one — a row that looks like a link and does nothing is
   *  worse than a row that does not look like one. */
  onOpenExercise?: (slug: string) => void;
  /** Exercise pictures by slug, fetched with the plan. Absent is fine: the
   *  rows fall back to a placeholder rather than reserving empty space. */
  thumbnails?: Record<string, string | null>;
}) {
  useLocale();
  const today = localYmd(new Date());

  /** The days you actually DO something: training and active recovery. Plain
   *  rest is not placed — it is what the gaps between these already mean. */
  const sessions = useMemo(
    () => (open?.days ?? []).filter(d => d.kind !== 'rest'),
    [open],
  );

  /** date per template day_index. Seeded from the profile's training days so
   *  most people confirm rather than fill anything in. */
  const [dates, setDates] = useState<Record<number, string>>({});
  /** Rows the user has moved by hand. A later default must not shove these. */
  const [pinned, setPinned] = useState<Set<number>>(new Set());

  const weekdays = useMemo(
    () => weekdayNumbers(profile?.training?.training_days),
    [profile],
  );

  // Seed once per plan: walk forward from today, dropping each session on the
  // next day they train. With no training days on file, consecutive days —
  // which is what the plan itself assumes.
  useEffect(() => {
    if (!sessions.length) return;
    setPinned(new Set());
    const seeded: Record<number, string> = {};
    let cursor = today;
    for (const d of sessions) {
      if (weekdays.length) {
        let guard = 0;
        while (guard < 14 && !weekdays.includes(new Date(`${cursor}T00:00:00`).getDay())) {
          cursor = addDays(cursor, 1);
          guard++;
        }
      }
      seeded[d.day_index] = cursor;
      cursor = addDays(cursor, 1);
    }
    setDates(seeded);
  }, [open?.id, sessions.length]);

  const setOne = (dayIndex: number, value: string) => {
    setPinned(prev => new Set(prev).add(dayIndex));
    setDates(prev => ({ ...prev, [dayIndex]: value }));
  };

  /** Shift everything that has NOT been placed by hand, keeping the spacing. */
  const shiftTo = (firstDate: string) => {
    const first = sessions[0];
    if (!first) return;
    const oldFirst = dates[first.day_index];
    if (!oldFirst) return;
    const delta = Math.round(
      (new Date(`${firstDate}T00:00:00`).getTime() - new Date(`${oldFirst}T00:00:00`).getTime()) / 86400000,
    );
    if (!delta) return;
    setDates(prev => {
      const next = { ...prev };
      for (const d of sessions) {
        if (pinned.has(d.day_index) && d.day_index !== first.day_index) continue;
        const cur = prev[d.day_index];
        if (cur) next[d.day_index] = addDays(cur, delta);
      }
      return next;
    });
  };

  const chosen = sessions.map(d => dates[d.day_index]).filter(Boolean) as string[];
  const clash = new Set(chosen).size !== chosen.length;
  const sorted = [...chosen].sort();
  const spanDays = sorted.length
    ? Math.round((new Date(`${sorted[sorted.length - 1]}T00:00:00`).getTime() - new Date(`${sorted[0]}T00:00:00`).getTime()) / 86400000) + 1
    : 0;
  const shape = open ? shapeOf(open.days) : null;

  return (
    <>
      {!open ? (
        <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">
          {detailLoading ? t('health.starters.loading') : t('health.starters.failed')}
        </div>
      ) : (
        <div className="space-y-4">
          {/* The plan's own identity. This used to be supplied by the sheet's
              chrome, so the in-page view had no name on it — a screen for
              choosing between plans that never said which one you were reading. */}
          <header>
            <h2 className="text-[22px] font-light leading-tight text-vscode-foreground">{open.title}</h2>
            {open.summary && (
              <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">{open.summary}</p>
            )}
            {open.goal && (
              <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.3em] text-[var(--accent)]">{open.goal.replace(/_/g, ' ')}</div>
            )}
          </header>

          <div className="flex flex-wrap gap-1.5">
            {[
              durationLabel(open.duration_days),
              shape ? `${shape.training} ${t('health.starters.sessions')}` : null,
              shape && shape.rest > 0 ? `${shape.rest} ${t('health.starters.rest_days')}` : null,
              open.minutes_per_session ? `${open.minutes_per_session} ${t('health.starters.minutes')}` : null,
            ].filter(Boolean).map(bit => (
              <span key={bit as string} className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-[10px] text-[var(--text-muted)]">{bit}</span>
            ))}
          </div>

          {open.description ? (
            <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{open.description}</p>
          ) : shape ? (
            /* Every published template has a null description. Rather than show
               a gap, say what the week actually asks of you — which is the thing
               somebody choosing a plan needs to know anyway. */
            <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {t('health.starters.shape_summary', {
                sessions: shape.training,
                exercises: shape.exercises,
                days: open.duration_days,
              })}
            </p>
          ) : null}

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('health.starters.equipment')}</div>
            <p className="text-[12px] text-[var(--text-secondary)]">
              {open.equipment.length ? open.equipment.join(', ') : t('health.starters.no_equipment')}
            </p>
          </div>

          {/* The whole week, before the button. Starting is then an informed
              act rather than a blind one — which is what makes landing it
              ACTIVE rather than as a draft defensible. */}
          <ul className="space-y-1">
            {open.days.map(d => {
              const rest = (d.training?.length ?? 0) === 0;
              return (
                <li key={d.day_index} className="rounded-lg border border-[var(--border)] px-3 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-[12px] text-[var(--text-primary)]">
                      {t('health.starters.day')} {d.day_index}{d.title ? ` — ${d.title}` : ''}
                    </span>
                    <span className={`shrink-0 text-[11px] ${rest ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}`}>
                      {rest ? t('health.starters.rest') : `${d.training.length} ${t('health.starters.exercises')}`}
                    </span>
                  </div>
                  {/* The movements themselves. Nobody commits a month of
                      training on the strength of a count, and sets/reps come
                      with the name because "Squat 5 x 5" and "Squat 3 x 12"
                      are different plans. */}
                  {!rest && (
                    <ul className="mt-2 space-y-1">
                      {d.training.map((ex, i) => {
                        const slug = ex.ref?.slug;
                        const canOpen = !!slug && !!onOpenExercise;
                        const numbers = [
                          ex.sets && ex.reps ? `${ex.sets} × ${ex.reps}` : ex.sets ? `${ex.sets}` : ex.reps,
                          ex.rest_seconds ? t('health.starters.rest_seconds', { seconds: ex.rest_seconds }) : null,
                          ex.tempo,
                        ].filter(Boolean).join(' · ');
                        const Row = canOpen ? 'button' : 'div';
                        return (
                          <li key={ex.id ?? i}>
                            {/* Tapping opens the catalogue exercise — the demo,
                                the muscles, the cues, the contraindications.
                                A name on its own tells somebody nothing about
                                whether they can do it. */}
                            <Row
                              {...(canOpen ? { type: 'button' as const, onClick: () => onOpenExercise!(slug!) } : {})}
                              className={`flex w-full gap-2.5 rounded-md px-2 py-1.5 text-left transition ${
                                canOpen
                                  ? 'cursor-pointer border border-transparent bg-transparent hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5'
                                  : ''
                              }`}
                            >
                              {/* The movement's own picture, from the catalogue.
                                  A name alone tells somebody nothing about a
                                  movement they have never done. */}
                              <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-black/20">
                                {slug && thumbnails?.[slug] && (
                                  <img src={thumbnails[slug]!} alt="" className="h-full w-full object-cover" loading="lazy" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                              <span className="flex items-baseline justify-between gap-3">
                                <span className="min-w-0 text-[12px] text-[var(--text-primary)] first-letter:uppercase">
                                  {ex.name}
                                  {canOpen && <span className="ml-1.5 text-[10px] text-[var(--accent)]">›</span>}
                                </span>
                                {numbers && <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{numbers}</span>}
                              </span>
                              {/* The cue the plan wrote for this movement — why
                                  it is here rather than another one. */}
                              {ex.notes && (
                                <span className="mt-0.5 block text-[10px] leading-relaxed text-[var(--text-muted)]">{ex.notes}</span>
                              )}
                              </span>
                            </Row>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Both said BEFORE the button. What starting does, and what it
              deliberately does not do. */}
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">{t('health.starters.copy_note')}</p>
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">{t('health.starters.not_adapted')}</p>

          {/* Every session is yours to place. Rest is not a row: a rest day
              says "do not train", and the gaps between these dates already say
              it. What is a row is anything you actually do — training and
              active recovery alike. */}
          <div className="space-y-3 rounded-lg border border-[var(--border)] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('health.starters.when')}</div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {([
                  [today, t('health.starters.when_today')],
                  [addDays(today, 1), t('health.starters.when_tomorrow')],
                  [nextMonday(today), t('health.starters.when_next_monday')],
                ] as Array<[string, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => shiftTo(value)}
                    className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] transition cursor-pointer hover:text-[var(--text-secondary)]"
                  >{label}</button>
                ))}
              </div>
            </div>

            <ul className="space-y-1.5">
              {sessions.map((d, i) => (
                <li key={d.day_index} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-[12px] text-[var(--text-primary)]">
                    <span className="text-[var(--text-muted)]">{t('health.starters.session_n', { n: i + 1 })}</span>
                    {d.title ? ` · ${d.title}` : ''}
                    {d.kind === 'active_recovery' && (
                      <span className="ml-1.5 rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">
                        {t('health.starters.active_recovery')}
                      </span>
                    )}
                  </span>
                  <DateField
                    size="sm"
                    value={dates[d.day_index] ?? null}
                    onChange={(v) => v && setOne(d.day_index, v)}
                  />
                </li>
              ))}
            </ul>

            {/* Where "3 sessions" becomes "runs 12 days" without it being a
                surprise after the fact. */}
            {spanDays > 0 && (
              <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                {t('health.starters.runs_for', { days: spanDays, sessions: sessions.length })}
              </p>
            )}

            {clash && (
              <p className="text-[10px] leading-relaxed text-red-400">{t('health.starters.same_day')}</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onStart(sessions.map(d => ({ day_index: d.day_index, date: dates[d.day_index] })).filter(p => p.date))}
            disabled={starting || clash || chosen.length !== sessions.length}
            className="w-full rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-[12px] font-medium text-[var(--accent)] transition enabled:cursor-pointer enabled:hover:bg-[var(--accent)]/20 disabled:opacity-50"
          >
            {starting ? t('health.starters.starting') : t('health.starters.start')}
          </button>
        </div>
      )}
    </>
  );
}
