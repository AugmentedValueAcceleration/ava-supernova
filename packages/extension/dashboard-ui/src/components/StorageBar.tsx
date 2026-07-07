import { useEffect, useState } from 'react';
import type { StorageScan } from '../types/messages';
import { post } from '../App';

// ─── Storage bar + detail card ───────────────────────────────────────────────
//
// A slim, colour-coded bar of Ava's WHOLE local footprint (~/.ava), segmented by
// category — Models, Runtime, Creative, Memory, Journal, Datasets, Old backups,
// Other. HOVER drops a detailed breakdown card below the bar (read-only peek);
// CLICK pins that same card open — it stays until the ✕ or Esc, and gains the
// actions (Open folder, Reclaim old backups). No full-screen overlay. Shared by
// the Command Center header and the Library. Data comes from the host footprint
// scan (get_storage_scan); the webview can't read the disk itself.

const CAT_COLOR: Record<string, string> = {
  models: '#a78bfa', runtime: '#64748b', creative: '#6aa9ff', memory: '#34d399',
  journal: '#f0a24b', datasets: '#22d3ee', backups: '#f87171', other: '#9ca3af',
};
const colorOf = (key: string) => CAT_COLOR[key] ?? CAT_COLOR.other;

function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

/** The compact bar + its hover/pinned detail card. Renders nothing until the
 *  scan has landed. */
export function StorageBar({ scan, label = 'Storage' }: { scan: StorageScan | null; label?: string }) {
  const [pinned, setPinned] = useState(false);
  const [armed, setArmed] = useState(false);

  // Pinned card closes on Esc (and the ✕); a stray click never dismisses it.
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPinned(false); setArmed(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinned]);

  if (!scan || scan.totalBytes <= 0) return null;
  const { totalBytes, categories, reclaim } = scan;

  const reclaimPaths = reclaim.flatMap(r => r.paths);
  const reclaimBytes = reclaim.reduce((a, r) => a + r.bytes, 0);
  const doReclaim = () => { if (reclaimPaths.length) post({ type: 'reclaim_storage', paths: reclaimPaths }); setArmed(false); };
  const close = () => { setPinned(false); setArmed(false); };

  // Visible on hover (read-only) OR when pinned (interactive).
  const cardVis = pinned
    ? 'visible translate-y-0 opacity-100 pointer-events-auto'
    : 'pointer-events-none invisible translate-y-1 opacity-0 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100';

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => { setArmed(false); setPinned(true); }}
        className="block w-full text-left"
      >
        <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>{label}</span>
          <span className="text-[var(--text-secondary)]">{formatBytes(totalBytes)}</span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
          {categories.map(c => (
            <div
              key={c.key}
              style={{ width: `${Math.max(0.5, (c.bytes / totalBytes) * 100)}%`, background: colorOf(c.key) }}
              className="h-full transition-opacity group-hover:opacity-90"
            />
          ))}
        </div>
      </button>

      <div className={`absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3 shadow-2xl transition-all duration-150 ${cardVis}`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">{label}</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-muted)]">{formatBytes(totalBytes)}</span>
            {pinned && (
              <button onClick={close} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition" aria-label="Close">✕</button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          {categories.map(c => (
            <div key={c.key} className="flex items-center gap-2 text-[11px]">
              <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: colorOf(c.key) }} />
              <span className="flex-1 truncate text-[var(--text-secondary)]">{c.label}</span>
              <span className="flex-shrink-0 text-[var(--text-muted)]">{formatBytes(c.bytes)}</span>
            </div>
          ))}
        </div>

        {pinned ? (
          <div className="mt-3 space-y-2 border-t border-[var(--border-card)] pt-2.5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => post({ type: 'open_storage_folder' })}
                title="Reveal the ~/.ava data folder"
                className="flex-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition"
              >
                Open folder
              </button>
              {reclaimBytes > 0 && (armed
                ? <button onClick={doReclaim} className="flex-shrink-0 rounded-lg border border-red-500/50 bg-red-500/15 px-2.5 py-1 text-[11px] font-medium text-red-300 hover:bg-red-500/25 transition">Free {formatBytes(reclaimBytes)}</button>
                : <button onClick={() => setArmed(true)} className="flex-shrink-0 rounded-lg border border-[var(--border-card)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:border-red-500/50 hover:text-red-300 transition">Reclaim</button>)}
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">Reclaim removes only stale backups. Models and runtime are Ava's local AI engine, managed in Desktop / Vision.</p>
          </div>
        ) : (
          <div className="mt-2 border-t border-[var(--border-card)] pt-2 text-[10px] text-[var(--text-muted)]">Click to manage</div>
        )}
      </div>
    </div>
  );
}
