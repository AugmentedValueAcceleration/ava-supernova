// ─── Shopping list ──────────────────────────────────────────────────────────
//
// The step that turns a meal plan into food. Everything before this is a
// proposal; this is the bit you take to a shop.
//
// Grouped by aisle and walked in the order of a supermarket, because a list
// sorted by recipe sends you back and forth past the same freezer six times.
//
// Two honesty rules it will not bend:
//   - a meal whose ingredients could not be read is NAMED, not hidden. A list
//     that looks complete and isn't sends someone home without dinner.
//   - quantities are never guessed across unit families. "400 g + 2 cloves" is
//     what the recipes said; inventing one number would be neater and wrong.
//
// The list logic itself is @ava/core's, shared with the IDE. This file is the
// extension's window onto it.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { t, tt, useLocale } from '../i18n';
import { Icon } from './Icon';
import {
  buildShoppingListAcross, buildSurplusAcross, daysInRange, weekBounds, shiftWeek,
  type ShoppingItem,
} from '../../../../core/dist/health/shopping-list.js';
import { AISLE_ORDER, type Aisle } from '../../../../core/dist/health/aisles.js';
import { mealsMissingMeta } from '../lib/plan-meal-meta';
import type { HealthPlan, HealthProfile } from '../types/messages';

const aisleLabel = (a: Aisle): string => t(`health.shopping.aisle.${a}`);

/* ------------------------------------------------------------------ ticks - */
// Kept OUT of the plan on purpose. What is already in the trolley is a fact
// about one shopping trip, not about the plan, and it must not travel with the
// plan when it is duplicated, exported or synced.

const tickKey = (scope: string) => `ava-shopping-ticks-${scope}`;
const foldKey = (scope: string) => `ava-shopping-folded-${scope}`;

function readSet(key: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch { return null; }
}
function writeSet(key: string, value: Set<string>): void {
  try { localStorage.setItem(key, JSON.stringify([...value])); } catch { /* storage disabled */ }
}

/**
 * Everything starts folded.
 *
 * A week across several plans runs to thirty-odd rows and opening onto all of
 * them is a wall. Folded, the aisle headers and their counts are a summary you
 * read at a glance — and you open the one you are standing in.
 *
 * `readSet` returning null distinguishes "never touched" from "deliberately
 * opened everything". Without that the default would fight the user: unfold
 * every aisle, come back, and it would helpfully fold them all again.
 */
const allFolded = () => new Set<string>(AISLE_ORDER);

/**
 * What is being shopped for.
 *
 * A plan when you are looking at one, a week when you are not. The week case is
 * not a nicety: activating a plan only archives other active plans of the SAME
 * type, so a meal plan and a combined plan can both be live across the same
 * seven days — and you make one trip to the shop, not one per plan.
 */
export type ShoppingScope = 'plan' | 'week';

