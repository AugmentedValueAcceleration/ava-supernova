// "Add this session to your training log?" (Health Part 6, mockup approved
// 14 Nov 2026). What was done at the gym, from the phone, beside what was
// planned — facts, never a score — and nothing saved until they say so.
// Also the paste box for "Add from phone" when a link cannot open Ava.
//
// ONE SHARED FILE: identical in the extension and the IDE apart from the
// import lines. Inline styles, so it looks the same in both.

import { useEffect, useState, type CSSProperties } from 'react';
import { tt, useLocale } from '../i18n';
import { compareExercise, type SharedResults } from '../../../../core/dist/health/share-results.js';

const border = '1px solid color-mix(in srgb, var(--accent) 30%, transparent)';
const btn: CSSProperties = { minHeight: 36, padding: '0 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' };
const VERDICT_COLOUR = { on_plan: '#cdd6f4', above: '#a6e3a1', short: '#f9e2af', not_done: '#9b8caa' } as const;

function didText(done: Array<[string, string]>): string {
  if (!done.length) return '';
  const same = done.every(([r, w]) => r === done[0][0] && w === done[0][1]);
  if (same) return `${done.length} × ${done[0][0]}${done[0][1] ? ` · ${done[0][1]}` : ''}`;
  return done.map(([r, w]) => `${r}${w ? ` @ ${w}` : ''}`).join(', ');
}

export function ResultsImport({ results, failed, saving, saved, onCheck, onSave, onClose }: {
  /** The session to show; null with `failed` false = the paste box. */
  results: SharedResults | null;
  /** The link could not be read. */
  failed?: boolean;
  saving?: boolean;
  saved?: boolean;
  /** Paste mode: check a pasted link. */
  onCheck: (text: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  useLocale();
  const [text, setText] = useState('');
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const title = results
    ? tt('health.results.title', 'Add this session to your training log?')
    : tt('health.results.paste_title', 'Add a session from your phone');

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 660, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 14, border, background: 'linear-gradient(135deg,#100d1a,#181327)', color: '#cdd6f4' }}>
        <div style={{ padding: '16px 22px', borderBottom: border }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
          {results && (
            <span style={{ fontSize: 12, color: '#a6adc8' }}>
              {[results.title, results.date, tt('health.results.from_phone', 'from your phone'), results.mins ? tt('health.results.mins', '{n} min').replace('{n}', String(results.mins)) : ''].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>

        <div style={{ padding: '14px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {saved ? (
            <p style={{ margin: 0, fontSize: 13, color: '#a6e3a1' }}>{tt('health.results.saved', 'Saved to your training log. Ava will see it next time you plan together.')}</p>
          ) : results ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr', gap: 8, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: '#a6adc8', paddingBottom: 6, borderBottom: border }}>
                <span>{tt('health.results.exercise', 'Exercise')}</span><span>{tt('health.results.planned', 'Planned')}</span><span>{tt('health.results.did', 'You did')}</span>
              </div>
              {results.exercises.map((e, i) => {
                const c = compareExercise(e);
                const did = didText(e.done);
                const note = c.verdict === 'above' ? tt('health.results.above', 'above plan')
                  : c.verdict === 'short' ? (c.setsShort === 1 ? tt('health.results.one_short', 'one set short') : tt('health.results.n_short', '{n} sets short').replace('{n}', String(c.setsShort)))
                  : c.verdict === 'not_done' ? tt('health.results.not_ticked', 'not ticked') : '';
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr', gap: 8, fontSize: 13, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span>{e.n}</span>
                    <span style={{ color: '#a6adc8' }}>{[e.ts ? `${e.ts} × ${e.tr}` : e.tr, e.tw].filter(Boolean).join(' · ')}</span>
                    <span style={{ color: VERDICT_COLOUR[c.verdict] }}>{[did, note].filter(Boolean).join(' · ')}</span>
                  </div>
                );
              })}
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#a6adc8', lineHeight: 1.5 }}>
                {tt('health.results.where', 'Saved on this computer, in your training log, beside the plan day it came from. It follows you between the extension and the IDE.')}
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 12, color: '#c9c3d6', lineHeight: 1.5 }}>
                {tt('health.results.paste_help', 'On your phone, finish the session and choose Send it to Ava. Then paste the link here.')}
              </p>
              <label style={{ fontSize: 11, color: '#a6adc8' }}>
                {tt('health.results.paste_label', 'The link from your phone')}
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
                  style={{ marginTop: 6, width: '100%', boxSizing: 'border-box', borderRadius: 8, border, background: 'rgba(0,0,0,0.25)', color: '#cdd6f4', padding: 10, fontSize: 12, fontFamily: 'inherit', resize: 'vertical' }} />
              </label>
              {failed && <p style={{ margin: 0, fontSize: 12, color: '#f9e2af' }}>{tt('health.results.bad', 'That link does not hold a session Ava can read. Send it again from your phone.')}</p>}
            </>
          )}
        </div>

        <div style={{ padding: '14px 22px', borderTop: border, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {saved ? (
            <button type="button" style={{ ...btn, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600 }} onClick={onClose}>{tt('health.results.done', 'Done')}</button>
          ) : (
            <>
              <button type="button" style={{ ...btn, border, background: 'transparent', color: '#cdd6f4' }} onClick={onClose}>{tt('health.results.not_now', 'Not now')}</button>
              {results ? (
                <button type="button" disabled={saving} style={{ ...btn, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, opacity: saving ? 0.6 : 1 }} onClick={onSave}>{tt('health.results.save', 'Save to my log')}</button>
              ) : (
                <button type="button" disabled={!text.trim()} style={{ ...btn, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, opacity: text.trim() ? 1 : 0.5 }} onClick={() => onCheck(text)}>{tt('health.results.check', 'Check it')}</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** "Add from phone" — for the Plans page header. */
export function AddFromPhoneButton({ onClick, style, className }: { onClick: () => void; style?: CSSProperties; className?: string }) {
  useLocale();
  return <button type="button" onClick={onClick} style={style} className={className}>{tt('health.results.add_from_phone', 'Add from phone')}</button>;
}
