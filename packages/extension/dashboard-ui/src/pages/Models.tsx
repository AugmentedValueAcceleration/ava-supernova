// Models — public benchmark leaderboard, rendered in the extension
// dashboard. Reads ava-supernova-bench/leaderboard.json from raw GitHub
// via @ava/core/benchmarks. Same data source the IDE Models page uses;
// each surface renders with its own design language.
//
// No platform middleman — the bytes shown here are byte-identical to
// what anyone visiting the public bench repo sees. That equivalence is
// the trust claim.
//
// v2 design (the honest-benchmark render): raw models and Ava modes live
// in SEPARATE tables (a mode costs more / runs slower by design, so they
// are never ranked against a raw model); every score carries its cost +
// latency + sample size (no naked accuracy number); each row links to its
// run receipts; a mode row expands to the fleet it actually ran; and our
// WORST results get their own panel — publishing losses is the part nobody
// fakes. Every v2 field is optional, so a not-yet-run bench still renders.

import { useState, useEffect, useCallback, Fragment } from 'react';
import { t, tt, useLocale } from '../i18n';
import { Rocket, ArrowSquareOut, ArrowsClockwise, CaretRight, Stack } from '@phosphor-icons/react';
import { Skeleton } from '../components/Skeleton';
import {
  fetchPublicLeaderboard,
  getCachedLeaderboard,
  isCacheStale,
  BENCH_CATEGORY_LABELS,
  type BenchLeaderboard,
  type BenchModelScores,
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

/** Compact "no naked score" sub-line: cost + latency + n, each shown only
 *  when the data is actually present. Returns null if we have none of it, so
 *  a Tier-1-only leaderboard doesn't render an empty bullet string. */
function metaLine(m: BenchModelScores): string | null {
  const parts: string[] = [];
  if (m.cost_credits_per_task != null) parts.push(`${m.cost_credits_per_task.toFixed(1)} cr/task`);
  if (m.median_latency_s != null) parts.push(`${m.median_latency_s.toFixed(0)}s`);
  if (m.overall_sample_size != null) parts.push(`n=${m.overall_sample_size}`);
  return parts.length ? parts.join(' · ') : null;
}

/** The lowest-scoring cells across the whole board — surfaced on purpose. */
function worstCells(leaderboard: BenchLeaderboard, limit = 4): { name: string; cat: string; score: number }[] {
  const cells: { name: string; cat: string; score: number }[] = [];
  for (const m of leaderboard.models) {
    for (const cat of leaderboard.categories) {
      const cell = m.scores[cat];
      if (cell) cells.push({ name: m.display_name, cat: BENCH_CATEGORY_LABELS[cat], score: cell.score });
    }
  }
  return cells.sort((a, b) => a.score - b.score).slice(0, limit);
}

export function ModelsPage() {
  useLocale();
  const [leaderboard, setLeaderboard] = useState<BenchLeaderboard | null>(() => getCachedLeaderboard());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const fresh = await fetchPublicLeaderboard();
      if (fresh) setLeaderboard(fresh);
      else setError(t('dash.models.repo_not_live'));
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

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const models = leaderboard?.models.filter(m => m.entry_kind !== 'mode') ?? [];
  const modes = leaderboard?.models.filter(m => m.entry_kind === 'mode') ?? [];

  /** One heatmap table — reused for the Models block and the Modes block.
   *  `expandable` turns on the fleet-disclosure row for mode entries. */
  const renderTable = (rows: BenchModelScores[], expandable: boolean) => {
    if (!leaderboard || rows.length === 0) return null;
    return (
      <div className="mb-4 overflow-x-auto rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
        <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 4 }}>
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-left text-[11px] font-medium text-[var(--text-muted)]">
                {expandable ? tt('dash.models.col_mode', 'Mode') : t('dash.models.col_model')}
              </th>
              {leaderboard.categories.map(cat => (
                <th key={cat} className="px-2 py-1.5 text-center text-[10px] font-medium text-[var(--text-muted)]" style={{ minWidth: 110 }}>
                  {BENCH_CATEGORY_LABELS[cat]}
                </th>
              ))}
              <th className="px-2 py-1.5 text-center text-[10px] font-medium text-[var(--text-muted)]">{t('dash.models.col_overall')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(m => {
              const meta = metaLine(m);
              const hasFleet = expandable && !!m.constituent_models?.length;
              const isOpen = expanded.has(m.model_id);
              return (
                <Fragment key={m.model_id}>
                  <tr>
                    <td className="px-2 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => hasFleet && toggle(m.model_id)}
                        className={`flex items-center gap-1 text-left text-xs font-medium text-[var(--text-primary)] ${hasFleet ? 'cursor-pointer hover:text-[var(--accent)]' : 'cursor-default'}`}
                      >
                        {hasFleet && (
                          <CaretRight size={11} weight="bold" className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                        )}
                        {m.display_name}
                      </button>
                      {/* No-naked-score sub-line + contamination badge + receipts */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {meta && <span className="font-mono text-[10px] text-[var(--text-muted)]">{meta}</span>}
                        {m.tasks_after_release != null && m.tasks_total != null && (
                          <span
                            title={tt('dash.models.clean_title', 'Tasks published after this model shipped — no training-data contamination on those.')}
                            className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300"
                          >
                            {tt('dash.models.clean', 'clean')} {m.tasks_after_release}/{m.tasks_total}
                          </span>
                        )}
                        {m.receipts_url && (
                          <a
                            href={m.receipts_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 font-mono text-[10px] text-[var(--accent)] hover:underline"
                          >
                            <ArrowSquareOut size={10} weight="duotone" />
                            {tt('dash.models.receipts', 'receipts')}
                          </a>
                        )}
                      </div>
                    </td>
                    {leaderboard.categories.map(cat => {
                      const cell = m.scores[cat];
                      const lowConfidence = cell && cell.sample_size < 10;
                      return (
                        <td
                          key={cat}
                          title={cell ? t('dash.models.cell_title', { score: cell.score.toFixed(1), runs: cell.sample_size, conf: lowConfidence ? t('dash.models.low_confidence_suffix') : '' }) : t('dash.models.no_runs')}
                          className="rounded text-center align-middle font-mono text-[11px] text-[var(--text-primary)]"
                          style={{ background: cellColor(cell?.score), padding: '10px 8px', opacity: lowConfidence ? 0.5 : 1 }}
                        >
                          {cell ? `${cell.score.toFixed(0)}%` : '—'}
                        </td>
                      );
                    })}
                    <td
                      className="rounded text-center align-middle font-mono text-[11px] font-bold text-[var(--text-primary)]"
                      style={{ background: cellColor(m.overall_pass_rate), padding: '10px 8px' }}
                    >
                      {m.overall_pass_rate.toFixed(0)}%
                    </td>
                  </tr>
                  {hasFleet && isOpen && (
                    <tr>
                      <td colSpan={leaderboard.categories.length + 2} className="px-2 pb-2">
                        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)]/40 px-3 py-2">
                          <Stack size={12} weight="duotone" className="text-[var(--accent)]" />
                          <span className="mr-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{tt('dash.models.fleet', 'Fleet')}</span>
                          {m.constituent_models!.map(cm => (
                            <span key={cm} className="rounded bg-[var(--accent)]/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-primary)]">{cm}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Hero — mirrors IDE ModelsPage. */}
      <div className="mb-5">
        <h1 className="m-0 text-[22px] font-semibold text-[#cdd6f4]">{t('dash.models.title')}</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">
          {t('dash.models.subtitle')}
        </p>
      </div>

      {/* Meta + actions */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-[var(--text-muted)]">
          {leaderboard
            ? t('dash.models.generated', { date: leaderboard.generated_at, runs: leaderboard.total_runs, models: leaderboard.models.length })
            : t('dash.models.no_data')}
        </div>
        <div className="flex gap-2">
          {leaderboard && (
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-3 py-1 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--accent)]/20"
            >
              <ArrowSquareOut size={12} weight="duotone" />
              {t('dash.models.view_on_github')}
            </a>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-1 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--bg-input)] disabled:opacity-50"
          >
            <ArrowsClockwise size={12} weight="duotone" className={loading ? 'animate-spin' : ''} />
            {loading ? t('dash.models.refreshing') : t('dash.models.refresh')}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {error && !leaderboard && (
        <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center">
          <div className="mb-3 flex justify-center text-[var(--accent)]">
            <Rocket size={36} weight="duotone" />
          </div>
          <div className="mb-1 text-sm font-medium text-[var(--text-primary)]">{t('dash.models.launching_soon')}</div>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[var(--text-muted)]">{error}</p>
        </div>
      )}

      {/* Skeleton — first load with no cached leaderboard yet. */}
      {loading && !leaderboard && !error && (
        <Skeleton height={340} radius={16} />
      )}

      {/* Models table (raw models, Tier 1) */}
      {leaderboard && models.length > 0 && (
        <>
          <h2 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">{tt('dash.models.section_models', 'Models')}</h2>
          {renderTable(models, false)}
        </>
      )}

      {/* Ava Modes table (Tier 2) — physically separated from raw models so a
          mode's number can never be misread as beating a raw model's. */}
      {leaderboard && modes.length > 0 && (
        <>
          <h2 className="mb-1 mt-5 text-[13px] font-semibold text-[var(--text-primary)]">{tt('dash.models.section_modes', 'Ava Modes')}</h2>
          <p className="mb-2 max-w-2xl text-[11px] leading-relaxed text-[var(--text-muted)]">
            {tt('dash.models.modes_explainer', 'Modes orchestrate several models. They are compared only to each other — never ranked against a raw model, because a mode costs more and runs slower by design. Expand a mode to see the fleet it actually ran.')}
          </p>
          {renderTable(modes, true)}
        </>
      )}

      {/* Where we lose — our weakest cells, surfaced on purpose. */}
      {leaderboard && leaderboard.total_runs > 0 && (
        <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-4">
          <div className="mb-1 text-[12px] font-semibold text-red-300">{tt('dash.models.losses_title', 'Where we lose')}</div>
          <p className="mb-2.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
            {tt('dash.models.losses_body', 'Our weakest results, shown on purpose. Publishing your own losses is the part nobody fakes.')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {worstCells(leaderboard).map((w, i) => (
              <span key={i} className="rounded-lg border border-red-500/20 bg-[var(--bg-card)] px-2.5 py-1 text-[10px] text-[var(--text-primary)]">
                <span className="font-medium">{w.name}</span>
                <span className="text-[var(--text-muted)]"> · {w.cat} · </span>
                <span className="font-mono text-red-300">{w.score.toFixed(0)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Plain-language summaries */}
      {leaderboard && (
        <div className="mb-4 flex flex-col gap-2">
          {leaderboard.models.map(m => (
            <div key={m.model_id} className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {m.display_name}
                  {m.entry_kind === 'mode' && (
                    <span className="ml-1.5 rounded bg-[var(--accent)]/15 px-1.5 py-0.5 align-middle text-[9px] uppercase tracking-wide text-[var(--accent)]">{tt('dash.models.mode_tag', 'mode')}</span>
                  )}
                </span>
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
        <strong className="text-[var(--text-primary)]">{t('dash.models.how_it_works_lead')}</strong> {t('dash.models.how_it_works_body')}
      </div>
    </div>
  );
}
