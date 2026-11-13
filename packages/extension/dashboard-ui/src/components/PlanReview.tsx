import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { t, tt, useLocale } from '../i18n';
import { PLAN_WIZARD_CSS } from './PlanWizard';
import { ExerciseDetailBody, RecipeDetailBody } from '../pages/Health';

/**
 * Ava's plan, shown BEFORE it is saved (12 Nov 2026 — he asked "do we show a
 * preview… incase they want amendments?", then "in the same design as we did
 * the wizard so they can view each day").
 *
 * THIS FILE IS IDENTICAL in the extension (dashboard-ui/src/components) and
 * the IDE (src/components) apart from the import lines at the top, like
 * PlanWizard, whose styles it shares. Change one, copy it to the other.
 *
 * Raised by health_plan_create's permission card. By the time it opens, core
 * has already checked the plan against their hard rules (the tool's
 * precheck): a plan that breaks one went back to Ava and never got here. What
 * is left to know — cautions, allergens the library cannot confirm, anything
 * written in without a library entry — is said at the top.
 *
 * Nothing is saved until they press save. "Change something" sends their own
 * words back to Ava, who revises and shows it again; "Don't save" saves
 * nothing.
 */

type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type Ref = { kind: string; slug: string } | null | undefined;
interface ReviewExercise { id?: string; ref?: Ref; name: string; sets?: number | null; reps?: string | null; weight?: string | null; rest_seconds?: number | null }
interface ReviewMeal { id?: string; slot: Slot; ref?: Ref; name: string; servings?: number | null; calories?: number | null }
interface ReviewDay { day_index: number; kind: 'training' | 'rest' | 'active_recovery'; title?: string | null; training?: ReviewExercise[]; meals?: ReviewMeal[]; notes?: string | null }

/** core's PlanReview (tools/health-plan-create), structurally. */
export interface PlanReviewData {
  type: 'fitness' | 'meal' | 'combined';
  title: string;
  duration_days: number;
  status: 'draft' | 'active';
  start_date: string | null;
  days: ReviewDay[];
  cautions: Array<{ slug: string; name: string; reasons: string[]; alternatives: Array<{ slug: string; name: string }> }>;
  unverified: string[];
  unknown: string[];
  unchecked: string[];
}

type Nut = { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number };
type RecipeDetailLike = { course?: string | null; hero_image_url?: string | null; versions: Array<{ level: string; nutrition?: Nut | null }> };

export interface PlanReviewProps {
  review: PlanReviewData;
  /** Which recipe version their calories come from (the cooking-level one). */
  kitchenLevel?: string | null;
  exerciseDetails: Record<string, unknown>;
  recipeDetails: Record<string, RecipeDetailLike>;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
  onSave: () => void;
  /** Their words, for Ava to revise the plan by. */
  onChange: (text: string) => void;
  onDiscard: () => void;
  onOpenSafety: () => void;
}

const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ACCENT = { fitness: 'var(--accent)', meal: '#f0a24b', combined: '#34d399' } as const;

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d; };

const CSS = `
.pr-days{grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}
.pr-item{display:flex;width:100%;align-items:center;gap:10px;cursor:pointer;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);padding:6px;text-align:left;color:var(--text-primary);font-family:inherit}
.pr-item:hover{border-color:color-mix(in srgb,var(--accent) 50%,transparent)}
.pr-item.warn{border-color:rgba(245,158,11,.45)}
.pr-item:disabled{cursor:default}
.pr-item:disabled:hover{border-color:var(--border)}
.pr-thumb{width:40px;height:40px;flex:none;border-radius:6px;border:1px solid var(--border);object-fit:cover;background:#1b1726}
.pr-roomy .pr-item{gap:14px;padding:10px;border-radius:12px}
.pr-roomy .pr-thumb{width:72px;height:72px;border-radius:10px}
.pr-roomy .pr-name{font-size:15px}
.pr-roomy .pw-day{padding:20px;gap:16px;border-radius:16px}
.pr-macro{display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:none;font-size:12px;color:var(--text-secondary);font-variant-numeric:tabular-nums}
.pr-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;border-top:1px solid var(--border);padding-top:14px}
.pr-stat{display:flex;flex-direction:column;gap:2px;border-radius:10px;background:var(--bg-input);padding:10px 12px}
.pr-stat b{font-size:18px;font-weight:600;color:var(--text-primary)}
.pr-stat span{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em}
.pr-kind{border-radius:999px;padding:1px 8px;font-size:11px;background:var(--border);color:var(--text-secondary)}
.pr-text{min-height:110px;width:100%;resize:vertical;border-radius:10px;border:1px solid var(--border);background:#0f0c17;padding:10px 12px;font-family:inherit;font-size:14px;color:var(--text-primary);outline:none}
.pr-text:focus{border-color:color-mix(in srgb,var(--accent) 60%,transparent)}
`;

