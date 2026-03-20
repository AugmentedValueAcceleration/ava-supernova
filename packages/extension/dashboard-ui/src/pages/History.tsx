import { useState, useMemo } from 'react';
import { post } from '../App';
import { SectionGroup } from '../components/SectionGroup';
import { UsageBar } from '../components/UsageBar';
import type { AccountInfo, SessionStats, UsageHistoryData } from '../types/messages';

// ─── Model pricing (per 1M tokens) ──────────────────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'qwen-turbo-latest': { input: 0.05, output: 0.40 },
  'qwen-plus-latest': { input: 0.20, output: 1.20 },
  'qwen3-235b-a22b': { input: 0.20, output: 1.20 },
  'qwq-plus': { input: 0.20, output: 1.20 },
  'qwen-max-latest': { input: 0.80, output: 3.20 },
};

const DEFAULT_PRICING = { input: 0.20, output: 1.20 };

function estimateCost(inputTokens: number, outputTokens: number, model: string): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  return `${hours}h ${remaining}m`;
}

function costColour(cost: number): string {
  if (cost < 0.10) return 'text-emerald-400';
  if (cost < 0.50) return 'text-yellow-400';
  if (cost < 1.00) return 'text-orange-400';
  return 'text-red-400';
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface HistoryProps {
  sessionStats: SessionStats | null;
  usageHistory: UsageHistoryData | null;
  mode: 'platform' | 'byok';
  account: AccountInfo | null;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function History({ sessionStats, usageHistory, mode, account }: HistoryProps) {
  const [activeTab, setActiveTab] = useState<'session' | 'alltime'>(() => {
    const saved = localStorage.getItem('ava-analytics-tab');
    return (saved === 'alltime' && mode === 'platform') ? 'alltime' : 'session';
  });

  const handleTabChange = (tab: 'session' | 'alltime') => {
    setActiveTab(tab);
    localStorage.setItem('ava-analytics-tab', tab);
    if (tab === 'alltime' && mode === 'platform') {
      post({ type: 'load_usage_history' });
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Usage Analytics</h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Track token usage, costs, and model performance.
        </p>
      </div>

      {/* Tab Toggle */}
      <div className="mb-6 flex gap-1 rounded-lg bg-[var(--bg-input)] p-1 w-fit">
        <button
          onClick={() => handleTabChange('session')}
          className={`rounded-md px-4 py-1.5 text-xs font-medium transition border-none cursor-pointer ${
            activeTab === 'session'
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-white bg-transparent'
          }`}
        >
          Session
        </button>
        <button
          onClick={() => handleTabChange('alltime')}
          className={`rounded-md px-4 py-1.5 text-xs font-medium transition border-none cursor-pointer ${
            activeTab === 'alltime'
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-white bg-transparent'
          }`}
        >
          All-Time
        </button>
      </div>

      {activeTab === 'session' ? (
        <SessionView stats={sessionStats} />
      ) : (
        <AllTimeView data={usageHistory} mode={mode} account={account} />
      )}
    </div>
  );
}

// ─── Session View ────────────────────────────────────────────────────────────

function SessionView({ stats }: { stats: SessionStats | null }) {
  const totalTokens = stats ? stats.total_input_tokens + stats.total_output_tokens : 0;
  const breakdown = stats?.model_breakdown ?? [];
  const maxTotal = breakdown.length > 0 ? Math.max(...breakdown.map(m => m.input_tokens + m.output_tokens)) : 1;
  const sessionDuration = stats ? timeSince(stats.session_start) : '--';

  const totalCost = useMemo(() => {
    if (!stats) return 0;
    return stats.model_breakdown.reduce((sum, m) => sum + estimateCost(m.input_tokens, m.output_tokens, m.model), 0);
  }, [stats]);

  return (
    <>
      {/* Summary Cards */}
      <div className="mb-6">
        <SectionGroup label="Session Summary">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Input Tokens" value={formatNumber(stats?.total_input_tokens ?? 0)} />
            <StatCard label="Output Tokens" value={formatNumber(stats?.total_output_tokens ?? 0)} />
            <StatCard label="Total Tokens" value={formatNumber(totalTokens)} highlight />
            <StatCard label="Messages" value={String(stats?.messages ?? 0)} />
            <StatCard label="Tool Calls" value={String(stats?.tool_calls ?? 0)} />
            <StatCard label="Duration" value={sessionDuration} sub={stats ? `Since ${new Date(stats.session_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : undefined} />
          </div>
        </SectionGroup>
      </div>

      {/* Cost Estimate */}
      <div className="mb-6">
        <SectionGroup label="Estimated Cost">
          <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${costColour(totalCost)}`}>
                ${totalCost.toFixed(4)}
              </span>
              <span className="text-xs text-[var(--text-muted)]">this session</span>
            </div>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Based on model pricing. Actual costs may vary.
            </p>
          </div>
        </SectionGroup>
      </div>

      {/* Model Breakdown */}
      <div className="mb-6">
        <SectionGroup label="Models Used">
          {breakdown.length > 0 ? (
            <div className="space-y-2">
              {breakdown.map((m) => {
                const total = m.input_tokens + m.output_tokens;
                const pct = (total / maxTotal) * 100;
                const cost = estimateCost(m.input_tokens, m.output_tokens, m.model);
                return (
                  <div key={`${m.provider}:${m.model}`} className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium">{m.model}</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-medium ${costColour(cost)}`}>${cost.toFixed(4)}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {m.requests} {m.requests === 1 ? 'req' : 'reqs'}
                        </span>
                      </div>
                    </div>
                    <div className="mb-2 h-2 overflow-hidden rounded-full bg-[var(--bg-input)]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-3 text-[10px] text-[var(--text-muted)]">
                      <span>In: {formatNumber(m.input_tokens)}</span>
                      <span>Out: {formatNumber(m.output_tokens)}</span>
                      <span>Total: {formatNumber(total)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-6 text-center">
              <p className="text-xs text-[var(--text-muted)]">No usage this session yet. Start chatting with Ava!</p>
            </div>
          )}
        </SectionGroup>
      </div>
    </>
  );
}

// ─── All-Time View ───────────────────────────────────────────────────────────

function AllTimeView({ data, mode, account }: { data: UsageHistoryData | null; mode: 'platform' | 'byok'; account: AccountInfo | null }) {
  const [expandedSession, setExpandedSession] = useState<number | null>(null);

  if (mode === 'byok' || !account) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center">
        <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">
          Connect your account to see usage history across sessions.
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          Your session data is shown in the Session tab above.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-card)] border-t-[var(--accent)]" />
      </div>
    );
  }

  // Forecast calculation
  const daysWithUsage = data.daily.filter(d => d.tokens > 0).length;
  const avgDailyTokens = daysWithUsage > 0 ? data.daily.reduce((s, d) => s + d.tokens, 0) / daysWithUsage : 0;
  const remaining = data.balance ? Math.max(0, data.balance.limit - data.balance.used) : 0;
  const forecastDays = avgDailyTokens > 0 ? Math.floor(remaining / avgDailyTokens) : null;

  // Month comparison
  const monthChange = data.lastMonthTotal > 0
    ? ((data.monthTotal - data.lastMonthTotal) / data.lastMonthTotal * 100).toFixed(0)
    : null;

  // Daily chart max
  const dailyMax = Math.max(...data.daily.map(d => d.tokens), 1);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {/* Token Balance Bar */}
      {data.balance && (
        <div className="mb-6">
          <SectionGroup label="Token Balance">
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
              {data.balance.tier === 'admin' ? (
                <>
                  <div className="mb-2 flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">Admin tier</span>
                    <span className="font-medium text-[var(--gradient-start)]">Unlimited</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[var(--bg-input)]">
                    <div className="h-full w-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]" />
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-2 flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">
                      {formatNumber(data.balance.used)} / {formatNumber(data.balance.limit)} used
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {((data.balance.used / data.balance.limit) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <UsageBar used={data.balance.used} limit={data.balance.limit} />
                </>
              )}
              {forecastDays !== null && data.balance.tier !== 'admin' && (
                <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                  Estimated {forecastDays} {forecastDays === 1 ? 'day' : 'days'} remaining at current pace
                </p>
              )}
            </div>
          </SectionGroup>
        </div>
      )}

      {/* Overview Stats */}
      <div className="mb-6">
        <SectionGroup label="Overview">
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="This Month" value={formatNumber(data.monthTotal)} sub={monthChange !== null ? `${Number(monthChange) >= 0 ? '+' : ''}${monthChange}% vs last` : 'first month'} />
            <StatCard label="Last Month" value={formatNumber(data.lastMonthTotal)} />
            <StatCard label="Avg / Session" value={formatNumber(data.avgPerSession)} />
            <StatCard label="Total Sessions" value={String(data.totalSessions)} />
          </div>
        </SectionGroup>
      </div>

      {/* Daily Usage Chart */}
      <div className="mb-6">
        <SectionGroup label="Daily Usage (Last 14 Days)">
          <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {data.daily.map((d) => {
                const heightPct = dailyMax > 0 ? (d.tokens / dailyMax) * 100 : 0;
                const isToday = d.date === today;
                const dayLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('en', { day: 'numeric' });

                return (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${formatNumber(d.tokens)} tokens`}>
                    <div className="w-full flex items-end" style={{ height: 90 }}>
                      <div
                        className={`w-full rounded-t transition-all ${
                          isToday
                            ? 'bg-[var(--accent)]'
                            : d.tokens > 0
                              ? 'bg-gradient-to-t from-[var(--gradient-start)] to-[var(--gradient-end)] opacity-70'
                              : 'bg-[var(--bg-input)]'
                        }`}
                        style={{ height: `${Math.max(heightPct, d.tokens > 0 ? 4 : 2)}%`, minHeight: 2 }}
                      />
                    </div>
                    <span className={`text-[8px] ${isToday ? 'text-[var(--accent)] font-bold' : 'text-[var(--text-muted)]'}`}>
                      {dayLabel}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[8px] text-[var(--text-muted)]">
              <span>{data.daily[0]?.date ? new Date(data.daily[0].date + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' }) : ''}</span>
              <span>Today</span>
            </div>
          </div>
        </SectionGroup>
      </div>

      {/* Most Used Models */}
      {data.topModels.length > 0 && (
        <div className="mb-6">
          <SectionGroup label="Most Used Models">
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 space-y-3">
              {data.topModels.map((m) => {
                const pct = (m.tokens / data.topModels[0].tokens) * 100;
                return (
                  <div key={m.model}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium truncate mr-3">{m.model}</span>
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0">{formatNumber(m.tokens)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-input)]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionGroup>
        </div>
      )}

      {/* Session History */}
      {data.sessions.length > 0 && (
        <div className="mb-6">
          <SectionGroup label="Session History" count={`${data.sessions.length} sessions`}>
            <div className="rounded-xl border border-[var(--border-card)] overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-6 gap-2 bg-[var(--bg-card)] px-4 py-2 border-b border-[var(--border-card)]">
                <span className="text-[10px] font-medium text-[var(--text-muted)]">Date</span>
                <span className="text-[10px] font-medium text-[var(--text-muted)]">Duration</span>
                <span className="text-[10px] font-medium text-[var(--text-muted)] text-right">Messages</span>
                <span className="text-[10px] font-medium text-[var(--text-muted)] text-right">Tokens</span>
                <span className="text-[10px] font-medium text-[var(--text-muted)]">Model</span>
                <span className="text-[10px] font-medium text-[var(--text-muted)] text-right">Cost</span>
              </div>

              {/* Rows */}
              <div className="max-h-80 overflow-y-auto">
                {data.sessions.map((s, i) => (
                  <div key={i}>
                    <div
                      className="grid grid-cols-6 gap-2 px-4 py-2.5 cursor-pointer transition hover:bg-[var(--bg-input)]/50 bg-[var(--bg-card)]/50 border-b border-[var(--border-card)] last:border-b-0"
                      onClick={() => setExpandedSession(expandedSession === i ? null : i)}
                    >
                      <span className="text-xs text-[var(--text-secondary)]">
                        {new Date(s.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{s.duration}</span>
                      <span className="text-xs text-[var(--text-muted)] text-right">{s.messages}</span>
                      <span className="text-xs font-mono text-[var(--text-secondary)] text-right">{formatNumber(s.tokens)}</span>
                      <span className="text-xs text-[var(--text-muted)] truncate" title={s.model}>{s.model}</span>
                      <span className={`text-xs font-mono text-right ${costColour(s.cost)}`}>${s.cost.toFixed(3)}</span>
                    </div>
                    {expandedSession === i && (
                      <div className="px-4 py-3 bg-[var(--bg-input)]/30 border-b border-[var(--border-card)]">
                        <div className="grid grid-cols-3 gap-3 text-[10px]">
                          <div>
                            <span className="text-[var(--text-muted)]">Date: </span>
                            <span className="text-[var(--text-secondary)]">{s.date}</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Duration: </span>
                            <span className="text-[var(--text-secondary)]">{s.duration}</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Primary Model: </span>
                            <span className="text-[var(--text-secondary)]">{s.model}</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Messages: </span>
                            <span className="text-[var(--text-secondary)]">{s.messages}</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Tokens: </span>
                            <span className="text-[var(--text-secondary)]">{s.tokens.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Est. Cost: </span>
                            <span className={costColour(s.cost)}>${s.cost.toFixed(4)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </SectionGroup>
        </div>
      )}
    </>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
      <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      <p className={`mt-1 text-lg font-bold ${highlight ? 'bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] bg-clip-text text-transparent' : ''}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}
