interface TierBadgeProps {
  tier: 'free' | 'pro' | 'ultra' | 'enterprise' | 'admin';
}

const TIER_CLASSES: Record<string, { bg: string; text: string; label: string }> = {
  free: { bg: 'bg-[#374151]', text: 'text-gray-300', label: 'Free' },
  pro: { bg: 'bg-[#1e3a5f]', text: 'text-blue-300', label: 'Pro' },
  ultra: { bg: 'bg-[#3b1f5e]', text: 'text-purple-300', label: 'Ultra' },
  enterprise: { bg: 'bg-[#4a3210]', text: 'text-amber-300', label: 'Enterprise' },
  admin: { bg: 'bg-[#1e3a2f]', text: 'text-emerald-300', label: 'Admin' },
};

export function TierBadge({ tier }: TierBadgeProps) {
  // Defensive fallback: if we're ever handed a tier not in the map (e.g.
  // a new plan added server-side before the client ships), render a
  // neutral "Free" badge instead of crashing the whole dashboard on
  // style.bg. Keeps the UI graceful when backend and client drift.
  const style = TIER_CLASSES[tier] || TIER_CLASSES.free;
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}