export function ShoppingListSheet({ plan, allPlans, profile, onClose, onLoadRecipeDetail }: {
  /** The plan in front of you, when there is one. */
  plan: HealthPlan | null;
  /** Everything active, for the week view. */
  allPlans: HealthPlan[];
  /** How many people are being cooked for. Read from the LIVE profile, not the
   *  plan: extension plans carry `profile_snapshot: null` (both writers set it
   *  that way), so a snapshot read would have silently done nothing forever. */
  profile: HealthProfile | null;
  onClose: () => void;
  /** Meals with no captured ingredients are repaired by loading their recipe;
   *  the plan view's backfill effect writes the result back. */
  onLoadRecipeDetail: (slug: string) => void;
}) {
  useLocale();
  const [scope, setScope] = useState<ShoppingScope>(plan ? 'plan' : 'week');
  const [week, setWeek] = useState(0);
  const [hideOptional, setHideOptional] = useState(false);

  const single = scope === 'plan' ? plan : null;
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const bounds = useMemo(() => shiftWeek(weekBounds(todayIso), week), [todayIso, week]);

  // A week's ticks belong to that week, not to a plan: the same onion is a
  // different errand next Tuesday. A plan's ticks stay keyed to the plan.
  const tickScope = single ? single.id : `week-${bounds.from}`;
  const [ticks, setTicks] = useState<Set<string>>(() => readSet(tickKey(tickScope)) ?? new Set());
  const [folded, setFolded] = useState<Set<string>>(() => readSet(foldKey(tickScope)) ?? allFolded());
  useEffect(() => {
    setTicks(readSet(tickKey(tickScope)) ?? new Set());
    setFolded(readSet(foldKey(tickScope)) ?? allFolded());
  }, [tickScope]);

  // Anything with no captured ingredients gets its recipe requested. The
  // backfill in the plan view writes the meta back, which re-renders this.
  const inScopePlans = useMemo(
    () => (single ? [single] : allPlans),
    [single, allPlans],
  );
  // Asked once per slug per open. The plan is re-committed as meta lands, so
  // this effect re-runs on every fill — without the guard it would re-request
  // a recipe the library genuinely has no ingredients for, on a loop.
  const asked = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const slug of mealsMissingMeta(inScopePlans.flatMap(p => p.days))) {
      if (asked.current.has(slug)) continue;
      asked.current.add(slug);
      onLoadRecipeDetail(slug);
    }
  }, [inScopePlans, onLoadRecipeDetail]);

  const planWeeks = single ? Math.max(1, Math.ceil((single.duration_days || 1) / 7)) : 0;

  const sources = useMemo(() => {
    if (single) {
      const days = planWeeks === 1
        ? single.days
        : single.days.filter(d => d.day_index > week * 7 && d.day_index <= (week + 1) * 7);
      return days.map(day => ({ day }));
    }
    return daysInRange(allPlans, bounds.from, bounds.to);
  }, [single, allPlans, week, planWeeks, bounds]);

  // Captured once on open rather than read live: a shop is a moment, and a
  // profile edited halfway through must not rewrite quantities already ticked.
  const [household] = useState<number | null>(() => profile?.kitchen?.household_size ?? null);

  // Every meal the current scope covers, with whether it can actually be
  // shopped for. A meal with no captured ingredients cannot contribute lines,
  // and saying so HERE — greyed, with the reason — beats a warning underneath
  // a list that silently came up short.
  const mealsInScope = useMemo(() => {
    const out: { key: string; name: string; slot: string; dayIndex: number; shoppable: boolean }[] = [];
    for (const { day } of sources) {
      for (const meal of day.meals ?? []) {
        if (!meal.name) continue;
        out.push({
          key: `${day.day_index}:${meal.id}`,
          name: meal.name,
          slot: meal.slot,
          dayIndex: day.day_index,
          shoppable: !!meal.meta?.ingredients?.length,
        });
      }
    }
    return out;
  }, [sources]);

  // EXCLUSIONS, not selections. Empty means everything is on, so the default
  // costs nothing and a meal whose ingredients land later is included rather
  // than missed because it wasn't there when the set was built.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  useEffect(() => { setExcluded(new Set()); }, [tickScope]);

  const selectedCount = mealsInScope.filter(m => !excluded.has(m.key)).length;
  const allOn = excluded.size === 0;

  const toggleMeal = useCallback((key: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Feed core only the meals still selected. Days are rebuilt rather than
  // mutated — the plan itself is never touched by looking at a shopping list.
  const selectedSources = useMemo(() => {
    if (excluded.size === 0) return sources;
    return sources.map(s => ({
      ...s,
      day: { ...s.day, meals: (s.day.meals ?? []).filter(m => !excluded.has(`${s.day.day_index}:${m.id}`)) },
    }));
  }, [sources, excluded]);

  const list = useMemo(
    () => buildShoppingListAcross(selectedSources, { excludeOptional: hideOptional, household }),
    [selectedSources, hideOptional, household],
  );

  // Food already bought and never cooked. Shown beside the shop rather than on
  // a screen of its own: the moment you are deciding what to buy is the moment
  // it matters that a bag of spinach is already in the fridge.
  const surplus = useMemo(
    () => buildSurplusAcross(selectedSources, { excludeOptional: hideOptional, household }),
    [selectedSources, hideOptional, household],
  );

  const toggle = useCallback((key: string) => {
    setTicks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      writeSet(tickKey(tickScope), next);
      return next;
    });
  }, [tickScope]);

  const clear = useCallback(() => {
    setTicks(new Set());
    writeSet(tickKey(tickScope), new Set());
  }, [tickScope]);

  const fold = useCallback((aisle: string) => {
    setFolded(prev => {
      const next = new Set(prev);
      if (next.has(aisle)) next.delete(aisle); else next.add(aisle);
      writeSet(foldKey(tickScope), next);
      return next;
    });
  }, [tickScope]);

  const got = list.groups.flatMap(g => g.items).filter(i => ticks.has(i.key)).length;
  const missingRead = list.missing.filter(m => m.reason === 'lookup_failed');
  const missingCustom = list.missing.filter(m => m.reason === 'not_in_library');

  return (
    <Drawer
      title={t('health.shopping.title')}
      subtitle={single ? single.title : rangeLabel(bounds.from, bounds.to)}
      onClose={onClose}
    >
      {/* Plan or week. Shown only when a plan is open — with no plan in front
          of you there is no choice to make. */}
      {plan && (
        <div className="mb-3 flex gap-1.5">
          {(['plan', 'week'] as ShoppingScope[]).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => { setScope(s); setWeek(0); }}
              className={`rounded-full border px-3 py-1 text-[11px] transition cursor-pointer ${
                scope === s
                  ? 'border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t(s === 'plan' ? 'health.shopping.scope_plan' : 'health.shopping.scope_week')}
            </button>
          ))}
        </div>
      )}

      {/* WHAT YOU ARE SHOPPING FOR — chosen before the list, not ticked off it.
          Everything starts on, so the whole-week case looks exactly as it did.
          Turning a meal off is how you say "I already have that", which used to
          get muddled with "I've bought that" because the tick meant both. */}
      {mealsInScope.length > 0 && (
        <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-input)]/20 p-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              {tt('health.shopping.shopping_for', 'Shopping for')}
            </span>
            <button type="button"
              onClick={() => setExcluded(allOn ? new Set(mealsInScope.map(m => m.key)) : new Set())}
              className="cursor-pointer border-none bg-transparent text-[10px] text-[var(--accent)] transition hover:opacity-80">
              {allOn ? tt('health.shopping.select_none', 'None') : tt('health.shopping.select_all', 'All')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {mealsInScope.map(m => {
              const on = !excluded.has(m.key);
              // A meal with no captured ingredients cannot contribute lines, so
              // it is shown greyed WITH the reason rather than quietly making
              // the list short and explaining underneath.
              if (!m.shoppable) {
                return (
                  <span key={m.key}
                    title={tt('health.shopping.no_ingredients', 'No ingredients captured for this meal yet')}
                    className="cursor-help rounded-md border border-dashed border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-muted)] line-through opacity-60">
                    {m.name}
                  </span>
                );
              }
              return (
                <button key={m.key} type="button" onClick={() => toggleMeal(m.key)}
                  className={`rounded-md border px-2 py-1 text-[10px] transition cursor-pointer ${
                    on
                      ? 'border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--text-primary)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] line-through opacity-60'
                  }`}>
                  {m.name}
                </button>
              );
            })}
          </div>
          {!allOn && (
            <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
              {selectedCount}/{mealsInScope.length} {tt('health.shopping.meals_selected', 'meals')}
            </p>
          )}
        </div>
      )}

      {list.itemCount === 0 && list.missing.length === 0 && list.settled.length === 0 ? (
        <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">
          {single ? t('health.shopping.no_meals') : t('health.shopping.no_meals_week')}
        </div>
      ) : list.itemCount === 0 && list.missing.length === 0 ? (
        /* Every meal logged is not an empty week — saying "nothing planned"
           would deny a week they actually lived. */
        <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">
          {t('health.shopping.all_settled')}
        </div>
      ) : (
        <>
          {/* A plan's own weeks are numbered; a calendar week is a date, and you
              can walk forward to shop ahead or back to check what you bought. */}
          {single ? planWeeks > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {Array.from({ length: planWeeks }, (_, w) => (
                <button key={w} type="button" onClick={() => setWeek(w)}
                  className={`rounded-full border px-3 py-1 text-[11px] transition cursor-pointer ${
                    w === week
                      ? 'border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}>
                  {t('health.shopping.week_n')} {w + 1}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-3 flex items-center justify-between">
              <Step dir="prev" label={t('health.shopping.prev_week')} onClick={() => setWeek(w => w - 1)} />
              <button type="button" onClick={() => setWeek(0)}
                className={`border-none bg-transparent text-[11px] cursor-pointer ${week === 0 ? 'text-[var(--text-muted)]' : 'text-[var(--accent)]'}`}>
                {week === 0 ? t('health.shopping.this_week') : t('health.shopping.back_to_this_week')}
              </button>
              <Step dir="next" label={t('health.shopping.next_week')} onClick={() => setWeek(w => w + 1)} />
            </div>
          )}

          <div className="mb-3 flex items-center justify-between gap-3 text-[11px]">
            <div className="text-[var(--text-muted)]">
              {got}/{list.itemCount} · {list.mealCount} {t('health.shopping.meals')}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setHideOptional(v => !v)}
                className={`border-none bg-transparent cursor-pointer ${hideOptional ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
                {t('health.shopping.hide_optional')}
              </button>
              {got > 0 && (
                <button type="button" onClick={clear}
                  className="border-none bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
                  {t('health.shopping.reset')}
                </button>
              )}
            </div>
          </div>

          {household != null && household > 1 && (
            <p className="mb-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
              {t('health.shopping.for_people')}
            </p>
          )}

          {/* Named, never hidden — and the two reasons kept apart, because one
              is worth retrying and the other can only be fixed by swapping the
              meal for a real recipe. */}
          <Gap meals={missingRead} message={t('health.shopping.incomplete')} />
          <Gap meals={missingCustom} message={t('health.shopping.not_in_library')} />

          {surplus.itemCount > 0 && (
            <div className="mb-3 rounded-lg border border-[var(--border)] px-3 py-2.5">
              <div className="text-[11px] font-medium text-[var(--accent)]">{t('health.shopping.surplus')}</div>
              <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{t('health.shopping.surplus.hint')}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                {surplus.groups.flatMap(g => g.items).map(i =>
                  `${i.name}${i.amounts.length ? ` — ${i.amounts.map(a => `${a.qty} ${a.unit}`).join(' + ')}` : ''}`,
                ).join(', ')}
              </div>
            </div>
          )}

          {/* Short on purpose. A list quietly missing the meals you logged
              reads as a bug rather than as the feature it is. */}
          {list.settled.length > 0 && (
            <div className="mb-3 rounded-lg border border-[var(--border)] px-3 py-2.5">
              <div className="text-[11px] font-medium text-[var(--text-muted)]">{t('health.shopping.settled')}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                {list.settled.map(s => `${s.name} (${t(`health.shopping.settled.${s.state}`)})`).join(', ')}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {list.groups.map(group => {
              const done = group.items.filter(i => ticks.has(i.key)).length;
              const shut = folded.has(group.aisle);
              return (
                <section key={group.aisle}>
                  {/* The whole header is the target, not a 10px chevron. */}
                  <button
                    type="button"
                    onClick={() => fold(group.aisle)}
                    aria-expanded={!shut}
                    className="mb-1.5 flex w-full cursor-pointer items-center gap-1.5 border-none bg-transparent text-left"
                  >
                    <svg className={`h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform ${shut ? '' : 'rotate-90'}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      {aisleLabel(group.aisle)}
                    </span>
                    {/* Kept on the header so a folded aisle still says where you
                        are in it, rather than going quiet. */}
                    <span className={`ml-auto text-[10px] ${done === group.items.length ? 'text-emerald-400/70' : 'text-[var(--text-muted)]'}`}>
                      {done}/{group.items.length}
                    </span>
                  </button>
                  {!shut && (
                    <ul className="space-y-0.5">
                      {group.items.map(item => (
                        <Row key={item.key} item={item} ticked={ticks.has(item.key)} onToggle={() => toggle(item.key)} />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </Drawer>
  );
}

function Row({ item, ticked, onToggle }: { item: ShoppingItem; ticked: boolean; onToggle: () => void }) {
  // Amounts are joined with "+", never summed across unit families. 400 g and
  // 2 cloves have no common number, and inventing one would be tidier and
  // sometimes wrong — see the note at the top of this file.
  const amounts = item.amounts.map(a => `${trimNum(a.qty)}${a.unit ? ` ${a.unit}` : ''}`).join(' + ');
  const extras = [
    item.looseLines > 0 ? t('health.shopping.loose_lines') : null,
    item.optional ? t('health.shopping.optional') : null,
  ].filter(Boolean).join(' · ');

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        title={item.meals.join(', ')}
        className="flex w-full cursor-pointer items-start gap-2.5 rounded-md border-none bg-transparent px-1 py-1.5 text-left transition hover:bg-[var(--accent)]/5"
      >
        <span className={`mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
          ticked ? 'border-[var(--accent)] bg-[var(--accent)]/20' : 'border-[var(--border)]'
        }`}>
          {ticked && <Icon.done size={11} />}
        </span>
        <span className={`min-w-0 flex-1 ${ticked ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
          <span className="text-[12px]">{item.name}</span>
          {extras && <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">{extras}</span>}
          {/* Why it is on the list. A single-plan list names no plans; more
              than one is the interesting case a per-plan list used to hide. */}
          {item.plans.length > 1 && (
            <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">{item.plans.join(' · ')}</span>
          )}
        </span>
        {amounts && (
          <span className={`shrink-0 text-[11px] tabular-nums ${ticked ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-secondary)]'}`}>
            {amounts}
          </span>
        )}
      </button>
    </li>
  );
}

function Gap({ meals, message }: { meals: { name: string }[]; message: string }) {
  if (!meals.length) return null;
  return (
    <div className="mb-3 rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2">
      <p className="text-[11px] leading-relaxed text-amber-200/90">{message}</p>
      <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
        {[...new Set(meals.map(m => m.name))].join(', ')}
      </p>
    </div>
  );
}

function Step({ dir, label, onClick }: { dir: 'prev' | 'next'; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className="cursor-pointer rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-[var(--text-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]">
      <svg className={`h-3 w-3 ${dir === 'prev' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  );
}

/** 2.5 stays 2.5; 3.0 becomes 3. Nobody writes "3.0 onions". */
function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function rangeLabel(from: string, to: string): string {
  const f = new Date(`${from}T00:00:00Z`);
  const tt2 = new Date(`${to}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
  return `${f.toLocaleDateString(undefined, opts)} – ${tt2.toLocaleDateString(undefined, opts)}`;
}

/** The modal shell both health sheets sit in — matches the plan overlay's
 *  register so opening one from the other does not feel like leaving. */
/**
 * Right-hand drawer, for panels you READ while doing something else.
 *
 * A shopping list is a reference document — you check it against the plan, or
 * against a shelf. A centred modal blacks out everything behind it and has to
 * be closed to see the calendar, which is the wrong shape for something used
 * over an hour. Full height rather than max-height for the same reason: a
 * week's shop is long, and a panel that shrink-wraps its content jumps about
 * as you fold aisles.
 *
 * Deliberately a separate component from Sheet rather than a variant of it.
 * The five short-lived panels — assist, duplicate, log, prep, starters — are
 * decisions you make and dismiss, and a centred modal is right for those.
 */
export function Drawer({ title, subtitle, onClose, children, footer }: {
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/60 backdrop-blur-[2px]"
      onClick={onClose} style={{ animation: 'ava-fade-in 160ms ease-out' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ animation: 'ava-slide-in-right 220ms cubic-bezier(0.32, 0.72, 0, 1)' }}
        className="flex h-full w-full max-w-[560px] flex-col overflow-hidden border-l border-[var(--accent)]/25 bg-gradient-to-b from-[#100d1a] to-[#150f22] shadow-[-24px_0_60px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--accent)]/14 px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-medium text-[var(--text-primary)]">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t('health.plans.cancel')}
            className="shrink-0 cursor-pointer border-none bg-transparent text-lg leading-none text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-[var(--accent)]/14 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Sheet({ title, subtitle, onClose, children }: {
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Escape closes. A modal you can only leave by finding the X is a modal that
  // traps somebody mid-shop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 sm:p-6" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-[620px] flex-col overflow-hidden rounded-xl border border-[var(--accent)]/25 bg-gradient-to-br from-[#100d1a] to-[#181327] shadow-[0_0_80px_color-mix(in_srgb,_var(--accent)_15%,_transparent)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--accent)]/14 px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-medium text-[var(--text-primary)]">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t('health.plans.cancel')}
            className="shrink-0 cursor-pointer border-none bg-transparent text-lg leading-none text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
