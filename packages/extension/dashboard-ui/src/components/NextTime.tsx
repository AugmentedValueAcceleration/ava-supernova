// "Saved. Next time?" and the plan day's "Last time" line (Health Part 6,
// progression from the log — mockup approved 14 Nov 2026). The person
// chooses; nothing changes until they press Update my plan. The rules
// (what is offered, when, by how much) live in core health/progression.ts.
//
// ONE SHARED FILE: identical in the extension and the IDE apart from the
// import lines. Inline styles, so it looks the same in both.

import { useEffect, useState, type CSSProperties } from 'react';
import { tt, useLocale } from '../i18n';
import type { LastTime, ProgressionChoice, ProgressionRow, ProgressionStep, StepOption } from '../../../../core/dist/health/progression.js';

const border = '1px solid color-mix(in srgb, var(--accent) 30%, transparent)';
const btn: CSSProperties = { minHeight: 36, padding: '0 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' };
const chip = (on: boolean): CSSProperties => ({
  minHeight: 32, padding: '0 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  border: on ? '1px solid var(--accent)' : border, background: on ? 'var(--accent)' : 'transparent',
  color: on ? '#fff' : '#cdd6f4', fontWeight: on ? 600 : 400,
});
const COLOUR = { above: '#a6e3a1', as_planned: '#cdd6f4', short: '#f9e2af', ticked: '#cdd6f4' } as const;

function repsText(last: LastTime): string {
  if (!last.reps.length) return last.targetReps ?? '';
  const lo = Math.min(...last.reps), hi = Math.max(...last.reps);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

/** "3 × 12 · 16 kg — above plan (3 × 10)" — what happened, never a score. */
export function lastText(last: LastTime): string {
  if (last.verdict === 'ticked') return tt('health.next.ticked', 'Done — no sets recorded');
  if (last.verdict === 'short') {
    return tt('health.next.short', '{done} of {target} sets').replace('{done}', String(last.done)).replace('{target}', String(last.target ?? last.done));
  }
  const did = [`${last.done} × ${repsText(last)}`, last.topKg != null ? `${last.topKg} kg` : ''].filter(Boolean).join(' · ');
  if (last.verdict === 'above') {
    const plan = last.target != null ? `${last.target} × ${last.targetReps ?? '?'}` : '';
    return `${did} — ${tt('health.next.above', 'above plan')}${plan ? ` (${plan})` : ''}`;
  }
  return `${did} — ${tt('health.next.as_planned', 'as planned')}`;
}

function optionLabel(o: StepOption): string {
  const sr = [o.sets != null ? `${o.sets} × ${o.reps ?? ''}` : o.reps ?? ''].join('');
  if (o.step === 'keep') return tt('health.next.keep', 'Keep it');
  if (o.step === 'one_more_rep') return `${tt('health.next.more_rep', 'One more rep')} · ${sr}`;
  if (o.step === 'one_more_set') return `${tt('health.next.more_set', 'One more set')} · ${sr}`;
  return `${tt('health.next.heavier', 'Heavier')} · ${o.weight ?? ''}`;
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** The plan day's line under an exercise: "Last time, Sat 14 Nov: 3 × 12 · 16 kg — above plan". */
export function LastTimeLine({ row, onStepUp }: { row: ProgressionRow; onStepUp?: () => void }) {
  useLocale();
  const colour = row.stepped ? '#a6e3a1' : COLOUR[row.last.verdict];
  const text = row.stepped
    ? `${lastText(row.last).split(' — ')[0]} — ${tt('health.next.stepped', 'you stepped this up')}`
    : lastText(row.last);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '2px 4px 0' }}>
      <span style={{ fontSize: 11, color: colour, lineHeight: 1.4 }}>
        {tt('health.next.last_time', 'Last time, {date}:').replace('{date}', shortDate(row.last.date))} {text}
      </span>
      {onStepUp && row.options.length > 0 && (
        <button type="button" onClick={onStepUp} style={{ ...chip(false), minHeight: 26, padding: '0 10px', fontSize: 11, flexShrink: 0 }}>
          {tt('health.next.step_up', 'Step up…')}
        </button>
      )}
    </div>
  );
}

/** "Saved. Next time?" (after a session) or "Step up" (one exercise, from the plan day). */
export function NextTimeDialog({ rows, title, note, busy, onApply, onClose }: {
  rows: ProgressionRow[];
  title?: string;
  /** What Update changes, in a line. */
  note?: string;
  busy?: boolean;
  onApply: (choices: ProgressionChoice[]) => void;
  onClose: () => void;
}) {
  useLocale();
  const [picked, setPicked] = useState<Record<string, ProgressionStep>>({});
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const choices: ProgressionChoice[] = rows.flatMap((r) => {
    const step = picked[r.slug] ?? 'keep';
    if (step === 'keep') return [];
    const o = r.options.find((x) => x.step === step);
    return o ? [{ slug: r.slug, step, weight: o.weight }] : [];
  });
  const heading = title ?? tt('health.next.title', 'Saved. Next time?');

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div role="dialog" aria-modal="true" aria-label={heading} onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 660, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 14, border, background: 'linear-gradient(135deg,#100d1a,#181327)', color: '#cdd6f4' }}>
        <div style={{ padding: '16px 22px', borderBottom: border, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{heading}</h2>
          <span style={{ fontSize: 12, color: '#a6adc8' }}>{tt('health.next.sub', 'From what you did last time. You choose — Ava never steps you up on her own.')}</span>
        </div>
        <div style={{ padding: '6px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => (
            <div key={r.slug} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{r.name}</span>
                <span style={{ color: COLOUR[r.last.verdict], textAlign: 'right' }}>
                  {lastText(r.last)}{!r.options.length ? ` — ${tt('health.next.stays', 'stays as it is')}` : ''}
                </span>
              </div>
              {r.options.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {r.options.map((o) => (
                    <button key={o.step} type="button" aria-pressed={(picked[r.slug] ?? 'keep') === o.step}
                      onClick={() => setPicked((p) => ({ ...p, [r.slug]: o.step }))}
                      style={chip((picked[r.slug] ?? 'keep') === o.step)}>{optionLabel(o)}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <p style={{ margin: 0, padding: '0 22px 14px', fontSize: 12, lineHeight: 1.5, color: '#a6adc8' }}>
          {note ?? tt('health.next.note', 'Changes the rest of this plan, wherever these exercises come up. Days already done are not touched.')}
        </p>
        <div style={{ padding: '14px 22px', borderTop: border, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={{ ...btn, border, background: 'transparent', color: '#cdd6f4' }} onClick={onClose}>{tt('health.next.leave', 'Leave my plan as it is')}</button>
          <button type="button" disabled={busy || !choices.length} onClick={() => onApply(choices)}
            style={{ ...btn, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, opacity: busy || !choices.length ? 0.5 : 1 }}>
            {tt('health.next.update', 'Update my plan')}
          </button>
        </div>
      </div>
    </div>
  );
}
