// Settings → PDF fonts: the optional bold Chinese, Japanese and Korean pack
// (his call 15 Nov 2026: ship the lighter set, offer the full one here).
// Downloaded once from Google's Noto fonts, checked against its fingerprint
// before it is kept, stored in ~/.ava/fonts so the extension and the IDE share it.
//
// ONE SHARED FILE: identical in the extension and the IDE apart from the
// import line. Inline styles; each app passes its own plumbing in.

import type { CSSProperties } from 'react';
import { tt, useLocale } from '../i18n';

export interface PdfFontsState { installed: boolean; sizeBytes: number; error?: string }

const card: CSSProperties = { marginBottom: 16, borderRadius: 12, border: '1px solid var(--border-card, rgba(255,255,255,0.08))', background: 'var(--bg-card, rgba(255,255,255,0.02))', padding: 20 };
const btn: CSSProperties = { borderRadius: 8, border: '1px solid var(--border, rgba(255,255,255,0.12))', background: 'transparent', color: 'var(--text-secondary, #a6adc8)', padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' };
const primary: CSSProperties = { ...btn, border: 'none', background: 'var(--accent, #a855f7)', color: '#fff', fontWeight: 600 };

export function PdfFontsSetting({ state, progress, onDownload, onRemove }: {
  /** null while checking. */
  state: PdfFontsState | null;
  /** Bytes so far while downloading, else null. */
  progress: { done: number; total: number } | null;
  onDownload: () => void;
  onRemove: () => void;
}) {
  useLocale();
  const mb = state ? Math.round(state.sizeBytes / 1e6) : 20;
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div style={card}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-primary, #cdd6f4)', fontWeight: 600 }}>
        {tt('settings.pdf_fonts.title', 'Bold Chinese, Japanese and Korean in PDFs')}
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary, #a6adc8)' }}>
        {state?.installed
          ? tt('settings.pdf_fonts.installed', 'Installed. PDFs in these languages use real bold.')
          : tt('settings.pdf_fonts.about', 'PDFs in every language come out right already. In Chinese, Japanese and Korean, bold prints at normal weight unless you add this font pack: {mb} MB, downloaded once from Google\'s Noto fonts and checked before it is used.').replace('{mb}', String(mb))}
      </p>
      {progress && (
        <div style={{ marginTop: 10 }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent, #a855f7)', transition: 'width 0.2s' }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted, #8d86a3)' }}>{tt('settings.pdf_fonts.downloading', 'Downloading… {pct}%').replace('{pct}', String(pct))}</span>
        </div>
      )}
      {state?.error && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#f87171' }}>{state.error}</p>}
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!state ? null : state.installed ? (
          <button type="button" style={btn} onClick={onRemove}>{tt('settings.pdf_fonts.remove', 'Remove')}</button>
        ) : (
          <button type="button" style={{ ...primary, opacity: progress ? 0.6 : 1 }} disabled={!!progress} onClick={onDownload}>
            {tt('settings.pdf_fonts.download', 'Download ({mb} MB)').replace('{mb}', String(mb))}
          </button>
        )}
      </div>
    </div>
  );
}
