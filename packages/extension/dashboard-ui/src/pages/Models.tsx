// Models — public benchmark leaderboard, rendered in the extension
// dashboard. Reads ava-supernova-bench/leaderboard.json from raw GitHub
// via @ava/core/benchmarks. Same data source the IDE Models page uses;
// each surface renders with its own design language.
//
// No platform middleman — the bytes shown here are byte-identical to
// what anyone visiting the public bench repo sees. That equivalence is
// the trust claim.

import { useState, useEffect, useCallback } from 'react';
import { Rocket, ArrowSquareOut, ArrowsClockwise } from '@phosphor-icons/react';
import { Skeleton } from '../components/Skeleton';
import {
  fetchPublicLeaderboard,
  getCachedLeaderboard,
  isCacheStale,
  BENCH_CATEGORY_LABELS,
  type BenchLeaderboard,
} from '@ava/core/benchmarks';

const REPO_URL = 'https://github.com/AugmentedValueAcceleration/ava-supernova-bench';

function cellColor(score: number | undefined): string {
  if (score == null) return 'rgba(49,34,68,0.4)';
  if (score >= 90) return 'rgba(34,197,94,0.55)';
  if (score >= 75) return 'rgba(34,197,94,0.35)';
  if (score >= 60) return 'rgba(249,226,175,0.45)';
  if (score >= 40) return 'rgba(251,146,60,0.45)';
  return 'rgba(239,68,68,0.45)';
}

export function ModelsPage() {
  const [leaderboard, setLeaderboard] = useState<BenchLeaderboard | null>(() => getCachedLeaderboard());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const fresh = await fetchPublicLeaderboard();
      if (fresh) setLeaderboard(fresh);
      else setError("The public benchmark repo isn't live yet — the leaderboard publishes the moment Ava's first run batch is pushed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!leaderboard || isCacheStale()) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full">
      {/* Hero — mirrors IDE ModelsPage at DashboardPages.tsx:14186-14190. */}
      <div className="mb-5">
        <h1 className="m-0 text-[22px] font-semibold text-[#cdd6f4]">Models</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">
          Real coding tasks. Real model outputs. Real receipts. Auditable in the public bench repo.
        </p>
      </div>

      {/* Meta + actions */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-[var(--text-muted)]">
          {leaderboard
            ? `Generated ${leaderboard.generated_at} · ${leaderboard.total_runs} total runs · ${leaderboard.models.length} models`
            : 'No leaderboard data yet'}
        </div>
        <div className="flex gap-2">
          {/* GitHub link only shows once data has actually published —
              before that the URL would 404 and we'd be teasing a repo
              that doesn't exist yet. */}
          {leaderboard && (
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-3 py-1 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--accent)]/20"
            >
              <ArrowSquareOut size={12} weight="duotone" />
              View on GitHub
            </a>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-1 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--bg-input)] disabled:opacity-50"
          >
            <ArrowsClockwise size={12} weight="duotone" className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {error && !leaderboard && (
        <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center">
          <div className="mb-3 flex justify-center text-[var(--accent)]">
            <Rocket size={36} weight="duotone" />
          </div>
          <div className="mb-1 text-sm font-medium text-[var(--text-primary)]">Leaderboard launching soon</div>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[var(--text-muted)]">{error}</p>
        </div>
      )}

      {/* Skeleton — first load with no cached leaderboard yet. */}
      {loading && !leaderboard && !error && (
        <Skeleton height={340} radius={16} />
      )}

      {/* Heatmap */}
      {leaderboard && (
        <div className="mb-4 overflow-x-auto rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
          <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 4 }}>
            <thead>
              <tr>
                <th className="px-2 py-1.5 text-left text-[11px] font-medium text-[var(--text-muted)]">Model</th>
                {leaderboard.categories.map(cat => (
                  <th key={cat} className="px-2 py-1.5 text-center text-[10px] font-medium text-[var(--text-muted)]" style={{ minWidth: 110 }}>
                    {BENCH_CATEGORY_LABELS[cat]}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-center text-[10px] font-medium text-[var(--text-muted)]">Overall</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.models.map(m => (
                <tr key={m.model_id}>
                  <td className="px-2 py-2 text-xs font-medium text-[var(--text-primary)]">{m.display_name}</td>
                  {leaderboard.categories.map(cat => {
                    const cell = m.scores[cat];
                    const lowConfidence = cell && cell.sample_size < 10;
                    return (
                      <td
                        key={cat}
                        title={cell ? `${cell.score.toFixed(1)}% over ${cell.sample_size} runs${lowConfidence ? ' (low confidence)' : ''}` : 'no runs in this category yet'}
                        className="rounded text-center font-mono text-[11px] text-[var(--text-primary)]"
                        style={{
                          background: cellColor(cell?.score),
                          padding: '10px 8px',
                          opacity: lowConfidence ? 0.5 : 1,
                        }}
                      >
                        {cell ? `${cell.score.toFixed(0)}%` : '—'}
                      </td>
                    );
                  })}
                  <td
                    className="rounded text-center font-mono text-[11px] font-bold text-[var(--text-primary)]"
                    style={{ background: cellColor(m.overall_pass_rate), padding: '10px 8px' }}
                  >
                    {m.overall_pass_rate.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Plain-language summaries */}
      {leaderboard && (
        <div className="mb-4 flex flex-col gap-2">
          {leaderboard.models.map(m => (
            <div key={m.model_id} className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{m.display_name}</span>
                <span className={`font-mono text-xs ${m.overall_pass_rate >= 80 ? 'text-emerald-300' : m.overall_pass_rate >= 60 ? 'text-yellow-300' : 'text-red-300'}`}>
                  {m.overall_pass_rate.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">{m.summary}</div>
            </div>
          ))}
        </div>
      )}

      {/* Trust footer */}
      <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
        <strong className="text-[var(--text-primary)]">How this works.</strong> Ava runs a hand-curated suite of real coding tasks against every supported model on a weekly cadence. Every score links to the exact prompt sent and the exact response received — open the public repo to read any transcript, propose a tighter scoring rubric, or reproduce a score on your own machine with one command. No user data ever enters this repo.
      </div>
    </div>
  );
}
