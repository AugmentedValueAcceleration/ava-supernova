// The look before a change from For you (Health Part 4, his ask 14 Nov 2026):
// nothing is saved until they confirm.
//   Swap it in   — tonight's dinner and its replacement side by side, the rest
//                  of today's meals underneath.
//   Add to today — an exercise: today's session, then "Add it at the end" or
//                  "Replace one" (tap the one it replaces; it takes that one's
//                  sets and reps). A lunch or snack: today's meals with the new
//                  one in place.
// Mirrors the IDE's ForYouPreview.tsx.

import { useState } from 'react';
import { t, tt, useLocale } from '../i18n';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import type { ForYouResult, ForYouExtra, ForYouAction } from '../types/messages';

const stripLead = (why: string) => why.replace(/^(If you swap tonight|A lunch for today|A snack for today|Same kind of training as today) · /, '');
const slotName = (slot: string) => t(`health.plans.slot.${slot}`);

function Pic({ src, kind }: { src?: string | null; kind: 'recipe' | 'exercise' }) {
  return (
    <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-md bg-black/20">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : kind === 'recipe' ? <Icon.meal size={20} /> : <Icon.fitness size={20} />}
    </div>
  );
}

const row = 'flex items-center gap-2 rounded-md border px-3 py-2 text-[12px]';
const quiet = 'border-[var(--border)] text-[var(--text-secondary)]';
const fresh = 'border-[#a6e3a1]/60 bg-[#a6e3a1]/10 text-[var(--text-primary)]';
const btn = 'min-h-[36px] cursor-pointer rounded-md px-4 text-[12px]';

