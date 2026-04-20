// Browser-safe subpath — pulls ONLY the billing data module, not the
// node-side tool surface that @ava/core's main entry also exports.
import { useEffect } from 'react';
import {
  PLANS,
  TOKEN_TOPUPS,
  STORAGE_ADDONS,
  pricingUrl,
  dashboardBillingUrl,
  type TokenTopupDefinition,
  type StorageAddonDefinition,
} from '@ava/core/billing';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import type { AccountInfo } from '../types/messages';
import { UsageBar } from '../components/UsageBar';
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

  // Trigger a fresh storage calculation whenever the Billing tab mounts.
  // The server endpoint re-sums pg_column_size across all the user's
  // cloud-synced objects and writes the result to usage.storage_gb_used,
  // then the host pushes an updated account snapshot back to the webview.
  // Silent + fire-and-forget — never blocks initial render, never surfaces
  // errors. If the platform is unreachable the user keeps seeing whatever
  // cached value they had.
  useEffect(() => {
    post({ type: 'refresh_storage' });
  }, []);

  const usage = account.usage ?? {
    tokens_used: 0,
    tokens_limit: null as number | null,
    requests_count: 0,
    period_start: null as string | null,
    period_end: null as string | null,
    free_tokens_used: 0,
    free_tokens_limit: 500_000,
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-10">
        <h1 className="text-2xl font-bold">{t('dash.billing.title')}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {t('dash.billing.subtitle')}
        </p>
      </div>

      {/* Current Plan — one unified bar covering free + subscription + top-ups.
          Paid users see the renewal date from the subscription cycle (not the
          calendar-month usage window). Free users see no renewal date. */}
      <div className="mb-10">
      <SectionGroup label={t('dash.billing.current_plan')}>
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <TierBadge tier={account.tier} />
          {account.subscription?.current_period_end && (
            <span className="text-xs text-[var(--text-muted)]">
              Renews {new Date(account.subscription.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>

        {(() => {
          const totalUsed = usage.free_tokens_used + usage.tokens_used;
          const totalLimit = usage.free_tokens_limit + (usage.tokens_limit ?? 0);
          const remaining = Math.max(0, totalLimit - totalUsed);
          return (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Tokens Remaining</p>
                {account.tier === 'admin' ? (
                  <span className="text-xs font-medium text-[var(--gradient-start)]">Unlimited</span>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">
                    {formatNumber(remaining)} of {formatNumber(totalLimit)}
                  </span>
                )}
              </div>
              {account.tier === 'admin' ? (
                <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-input)]">
                  <div className="h-full w-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]" />
                </div>
              ) : (
                <UsageBar used={totalUsed} limit={totalLimit} accent />
              )}
            </div>
          );
        })()}

        {account.tier !== 'free' && account.tier !== 'admin' && (
          <button
            onClick={() => openUrl(dashboardBillingUrl())}
            className="rounded-lg border border-[var(--border-input)] px-4 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)] hover:text-white"
          >
            Manage Subscription &rarr;
          </button>
        )}
      </div>
      </SectionGroup>
      </div>

      {/* Cloud Storage */}
      {account.storage && (
        <div className="mb-10">
          <SectionGroup
            label="Cloud Storage"
            description="Syncs across every device you use Ava on. Local files always work, even at cap."
          >
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
              <div className="mb-4 flex items-baseline justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Used</p>
                  <p className="mt-1 text-xl font-semibold">
                    {formatStorage(account.storage.used_gb)} <span className="text-sm text-[var(--text-muted)]">of {formatStorage(account.storage.total_gb)}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatStorage(account.storage.base_gb)} plan
                    {account.storage.addon_gb > 0 && ` + ${formatStorage(account.storage.addon_gb)} add-ons`}
                  </p>
                  <button
                    onClick={() => post({ type: 'refresh_storage' })}
                    title="Recalculate storage usage"
                    className="mt-1 text-[10px] text-[var(--text-muted)] transition hover:text-[var(--text-secondary)] bg-transparent border-none cursor-pointer p-0"
                  >
                    Refresh &#x21bb;
                  </button>
                </div>
              </div>
              <UsageBar used={account.storage.used_gb} limit={account.storage.total_gb} accent />
              <p className="mt-3 text-[11px] text-[var(--text-muted)]">
                Hit the cap? Cloud sync pauses; local work keeps going. Add a top-up anytime to raise it.
              </p>
            </div>
          </SectionGroup>
        </div>
      )}

      {/* Storage Add-ons — every CTA opens the web billing dashboard in
          the browser. The extension stays out of the Stripe flow and the
          user sees identical prices to the marketing site. */}
      {account.tier !== 'admin' && (
        <div className="mb-10">
          <SectionGroup
            label="Add Storage"
            description="Recurring monthly add-ons. Stack multiple if you need more."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {STORAGE_ADDONS.map((a: StorageAddonDefinition) => (
                <PurchaseCard
                  key={a.id}
                  title={a.label}
                  subtitle={a.subtitle}
                  price={`$${a.price}`}
                  priceSuffix="/mo"
                  effectiveRate={a.effectiveRate}
                  popular={a.popular}
                  state="live"
                  ctaLabel="Add storage"
                  onClick={() => openUrl(dashboardBillingUrl())}
                />
              ))}
            </div>
          </SectionGroup>
        </div>
      )}

      {/* Token top-ups — CTAs deep-link to the dashboard billing page
          (same flow used by Pricing). Canonical data + effective rate
          makes the 10M "Best value" label honest. */}
      {account.tier !== 'admin' && (
        <div className="mb-10">
        <SectionGroup label="Top Up Tokens" description="Running low? Add extra tokens — they never expire.">
          <div className="grid gap-3 sm:grid-cols-3">
            {TOKEN_TOPUPS.map((pkg: TokenTopupDefinition) => (
              <PurchaseCard
                key={pkg.id}
                title={pkg.label}
                subtitle={pkg.subtitle}
                price={`$${pkg.price}`}
                effectiveRate={pkg.effectiveRate}
                popular={pkg.popular}
                state="live"
                ctaLabel="Buy tokens"
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
        <SectionGroup label="Plans">
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
            Your plan
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
          Current plan
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
          Downgrade to Free
        </button>
      ) : (
        <button
          onClick={onUpgrade}
          className="mt-4 w-full rounded-lg bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Upgrade to {tier.charAt(0).toUpperCase() + tier.slice(1)}
        </button>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatStorage(gb: number): string {
  if (gb >= 1000) return `${(gb / 1024).toFixed(2)} TB`;
  if (gb >= 10) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(gb * 1024)} MB`;
}

// Re-export so callers can reach the website URL helpers without pulling
// @ava/core directly (e.g. DashboardPage and routing components).
export { pricingUrl };
