interface TierBadgeProps {
  tier: 'free' | 'pro' | 'ultra';
}

const TIER_STYLES = {
  free: { background: '#374151', color: '#9ca3af', label: 'FREE' },
  pro: { background: '#1e3a5f', color: '#60a5fa', label: 'PRO' },
  ultra: { background: '#3b1f5e', color: '#a78bfa', label: 'ULTRA' },
};

export function TierBadge({ tier }: TierBadgeProps) {
  const style = TIER_STYLES[tier];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.5px',
        background: style.background,
        color: style.color,
      }}
    >
      {style.label}
    </span>
  );
}
