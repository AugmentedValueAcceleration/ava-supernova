import { useState, useEffect } from 'react';
import { post } from '../App';
import { UsageBar } from '../components/UsageBar';
import { SectionGroup } from '../components/SectionGroup';
import type { AccountInfo, UsageLogEntry } from '../types/messages';

interface UsageProps {
  account: AccountInfo;
  logs: UsageLogEntry[];
}

interface ModelBreakdown {
  model: string;
  input: number;
  output: number;
  count: number;
}

export function Usage({ account, logs }: UsageProps) {
  const usage = account.usage ?? {
    tokens_used: 0,
    tokens_limit: null as number | null,
    requests_count: 0,
    period_start: null as string | null,
    period_end: null as string | null,
    free_tokens_used: 0,
    free_tokens_limit: 500_000,
  };
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('30d');

  useEffect(() => {
    post({ type: 'load_usage_logs', period });
  }, [period]);

  // Build model breakdown from logs
  const modelMap: Record<string, ModelBreakdown> = {};
  for (const log of logs) {
    if (!modelMap[log.model]) {
      modelMap[log.model] = { model: log.model, input: 0, output: 0, count: 0 };
    }
    modelMap[log.model].input += log.input_tokens;
    modelMap[log.model].output += log.output_tokens;
    modelMap[log.model].count += 1;
  }
  const breakdown = Object.values(modelMap).sort((a, b) => (b.input + b.output) - (a.input + a.output));
  const maxTotal = breakdown.length > 0 ? breakdown[0].input + breakdown[0].output : 1;

  const periodLabel = usage.period_start
    ? `${new Date(usage.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — ${new Date(usage.period_end!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : 'No active period';

  return (
    <div className="max-w-4xl">
      <div className="mb-10">
        <h1 className="text-2xl font-bold">Usage</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Track your token usage and request history.
        </p>
      </div>

      {/* Period Summary */}
      <div className="mb-10">
      <SectionGroup label="Summary">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Free Tokens"
          value={formatNumber(Math.max(0, usage.free_tokens_limit - usage.free_tokens_used))}
          sub={`of ${formatNumber(usage.free_tokens_limit)} remaining`}
        />
        <SummaryCard
          label="Plan Tokens"
          value={formatNumber(usage.tokens_used)}
          sub={usage.tokens_limit ? `of ${formatNumber(usage.tokens_limit)} limit` : 'used this period'}
        />
        <SummaryCard
          label="Requests"
          value={String(usage.requests_count)}
          sub="this period"
        />
        <SummaryCard
          label="Current Period"
          value={periodLabel}
          isText
        />
      </div>
      </SectionGroup>
      </div>

      {/* Token Bars */}
      <div className="mb-10">
      <SectionGroup label="Token Pools">
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
          {/* Free Pool */}
          <div className="mb-2 flex justify-between text-xs">
            <span className="text-[var(--text-secondary)]">
              Free Pool: {formatNumber(usage.free_tokens_used)} / {formatNumber(usage.free_tokens_limit)} tokens
            </span>
            {account.tier === 'admin' ? (
              <span className="font-medium text-[var(--gradient-start)]">Unlimited</span>
            ) : (
              <span className="text-[var(--text-muted)]">
                {((usage.free_tokens_used / usage.free_tokens_limit) * 100).toFixed(1)}%
              </span>
            )}
          </div>
          {account.tier === 'admin' ? (
            <div className="h-3 overflow-hidden rounded-full bg-[var(--bg-input)]">
              <div className="h-full w-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]" />
            </div>
          ) : (
            <UsageBar used={usage.free_tokens_used} limit={usage.free_tokens_limit} />
          )}
          <p className="mt-2 mb-5 text-[10px] text-[var(--text-muted)]">
            {account.tier === 'admin' ? 'No metering — admin tier' : '500K free tokens included every month. Resets monthly.'}
          </p>

          {/* Subscription Pool */}
          {(account.tier !== 'free' || usage.tokens_limit !== null) && (
            <>
              <div className="mb-2 flex justify-between text-xs">
                <span className="text-[var(--text-secondary)]">
                  {account.tier.charAt(0).toUpperCase() + account.tier.slice(1)} Plan: {formatNumber(usage.tokens_used)}{usage.tokens_limit !== null ? ` / ${formatNumber(usage.tokens_limit)} tokens` : ' tokens'}
                </span>
                {account.tier === 'admin' ? (
                  <span className="font-medium text-[var(--gradient-start)]">Unlimited</span>
                ) : usage.tokens_limit !== null ? (
                  <span className="text-[var(--text-muted)]">
                    {((usage.tokens_used / usage.tokens_limit) * 100).toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)]">BYOK — no limit</span>
                )}
              </div>
              {account.tier === 'admin' ? (
                <div className="h-3 overflow-hidden rounded-full bg-[var(--bg-input)]">
                  <div className="h-full w-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]" />
                </div>
              ) : usage.tokens_limit !== null ? (
                <UsageBar used={usage.tokens_used} limit={usage.tokens_limit} />
              ) : null}
            </>
          )}
        </div>
      </SectionGroup>
      </div>

      {/* Model Breakdown */}
      <div className="mb-10">
        <SectionGroup label="Usage by Model">
        {breakdown.length > 0 ? (
          <div className="space-y-3">
            {breakdown.map((m) => {
              const total = m.input + m.output;
              const pct = (total / maxTotal) * 100;
              return (
                <div key={m.model} className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{m.model}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {m.count} {m.count === 1 ? 'request' : 'requests'}
                    </span>
                  </div>
                  <div className="mb-2 h-2 overflow-hidden rounded-full bg-[var(--bg-input)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-[var(--text-muted)]">
                    <span>Input: {formatNumber(m.input)}</span>
                    <span>Output: {formatNumber(m.output)}</span>
                    <span>Total: {formatNumber(total)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">No usage data for this period.</p>
          </div>
        )}
        </SectionGroup>
      </div>

      {/* Recent Requests */}
      <div>
        <SectionGroup label="Recent Requests">
        <div className="flex items-center justify-end">
          <div className="flex gap-1 rounded-lg bg-[var(--bg-input)] p-1">
            {(['7d', '30d', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  period === p
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-muted)] hover:text-white'
                }`}
              >
                {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : 'All'}
              </button>
            ))}
          </div>
        </div>

        {logs.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-[var(--border-card)]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-card)] bg-[var(--bg-card)]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">Model</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">Provider</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)]">Input</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)]">Output</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)]">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-card)]">
                {logs.map((log) => (
                  <tr key={log.id} className="bg-[var(--bg-card)]/50">
                    <td className="px-4 py-3 text-sm font-medium">{log.model}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{log.provider}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-[var(--text-secondary)]">{log.input_tokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-[var(--text-secondary)]">{log.output_tokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--text-muted)]">{formatDate(log.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">No requests logged yet.</p>
          </div>
        )}
        </SectionGroup>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, isText }: { label: string; value: string; sub?: string; isText?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className={`mt-1 ${isText ? 'text-sm font-medium' : 'text-2xl font-bold'}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
