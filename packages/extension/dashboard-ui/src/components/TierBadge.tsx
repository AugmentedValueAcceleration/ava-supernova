import { t, useLocale } from '../i18n';

interface TierBadgeProps {
  tier: 'free' | 'pro' | 'ultra' | 'enterprise' | 'admin';
}

// labelKey carries the i18n key for the tier name, shared with Billing.tsx.
const TIER_CLASSES: Record<string, { bg: string; text: string; labelKey: string }> = {
  free: { bg: 'bg-[#374151]', text: 'text-gray-300', labelKey: 'dash.billing.plan.free' },
  pro: { bg: 'bg-[#1e3a5f]', text: 'text-blue-300', labelKey: 'dash.billing.plan.pro' },
  ultra: { bg: 'bg-[#3b1f5e]', text: 'text-purple-300', labelKey: 'dash.billing.plan.ultra' },
  enterprise: { bg: 'bg-[#4a3210]', text: 'text-amber-300', labelKey: 'dash.billing.plan.enterprise' },
  admin: { bg: 'bg-[#1e3a2f]', text: 'text-emerald-300', labelKey: 'dash.billing.plan.admin' },
};

export function TierBadge({ tier }: TierBadgeProps) {
  useLocale();
  // Defensive fallback: if we're ever handed a tier not in the map (e.g.
  // a new plan added server-side before the client ships), render a
  // neutral "Free" badge instead of crashing the whole dashboard on
  // style.bg. Keeps the UI graceful when backend and client drift.
  const style = TIER_CLASSES[tier] || TIER_CLASSES.free;
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${style.bg} ${style.text}`}>
      {t(style.labelKey)}
    </span>
  );
}
