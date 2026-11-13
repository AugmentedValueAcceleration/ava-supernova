// ─── Shopping — its own tab (13 Nov 2026) ────────────────────────────────────
//
// The operator's three problems with the old drawer (11 Nov): it needed its own
// tab, a proper display, and a way onto the phone — "nobody takes the computer
// shopping". Design approved from the mockup on 13 Nov ("perfect").
//
// The engine is core's and unchanged: aisles in walking order, household
// scaling, a week across plans or one plan, meals left out, missing meals
// NAMED. What is new is the screen, the cupboard staples, ticks kept in
// ~/.ava/health/shopping.json (so they follow you between the extension and
// the IDE), and Send to phone: the list packed into a QR code / WhatsApp link,
// after the `#`, so it never passes through us.
//
// This file is identical in the extension and the IDE apart from its imports.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { t, tt, useLocale } from '../i18n';
import {
  buildShoppingListAcross, buildSurplusAcross, weekBounds, shiftWeek,
  type PlanDaySource, type ShoppingItem,
} from '../../../../core/dist/health/shopping-list.js';
import { normaliseIngredientName, type Aisle } from '../../../../core/dist/health/aisles.js';
import { sharedListUrl, sharedListText, whatsAppLink, type SharedList } from '../../../../core/dist/health/share-list.js';
import { fillDayMeta, mealsMissingMeta } from '../lib/plan-meal-meta';
import type { HealthPlan, HealthPlanDay, HealthProfile, HealthRecipeDetail, ShoppingState } from '../types/messages';

export interface ShoppingPageProps {
  /** Every plan that is not archived, with its days. */
  plans: HealthPlan[];
  profile: HealthProfile | null;
  recipeDetails: Record<string, HealthRecipeDetail | undefined>;
  onLoadRecipeDetail: (slug: string) => void;
  /** Opened from a plan's "Shopping list" button: start on that plan. */
  initialPlanId: string | null;
  shopping: ShoppingState | null;
  onSaveShopping: (next: ShoppingState) => void;
  onOpenUrl: (url: string) => void;
}

const EMPTY: ShoppingState = { schema_version: 1, staples: [], ticks: {}, updated_at: null };
const aisleLabel = (a: Aisle): string => t(`health.shopping.aisle.${a}`);
const trimNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const amountOf = (i: ShoppingItem) => i.amounts.map((a) => `${trimNum(a.qty)}${a.unit ? ` ${a.unit}` : ''}`).join(' + ');
const isoPlus = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
function dayName(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
}
function rangeLabel(from: string, to: string): string {
  const o: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' };
  return `${new Date(`${from}T00:00:00Z`).toLocaleDateString(undefined, o)} – ${new Date(`${to}T00:00:00Z`).toLocaleDateString(undefined, o)}`;
}

interface Source extends PlanDaySource { date: string | null }

