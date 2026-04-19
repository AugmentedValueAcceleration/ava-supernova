// Browser-safe subpath — pulls ONLY the billing data module, not the
// node-side tool surface that @ava/core's main entry also exports.
import {
  PLANS,
  TOKEN_TOPUPS,
  STORAGE_ADDONS,
  pricingUrl,
  dashboardBillingUrl,
  upgradeUrl,
  tokenTopupUrl,
  storageAddonUrl,
  type PlanTier,
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

      {/* Current Plan */}
      <div className="mb-10">
      <SectionGroup label={t('dash.billing.current_plan')}>
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <TierBadge tier={account.tier} />
          {usage.period_end && (
            <span className="text-xs text-[var(--text-muted)]">
              Renews {new Date(usage.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>

        {/* Free Token Pool */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Free Tokens</p>
            {account.tier === 'admin' ? (
              <span className="text-xs font-medium text-[var(--gradient-start)]">Unlimited</span>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">
                {formatNumber(usage.free_tokens_limit - usage.free_tokens_used)} remaining
              </span>
            )}
          </div>
          {account.tier === 'admin' ? (
            <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-input)]">
              <div className="h-full w-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]" />
            </div>
          ) : (
            <UsageBar used={usage.free_tokens_used} limit={usage.free_tokens_limit} />
          )}
        </div>

        {/* Plan Tokens */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {account.tier.charAt(0).toUpperCase() + account.tier.slice(1)} Plan
            </p>
            {account.tier === 'admin' ? (
              <span className="text-xs font-medium text-[var(--gradient-start)]">Unlimited</span>
            ) : usage.tokens_limit !== null ? (
              <span className="text-xs text-[var(--text-muted)]">
                {formatNumber(usage.tokens_limit - usage.tokens_used)} remaining
              </span>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">BYOK — no limit</span>
            )}
          </div>
          {account.tier === 'admin' ? (
            <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-input)]">
              <div className="h-full w-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]" />
            </div>
          ) : usage.tokens_limit !== null ? (
            <UsageBar used={usage.tokens_used} limit={usage.tokens_limit} accent />
          ) : null}
        </div>

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

      {/* Storage Top-ups — paid users only */}
      {account.tier !== 'free' && account.tier !== 'admin' && (
        <div className="mb-10">
          <SectionGroup
            label="Add Storage"
            description="Recurring monthly add-ons. Stack multiple if you need more. Cancel anytime."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {STORAGE_ADDONS.map((a: StorageAddonDefinition) => (
                <button
                  key={a.id}
                  onClick={() => openUrl(storageAddonUrl(a.id))}
                  className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] p-5 text-center transition hover:border-[var(--accent)]/30"
                >
                  <p className="text-xl font-bold text-[var(--gradient-start)]">
                    ${a.price}<span className="text-xs font-normal text-[var(--text-muted)]">/mo</span>
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{a.label}</p>
                </button>
              ))}
            </div>
          </SectionGroup>
        </div>
      )}

      {/* Token top-ups — paid users only, canonical pricing from @ava/core */}
      {account.tier !== 'free' && account.tier !== 'admin' && (
        <div className="mb-10">
        <SectionGroup label="Top Up Tokens" description="Running low? Add extra tokens — they never expire.">
          <div className="grid gap-3 sm:grid-cols-3">
            {TOKEN_TOPUPS.map((pkg: TokenTopupDefinition) => (
              <button
                key={pkg.id}
                onClick={() => openUrl(tokenTopupUrl(pkg.id))}
                className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] p-5 text-center transition hover:border-[var(--accent)]/30"
              >
                <p className="text-xl font-bold text-[var(--gradient-start)]">${pkg.price}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{pkg.label}</p>
              </button>
            ))}
          </div>
        </SectionGroup>
        </div>
      )}

      {/* Upgrade Cards — every tier above the user's current one */}
      {account.tier !== 'enterprise' && account.tier !== 'admin' && (
        <SectionGroup label="Upgrade">
          <div className={`grid gap-3 ${upgradeTargets(account.tier).length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {upgradeTargets(account.tier).map((tier) => (
              <UpgradeCard
                key={tier}
                tier={tier}
                highlight={tier === 'ultra'}
                onUpgrade={() => openUrl(upgradeUrl(tier))}
              />
            ))}
          </div>
        </SectionGroup>
      )}
    </div>
  );
}

/** The paid tiers a user on the given tier can upgrade to. */
function upgradeTargets(current: PlanTier): Array<'pro' | 'ultra' | 'enterprise'> {
  if (current === 'free') return ['pro', 'ultra', 'enterprise'];
  if (current === 'pro') return ['ultra', 'enterprise'];
  if (current === 'ultra') return ['enterprise'];
  return [];
}

function UpgradeCard({
  tier,
  highlight,
  onUpgrade,
}: {
  tier: 'pro' | 'ultra' | 'enterprise';
  highlight: boolean;
  onUpgrade: () => void;
}) {
  const plan = PLANS[tier];
  return (
    <div
      className={`flex flex-col rounded-xl border p-5 ${
        highlight ? 'border-[var(--accent)]/40 bg-[var(--bg-card)]' : 'border-[var(--border-card)] bg-[var(--bg-card)]'
      }`}
    >
      <TierBadge tier={tier} />
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

      <button
        onClick={onUpgrade}
        className={`mt-4 w-full rounded-lg py-2.5 text-sm font-semibold text-white transition ${
          highlight
            ? 'bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] hover:opacity-90'
            : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
        }`}
      >
        Upgrade to {plan.name}
      </button>
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
