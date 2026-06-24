// Browser-safe subpath — pulls ONLY the billing data module, not the
// node-side tool surface that @ava/core's main entry also exports.
import {
  PLANS,
  CREDIT_TOPUPS,
  pricingUrl,
  dashboardBillingUrl,
  type CreditTopupDefinition,
} from '@ava/core/billing';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import type { AccountInfo } from '../types/messages';
import { TierBadge } from '../components/TierBadge';
import { SectionGroup } from '../components/SectionGroup';
import { CheckIcon } from '../components/Icons';
import { PurchaseCard } from '../components/PurchaseCard';

// Every pricing/upgrade CTA opens the canonical website page in the user's
// browser rather than firing an in-extension Stripe flow. Keeps the extension
// out of the checkout business and guarantees the user sees the same prices
// they'd see on the marketing site.
function openUrl(url: string) {
  post({ type: 'open_url', url });
}

interface BillingProps {
  account: AccountInfo;
}

export function Billing({ account }: BillingProps) {
  useLocale();

  // Storage usage / refresh removed — cloud storage is sunsetting (1 Jul 2026).

  // Credits-redesign read shim. Free tier's free pool defaults to 300;
  // paid tiers have no free pool — their allowance lives in credits_limit.
  const rawUsage = (account.usage ?? {}) as Record<string, unknown>;
  const tierDefaults: Record<string, { free: number; sub: number | null }> = {
    free:       { free:   300,      sub: null    },
    pro:        { free: 0,          sub:  5_000  },
    ultra:      { free: 0,          sub: 10_000  },
    enterprise: { free: 0,          sub: 20_000  },
    admin:      { free: 0,          sub: 999_999_999 },
  };
  const td = tierDefaults[account.tier ?? 'free'] ?? tierDefaults.free;
  const usage = {
    credits_used:       Number(rawUsage.credits_used       ?? rawUsage.tokens_used       ?? 0),
    credits_limit:     ((rawUsage.credits_limit     as number | null | undefined) ?? (rawUsage.tokens_limit     as number | null | undefined) ?? td.sub) as number | null,
    requests_count:     Number(rawUsage.requests_count ?? 0),
    period_start:      (rawUsage.period_start      as string | null | undefined) ?? null,
    period_end:        (rawUsage.period_end        as string | null | undefined) ?? null,
    free_credits_used:  Number(rawUsage.free_credits_used  ?? rawUsage.free_tokens_used  ?? 0),
    free_credits_limit: Number(rawUsage.free_credits_limit ?? rawUsage.free_tokens_limit ?? td.free),
  };

  return (
    <div className="w-full">
      <div className="mb-10">
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.billing.title')}</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">
          {t('dash.billing.subtitle')}
        </p>
      </div>

      {/* Current Plan + Credits Remaining — split into two cards mirroring
          the IDE BillingPage at DashboardPages.tsx:11899-11958. Free tier
          shows free pool; paid tiers show plan pool. We don't sum them —
          on paid plans the legacy free credits aren't an additive bonus,
          they're just the pool that's bypassed (per
          project_billing_architecture). */}
      {(() => {
        const tierConfig: Record<string, { label: string; chipColor: string; chipBg: string; limitText: string }> = {
          free:       { label: t('dash.billing.plan.free'),       chipColor: '#a6e3a1', chipBg: 'rgba(166,227,161,0.10)', limitText: '300 credits' },
          pro:        { label: t('dash.billing.plan.pro'),        chipColor: '#89b4fa', chipBg: 'rgba(137,180,250,0.10)', limitText: '5,000 credits' },
          ultra:      { label: t('dash.billing.plan.ultra'),      chipColor: '#cba6f7', chipBg: 'rgba(203,166,247,0.10)', limitText: '10,000 credits' },
          enterprise: { label: t('dash.billing.plan.enterprise'), chipColor: '#f9e2af', chipBg: 'rgba(249,226,175,0.10)', limitText: '20,000 credits' },
          admin:      { label: t('dash.billing.plan.admin'),      chipColor: '#f38ba8', chipBg: 'rgba(243,139,168,0.10)', limitText: 'Unlimited' },
        };
        const tc = tierConfig[account.tier ?? 'free'] ?? tierConfig.free;
        const isFree = account.tier === 'free';
        const used = isFree ? usage.free_credits_used : usage.credits_used;
        const limit = isFree ? usage.free_credits_limit : (usage.credits_limit ?? 0);
        const remaining = Math.max(0, limit - used);
        const usedPct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
        const topUpBalance = Number((account.usage as Record<string, unknown> | undefined)?.topup_tokens_remaining ?? 0);

        return (
          <>
            {/* Current Plan — horizontal card */}
            <div className="mb-4 flex items-center justify-between rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
              <div>
                <div className="mb-1 text-xs text-[var(--text-muted)]">{t('dash.billing.current_plan')}</div>
                <div className="flex items-center gap-2.5">
                  <span className="text-xl font-bold text-[#cdd6f4]">{tc.label}</span>
                  <span
                    className="rounded-lg px-2.5 py-[3px] text-[11px] font-semibold"
                    style={{ color: tc.chipColor, background: tc.chipBg }}
                  >
                    {tc.limitText}
                  </span>
                </div>
                {account.subscription?.current_period_end && (
                  <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                    Renews {new Date(account.subscription.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                )}
              </div>
              {account.tier !== 'admin' && (
                <button
                  onClick={() => openUrl(dashboardBillingUrl())}
                  className="rounded-lg bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] px-[18px] py-2 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  {t('billing.manage_plan')}
                </button>
              )}
            </div>

            {/* Credits Remaining — separate card with big number */}
            <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
              <div className="mb-2 flex items-baseline justify-between">
                <div className="text-xs text-[var(--text-muted)]">{t('billing.credits_remaining')}</div>
                <div className="text-[11px] text-[#45475a]">
                  {limit > 0
                    ? `${remaining.toLocaleString()} of ${limit.toLocaleString()}`
                    : t('billing.no_credits_period')}
                </div>
              </div>
              <div className="mb-2.5 text-[28px] font-bold text-[#cdd6f4] tabular-nums">
                {account.tier === 'admin' ? '∞' : remaining.toLocaleString()}
              </div>
              <div className="h-1.5 overflow-hidden rounded-[3px] bg-[rgba(49,34,68,0.5)]">
                <div
                  className="h-full rounded-[3px] transition-[width] duration-500"
                  style={{
                    width: account.tier === 'admin' ? '100%' : `${usedPct}%`,
                    background: account.tier === 'admin'
                      ? 'linear-gradient(90deg, #a855f7, #7c3aed)'
                      : usedPct >= 95
                        ? 'linear-gradient(90deg, #f87171, #ef4444)'
                        : usedPct >= 80
                          ? 'linear-gradient(90deg, #f59e0b, #eab308)'
                          : 'linear-gradient(90deg, #a855f7, #7c3aed)',
                  }}
                />
              </div>
              <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                {account.tier === 'free'
                  ? t('billing.resets_monthly')
                  : account.tier === 'admin'
                    ? t('billing.unlimited_usage')
                    : t('billing.includes_allowance')}
              </div>
            </div>

            {/* Top-Up Balance — only shown when there's a separate top-up
                pool above the plan allowance. Mirrors IDE at
                DashboardPages.tsx:12026-12034. */}
            {topUpBalance > 0 && (
              <div className="mb-4 flex items-center justify-between rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
                <div>
                  <div className="mb-1 text-xs text-[var(--text-muted)]">{t('billing.topup_balance')}</div>
                  <div className="text-lg font-bold text-[#f9e2af]">{topUpBalance.toLocaleString()}</div>
                </div>
                <span className="rounded-lg px-2.5 py-[3px] text-[10px] font-semibold" style={{ color: '#f9e2af', background: 'rgba(249,226,175,0.10)' }}>
                  {t('billing.active')}
                </span>
              </div>
            )}
          </>
        );
      })()}

      {/* Cloud Storage display removed — cloud storage is sunsetting
          (1 Jul 2026); data is local-first, nothing to meter. */}

      {/* Storage add-ons removed — cloud storage is sunsetting (1 Jul 2026);
          we no longer sell it. Credit top-ups remain below. */}

      {/* Token top-ups — CTAs deep-link to the dashboard billing page
          (same flow used by Pricing). Canonical data + effective rate
          makes the 10M "Best value" label honest. */}
      {account.tier !== 'admin' && (
        <div className="mb-10">
        <SectionGroup label={t('billing.topup_credits')} description={t('billing.topup_credits_desc')}>
          <div className="grid gap-3 sm:grid-cols-3">
            {CREDIT_TOPUPS.map((pkg: CreditTopupDefinition) => (
              <PurchaseCard
                key={pkg.id}
                title={pkg.label}
                subtitle={pkg.subtitle}
                price={`$${pkg.price}`}
                effectiveRate={pkg.effectiveRate}
                popular={pkg.popular}
                state="live"
                ctaLabel={t('billing.buy_credits')}
                onClick={() => openUrl(dashboardBillingUrl())}
              />
            ))}
          </div>
        </SectionGroup>
        </div>
      )}

      {/* Plans — every tier shown for full transparency. Current tier is
          flagged "Your plan". Free is always visible so paid users can see
          where they'd land on cancellation. Upgrade buttons deep-link to
          the web billing dashboard where Stripe checkout runs. */}
      {account.tier !== 'admin' && (
        <SectionGroup label={t('billing.plans')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(['free', 'pro', 'ultra', 'enterprise'] as const).map((tier) => (
              <PlanCard
                key={tier}
                tier={tier}
                isCurrent={tier === account.tier}
                highlight={tier === 'ultra'}
                onUpgrade={() => openUrl(dashboardBillingUrl())}
              />
            ))}
          </div>
        </SectionGroup>
      )}
    </div>
  );
}

function PlanCard({
  tier,
  isCurrent,
  highlight,
  onUpgrade,
}: {
  tier: 'free' | 'pro' | 'ultra' | 'enterprise';
  isCurrent: boolean;
  highlight: boolean;
  onUpgrade: () => void;
}) {
  const plan = PLANS[tier];
  return (
    <div
      className={`flex flex-col rounded-xl border p-5 ${
        isCurrent
          ? 'border-[var(--gradient-start)]/50 bg-[var(--bg-card)]'
          : highlight
          ? 'border-[var(--accent)]/40 bg-[var(--bg-card)]'
          : 'border-[var(--border-card)] bg-[var(--bg-card)]'
      }`}
    >
      <div className="flex items-center justify-between">
        <TierBadge tier={tier} />
        {isCurrent && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--gradient-start)]">
            {t('billing.your_plan')}
          </span>
        )}
      </div>
      <div className="mt-3">
        <span className="text-3xl font-bold">${plan.price}</span>
        <span className="text-xs text-[var(--text-muted)]">/mo</span>
      </div>

      <ul className="mt-4 flex-1 space-y-2.5">
        {plan.features.map((f: string) => (
          <li key={f} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
            <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--gradient-start)]" />
            {f}
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <div className="mt-4 w-full rounded-lg border border-[var(--border-input)] py-2.5 text-center text-xs text-[var(--text-muted)]">
          {t('billing.current_plan_badge')}
        </div>
      ) : tier === 'free' ? (
        // Paid users always see a clean exit. Deep-link to the web
        // dashboard which runs the actual Stripe cancel_at_period_end
        // flow (/api/billing/downgrade). The extension stays out of
        // billing mutations by design, same as for upgrade / top-up.
        <button
          onClick={onUpgrade}
          className="mt-4 w-full rounded-lg border border-[var(--border-input)] py-2.5 text-center text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)]"
        >
          {t('billing.downgrade_free')}
        </button>
      ) : (
        <button
          onClick={onUpgrade}
          className="mt-4 w-full rounded-lg bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {t('billing.upgrade_to', { tier: t(`dash.billing.plan.${tier}`) })}
        </button>
      )}
    </div>
  );
}

// Re-export so callers can reach the website URL helpers without pulling
// @ava/core directly (e.g. DashboardPage and routing components).
export { pricingUrl };
