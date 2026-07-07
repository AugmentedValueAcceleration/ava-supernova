import { useState } from 'react';
import type { CreativeAsset } from '../types/messages';
import { post } from '../App';
import { DESIGN_GROUPS, designTypeMeta, coarseKindToType, accentOfType } from '../lib/design-types';

// ─── Storage bar + manager ───────────────────────────────────────────────────
//
// A slim, colour-coded bar of how much the LOCAL creative gallery is using on
// disk, segmented by fine type (group accent per segment). Hover a segment for a
// quick tooltip; click the bar to open the manager and prune. Shared by the
// Library Assets tab and the Command Center header so both read identically.
//
// Everything is computed straight from the already-loaded localCreative assets
// (each carries size_bytes) — no extra host call. Only touches
// ~/.ava/…/creative; workspace files are never counted or deleted.

export interface StorageRow {
  type: string; label: string; accent: string;
  bytes: number; count: number; ids: string[]; createdAt: string[];
}

function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

/** Total on-disk usage + a per-type breakdown, from the local creative assets.
 *  Only image/video assets count (the Assets-tab scope); rows follow nav order. */
export function computeStorageSummary(assets: CreativeAsset[]): { totalBytes: number; rows: StorageRow[] } {
  let totalBytes = 0;
  const byType = new Map<string, StorageRow>();
  for (const a of assets) {
    const k = (a.asset_type || a.type || 'image').toLowerCase();
    if (!['image', 'video', 'graphic'].includes(k)) continue;
    const bytes = a.size_bytes ?? 0;
    totalBytes += bytes;
    const et = a.design_type || coarseKindToType(k);
    const cur = byType.get(et) ?? {
      type: et, label: designTypeMeta(et)?.label ?? et, accent: accentOfType(et),
      bytes: 0, count: 0, ids: [], createdAt: [],
    };
    cur.bytes += bytes; cur.count++; cur.ids.push(a.id); cur.createdAt.push(a.created_at);
    byType.set(et, cur);
  }
  const order: string[] = DESIGN_GROUPS.flatMap(g => g.items.map(i => i.id));
  const rows = [...byType.values()].sort((a, b) => (order.indexOf(a.type) + 1 || 999) - (order.indexOf(b.type) + 1 || 999));
  return { totalBytes, rows };
}

/** The compact bar. Renders nothing until something has actually been saved. */
export function StorageBar({ assets, label = 'Local library' }: { assets: CreativeAsset[]; label?: string }) {
  const { totalBytes, rows } = computeStorageSummary(assets);
  const [open, setOpen] = useState(false);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  if (totalBytes <= 0) return null;

  const prune = (ids: string[]) => { if (ids.length) post({ type: 'prune_creative', ids }); setConfirmKey(null); };

  return (
    <>
      <button
        type="button"
        onClick={() => { setConfirmKey(null); setOpen(true); }}
        className="group block w-full text-left"
        title="Storage — click to manage"
      >
        <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>{label}</span>
          <span className="text-[var(--text-secondary)]">{formatBytes(totalBytes)}</span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
          {rows.map(r => (
            <div
              key={r.type}
              title={`${r.label} · ${formatBytes(r.bytes)} (${r.count})`}
              style={{ width: `${Math.max(1, (r.bytes / totalBytes) * 100)}%`, background: r.accent }}
              className="h-full transition-opacity group-hover:opacity-90"
            />
          ))}
        </div>
      </button>
      {open && (
        <StorageManager
          rows={rows}
          totalBytes={totalBytes}
          confirmKey={confirmKey}
          onArm={setConfirmKey}
          onPrune={prune}
          onClose={() => { setOpen(false); setConfirmKey(null); }}
        />
      )}
    </>
  );
}

/** Storage manager modal — usage by type with one-tap pruning (by type, or by
 *  age across all types). Deletes are two-tap (arm → confirm) since
 *  window.confirm is unreliable in webviews. */
function StorageManager({ rows, totalBytes, confirmKey, onArm, onPrune, onClose }: {
  rows: StorageRow[];
  totalBytes: number;
  confirmKey: string | null;
  onArm: (key: string | null) => void;
  onPrune: (ids: string[]) => void;
  onClose: () => void;
}) {
  const idsOlderThan = (days: number): string[] => {
    const cutoff = Date.now() - days * 86_400_000;
    const ids: string[] = [];
    for (const r of rows) r.createdAt.forEach((c, i) => {
      const t = Date.parse(c);
      if (!Number.isNaN(t) && t < cutoff) ids.push(r.ids[i]);
    });
    return ids;
  };
  const ClearBtn = ({ k, ids, label = 'Clear' }: { k: string; ids: string[]; label?: string }) => (
    confirmKey === k
      ? <button onClick={() => onPrune(ids)} className="rounded-md border border-red-500/50 bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300 hover:bg-red-500/25 transition">Confirm ({ids.length})</button>
      : <button onClick={() => onArm(k)} disabled={!ids.length} className="rounded-md border border-[var(--border-card)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)] hover:border-red-500/50 hover:text-red-300 disabled:opacity-40 disabled:pointer-events-none transition">{label}</button>
  );
  const totalCount = rows.reduce((n, r) => n + r.count, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Storage</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition" aria-label="Close">✕</button>
        </div>
        <p className="mb-4 text-[12px] text-[var(--text-muted)]">
          Local creative library · <span className="text-[var(--text-secondary)]">{formatBytes(totalBytes)}</span> across {totalCount} asset{totalCount === 1 ? '' : 's'}
        </p>

        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.type} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12px] text-[var(--text-secondary)]">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: r.accent }} />
                    {r.label} <span className="text-[var(--text-muted)]">· {r.count}</span>
                  </span>
                  <span className="flex-shrink-0 text-[11px] text-[var(--text-muted)]">{formatBytes(r.bytes)}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full" style={{ width: `${totalBytes ? Math.max(3, (r.bytes / totalBytes) * 100) : 0}%`, background: r.accent }} />
                </div>
              </div>
              <ClearBtn k={`type:${r.type}`} ids={r.ids} />
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-[var(--border-card)] pt-3">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Clear older than</div>
          <div className="flex items-center gap-4">
            {[30, 90].map(days => {
              const ids = idsOlderThan(days);
              return (
                <div key={days} className="flex items-center gap-1.5">
                  <span className="text-[11px] text-[var(--text-secondary)]">{days} days</span>
                  <ClearBtn k={`age:${days}`} ids={ids} label={ids.length ? `Clear ${ids.length}` : 'None'} />
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-muted)]">Only affects assets in your local creative library. Deletes are permanent.</p>
        </div>
      </div>
    </div>
  );
}