export function ForYouPreview({ x, result, onConfirm, onClose }: {
  x: ForYouExtra;
  result: ForYouResult;
  onConfirm: (a: ForYouAction) => void;
  onClose: () => void;
}) {
  useLocale();
  const items = result.todayItems ?? { training: [], meals: [] };
  const [mode, setMode] = useState<'end' | 'replace'>('end');
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const a = x.action;

  const footer = (label: string, action: ForYouAction | null, cancel: string) => (
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" className={`${btn} border border-[var(--border)] bg-transparent text-[var(--text-primary)]`} onClick={onClose}>{cancel}</button>
      <button type="button" disabled={!action} className={`${btn} border-none bg-[var(--accent)] font-semibold text-white disabled:opacity-40`} onClick={() => action && onConfirm(action)}>{label}</button>
    </div>
  );

  if (a.type === 'swap_meal') {
    const old = result.dinner;
    return (
      <Sheet title={tt('health.foryou.p.swap_title', 'Swap tonight’s dinner?')} subtitle={tt('health.foryou.p.nothing_saved', 'Nothing changes until you confirm.')} onClose={onClose}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] uppercase tracking-[0.18em] text-[#f38ba8]">{tt('health.foryou.p.goes', 'Goes')}</span>
            <Pic src={old?.image} kind="recipe" />
            <span className="text-[13px] text-[var(--text-secondary)] line-through">{old?.name}</span>
            {old?.why && <span className="text-[11px] text-[var(--text-muted)]">{old.why}</span>}
          </div>
          <span className="mt-12 text-[18px] text-[var(--text-muted)]" aria-hidden>→</span>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] uppercase tracking-[0.18em] text-[#a6e3a1]">{tt('health.foryou.p.comes', 'Comes in')}</span>
            <Pic src={x.image} kind="recipe" />
            <span className="text-[13px] text-[var(--text-primary)]">{x.name}</span>
            <span className="text-[11px] text-[#a6e3a1]">{stripLead(x.why)}</span>
          </div>
        </div>
        {items.meals.filter((m) => m.id !== a.mealId).length > 0 && (
          <>
            <div className="mb-2 mt-5 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{tt('health.foryou.p.rest_today', 'The rest of today')}</div>
            <div className="flex flex-col gap-1.5">
              {items.meals.filter((m) => m.id !== a.mealId).map((m) => (
                <div key={m.id} className={`${row} ${quiet}`}><span className="w-16 text-[10px] uppercase tracking-wide">{slotName(m.slot)}</span>{m.name}</div>
              ))}
            </div>
          </>
        )}
        {footer(tt('health.foryou.p.swap_it', 'Swap it'), a, tt('health.foryou.p.keep_dinner', 'Keep my dinner'))}
      </Sheet>
    );
  }

  if (a.type === 'add_meal') {
    return (
      <Sheet title={tt('health.foryou.p.add_meal_title', 'Add {name} to today?').replace('{name}', x.name)} subtitle={tt('health.foryou.p.nothing_saved', 'Nothing changes until you confirm.')} onClose={onClose}>
        <div className="mb-3 grid grid-cols-[120px_1fr] items-center gap-3">
          <Pic src={x.image} kind="recipe" />
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-[var(--text-primary)]">{x.name}</span>
            <span className="text-[11px] text-[#a6e3a1]">{stripLead(x.why)}</span>
          </div>
        </div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{tt('health.foryou.p.today_meals', 'Today’s meals')}</div>
        <div className="flex flex-col gap-1.5">
          {[...items.meals.map((m) => ({ ...m, isNew: false })), { id: 'new', slot: a.slot, name: x.name, isNew: true }]
            .sort((p, q) => ['breakfast', 'lunch', 'snack', 'dinner'].indexOf(p.slot) - ['breakfast', 'lunch', 'snack', 'dinner'].indexOf(q.slot))
            .map((m) => (
              <div key={m.id} className={`${row} ${m.isNew ? fresh : quiet}`}>
                <span className="w-16 text-[10px] uppercase tracking-wide">{slotName(m.slot)}</span>{m.name}
                {m.isNew && <span className="ml-auto text-[10px] text-[#a6e3a1]">{tt('health.foryou.p.new', 'New')}</span>}
              </div>
            ))}
        </div>
        {footer(tt('health.foryou.p.save', 'Save to my plan'), a, tt('health.foryou.p.cancel', 'Cancel'))}
      </Sheet>
    );
  }

  // An exercise: at the end, or in place of one.
  const replaced = mode === 'replace' ? items.training.find((e) => e.id === replaceId) : null;
  const action: ForYouAction | null = mode === 'end'
    ? a
    : replaced ? { type: 'replace_exercise', planId: a.planId, dayIndex: a.dayIndex, exerciseId: replaced.id, slug: x.slug, name: x.name } : null;
  const tab = (on: boolean) => `${btn} flex-1 border ${on ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-primary)]' : 'border-[var(--border)] bg-transparent text-[var(--text-secondary)]'}`;
  const setsOf = (e: { sets: number | null; reps: string | null }) => [e.sets ? `${e.sets} × ${e.reps ?? ''}`.trim() : null].filter(Boolean).join('');

  return (
    <Sheet title={tt('health.foryou.p.add_ex_title', 'Add {name} to today’s session?').replace('{name}', x.name)} subtitle={tt('health.foryou.p.nothing_saved', 'Nothing changes until you confirm.')} onClose={onClose}>
      <div className="mb-4 flex gap-2">
        <button type="button" className={tab(mode === 'end')} onClick={() => { setMode('end'); setReplaceId(null); }}>{tt('health.foryou.p.at_end', 'Add it at the end')}</button>
        <button type="button" className={tab(mode === 'replace')} onClick={() => setMode('replace')} disabled={!items.training.length}>{tt('health.foryou.p.replace_one', 'Replace one')}</button>
      </div>
      {mode === 'replace' && <p className="mb-2 mt-0 text-[11px] text-[var(--text-secondary)]">{tt('health.foryou.p.tap_one', 'Tap the exercise it replaces. It keeps that one’s sets and reps.')}</p>}
      <div className="flex flex-col gap-1.5">
        {items.training.map((e, i) => {
          const isOut = replaced?.id === e.id;
          const inner = (
            <>
              <span className="w-5 text-[10px] text-[var(--text-muted)]">{i + 1}</span>
              <span className={isOut ? 'line-through' : ''}>{e.name}</span>
              {isOut && <span className="text-[#a6e3a1]">→ {x.name}</span>}
              <span className="ml-auto text-[10px] text-[var(--text-muted)]">{setsOf(e)}</span>
            </>
          );
          return mode === 'replace' ? (
            <button key={e.id} type="button" onClick={() => setReplaceId(e.id)}
              className={`${row} cursor-pointer bg-transparent text-left ${isOut ? 'border-[#f38ba8]/60 text-[var(--text-primary)]' : `${quiet} hover:border-[var(--accent)]/50`}`}>{inner}</button>
          ) : (
            <div key={e.id} className={`${row} ${quiet}`}>{inner}</div>
          );
        })}
        {mode === 'end' && (
          <div className={`${row} ${fresh}`}>
            <span className="w-5 text-[10px]">{items.training.length + 1}</span>{x.name}
            <span className="ml-auto text-[10px] text-[#a6e3a1]">3 × 10 · {tt('health.foryou.p.new', 'New')}</span>
          </div>
        )}
      </div>
      {footer(tt('health.foryou.p.save', 'Save to my plan'), action, tt('health.foryou.p.cancel', 'Cancel'))}
    </Sheet>
  );
}
