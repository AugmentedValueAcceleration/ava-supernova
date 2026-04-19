interface UsageBarProps {
  used: number;
  limit: number;
  accent?: boolean;
}

export function UsageBar({ used, limit, accent }: UsageBarProps) {
  // Standard progress-bar semantics: the filled portion shows how much has
  // been consumed. 0 / 2 GB renders as an empty bar (0%), 1.9 / 2 GB as
  // nearly full (95%). Previous implementation filled by remaining tokens,
  // which made an empty-storage card look 100% maxed-out.
  const safeLimit = limit > 0 ? limit : 1;
  const rawPct = (used / safeLimit) * 100;
  const usedPct = Math.max(0, Math.min(rawPct, 100));

  // Colour ramps with the fill: green when there's plenty of headroom,
  // amber as you approach the cap, red when you're at risk of hitting it.
  const color = usedPct >= 90
    ? 'bg-red-500'
    : usedPct >= 70
      ? 'bg-amber-500'
      : accent
        ? 'bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]'
        : 'bg-emerald-500';

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-input)]">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${usedPct}%` }} />
        </div>
        <span className="w-12 text-right text-[10px] text-[var(--text-muted)]">{usedPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}
