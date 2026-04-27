import { useState, useEffect, useMemo } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import { UsageBar } from '../components/UsageBar';
import { SectionGroup } from '../components/SectionGroup';
import { creditsForTurn } from '@ava/core/billing';
import type { AccountInfo, SessionStats, UsageLogEntry } from '../types/messages';

// Estimate credits for a single usage log row using the same bracket-
// scaling math the server uses to bill chat turns. Lets the per-row
// table lead with credits (the unit users actually budget against)
// and treat raw input/output tokens as the secondary detail. Same
// helper the IDE chat session counter uses, so the in-app numbers
// agree with each other.
function estimateRowCredits(input: number, output: number, model: string | undefined): number {
  return creditsForTurn('chat_turn', { inputTokens: input, outputTokens: output, model }).credits;
}

interface UsageProps {
  account: AccountInfo | null;
  logs: UsageLogEntry[];
  sessionStats?: SessionStats | null;
  mode: 'platform' | 'byok';
}

interface ModelBreakdown {
  model: string;
  input: number;
  output: number;
  count: number;
}

const PAGE_SIZE = 15;

export function Usage({ account, logs, sessionStats, mode }: UsageProps) {
  useLocale();
  // Credits-redesign read shim. Reads credits_* first, tokens_* second
  // (for any stale cache from before the platform's account-info hotfix
  // deployed), tier-appropriate default third. Free tier's free pool
  // defaults to 300 credits; paid tiers have no free pool (0) — their
  // allowance lives entirely in credits_limit / sub pool.
  const rawUsage = (account?.usage ?? {}) as Record<string, unknown>;
  const tierDefaults: Record<string, { free: number; sub: number | null }> = {
    free:       { free:   300,      sub: null    },
    pro:        { free: 0,          sub:  5_000  },
    ultra:      { free: 0,          sub: 10_000  },
    enterprise: { free: 0,          sub: 20_000  },
    admin:      { free: 0,          sub: 999_999_999 },
  };
  const td = tierDefaults[account?.tier ?? 'free'] ?? tierDefaults.free;
  const usage = {
    credits_used:       Number(rawUsage.credits_used       ?? rawUsage.tokens_used       ?? 0),
    credits_limit:     ((rawUsage.credits_limit     as number | null | undefined) ?? (rawUsage.tokens_limit     as number | null | undefined) ?? td.sub) as number | null,
    requests_count:     Number(rawUsage.requests_count ?? 0),
    period_start:      (rawUsage.period_start      as string | null | undefined) ?? null,
    period_end:        (rawUsage.period_end        as string | null | undefined) ?? null,
    free_credits_used:  Number(rawUsage.free_credits_used  ?? rawUsage.free_tokens_used  ?? 0),
    free_credits_limit: Number(rawUsage.free_credits_limit ?? rawUsage.free_tokens_limit ?? td.free),
  };
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('30d');
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (account) { post({ type: 'load_usage_logs', period }); setPage(0); }
  }, [period]);

  if (mode === 'byok' || !account) {
    return <ByokUsage stats={sessionStats} />;
  }

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

  // Derive summary from logs when account.usage is missing/stale
  const logsTotal = useMemo(() => {
    let input = 0, output = 0;
    for (const log of logs) { input += log.input_tokens; output += log.output_tokens; }
    return { input, output, total: input + output, count: logs.length };
  }, [logs]);

  const periodLabel = usage.period_start
    ? `${new Date(usage.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — ${new Date(usage.period_end!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : t('dash.usage.no_active_period');

  // Pagination
  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const pagedLogs = logs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.usage.title')}</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">
          {t('dash.usage.subtitle')}
        </p>
      </div>

      {/* Period Summary */}
      <div className="mb-6">
      <SectionGroup label={t('dash.usage.summary')}>
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          label={t('dash.usage.credits_used')}
          value={formatNumber(usage.credits_used || logsTotal.total)}
          sub={usage.credits_used ? (usage.credits_limit ? `of ${formatNumber(usage.credits_limit)} limit` : t('dash.usage.this_period')) : t('dash.usage.from_requests', { count: logsTotal.count })}
        />
        <SummaryCard
          label={t('dash.usage.requests')}
          value={String(usage.requests_count || logsTotal.count)}
          sub={t('dash.usage.this_period')}
        />
        <SummaryCard
          label={t('dash.usage.free_credits')}
          value={formatNumber(Math.max(0, usage.free_credits_limit - usage.free_credits_used))}
          sub={`of ${formatNumber(usage.free_credits_limit)}`}
        />
        <SummaryCard
          label={t('dash.usage.period')}
          value={periodLabel}
          isText
        />
      </div>
      </SectionGroup>
      </div>

      {/* Unified credit bar — free + subscription + top-ups in one view.
          Backend still splits pools (free burns first, overflows to
          credits_limit), but users only need the combined total. */}
      <div className="mb-6">
      <SectionGroup label={t('dash.usage.credit_pools')}>
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        {(() => {
          const totalUsed = usage.free_credits_used + usage.credits_used;
          const totalLimit = usage.free_credits_limit + (usage.credits_limit ?? 0);
          const remaining = Math.max(0, totalLimit - totalUsed);
          return (
            <>
              <div className="mb-2 flex justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Credits Remaining</span>
                {account.tier === 'admin' ? (
                  <span className="font-medium text-[var(--gradient-start)]">{t('dash.usage.unlimited')}</span>
                ) : (
                  <span className="text-white font-semibold">
                    {formatNumber(remaining)}
                  </span>
                )}
              </div>
              {account.tier === 'admin' ? (
                <div className="h-3 overflow-hidden rounded-full bg-[var(--bg-input)]">
                  <div className="h-full w-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]" />
                </div>
              ) : (
                <UsageBar used={totalUsed} limit={totalLimit} accent />
              )}
              <div className="mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
                <span>{formatNumber(totalUsed)} used</span>
                <span>{formatNumber(totalLimit)} limit</span>
              </div>
            </>
          );
        })()}
      </div>
      </SectionGroup>
      </div>

      {/* Model Breakdown */}
      <div className="mb-6">
        <SectionGroup label={t('dash.usage.usage_by_model')}>
        {breakdown.length > 0 ? (
          <div className="space-y-3">
            {breakdown.map((m) => {
              const total = m.input + m.output;
              const pct = (total / maxTotal) * 100;
              return (
                <div key={m.model} className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium">{m.model}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {m.count} {m.count === 1 ? 'req' : 'reqs'}
                    </span>
                  </div>
                  <div className="mb-2 h-2 overflow-hidden rounded-full bg-[var(--bg-input)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-3 text-[10px] text-[var(--text-muted)]">
                    <span>{t('status.in')}: {formatNumber(m.input)}</span>
                    <span>{t('status.out')}: {formatNumber(m.output)}</span>
                    <span>{t('status.total')}: {formatNumber(total)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-6 text-center">
            <p className="text-xs text-[var(--text-muted)]">{t('dash.usage.no_usage_period')}</p>
          </div>
        )}
        </SectionGroup>
      </div>

      {/* Recent Requests */}
      <div className="mb-6">
        <SectionGroup label={t('dash.usage.recent_requests')}>
        <div className="flex items-center justify-end">
          <div className="flex gap-1 rounded-lg bg-[var(--bg-input)] p-1">
            {(['7d', '30d', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition ${
                  period === p
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-muted)] hover:text-white'
                }`}
              >
                {p === '7d' ? '7D' : p === '30d' ? '30D' : 'All'}
              </button>
            ))}
          </div>
        </div>

        {logs.length > 0 ? (
          <>
            <div className="overflow-x-auto rounded-xl border border-[var(--border-card)]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-card)] bg-[var(--bg-card)]">
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-muted)]">{t('dash.usage.model')}</th>
                    {/* Credits column leads — that's the unit users
                        budget against. Raw I/O tokens stay as detail
                        columns to the right, dimmed, for transparency. */}
                    <th className="px-3 py-2 text-right text-[10px] font-medium text-[var(--accent)]">Credits</th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium text-[var(--text-muted)]">In <span className="opacity-60">tokens</span></th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium text-[var(--text-muted)]">Out <span className="opacity-60">tokens</span></th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium text-[var(--text-muted)]">{t('dash.usage.date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-card)]">
                  {pagedLogs.map((log) => {
                    const credits = estimateRowCredits(log.input_tokens ?? 0, log.output_tokens ?? 0, log.model);
                    return (
                      <tr key={log.id} className="bg-[var(--bg-card)]/50">
                        <td className="px-3 py-2 text-xs font-medium">{log.model}</td>
                        <td
                          className="px-3 py-2 text-right font-mono text-xs font-semibold text-[var(--text-primary)]"
                          title={`Estimated credit charge using the same bracket-scaling math the server bills with.`}
                        >
                          {credits.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] text-[var(--text-muted)]">{(log.input_tokens ?? 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] text-[var(--text-muted)]">{(log.output_tokens ?? 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-[10px] text-[var(--text-muted)]">{formatDate(log.timestamp)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)]">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, logs.length)} of {logs.length}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="rounded-md px-2 py-1 text-[10px] text-[var(--text-muted)] transition hover:bg-[var(--bg-input)] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    {t('dash.usage.prev')}
                  </button>
                  <span className="flex items-center px-2 text-[10px] text-[var(--text-muted)]">
                    {page + 1}/{totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="rounded-md px-2 py-1 text-[10px] text-[var(--text-muted)] transition hover:bg-[var(--bg-input)] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    {t('dash.usage.next')}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-6 text-center">
            <p className="text-xs text-[var(--text-muted)]">{t('dash.usage.no_requests')}</p>
          </div>
        )}
        </SectionGroup>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, isText }: { label: string; value: string; sub?: string; isText?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
      <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      <p className={`mt-1 ${isText ? 'text-xs font-medium' : 'text-lg font-bold'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}

function formatNumber(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(Math.round(v));
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

function ByokUsage({ stats }: { stats?: SessionStats | null }) {
  const totalTokens = stats ? stats.total_input_tokens + stats.total_output_tokens : 0;
  const breakdown = stats?.model_breakdown ?? [];
  const maxTotal = breakdown.length > 0 ? Math.max(...breakdown.map(m => m.input_tokens + m.output_tokens)) : 1;

  const sessionDuration = stats ? timeSince(stats.session_start) : '—';

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.usage.title')}</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">
          {t('dash.usage.subtitle')}
        </p>
      </div>

      {/* BYOK explainer — clarifies why no credit numbers appear here.
          In BYOK mode the provider bills directly, so there's no Ava
          credit accounting to surface — only raw tokens. Without this
          banner the missing credit columns read as a bug. */}
      <div className="mb-5 rounded-xl border border-[var(--border-card)] bg-[var(--accent)]/5 px-4 py-3">
        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">BYOK mode</span> — your provider bills you directly for these tokens, so there's no Ava credit charge to display.
          Switch to a platform account to see credit usage alongside the raw token counts.
        </p>
      </div>

      {/* Summary */}
      <div className="mb-6">
        <SectionGroup label={t('dash.usage.summary')}>
          <div className="grid grid-cols-2 gap-3">
            <SummaryCard label={t('dash.usage.total_tokens')} value={formatNumber(totalTokens)} sub={`${t('dash.usage.input_tokens')}: ${formatNumber(stats?.total_input_tokens ?? 0)} / ${t('dash.usage.output_tokens')}: ${formatNumber(stats?.total_output_tokens ?? 0)}`} />
            <SummaryCard label={t('dash.usage.messages')} value={String(stats?.messages ?? 0)} sub={t('dash.usage.session')} />
            <SummaryCard label={t('dash.usage.tool_calls')} value={String(stats?.tool_calls ?? 0)} sub={t('dash.usage.session')} />
            <SummaryCard label={t('dash.usage.session')} value={sessionDuration} isText sub={stats ? t('dash.usage.since', { time: new Date(stats.session_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) }) : undefined} />
          </div>
        </SectionGroup>
      </div>

      {/* Model Breakdown */}
      <div className="mb-6">
        <SectionGroup label={t('dash.usage.usage_by_model')}>
          {breakdown.length > 0 ? (
            <div className="space-y-3">
              {breakdown.map((m) => {
                const total = m.input_tokens + m.output_tokens;
                const pct = (total / maxTotal) * 100;
                return (
                  <div key={`${m.provider}:${m.model}`} className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium">{m.model}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {m.requests} {m.requests === 1 ? 'req' : 'reqs'}
                      </span>
                    </div>
                    <div className="mb-2 h-2 overflow-hidden rounded-full bg-[var(--bg-input)]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-3 text-[10px] text-[var(--text-muted)]">
                      <span>{t('status.in')}: {formatNumber(m.input_tokens)}</span>
                      <span>{t('status.out')}: {formatNumber(m.output_tokens)}</span>
                      <span>{t('status.total')}: {formatNumber(total)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-6 text-center">
              <p className="text-xs text-[var(--text-muted)]">{t('dash.usage.no_usage_session')}</p>
            </div>
          )}
        </SectionGroup>
      </div>

      {/* CTA */}
      <div className="rounded-xl border border-dashed border-[var(--border-card)] bg-[var(--bg-card)] p-5 text-center">
        <p className="text-xs text-[var(--text-muted)]">
          {t('dash.usage.connect_for_history')}
        </p>
      </div>
    </div>
  );
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
