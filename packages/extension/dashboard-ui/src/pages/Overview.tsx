import { useState, useEffect, useMemo } from 'react';
import { TierBadge } from '../components/TierBadge';
import { UsageBar } from '../components/UsageBar';
import { SectionGroup } from '../components/SectionGroup';
import { post } from '../App';
import { BoltIcon, ChartBarIcon, LinkIcon } from '../components/Icons';
import type { AccountInfo, ConnectionStatus, Page, UsageLogEntry } from '../types/messages';

interface OverviewProps {
  account: AccountInfo;
  connections: ConnectionStatus;
  onNavigate: (page: Page) => void;
  logs: UsageLogEntry[];
}

export function Overview({ account, connections: _connections, onNavigate, logs }: OverviewProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(account.name ?? '');
  const [refreshing, setRefreshing] = useState(false);

  // Load usage logs on mount so we have fallback stats
  useEffect(() => {
    if (logs.length === 0) {
      post({ type: 'load_usage_logs', period: '30d' });
    }
  }, []);

  const saveName = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== account.name) {
      post({ type: 'update_name', name: trimmed });
    }
    setEditingName(false);
  };
  const usage = account.usage ?? {
    tokens_used: 0,
    tokens_limit: null as number | null,
    requests_count: 0,
    period_start: null as string | null,
    period_end: null as string | null,
    free_tokens_used: 0,
    free_tokens_limit: 500_000,
  };

  // Derive stats from logs as fallback when account.usage is stale/empty
  const logsTotal = useMemo(() => {
    let total = 0;
    for (const log of logs) { total += log.input_tokens + log.output_tokens; }
    return { total, count: logs.length };
  }, [logs]);

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* Page Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Overview</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') { setNameValue(account.name ?? ''); setEditingName(false); }
                }}
                placeholder="Your name"
                className="rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-0.5 text-sm text-white outline-none focus:border-[var(--accent)]"
              />
            ) : (
              <button
                onClick={() => { setNameValue(account.name ?? ''); setEditingName(true); }}
                className="text-sm text-[var(--text-secondary)] hover:text-white transition"
                title="Click to edit name"
              >
                {account.name || 'Set your name'}
              </button>
            )}
            <span className="text-xs text-[var(--text-muted)]">·</span>
            <span className="text-sm text-[var(--text-muted)]">{account.email}</span>
          </div>
        </div>
        <TierBadge tier={account.tier} />
      </div>

      {/* ── Statistics ─────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Statistics</h2>
          <button
            onClick={() => {
              setRefreshing(true);
              post({ type: 'refresh_account' });
              setTimeout(() => setRefreshing(false), 1500);
            }}
            title="Refresh stats"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-[var(--text-muted)] transition hover:bg-[var(--bg-input)] hover:text-white"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className={refreshing ? 'animate-spin' : ''}>
              <path d="M13.507 12.324a7 7 0 0 0 .065-8.56A7 7 0 0 0 2 4.393V2H1v3.5l.5.5H5V5H2.811a6.008 6.008 0 1 1-.135 5.77l-.887.462a7 7 0 0 0 11.718 1.092zM8 4h1v4.28l3.35 2.01-.51.858L8 8.72V4z"/>
            </svg>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<ChartBarIcon className="h-5 w-5 text-[var(--gradient-start)]" />}
              value={formatNumber(usage.tokens_used || logsTotal.total)}
              label="Tokens Used"
              subtext={usage.period_start ? `Since ${new Date(usage.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : (logsTotal.count > 0 ? `from ${logsTotal.count} requests` : undefined)}
            />
            <StatCard
              icon={<BoltIcon className="h-5 w-5 text-[var(--gradient-start)]" />}
              value={String(usage.requests_count || logsTotal.count)}
              label="Requests"
              subtext="This period"
            />
          </div>
        </div>
      </div>

      {/* ── Token Credits ──────────────────────────────────────── */}
      <div className="mb-6">
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
      <div className="mb-6">
        <SectionGroup label="Coming Soon">
          <div className="grid grid-cols-2 gap-3">
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
        <div className="grid grid-cols-2 gap-3">
          <ActionCard label="Manage Billing" onClick={() => onNavigate('billing')} />
          <ActionCard label="Open Chat" onClick={() => post({ type: 'open_chat' })} />
        </div>
      </SectionGroup>
    </div>
  );
}

function StatCard({ icon, value, label, subtext }: { icon: React.ReactNode; value: string; label: string; subtext?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-input)]">
        {icon}
      </div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
      {subtext && <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{subtext}</div>}
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
