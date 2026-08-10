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
import { planFromCurated, orderForProfile, shapeOf } from '../../../../core/dist/health/starters.js';
import type { CuratedPlanSummary, CuratedPlanDetail, HealthPlan, HealthProfile } from '../types/messages';

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

  const start = () => {
    if (!open || starting) return;
    setStarting(true);
    const plan = planFromCurated(open, {
      id: `plan${Date.now()}${Math.floor(Math.random() * 1000)}`,
      // Lands today and ACTIVE — the promise is a good week on day one, and a
      // starter sitting in drafts helps nobody. Fair only because the whole
      // plan is on screen before the button is pressed.
      startDate: new Date().toISOString().slice(0, 10),
    });
    onStart(plan as unknown as HealthPlan, open.id);
    onClose();
  };

  // ── One template, in full ───────────────────────────────────────────────
  if (openId) {
    const shape = open ? shapeOf(open.days) : null;
    return (
      <Sheet
        title={open?.title ?? t('health.starters.title')}
        subtitle={open?.summary ?? null}
        onClose={onClose}
      >
        <button
          type="button"
          onClick={() => setOpenId(null)}
          className="mb-3 cursor-pointer border-none bg-transparent text-[11px] text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          ← {t('health.starters.back')}
        </button>

        {!open ? (
          <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">
            {detailLoading ? t('health.starters.loading') : t('health.starters.failed')}
          </div>
        ) : (
          <div className="space-y-4">
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

            {open.description && (
              <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{open.description}</p>
            )}

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
                  <li key={d.day_index} className="flex items-baseline justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2">
                    <span className="min-w-0 text-[12px] text-[var(--text-primary)]">
                      {t('health.starters.day')} {d.day_index}{d.title ? ` — ${d.title}` : ''}
                    </span>
                    <span className={`shrink-0 text-[11px] ${rest ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}`}>
                      {rest ? t('health.starters.rest') : `${d.training.length} ${t('health.starters.exercises')}`}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* Both said BEFORE the button. What starting does, and what it
                deliberately does not do. */}
            <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">{t('health.starters.copy_note')}</p>
            <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">{t('health.starters.not_adapted')}</p>

            <button
              type="button"
              onClick={start}
              disabled={starting}
              className="w-full rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-[12px] font-medium text-[var(--accent)] transition enabled:cursor-pointer enabled:hover:bg-[var(--accent)]/20 disabled:opacity-50"
            >
              {starting ? t('health.starters.starting') : t('health.starters.start')}
            </button>
          </div>
        )}
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
