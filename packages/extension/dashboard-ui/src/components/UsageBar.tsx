interface UsageBarProps {
  used: number;
  limit: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function UsageBar({ used, limit }: UsageBarProps) {
  const pct = Math.min(100, (used / limit) * 100);

  const barColor =
    pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]';

  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs text-[var(--text-secondary)]">
        <span>{formatTokens(used)} tokens used</span>
        <span>{formatTokens(limit)} limit</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-input)]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-[var(--text-muted)]">
        {pct.toFixed(0)}% used
      </div>
    </div>
  );
}
