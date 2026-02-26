interface UsageBarProps {
  used: number;
  limit: number;
  accent?: boolean;
}

export function UsageBar({ used, limit, accent }: UsageBarProps) {
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct > 90
    ? 'bg-red-500'
    : pct > 70
      ? 'bg-amber-500'
      : accent
        ? 'bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]'
        : 'bg-emerald-500';

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-input)]">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="w-12 text-right text-[10px] text-[var(--text-muted)]">{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}
