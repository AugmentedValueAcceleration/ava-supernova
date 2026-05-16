import { cloudSyncEnabled } from '../lib/data-mode';

/**
 * Small badge shown on data pages (Tasks, Memory, Learning, Journal).
 * Data is always stored locally; the badge reflects whether a cloud
 * copy is also kept. "Local only" (green) vs "Cloud sync" (blue).
 */
export function StorageBadge() {
  const cloudSync = cloudSyncEnabled();
  const s = cloudSync
    ? { border: 'border-blue-500/20', bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400', label: 'Cloud sync' }
    : { border: 'border-emerald-500/20', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Local only' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium ${s.border} ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