function imageOf(detail: unknown): string | null {
  const d = detail as { thumbnail_url?: string | null; hero_image_url?: string | null } | undefined;
  return d?.hero_image_url ?? d?.thumbnail_url ?? null;
}

export function PlanReview(props: PlanReviewProps) {
  useLocale();
  const { review, exerciseDetails, recipeDetails } = props;
  const [open, setOpen] = useState<{ kind: 'exercise' | 'recipe'; slug: string; name: string } | null>(null);
  const [changing, setChanging] = useState(false);
  const [text, setText] = useState('');
  const training = review.type !== 'meal';
  const meals = review.type !== 'fitness';

  // Pictures and calories come from the library: fetch each item once.
  useEffect(() => {
    const ex = new Set<string>(), re = new Set<string>();
    for (const d of review.days) {
      for (const e of d.training ?? []) if (e.ref?.slug && !exerciseDetails[e.ref.slug]) ex.add(e.ref.slug);
      for (const m of d.meals ?? []) if (m.ref?.slug && !recipeDetails[m.ref.slug]) re.add(m.ref.slug);
    }
    ex.forEach(props.onLoadExerciseDetail);
    re.forEach(props.onLoadRecipeDetail);
    // Only when the plan itself changes — a detail arriving must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review]);

  // Esc closes whatever is on top; it never decides for them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (changing) setChanging(false); else if (open) setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changing, open]);

  const cautionFor = (slug?: string) => (slug ? review.cautions.find((c) => c.slug === slug) : undefined);
  // One meal's figures, from the recipe version at their cooking level.
  const mealNut = (m: ReviewMeal): Nut | null => {
    const det = m.ref?.slug ? recipeDetails[m.ref.slug] : undefined;
    const lvl = props.kitchenLevel ?? 'intermediate';
    const withCal = det?.versions.filter((v) => v.nutrition?.calories != null) ?? [];
    const n = (withCal.find((v) => v.level === lvl) ?? withCal.find((v) => v.level === 'intermediate') ?? withCal[0])?.nutrition;
    const k = m.servings ?? 1;
    if (n?.calories != null) return { calories: n.calories * k, protein_g: (n.protein_g ?? 0) * k, carbs_g: (n.carbs_g ?? 0) * k, fat_g: (n.fat_g ?? 0) * k };
    return typeof m.calories === 'number' ? { calories: m.calories * k } : null;
  };
  const dayNut = (d: ReviewDay) => {
    const sum = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    let known = false;
    for (const m of d.meals ?? []) {
      const n = mealNut(m);
      if (!n) continue;
      known = true;
      sum.calories += n.calories ?? 0; sum.protein_g += n.protein_g ?? 0; sum.carbs_g += n.carbs_g ?? 0; sum.fat_g += n.fat_g ?? 0;
    }
    return known ? sum : null;
  };
  const kcal = (d: ReviewDay) => { const n = dayNut(d); return n ? Math.round(n.calories) : null; };

  const typeName = review.type === 'fitness' ? tt('health.wizard.type.fitness', 'Fitness') : review.type === 'meal' ? tt('health.wizard.type.meal', 'Meal') : tt('health.wizard.type.combined', 'Combined');
  const lengthName = review.duration_days === 1 ? tt('health.wizard.len.1', '1 day') : `${review.duration_days} ${tt('health.wizard.days', 'days')}`;
  const starts = review.start_date ? addDays(review.start_date, 0).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : tt('health.review.no_date', 'No start date yet');
  const slotName = (s: Slot) => t(`health.plans.slot.${s}`);
  const worth = review.cautions.length + review.unverified.length + review.unknown.length + review.unchecked.length > 0;
  const days = [...review.days].sort((a, b) => a.day_index - b.day_index);
  const roomy = days.length > 0 && days.length <= 3;

  const send = () => { const v = text.trim(); if (v) props.onChange(v); };

  let drawer = null;
  if (open) {
    const exDet = open.kind === 'exercise' ? exerciseDetails[open.slug] : undefined;
    const reDet = open.kind === 'recipe' ? recipeDetails[open.slug] : undefined;
    const c = cautionFor(open.slug);
    drawer = (
      <div className="pw-overlay" onClick={() => setOpen(null)}>
        <div role="dialog" aria-modal="true" aria-label={open.name} onClick={(e) => e.stopPropagation()} className="pw-drawer">
          <div className="pw-row" style={{ gap: 12, borderBottom: '1px solid var(--border)', padding: '16px 20px' }}>
            <span className="pw-trunc" style={{ minWidth: 0, flex: 1, fontSize: 16, fontWeight: 600 }}>{open.name}</span>
            <button type="button" className="pw-btn quiet" onClick={() => setOpen(null)}>{tt('health.wizard.close', 'Close')}</button>
          </div>
          {c && (
            <div className="pw-warnbox" style={{ margin: '16px 20px 0' }}>
              {tt('health.wizard.care', 'Take care:')} {c.reasons.join('; ')}
              {c.alternatives.length ? `. ${tt('health.wizard.easier_version', 'Easier version')}: ${c.alternatives.map((a) => a.name).join(', ')}` : ''}
            </div>
          )}
          <div style={{ minHeight: 0, flex: 1, overflowY: 'auto', padding: 20 }}>
            {exDet ? <ExerciseDetailBody ex={exDet as never} /> : reDet ? <RecipeDetailBody r={reDet as never} /> : (
              <span className="pw-muted" style={{ fontSize: 13 }}>{tt('health.wizard.loading', 'Loading…')}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Portalled to <body>, so "fixed" covers the whole window in both apps.
  return createPortal(
    <div className="pw-root" role="dialog" aria-modal="true" aria-label={review.title}>
      <style>{PLAN_WIZARD_CSS}{CSS}</style>
      <header className="pw-header">
        <div style={{ minWidth: 220, flex: 1 }}>
          <span className="pw-label" style={{ color: ACCENT[review.type] }}>{tt('health.review.kicker', "Ava's plan · not saved yet")}</span>
          <h1 className="pw-h1" style={{ marginTop: 2 }}>{review.title}</h1>
          <p className="pw-muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{tt('health.review.sub', 'Have a look at each day. Nothing is kept until you save it.')}</p>
        </div>
        <div className="pw-row" style={{ gap: 8 }}>
          {[typeName, lengthName, starts].map((v) => <span key={v} className="pw-chip">{v}</span>)}
        </div>
      </header>

      <main className="pw-main">
        <div className="pw-wrap pw-col" style={{ gap: 16 }}>
          {worth && (
            <div className="pw-panel pw-col" style={{ gap: 6, padding: 16, borderColor: 'rgba(245,158,11,.3)' }}>
              <span className="pw-warn" style={{ fontSize: 14, fontWeight: 600 }}>{tt('health.wizard.worth', 'Worth knowing')}</span>
              {review.cautions.map((c) => (
                <span key={c.slug} className="pw-sec" style={{ fontSize: 13 }}>
                  {c.name}: {c.reasons.join('; ')}{c.alternatives.length ? `. ${tt('health.wizard.easier_version', 'Easier version')}: ${c.alternatives.map((a) => a.name).join(', ')}` : ''}.
                </span>
              ))}
              {review.unverified.length > 0 && <span className="pw-sec" style={{ fontSize: 13 }}>{tt('health.wizard.unverified', "Can't be checked for {x}: the library can't confirm a dish is free from it.").replace('{x}', review.unverified.join(', '))}</span>}
              {review.unchecked.length > 0 && <span className="pw-sec" style={{ fontSize: 13 }}>{tt('health.review.unchecked', 'Not from the library, so not checked against your rules: {x}.').replace('{x}', review.unchecked.join(', '))}</span>}
              {review.unknown.length > 0 && <span className="pw-sec" style={{ fontSize: 13 }}>{tt('health.review.unknown', 'Not found in the library, so not checked: {x}.').replace('{x}', review.unknown.join(', '))}</span>}
            </div>
          )}

          {days.length === 0 && (
            <div className="pw-panel" style={{ padding: 16 }}>
              <span className="pw-sec" style={{ fontSize: 14 }}>{tt('health.review.no_days', "Ava hasn't written the days into this one. Ask her to, so you can see them before it's saved.")}</span>
            </div>
          )}

          {/* A week reads as a strip of seven; one to three days get the room
              (operator, 13 Nov 2026: a 1-day plan sat in a 170px column). */}
          <div className={`pw-days pr-days${roomy ? ' pr-roomy' : ''}`}
            style={roomy ? { overflow: 'visible', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, maxWidth: days.length === 1 ? 960 : undefined, width: '100%', margin: '0 auto', gap: 16 } : { overflow: 'visible' }}>
            {days.map((d, i) => {
              const date = review.start_date ? addDays(review.start_date, d.day_index - 1) : null;
              const total = meals ? kcal(d) : null;
              const ex = d.training ?? [];
              const ms = d.meals ?? [];
              return (
                <div key={`${d.day_index}-${i}`} className="pw-day" style={{ minHeight: 0 }}>
                  <div className="pw-col" style={{ gap: 2 }}>
                    <span className="pw-label">{date ? `${date.getDate()} ${date.toLocaleDateString(undefined, { month: 'short' })}` : `${tt('health.review.day', 'Day')} ${d.day_index}`}</span>
                    <span className="pw-row" style={{ gap: 8 }}>
                      <span style={{ fontSize: roomy ? 22 : 15, fontWeight: 600 }}>{date ? WEEKDAY[date.getDay()] : `${tt('health.review.day', 'Day')} ${d.day_index}`}</span>
                      {d.kind !== 'training' && training && <span className="pr-kind">{d.kind === 'rest' ? tt('health.wizard.rest', 'Rest day') : tt('health.review.recovery', 'Active recovery')}</span>}
                    </span>
                    {d.title && <span className="pw-sec" style={{ fontSize: 12 }}>{d.title}</span>}
                  </div>

                  {training && ex.length > 0 && (
                    <div className="pw-col" style={{ gap: 6 }}>
                      <span className="pw-label" style={{ color: 'var(--accent)', letterSpacing: '.1em' }}>{tt('health.wizard.training', 'Training')}</span>
                      {ex.map((e, j) => {
                        const c = cautionFor(e.ref?.slug);
                        const img = e.ref?.slug ? imageOf(exerciseDetails[e.ref.slug]) : null;
                        const dose = [e.sets != null || e.reps ? `${e.sets ?? '–'} × ${e.reps ?? '–'}` : null, e.weight].filter(Boolean).join(' · ');
                        return (
                          <button key={e.id ?? j} type="button" className={`pr-item${c ? ' warn' : ''}`} disabled={!e.ref?.slug}
                            onClick={() => e.ref?.slug && setOpen({ kind: 'exercise', slug: e.ref.slug, name: e.name })}
                            aria-label={e.ref?.slug ? `${tt('health.wizard.view', 'View')} ${e.name}` : e.name}>
                            {img ? <img src={img} alt="" className="pr-thumb" loading="lazy" /> : <span aria-hidden="true" className="pr-thumb" />}
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span className="pr-name" style={{ display: 'block', fontSize: 13 }}>{e.name}</span>
                              <span className={c ? 'pw-warn' : 'pw-muted'} style={{ display: 'block', fontSize: 11 }}>{c ? c.reasons.join('; ') : dose}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {meals && ms.length > 0 && (
                    <div className="pw-col" style={{ gap: 6 }}>
                      <span className="pw-label" style={{ color: '#f0a24b', letterSpacing: '.1em' }}>{tt('health.wizard.meals', 'Meals')}</span>
                      {SLOTS.flatMap((s) => ms.filter((m) => m.slot === s)).map((m, j) => {
                        const img = m.ref?.slug ? imageOf(recipeDetails[m.ref.slug]) : null;
                        return (
                          <button key={m.id ?? j} type="button" className="pr-item" disabled={!m.ref?.slug}
                            onClick={() => m.ref?.slug && setOpen({ kind: 'recipe', slug: m.ref.slug, name: m.name })}
                            aria-label={m.ref?.slug ? `${tt('health.wizard.view', 'View')} ${m.name}` : m.name}>
                            {img ? <img src={img} alt="" className="pr-thumb" loading="lazy" /> : <span aria-hidden="true" className="pr-thumb" />}
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span className="pw-muted" style={{ display: 'block', fontSize: 11 }}>{slotName(m.slot)}{(m.servings ?? 1) > 1 ? ` · ${m.servings} ${tt('health.review.servings', 'servings')}` : ''}</span>
                              <span className="pr-name" style={{ display: 'block', fontSize: 13 }}>{m.name}</span>
                            </span>
                            {roomy && (() => { const n = mealNut(m); return n?.calories != null ? (
                              <span className="pr-macro">
                                <span style={{ color: 'var(--text-primary)', fontSize: 14 }}>{Math.round(n.calories)} kcal</span>
                                {n.protein_g != null && <span>{Math.round(n.protein_g)} g {tt('health.review.protein', 'protein')}</span>}
                              </span>
                            ) : null; })()}
                          </button>
                        );
                      })}
                      {total !== null && !roomy && <span className="pw-sec" style={{ borderTop: '1px solid var(--border)', paddingTop: 6, fontSize: 12 }}>{total} kcal</span>}
                      {roomy && (() => { const n = dayNut(d); return n ? (
                        <div className="pr-stats" aria-label={tt('health.review.day_totals', 'Day totals')}>
                          <div className="pr-stat"><b>{Math.round(n.calories)}</b><span>kcal</span></div>
                          <div className="pr-stat"><b>{Math.round(n.protein_g)} g</b><span>{tt('health.review.protein', 'protein')}</span></div>
                          <div className="pr-stat"><b>{Math.round(n.carbs_g)} g</b><span>{tt('health.review.carbs', 'carbs')}</span></div>
                          <div className="pr-stat"><b>{Math.round(n.fat_g)} g</b><span>{tt('health.review.fat', 'fat')}</span></div>
                        </div>
                      ) : null; })()}
                    </div>
                  )}

                  {d.notes && <span className="pw-muted" style={{ fontSize: roomy ? 13 : 12, lineHeight: 1.5 }}>{d.notes}</span>}
                  {((training && !ex.length && !(meals && ms.length)) || (!training && meals && !ms.length)) && (
                    <span className="pw-muted" style={{ fontSize: 12 }}>{training ? tt('health.wizard.rest', 'Rest day') : tt('health.review.nothing', 'Nothing planned')}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="pw-footer" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="pw-row" style={{ gap: 12 }}>
          <button type="button" className="pw-btn quiet" onClick={props.onDiscard}>{tt('health.review.discard', "Don't save")}</button>
          <span className="pw-muted" style={{ fontSize: 12 }}>
            {tt('health.wizard.not_advice', 'Not medical advice.')}{' '}
            <button type="button" className="pw-link" style={{ fontSize: 12 }} onClick={props.onOpenSafety}>{tt('health.wizard.safety_link', 'Health & Fitness Safety')}</button>
          </span>
        </div>
        <div className="pw-row" style={{ gap: 10 }}>
          <button type="button" className="pw-btn" onClick={() => setChanging(true)}>{tt('health.review.change', 'Change something')}</button>
          <button type="button" className="pw-primary" onClick={props.onSave}>
            {review.status === 'active' ? tt('health.wizard.start_plan', 'Start this plan') : tt('health.wizard.save_draft', 'Save as a draft')}
          </button>
        </div>
      </footer>

      {drawer}

      {changing && (
        <div className="pw-modalback" onClick={() => setChanging(false)}>
          <form role="dialog" aria-modal="true" aria-labelledby="review-change-title" className="pw-modal" style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); send(); }}>
            <h3 id="review-change-title" style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{tt('health.review.change_h', 'What would you like changed?')}</h3>
            <p className="pw-sec" style={{ margin: 0, fontSize: 13 }}>{tt('health.review.change_p', "Ava will change it and show you the plan again. Nothing is saved yet.")}</p>
            <label className="pw-sr" htmlFor="review-change">{tt('health.review.change_h', 'What would you like changed?')}</label>
            <textarea id="review-change" className="pr-text" autoFocus value={text} onChange={(e) => setText(e.target.value)}
              placeholder={tt('health.review.change_ph', 'e.g. swap Wednesday’s dinner for something vegetarian, and make Friday a rest day')}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
            <div className="pw-row" style={{ gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="pw-btn" onClick={() => setChanging(false)}>{tt('health.wizard.cancel', 'Cancel')}</button>
              <button type="submit" className="pw-primary" disabled={!text.trim()}>{tt('health.review.send', 'Send to Ava')}</button>
            </div>
          </form>
        </div>
      )}
    </div>,
    document.body,
  );
}
