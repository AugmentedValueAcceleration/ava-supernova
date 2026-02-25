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
  const color = pct >= 95 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
          marginBottom: '6px',
          opacity: 0.75,
        }}
      >
        <span>{formatTokens(used)} tokens used</span>
        <span>{formatTokens(limit)} limit</span>
      </div>
      <div
        style={{
          height: '6px',
          borderRadius: '3px',
          background: 'var(--vscode-progressBar-background, #333)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: '3px',
            background: color,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.5 }}>
        {pct.toFixed(0)}% used
      </div>
    </div>
  );
}
