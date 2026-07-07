import { useState } from 'react';
import type { StorageScan } from '../types/messages';
import { post } from '../App';

// ─── Storage bar + manager ───────────────────────────────────────────────────
//
// A slim, colour-coded bar of Ava's WHOLE local footprint (~/.ava), segmented by
// category — Models, Runtime, Creative, Memory, Journal, Datasets, Old backups,
// Other. Hover a segment for a tooltip; click for the full breakdown + one-tap
// reclaim of stale backups. Shared by the Command Center header and the Library
// so both tell the same, honest story. Data comes from the host footprint scan
// (get_storage_scan); the webview can't read the disk itself.

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

/** The compact bar. Renders nothing until the scan has landed. */
export function StorageBar({ scan, label = 'Storage' }: { scan: StorageScan | null; label?: string }) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  if (!scan || scan.totalBytes <= 0) return null;
  const { totalBytes, categories, reclaim } = scan;

  const reclaimPaths = reclaim.flatMap(r => r.paths);
  const reclaimBytes = reclaim.reduce((a, r) => a + r.bytes, 0);
  const doReclaim = () => { if (reclaimPaths.length) post({ type: 'reclaim_storage', paths: reclaimPaths }); setArmed(false); setOpen(false); };

  return (
    <>
      <button
        type="button"
        onClick={() => { setArmed(false); setOpen(true); }}
        className="group block w-full text-left"
        title="Storage — click for the breakdown"
      >
        <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>{label}</span>
          <span className="text-[var(--text-secondary)]">{formatBytes(totalBytes)}</span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
          {categories.map(c => (
            <div
              key={c.key}
              title={`${c.label} · ${formatBytes(c.bytes)}`}
              style={{ width: `${Math.max(0.5, (c.bytes / totalBytes) * 100)}%`, background: colorOf(c.key) }}
              className="h-full transition-opacity group-hover:opacity-90"
            />
          ))}
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => { setOpen(false); setArmed(false); }}>
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Storage</h3>
              <button onClick={() => { setOpen(false); setArmed(false); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition" aria-label="Close">✕</button>
            </div>
            <p className="mb-4 text-[12px] text-[var(--text-muted)]">
              Ava is using <span className="text-[var(--text-secondary)]">{formatBytes(totalBytes)}</span> on this machine
            </p>

            <div className="space-y-2">
              {categories.map(c => (
                <div key={c.key} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12px] text-[var(--text-secondary)]">
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorOf(c.key) }} />
                        {c.label}
                      </span>
                      <span className="flex-shrink-0 text-[11px] text-[var(--text-muted)]">{formatBytes(c.bytes)}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(1, (c.bytes / totalBytes) * 100)}%`, background: colorOf(c.key) }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {reclaimBytes > 0 && (
              <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-white/[0.03] p-3">
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-[var(--text-secondary)]">Reclaim old backups</div>
                  <div className="text-[11px] text-[var(--text-muted)]">Stale migration backups · frees {formatBytes(reclaimBytes)}</div>
                </div>
                {armed
                  ? <button onClick={doReclaim} className="flex-shrink-0 rounded-md border border-red-500/50 bg-red-500/15 px-2.5 py-1 text-[11px] font-medium text-red-300 hover:bg-red-500/25 transition">Confirm delete</button>
                  : <button onClick={() => setArmed(true)} className="flex-shrink-0 rounded-md border border-[var(--border-card)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:border-red-500/50 hover:text-red-300 transition">Reclaim</button>}
              </div>
            )}

            <p className="mt-4 text-[10px] leading-relaxed text-[var(--text-muted)]">
              Models and runtime are Ava's local AI engine — shown for transparency. They're managed with the models in Desktop / Vision, not here. Reclaim only ever removes stale backups.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
