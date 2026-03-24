import { t } from '../i18n';
import { post } from '../App';
import type { AccountInfo } from '../types/messages';
import { UsageBar } from '../components/UsageBar';
import { TierBadge } from '../components/TierBadge';
import { SectionGroup } from '../components/SectionGroup';
import { CheckIcon } from '../components/Icons';

interface BillingProps {
  account: AccountInfo;
}

const TOPUP_PACKAGES = [
  { id: 'starter', label: '2.5M tokens', price: '$5', tokens: '2,500,000' },
  { id: 'standard', label: '12M tokens', price: '$20', tokens: '12,000,000' },
  { id: 'pro_pack', label: '50M tokens', price: '$70', tokens: '50,000,000' },
] as const;

const PLAN_FEATURES: Record<string, string[]> = {
  pro: [
    'Managed API access — no keys needed',
    '5M tokens / month included',
    'All supported models',
    'Top-up tokens anytime',
    'Priority support',
  ],
  ultra: [
    'Everything in Pro',
    'Unlimited tokens',
    'Highest-priority routing',
    'Early access to new models',
    'Rate-limited only during extreme load',
  ],
};

export function Billing({ account }: BillingProps) {
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
            onClick={() => post({ type: 'open_portal' })}
            className="rounded-lg border border-[var(--border-input)] px-4 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)] hover:text-white"
          >
            Manage Subscription &rarr;
          </button>
        )}
      </div>
      </SectionGroup>
      </div>

      {/* Top-ups (Pro only) */}
      {account.tier === 'pro' && (
        <div className="mb-10">
        <SectionGroup label="Top Up Tokens" description="Running low? Add extra tokens — they never expire.">
          <div className="grid gap-3 sm:grid-cols-3">
            {TOPUP_PACKAGES.map(pkg => (
              <button
                key={pkg.id}
                onClick={() => post({ type: 'open_topup', package: pkg.id as 'starter' | 'standard' | 'pro_pack' })}
                className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] p-5 text-center transition hover:border-[var(--accent)]/30"
              >
                <p className="text-xl font-bold text-[var(--gradient-start)]">{pkg.price}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{pkg.label}</p>
              </button>
            ))}
          </div>
        </SectionGroup>
        </div>
      )}

      {/* Upgrade Cards */}
      {account.tier !== 'ultra' && account.tier !== 'admin' && (
        <SectionGroup label="Upgrade">
          <div className="grid gap-3 sm:grid-cols-2">
            {account.tier === 'free' && (
              <UpgradeCard
                title="Pro"
                price="$19"
                period="/mo"
                features={PLAN_FEATURES.pro}
                highlight={false}
                onUpgrade={() => post({ type: 'open_checkout', plan: 'pro' })}
              />
            )}
            <UpgradeCard
              title="Ultra"
              price="$49"
              period="/mo"
              features={PLAN_FEATURES.ultra}
              highlight={true}
              onUpgrade={() => post({ type: 'open_checkout', plan: 'ultra' })}
            />
          </div>
        </SectionGroup>
      )}
    </div>
  );
}

function UpgradeCard({
  title,
  price,
  period,
  features,
  highlight,
  onUpgrade,
}: {
  title: string;
  price: string;
  period: string;
  features: string[];
  highlight: boolean;
  onUpgrade: () => void;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border p-5 ${
        highlight ? 'border-[var(--accent)]/40 bg-[var(--bg-card)]' : 'border-[var(--border-card)] bg-[var(--bg-card)]'
      }`}
    >
      <TierBadge tier={title.toLowerCase() as 'pro' | 'ultra'} />
      <div className="mt-3">
        <span className="text-3xl font-bold">{price}</span>
        <span className="text-xs text-[var(--text-muted)]">{period}</span>
      </div>

      <ul className="mt-4 flex-1 space-y-2.5">
        {features.map(f => (
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
        Upgrade to {title}
      </button>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
