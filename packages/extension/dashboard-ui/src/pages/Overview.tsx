import { TierBadge } from '../components/TierBadge';
import { UsageBar } from '../components/UsageBar';
import { post } from '../App';
import { BoltIcon, LinkIcon, ChartBarIcon, ChatBubbleIcon, GitHubIcon, EnvelopeIcon, GameControllerIcon } from '../components/Icons';
import type { AccountInfo, ConnectionStatus, Page } from '../types/messages';

interface OverviewProps {
  account: AccountInfo;
  connections: ConnectionStatus;
  onNavigate: (page: Page) => void;
}

const SERVICE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  github: GitHubIcon,
  email: EnvelopeIcon,
  slack: ChatBubbleIcon,
  discord: GameControllerIcon,
};

export function Overview({ account, connections, onNavigate }: OverviewProps) {
  const connectedCount = Object.values(connections).filter(Boolean).length;
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
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <StatCard
          icon={<LinkIcon className="h-5 w-5 text-[var(--gradient-start)]" />}
          value={`${connectedCount}/4`}
          label="Connections"
          subtext={connectedCount < 4 ? 'Set up more' : 'All connected'}
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

      {/* Connected Services */}
      <div className="mb-8 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Connected Services
          </p>
          <span className="text-xs text-[var(--text-muted)]">
            {connectedCount}/4 connected
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(connections) as Array<[keyof ConnectionStatus, boolean]>).map(([service, connected]) => {
            const Icon = SERVICE_ICONS[service];
            return (
              <div
                key={service}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                  connected
                    ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                    : 'border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-muted)]'
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                <span className="capitalize">{service}</span>
              </div>
            );
          })}
        </div>
        {connectedCount < 4 && (
          <button
            onClick={() => onNavigate('connections')}
            className="mt-3 border-none bg-transparent text-xs text-[var(--gradient-start)] hover:underline"
          >
            Set up connections &rarr;
          </button>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <ActionCard label="Manage Billing" onClick={() => onNavigate('billing')} />
        <ActionCard label="View Memory" onClick={() => onNavigate('memory')} />
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
