import { TierBadge } from '../components/TierBadge';
import { UsageBar } from '../components/UsageBar';
import { post } from '../App';
import { BoltIcon, ChartBarIcon, SparklesIcon, LinkIcon } from '../components/Icons';
import type { AccountInfo, ConnectionStatus, Page } from '../types/messages';

interface OverviewProps {
  account: AccountInfo;
  connections: ConnectionStatus;
  onNavigate: (page: Page) => void;
}

export function Overview({ account, connections: _connections, onNavigate }: OverviewProps) {
  const usage = account.usage;

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{account.email}</p>
        </div>
        <TierBadge tier={account.tier} />
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <StatCard
          icon={<ChartBarIcon className="h-5 w-5 text-[var(--gradient-start)]" />}
          value={usage ? formatNumber(usage.tokens_used) : '0'}
          label="Tokens Used"
          subtext={usage?.period_start ? `Since ${new Date(usage.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : undefined}
        />
        <StatCard
          icon={<BoltIcon className="h-5 w-5 text-[var(--gradient-start)]" />}
          value={usage ? String(usage.requests_count) : '0'}
          label="Requests"
          subtext="This period"
        />
      </div>

      {/* Free Token Pool (all tiers except admin) */}
      {account.tier !== 'admin' && usage && (
        <div className="mb-8 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Free Token Pool
          </p>
          <UsageBar used={usage.free_tokens_used} limit={usage.free_tokens_limit} />
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            500K free tokens included every month. Resets at the start of each billing period.
          </p>
        </div>
      )}

      {/* Subscription Usage (paid tiers) */}
      {(account.tier === 'pro' || account.tier === 'ultra') && usage && usage.tokens_limit !== null && (
        <div className="mb-8 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Subscription Tokens
          </p>
          <UsageBar used={usage.tokens_used} limit={usage.tokens_limit} />
          {usage.tokens_used >= usage.tokens_limit * 0.95 && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => post({ type: 'open_topup', package: 'starter' })}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)]"
              >
                Top Up Tokens
              </button>
              {account.tier === 'pro' && (
                <button
                  onClick={() => post({ type: 'open_checkout', plan: 'ultra' })}
                  className="rounded-lg border border-[var(--border-input)] px-4 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)] hover:text-white"
                >
                  Upgrade to Ultra
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Admin unlimited */}
      {account.tier === 'admin' && (
        <div className="mb-8 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
          <p className="text-sm font-medium text-[var(--gradient-start)]">
            Unlimited tokens — admin tier
          </p>
        </div>
      )}

      {/* Upgrade CTA (free tier only) */}
      {account.tier === 'free' && (
        <div className="mb-8 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            Want more tokens? Upgrade for 10M+ managed tokens per month — no API key needed.
          </p>
          <button
            onClick={() => post({ type: 'open_checkout', plan: 'pro' })}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)]"
          >
            Upgrade to Pro — $19/mo
          </button>
        </div>
      )}

      {/* Coming Soon — Memory & Connections */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SparklesIcon className="h-4 w-4 text-[var(--text-muted)]" />
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Memory</p>
            </div>
            <span className="rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">Coming Soon</span>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            Memory sync between the extension and your account is on the way.
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-[var(--text-muted)]" />
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Connections</p>
            </div>
            <span className="rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">Coming Soon</span>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            Connect GitHub, Email, Slack, and Discord — all from one place.
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionCard label="Manage Billing" onClick={() => onNavigate('billing')} />
        <ActionCard label="Open Chat" onClick={() => post({ type: 'open_chat' })} />
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, subtext }: { icon: React.ReactNode; value: string; label: string; subtext?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-input)]">
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-[var(--text-secondary)]">{label}</div>
      {subtext && <div className="mt-0.5 text-xs text-[var(--text-muted)]">{subtext}</div>}
    </div>
  );
}

function ActionCard({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 text-left text-sm text-[var(--text-secondary)] transition hover:border-[var(--accent)]/30 hover:text-white"
    >
      {label}
    </button>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
