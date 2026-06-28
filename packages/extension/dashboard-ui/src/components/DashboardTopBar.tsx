import type { AccountInfo } from '../types/messages';
import { t, useLocale } from '../i18n';

/**
 * Thin status strip rendered above every non-Chat page. Shows the
 * operator's plan tier + credit balance so they always know where they
 * stand without opening Account.
 *
 * Chat has its own full Header (model picker, conversation title,
 * Tasks, New Chat); this is the compact equivalent for pages that
 * don't need those affordances. Credit logic mirrors the Chat header
 * so the operator never sees two different numbers for the same pool.
 */

interface Props {
  account: AccountInfo | null;
}

export function DashboardTopBar({ account }: Props) {
  useLocale();
  const tier = account?.tier ?? null;
  const usage = account?.usage ?? null;

  // Same colour ramp as the Chat header credits chip. Admin = ∞. No
  // usage row yet = "Loading…" so we don't show stale zeros.
  let creditsNode: React.ReactNode = null;
  if (account) {
    if (tier === 'admin') {
      creditsNode = (
        <span
          className="text-[11px] tabular-nums"
          style={{ fontFamily: 'monospace', color: '#6c7086', opacity: 0.6 }}
          title={t('dash.topbar.unlimited_credits')}
        >∞ credits</span>
      );
    } else if (!usage) {
      creditsNode = (
        <span className="text-[11px] text-[var(--text-muted)]">{t('dash.topbar.loading_credits')}</span>
      );
    } else {
      const limit = (usage.free_credits_limit ?? 0) + (usage.credits_limit ?? 0);
      const used = (usage.free_credits_used ?? 0) + (usage.credits_used ?? 0);
      if (limit > 0) {
        const remaining = Math.max(0, limit - used);
        const pct = (used / limit) * 100;
        const color = pct >= 95 ? '#ef4444' : pct >= 80 ? '#eab308' : '#a6e3a1';
        creditsNode = (
          <span
            className="text-[11px] tabular-nums font-semibold"
            style={{ fontFamily: 'monospace', color }}
            title={t('dash.topbar.credits_remaining_title', { remaining: remaining.toLocaleString(), limit: limit.toLocaleString(), pct: Math.round(pct) })}
          >
            {t('dash.topbar.credits_left', { remaining: remaining.toLocaleString() })}
          </span>
        );
      }
    }
  } else {
    creditsNode = (
      <span className="text-[11px] text-[var(--text-muted)]" title={t('dash.topbar.sign_in_balance')}>
        {t('dash.topbar.byok_no_account')}
      </span>
    );
  }

  const tierLabel = tier
    ? tier === 'admin' ? 'Admin' : tier.charAt(0).toUpperCase() + tier.slice(1)
    : null;

  return (
    <div
      className="flex items-center justify-end gap-3 border-b border-[color-mix(in_srgb,var(--accent)_10%,transparent)] bg-gradient-to-r from-[#0f0f17] to-[#1a1625] px-6 py-2"
      style={{ minHeight: 40 }}
    >
      {tierLabel && (
        <span
          className="rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--accent)]"
          title={t('dash.topbar.plan_title', { tier: tierLabel })}
        >
          {tierLabel}
        </span>
      )}
      {creditsNode}
    </div>
  );
}
