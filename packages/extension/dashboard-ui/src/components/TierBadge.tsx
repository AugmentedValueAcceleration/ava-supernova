interface TierBadgeProps {
  tier: 'free' | 'pro' | 'ultra' | 'admin';
}

const TIER_CLASSES: Record<string, { bg: string; text: string; label: string }> = {
  free: { bg: 'bg-[#374151]', text: 'text-gray-300', label: 'Free' },
  pro: { bg: 'bg-[#1e3a5f]', text: 'text-blue-300', label: 'Pro' },
  ultra: { bg: 'bg-[#3b1f5e]', text: 'text-purple-300', label: 'Ultra' },
  admin: { bg: 'bg-[#1e3a2f]', text: 'text-emerald-300', label: 'Admin' },
};

export function TierBadge({ tier }: TierBadgeProps) {
  const style = TIER_CLASSES[tier];
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}