export function ShoppingPage({ plans, profile, recipeDetails, onLoadRecipeDetail, initialPlanId, shopping, onSaveShopping, onOpenUrl }: ShoppingPageProps) {
  useLocale();
  const state = shopping ?? EMPTY;
  const shoppable = useMemo(() => plans.filter((p) => p.status !== 'archived' && p.days.some((d) => (d.meals ?? []).length > 0)), [plans]);

  const [planId, setPlanId] = useState<string | null>(initialPlanId);
  useEffect(() => { if (initialPlanId) setPlanId(initialPlanId); }, [initialPlanId]);
  const single = planId ? shoppable.find((p) => p.id === planId) ?? null : null;

  const [week, setWeek] = useState(0);
  useEffect(() => { setWeek(0); }, [planId]);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const bounds = useMemo(() => shiftWeek(weekBounds(todayIso), week), [todayIso, week]);
  const planWeeks = single ? Math.max(1, Math.ceil((single.duration_days || 1) / 7)) : 0;
  const scopeKey = single ? `plan-${single.id}${planWeeks > 1 ? `-w${week}` : ''}` : `week-${bounds.from}`;

  // Ingredients travel with the plan; a meal written before that was captured
  // gets its recipe fetched and filled in HERE, for the list, without touching
  // the plan. (The old drawer relied on the plan editor being open to do it.)
  const asked = useRef<Set<string>>(new Set());
  const scopePlans = single ? [single] : shoppable;
  useEffect(() => {
    for (const slug of mealsMissingMeta(scopePlans.flatMap((p) => p.days))) {
      if (asked.current.has(slug) || recipeDetails[slug]) continue;
      asked.current.add(slug);
      onLoadRecipeDetail(slug);
    }
  }, [scopePlans, recipeDetails, onLoadRecipeDetail]);

  const sources: Source[] = useMemo(() => {
    const fill = (day: HealthPlanDay) => fillDayMeta(day, recipeDetails).day;
    const out: Source[] = [];
    if (single) {
      const days = planWeeks === 1 ? single.days : single.days.filter((d) => d.day_index > week * 7 && d.day_index <= (week + 1) * 7);
      for (const d of days) out.push({ day: fill(d), planTitle: single.title, date: single.start_date ? isoPlus(single.start_date, d.day_index - 1) : null });
      return out;
    }
    for (const p of shoppable) {
      if (!p.start_date) continue;
      for (const d of p.days) {
        const date = isoPlus(p.start_date, d.day_index - 1);
        if (date >= bounds.from && date <= bounds.to) out.push({ day: fill(d), planTitle: p.title, date });
      }
    }
    return out;
  }, [single, shoppable, planWeeks, week, bounds, recipeDetails]);

  const meals = useMemo(() => {
    const out: { key: string; name: string; when: string; shoppable: boolean }[] = [];
    for (const s of [...sources].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.day.day_index - b.day.day_index)) {
      for (const m of s.day.meals ?? []) {
        if (!m.name) continue;
        const day = s.date ? dayName(s.date) : tt('health.shopping.day_n', 'Day {n}').replace('{n}', String(s.day.day_index));
        out.push({ key: `${s.planTitle}:${s.day.day_index}:${m.id}`, name: m.name, when: `${day} · ${t(`health.plans.slot.${m.slot}`)}`, shoppable: !!m.meta?.ingredients?.length || !m.ref?.slug });
      }
    }
    return out;
  }, [sources]);

  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  useEffect(() => { setExcluded(new Set()); }, [scopeKey]);
  const [hideOptional, setHideOptional] = useState(false);
  const [household] = useState<number | null>(() => profile?.kitchen?.household_size ?? null);

  const selected = useMemo(() => excluded.size === 0 ? sources : sources.map((s) => ({
    ...s, day: { ...s.day, meals: (s.day.meals ?? []).filter((m) => !excluded.has(`${s.planTitle}:${s.day.day_index}:${m.id}`)) },
  })), [sources, excluded]);

  const list = useMemo(() => buildShoppingListAcross(selected, { excludeOptional: hideOptional, household }), [selected, hideOptional, household]);
  const surplus = useMemo(() => buildSurplusAcross(selected, { excludeOptional: hideOptional, household }), [selected, hideOptional, household]);

  // Cupboard staples never go on the list.
  const stapleKeys = useMemo(() => new Set(state.staples.map((s) => normaliseIngredientName(s))), [state.staples]);
  const groups = useMemo(() => list.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !stapleKeys.has(i.key)) }))
    .filter((g) => g.items.length > 0), [list, stapleKeys]);
  const leftOff = list.groups.flatMap((g) => g.items).filter((i) => stapleKeys.has(i.key)).length;

  const ticks = useMemo(() => new Set(state.ticks[scopeKey] ?? []), [state.ticks, scopeKey]);
  const all = groups.flatMap((g) => g.items);
  const got = all.filter((i) => ticks.has(i.key)).length;

  const save = useCallback((next: Partial<ShoppingState>) => onSaveShopping({ ...state, ...next }), [state, onSaveShopping]);
  const toggle = (key: string) => {
    const next = new Set(ticks);
    if (next.has(key)) next.delete(key); else next.add(key);
    const rest = { ...state.ticks }; delete rest[scopeKey];
    save({ ticks: { ...rest, [scopeKey]: [...next] } });
  };
  const untickAll = () => { const rest = { ...state.ticks }; delete rest[scopeKey]; save({ ticks: rest }); };
  const addStaple = (name: string) => {
    const n = name.trim();
    if (!n || stapleKeys.has(normaliseIngredientName(n))) return;
    save({ staples: [...state.staples, n] });
  };
  const removeStaple = (name: string) => save({ staples: state.staples.filter((s) => s !== name) });
  const [stapleDraft, setStapleDraft] = useState('');

  // ── Taking it shopping ─────────────────────────────────────────────────────
  const title = single ? (planWeeks > 1 ? `${single.title} · ${t('health.shopping.week_n')} ${week + 1}` : single.title) : rangeLabel(bounds.from, bounds.to);
  const shared: SharedList = useMemo(() => ({
    v: 1, title, made: todayIso,
    // What is still to get — a tick means it is already in the trolley.
    groups: groups.map((g) => ({ aisle: aisleLabel(g.aisle), items: g.items.filter((i) => !ticks.has(i.key)).map((i) => ({ n: i.name, q: amountOf(i) })) })).filter((g) => g.items.length),
  }), [groups, ticks, title, todayIso]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let live = true; sharedListUrl(shared).then((u) => { if (live) setUrl(u); }).catch(() => setUrl(null)); return () => { live = false; }; }, [shared]);
  const text = url ? sharedListText(shared, url, tt('health.shopping.open_with_ticks', 'Open with tick boxes')) : '';
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(sharedListText(shared)); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  const toWhatsApp = () => { if (text) onOpenUrl(whatsAppLink(text)); };
  const remaining = shared.groups.reduce((n, g) => n + g.items.length, 0);

  const missingRead = list.missing.filter((m) => m.reason === 'lookup_failed');
  const missingCustom = list.missing.filter((m) => m.reason === 'not_in_library');
  const empty = list.itemCount === 0 && list.missing.length === 0;

  return (
    <div className="sp-root">
      <style>{CSS}</style>

      <div className="sp-top">
        <div className="sp-col" style={{ gap: 4 }}>
          <span className="sp-label">{single ? tt('health.shopping.one_plan', 'One plan') : week === 0 ? t('health.shopping.this_week') : tt('health.shopping.another_week', 'Another week')}</span>
          <div className="sp-row" style={{ gap: 10 }}>
            {!single && <button type="button" className="sp-step" aria-label={t('health.shopping.prev_week')} onClick={() => setWeek((w) => w - 1)}>‹</button>}
            <h2 className="sp-h1">{single ? single.title : rangeLabel(bounds.from, bounds.to)}</h2>
            {!single && <button type="button" className="sp-step" aria-label={t('health.shopping.next_week')} onClick={() => setWeek((w) => w + 1)}>›</button>}
            {!single && week !== 0 && <button type="button" className="sp-link" onClick={() => setWeek(0)}>{t('health.shopping.back_to_this_week')}</button>}
          </div>
        </div>
        <div className="sp-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className={`sp-pill ${!single ? 'on' : ''}`} onClick={() => setPlanId(null)}>{tt('health.shopping.all_plans', 'All plans')}</button>
          {shoppable.map((p) => (
            <button key={p.id} type="button" className={`sp-pill ${single?.id === p.id ? 'on' : ''}`} onClick={() => setPlanId(p.id)}>{p.title}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="sp-btn" disabled={!remaining} onClick={copy}>{copied ? tt('health.shopping.copied', 'Copied') : tt('health.shopping.copy', 'Copy')}</button>
        <button type="button" className="sp-btn" disabled={!remaining || !url} onClick={toWhatsApp}><WaIcon />WhatsApp</button>
        <button type="button" className="sp-primary" disabled={!remaining || !url} onClick={() => setSending(true)}><QrIcon />{tt('health.shopping.send_to_phone', 'Send to phone')}</button>
      </div>

      {single && planWeeks > 1 && (
        <div className="sp-row" style={{ gap: 8, padding: '0 32px 12px' }}>
          {Array.from({ length: planWeeks }, (_, w) => (
            <button key={w} type="button" className={`sp-pill ${w === week ? 'on' : ''}`} onClick={() => setWeek(w)}>{t('health.shopping.week_n')} {w + 1}</button>
          ))}
        </div>
      )}

      {empty ? (
        <div className="sp-empty">
          {list.settled.length ? t('health.shopping.all_settled') : single ? t('health.shopping.no_meals') : t('health.shopping.no_meals_week')}
        </div>
      ) : (
        <div className="sp-body">
          <div className="sp-main">
            <div className="sp-panel sp-row" style={{ gap: 14, padding: '14px 18px' }}>
              <span className="sp-sec"><strong className="sp-strong">{got} / {all.length}</strong> {tt('health.shopping.in_trolley', 'in the trolley')}</span>
              <div className="sp-bar"><div style={{ width: `${all.length ? Math.round((got / all.length) * 100) : 0}%` }} /></div>
              {household != null && household > 1 && <span className="sp-muted">{tt('health.shopping.for_n', 'For {n} people').replace('{n}', String(household))}</span>}
              <button type="button" className={`sp-quiet ${hideOptional ? 'on' : ''}`} onClick={() => setHideOptional((v) => !v)}>{t('health.shopping.hide_optional')}</button>
              {got > 0 && <button type="button" className="sp-quiet" onClick={untickAll}>{tt('health.shopping.untick_all', 'Untick all')}</button>}
            </div>

            <div className="sp-aisles">
              {groups.map((g) => {
                const left = g.items.filter((i) => !ticks.has(i.key)).length;
                return (
                  <section key={g.aisle} className="sp-panel" style={{ padding: '14px 16px' }}>
                    <div className="sp-row" style={{ gap: 8, paddingBottom: 6 }}>
                      <span className="sp-aisle">{aisleLabel(g.aisle)}</span>
                      <span className="sp-muted" style={{ fontSize: 12 }}>{left ? tt('health.shopping.n_to_get', '{n} to get').replace('{n}', String(left)) : tt('health.shopping.aisle_done', 'all in')}</span>
                    </div>
                    {g.items.map((i) => {
                      const on = ticks.has(i.key);
                      const extras = [i.looseLines > 0 ? t('health.shopping.loose_lines') : null, i.optional ? t('health.shopping.optional') : null].filter(Boolean).join(' · ');
                      return (
                        <div key={i.key} className="sp-item">
                          <label className="sp-tick">
                            <input type="checkbox" checked={on} onChange={() => toggle(i.key)} />
                            <span className="sp-col" style={{ minWidth: 0, flex: 1 }}>
                              <span className={`sp-name ${on ? 'got' : ''}`}>{i.name}{extras && <span className="sp-muted" style={{ fontSize: 11 }}> · {extras}</span>}</span>
                              <span className="sp-for">{i.meals.join(', ')}</span>
                            </span>
                            <span className={`sp-qty ${on ? 'got' : ''}`}>{amountOf(i)}</span>
                          </label>
                          <button type="button" className="sp-always" title={tt('health.shopping.always_have_hint', 'Never put this on a list again')} onClick={() => addStaple(i.name)}>
                            {tt('health.shopping.always_have', 'Always have it')}
                          </button>
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          </div>

          <aside className="sp-side">
            {meals.length > 0 && (
              <div className="sp-panel" style={{ padding: 16 }}>
                <div className="sp-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="sp-label">{tt('health.shopping.meals_on_list', 'Meals on this list')}</span>
                  <button type="button" className="sp-link" onClick={() => setExcluded(excluded.size === 0 ? new Set(meals.map((m) => m.key)) : new Set())}>
                    {excluded.size === 0 ? t('health.shopping.select_none') : t('health.shopping.select_all')}
                  </button>
                </div>
                {meals.map((m) => (
                  <label key={m.key} className={`sp-meal ${m.shoppable ? '' : 'off'}`} title={m.shoppable ? undefined : t('health.shopping.no_ingredients')}>
                    <input type="checkbox" checked={!excluded.has(m.key)} disabled={!m.shoppable}
                      onChange={() => setExcluded((prev) => { const n = new Set(prev); if (n.has(m.key)) n.delete(m.key); else n.add(m.key); return n; })} />
                    <span className="sp-muted" style={{ width: 92, flexShrink: 0 }}>{m.when}</span>
                    <span className="sp-trunc">{m.name}</span>
                  </label>
                ))}
                <p className="sp-hint">{tt('health.shopping.untick_meal_hint', "Untick a meal you're eating out for and its food leaves the list.")}</p>
              </div>
            )}

            <div className="sp-panel" style={{ padding: 16 }}>
              <span className="sp-label">{tt('health.shopping.cupboard', 'Already in the cupboard')}</span>
              <div className="sp-row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {state.staples.map((s) => (
                  <span key={s} className="sp-chip">{s}<button type="button" className="sp-x" aria-label={`${tt('health.shopping.remove', 'Remove')} ${s}`} onClick={() => removeStaple(s)}>×</button></span>
                ))}
                <form className="sp-row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); addStaple(stapleDraft); setStapleDraft(''); }}>
                  <input className="sp-input" value={stapleDraft} onChange={(e) => setStapleDraft(e.target.value)} placeholder={tt('health.shopping.add_staple', 'e.g. salt')} aria-label={tt('health.shopping.add_staple_label', 'Add something you always have')} />
                  <button type="submit" className="sp-add" disabled={!stapleDraft.trim()}>{tt('health.shopping.add', 'Add')}</button>
                </form>
              </div>
              <p className="sp-hint">
                {leftOff > 0 ? tt('health.shopping.left_off', '{n} left off this list. ').replace('{n}', String(leftOff)) : ''}
                {tt('health.shopping.cupboard_hint', 'Never put on a list. Kept on this computer, and follows you between the extension and the IDE.')}
              </p>
            </div>

            {missingRead.length > 0 && <div className="sp-warn">{t('health.shopping.incomplete')} {[...new Set(missingRead.map((m) => m.name))].join(', ')}</div>}
            {missingCustom.length > 0 && <div className="sp-warn">{t('health.shopping.not_in_library')} {[...new Set(missingCustom.map((m) => m.name))].join(', ')}</div>}

            {surplus.itemCount > 0 && (
              <div className="sp-panel" style={{ padding: '14px 16px' }}>
                <span className="sp-label">{t('health.shopping.surplus')}</span>
                <p className="sp-hint" style={{ marginTop: 6 }}>{t('health.shopping.surplus.hint')}</p>
                <p className="sp-sec" style={{ margin: '6px 0 0', fontSize: 13 }}>
                  {surplus.groups.flatMap((g) => g.items).map((i) => `${i.name}${i.amounts.length ? ` — ${amountOf(i)}` : ''}`).join(', ')}
                </p>
              </div>
            )}

            {list.settled.length > 0 && (
              <div className="sp-panel" style={{ padding: '14px 16px' }}>
                <span className="sp-label">{t('health.shopping.settled')}</span>
                <p className="sp-sec" style={{ margin: '6px 0 0', fontSize: 13 }}>{list.settled.map((s) => `${s.name} (${t(`health.shopping.settled.${s.state}`)})`).join(', ')}</p>
              </div>
            )}
          </aside>
        </div>
      )}

      {sending && url && (
        <SendToPhone url={url} list={shared} remaining={remaining} meals={meals.length - excluded.size} household={household}
          copied={copied} onCopy={copy} onWhatsApp={toWhatsApp} onClose={() => setSending(false)} />
      )}
    </div>
  );
}

function SendToPhone({ url, list, remaining, meals, household, copied, onCopy, onWhatsApp, onClose }: {
  url: string; list: SharedList; remaining: number; meals: number; household: number | null; copied: boolean;
  onCopy: () => void; onWhatsApp: () => void; onClose: () => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const qr = useMemo(() => {
    const q = qrcode(0, 'L');
    q.addData(url, 'Byte');
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { n, d };
  }, [url]);
  return (
    <div className="sp-overlay" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={tt('health.shopping.take_shopping', 'Take this list shopping')} className="sp-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="sp-row" style={{ padding: '20px 24px', borderBottom: '1px solid var(--sp-border)' }}>
          <h2 className="sp-h1" style={{ fontSize: 20, flex: 1 }}>{tt('health.shopping.take_shopping', 'Take this list shopping')}</h2>
          <button type="button" className="sp-step" aria-label={t('health.plans.cancel')} onClick={onClose}>×</button>
        </div>
        <div className="sp-row" style={{ gap: 28, padding: '28px 24px', alignItems: 'flex-start' }}>
          <svg role="img" aria-label={tt('health.shopping.qr_label', 'QR code for this list')} viewBox={`-4 -4 ${qr.n + 8} ${qr.n + 8}`} className="sp-qr" shapeRendering="crispEdges">
            <rect x={-4} y={-4} width={qr.n + 8} height={qr.n + 8} fill="#fff" />
            <path d={qr.d} fill="#14111d" />
          </svg>
          <div className="sp-col" style={{ gap: 14, minWidth: 0 }}>
            <span className="sp-label">{tt('health.shopping.scan', "Scan with your phone's camera")}</span>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{tt('health.shopping.scan_what', 'The list opens on your phone and stays there: tick as you go, no signal needed in the shop, and it is back at avasupernova.com/list without scanning again.')}</p>
            <p className="sp-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{tt('health.shopping.scan_private', 'The list travels inside the code itself. Nothing is sent to us, there is no account, and we never see what you buy.')}</p>
            <div className="sp-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="sp-tag">{tt('health.shopping.n_items', '{n} items').replace('{n}', String(remaining))}</span>
              <span className="sp-tag">{list.title}</span>
              <span className="sp-tag">{tt('health.shopping.n_meals', '{n} meals').replace('{n}', String(meals))}{household && household > 1 ? ` · ${tt('health.shopping.for_n', 'For {n} people').replace('{n}', String(household))}` : ''}</span>
            </div>
          </div>
        </div>
        <div className="sp-row sp-dfoot">
          <span className="sp-muted" style={{ flex: 1, fontSize: 13 }}>{tt('health.shopping.no_camera', 'No camera handy?')}</span>
          <button type="button" className="sp-btn" onClick={onCopy}>{copied ? tt('health.shopping.copied', 'Copied') : tt('health.shopping.copy_text', 'Copy as text')}</button>
          <button type="button" className="sp-wa" onClick={onWhatsApp}><WaIcon light />{tt('health.shopping.send_whatsapp', 'Send to WhatsApp')}</button>
        </div>
      </div>
    </div>
  );
}

function WaIcon({ light }: { light?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={light ? '#fff' : '#4ade80'} strokeWidth="2" aria-hidden="true"><path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.6z" /></svg>;
}
function QrIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3M21 14v7h-7" /></svg>;
}

const CSS = `
.sp-root{--sp-border:var(--border,#2a2338);--sp-panel:#14111d;display:flex;flex-direction:column;min-height:100%;color:var(--text-primary,#ece8f4);font-size:14px;line-height:1.4}
.sp-root *{box-sizing:border-box}
.sp-root button{font-family:inherit}
.sp-root button:focus-visible,.sp-root input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.sp-row{display:flex;align-items:center}
.sp-col{display:flex;flex-direction:column}
.sp-top{display:flex;flex-wrap:wrap;align-items:center;gap:16px;padding:20px 32px 16px}
.sp-h1{margin:0;font-size:22px;font-weight:600}
.sp-label{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--text-muted)}
.sp-muted{color:var(--text-muted)}
.sp-sec{color:var(--text-secondary)}
.sp-strong{color:var(--text-primary)}
.sp-hint{margin:10px 0 0;font-size:12px;color:var(--text-muted)}
.sp-trunc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-step{width:36px;height:36px;border-radius:10px;border:1px solid var(--sp-border);background:transparent;color:var(--text-primary);cursor:pointer;font-size:16px}
.sp-link{border:none;background:transparent;padding:0;color:var(--accent);cursor:pointer;font-size:12px;text-decoration:underline dotted;text-underline-offset:2px}
.sp-pill{min-height:36px;border-radius:999px;border:1px solid var(--sp-border);padding:0 14px;font-size:13px;cursor:pointer;background:transparent;color:var(--text-muted)}
.sp-pill:hover{color:var(--text-primary)}
.sp-pill.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--text-primary)}
.sp-btn{min-height:44px;display:inline-flex;align-items:center;gap:8px;border-radius:10px;border:1px solid var(--sp-border);background:transparent;padding:0 16px;font-size:14px;color:var(--text-primary);cursor:pointer}
.sp-primary{min-height:44px;display:inline-flex;align-items:center;gap:8px;border-radius:10px;border:none;background:var(--accent);padding:0 20px;font-size:14px;font-weight:600;color:#fff;cursor:pointer}
.sp-wa{min-height:44px;display:inline-flex;align-items:center;gap:8px;border-radius:10px;border:none;background:#16a34a;padding:0 18px;font-size:14px;font-weight:600;color:#fff;cursor:pointer}
.sp-btn:disabled,.sp-primary:disabled{opacity:.4;cursor:not-allowed}
.sp-quiet{border:none;background:transparent;font-size:12px;color:var(--text-muted);cursor:pointer;min-height:32px}
.sp-quiet:hover,.sp-quiet.on{color:var(--text-primary)}
.sp-body{display:flex;flex-wrap:wrap;gap:20px;padding:0 32px 28px;align-items:flex-start}
.sp-main{flex:999 1 560px;min-width:0;display:flex;flex-direction:column;gap:14px}
.sp-side{flex:1 1 280px;max-width:340px;display:flex;flex-direction:column;gap:14px}
.sp-panel{border-radius:14px;border:1px solid var(--sp-border);background:var(--sp-panel)}
.sp-bar{flex:1;min-width:80px;height:8px;border-radius:999px;background:#241e31;overflow:hidden}
.sp-bar>div{height:100%;border-radius:999px;background:var(--accent);transition:width .2s}
.sp-aisles{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;align-items:start}
.sp-aisle{font-size:13px;font-weight:600}
.sp-item{position:relative;border-top:1px solid #1f1a2b}
.sp-tick{display:flex;align-items:center;gap:10px;min-height:44px;padding:4px 0;cursor:pointer}
.sp-tick input{width:18px;height:18px;accent-color:var(--accent);flex-shrink:0;cursor:pointer}
.sp-name{font-size:14px}
.sp-name.got,.sp-qty.got{color:var(--text-muted);text-decoration:line-through}
.sp-for{font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-qty{font-size:13px;color:var(--text-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}
.sp-always{position:absolute;right:0;top:50%;transform:translateY(-50%);display:none;border-radius:8px;border:1px solid var(--sp-border);background:#1a1625;padding:4px 10px;font-size:11px;color:var(--text-muted);cursor:pointer}
.sp-item:hover .sp-always,.sp-always:focus-visible{display:block}
.sp-item:hover .sp-qty{visibility:hidden}
.sp-meal{display:flex;align-items:center;gap:10px;min-height:36px;font-size:13px;cursor:pointer}
.sp-meal input{width:16px;height:16px;accent-color:var(--accent);flex-shrink:0}
.sp-meal.off{opacity:.5;text-decoration:line-through;cursor:help}
.sp-chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;border:1px solid var(--sp-border);background:#1a1625;padding:6px 10px 6px 12px;font-size:12px}
.sp-x{border:none;background:transparent;padding:0;color:var(--text-muted);cursor:pointer;font-size:14px;line-height:1}
.sp-x:hover{color:var(--text-primary)}
.sp-input{height:32px;width:120px;border-radius:999px;border:1px dashed var(--sp-border);background:transparent;padding:0 12px;font-size:12px;color:var(--text-primary);outline:none}
.sp-input:focus{border-style:solid;border-color:color-mix(in srgb,var(--accent) 60%,transparent)}
.sp-add{height:32px;border-radius:999px;border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);background:color-mix(in srgb,var(--accent) 15%,transparent);padding:0 12px;font-size:12px;color:var(--text-primary);cursor:pointer}
.sp-add:disabled{opacity:.4;cursor:not-allowed}
.sp-warn{border-radius:12px;border:1px solid rgba(245,158,11,.4);background:rgba(245,158,11,.1);color:#fde68a;padding:12px 14px;font-size:13px;line-height:1.5}
.sp-empty{padding:64px 32px;text-align:center;color:var(--text-muted)}
.sp-overlay{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(5,4,9,.75);padding:16px}
.sp-dialog{width:min(760px,100%);border-radius:18px;border:1px solid #3a2f52;background:var(--sp-panel);box-shadow:0 30px 80px rgba(0,0,0,.6)}
.sp-dfoot{gap:10px;flex-wrap:wrap;padding:16px 24px;border-top:1px solid var(--sp-border);background:#110e1a;border-radius:0 0 18px 18px}
.sp-qr{width:320px;height:320px;max-width:100%;flex-shrink:0;border-radius:14px;background:#fff}
.sp-tag{border-radius:999px;background:#241e31;padding:4px 12px;font-size:12px;color:var(--text-secondary)}
@media (max-width:720px){.sp-top,.sp-body{padding-left:16px;padding-right:16px}.sp-dialog .sp-row{flex-wrap:wrap}}
`;
