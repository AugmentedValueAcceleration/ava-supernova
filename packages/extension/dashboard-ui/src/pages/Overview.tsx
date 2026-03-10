import { TierBadge } from '../components/TierBadge';
import { UsageBar } from '../components/UsageBar';
import { SectionGroup } from '../components/SectionGroup';
import { post } from '../App';
import { BoltIcon, ChartBarIcon, SparklesIcon, LinkIcon } from '../components/Icons';
import type { AccountInfo, ConnectionStatus, Page } from '../types/messages';

interface OverviewProps {
  account: AccountInfo;
  connections: ConnectionStatus;
  onNavigate: (page: Page) => void;
}

export function Overview({ account, connections: _connections, onNavigate }: OverviewProps) {
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
    <div className="max-w-4xl">
      {/* Page Header */}
      <div className="mb-10 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{account.email}</p>
        </div>
        <TierBadge tier={account.tier} />
      </div>

      {/* ── Statistics ─────────────────────────────────────────── */}
      <div className="mb-10">
        <SectionGroup label="Statistics">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              icon={<ChartBarIcon className="h-5 w-5 text-[var(--gradient-start)]" />}
              value={formatNumber(usage.tokens_used)}
              label="Tokens Used"
              subtext={usage.period_start ? `Since ${new Date(usage.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : undefined}
            />
            <StatCard
              icon={<BoltIcon className="h-5 w-5 text-[var(--gradient-start)]" />}
              value={String(usage.requests_count)}
              label="Requests"
              subtext="This period"
            />
          </div>
        </SectionGroup>
      </div>

      {/* ── Token Credits ──────────────────────────────────────── */}
      <div className="mb-10">
        <SectionGroup label="Token Credits">
          <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
            {/* Free Token Pool */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">Free Tokens</span>
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
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              {account.tier === 'admin' ? 'No metering — admin tier' : '500K free tokens included every month'}
            </p>

            <div className="my-5 border-t border-[var(--border-card)]" />

            {/* Plan Tokens */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {account.tier.charAt(0).toUpperCase() + account.tier.slice(1)} Plan
              </span>
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

            {/* Footer */}
            <div className="mt-5 flex items-center justify-between border-t border-[var(--border-card)] pt-4">
              <button
                onClick={() => onNavigate('usage')}
                className="text-xs text-[var(--gradient-start)] hover:underline"
              >
                View detailed usage &rarr;
              </button>
              {(account.tier === 'pro' || account.tier === 'ultra') && usage.tokens_limit !== null && usage.tokens_used >= usage.tokens_limit * 0.95 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => post({ type: 'open_topup', package: 'starter' })}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)]"
                  >
                    Top Up
                  </button>
                  {account.tier === 'pro' && (
                    <button
                      onClick={() => post({ type: 'open_checkout', plan: 'ultra' })}
                      className="rounded-lg border border-[var(--border-input)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)] hover:text-white"
                    >
                      Upgrade
                    </button>
                  )}
                </div>
              )}
              {account.tier === 'free' && (
                <button
                  onClick={() => onNavigate('billing')}
                  className="text-xs text-[var(--text-muted)] hover:text-white hover:underline"
                >
                  Upgrade for 10M+ tokens
                </button>
              )}
            </div>
          </div>

          {/* Upgrade CTA (free tier only) */}
          {account.tier === 'free' && (
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
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
        </SectionGroup>
      </div>

      {/* ── Coming Soon ────────────────────────────────────────── */}
      <div className="mb-10">
        <SectionGroup label="Coming Soon">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-dashed border-[var(--border-card)] bg-[var(--bg-card)] p-5">
              <div className="mb-3 flex items-center gap-2">
                <SparklesIcon className="h-4 w-4 text-[var(--text-muted)]" />
                <p className="text-sm font-semibold text-[var(--text-secondary)]">Memory Sync</p>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Memory sync between the extension and your account is on the way.
              </p>
            </div>
            <div className="rounded-xl border border-dashed border-[var(--border-card)] bg-[var(--bg-card)] p-5">
              <div className="mb-3 flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-[var(--text-muted)]" />
                <p className="text-sm font-semibold text-[var(--text-secondary)]">Connections</p>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Connect GitHub, Email, Slack, and Discord — all from one place.
              </p>
            </div>
          </div>
        </SectionGroup>
      </div>

      {/* ── Quick Actions ──────────────────────────────────────── */}
      <SectionGroup label="Quick Actions">
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionCard label="Manage Billing" onClick={() => onNavigate('billing')} />
          <ActionCard label="Open Chat" onClick={() => post({ type: 'open_chat' })} />
        </div>
      </SectionGroup>
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
      className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5 text-left text-sm text-[var(--text-secondary)] transition hover:border-[var(--accent)]/30 hover:text-white"
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
