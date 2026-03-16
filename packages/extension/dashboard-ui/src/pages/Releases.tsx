import { useState, useEffect, useMemo } from 'react';
import { post } from '../App';
import type { ReleaseNote } from '../types/messages';

function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function Releases({ releases }: { releases: ReleaseNote[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // Request data on mount
  useEffect(() => {
    post({ type: 'load_releases' });
  }, []);

  // Auto-expand latest and default to its month
  useEffect(() => {
    if (releases.length > 0 && !expanded) {
      setExpanded(releases[0].id);
      setSelectedMonth(getMonthKey(releases[0].published_at));
    }
  }, [releases, expanded]);

  const months = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of releases) {
      const key = getMonthKey(r.published_at);
      if (!seen.has(key)) {
        seen.set(key, formatMonth(new Date(r.published_at)));
      }
    }
    return Array.from(seen.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [releases]);

  const filtered = useMemo(() => {
    if (!selectedMonth) return releases;
    return releases.filter(r => getMonthKey(r.published_at) === selectedMonth);
  }, [releases, selectedMonth]);

  if (releases.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-[var(--text-muted)]">
        Loading release notes...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Release Notes</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            What&apos;s new in each version of Ava | Supernova
          </p>
        </div>

        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="text-xs bg-[var(--bg-input)] border border-[var(--border-card)] text-white rounded-lg px-3 py-2 outline-none focus:border-[var(--accent)] transition"
        >
          <option value="">All releases</option>
          {months.map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {filtered.map((release) => {
          const isExpanded = expanded === release.id;
          const isLatest = release.id === releases[0]?.id;

          return (
            <div
              key={release.id}
              className={`rounded-lg border bg-[var(--bg-card)] overflow-hidden transition ${
                isLatest ? 'border-[var(--accent)]/30' : 'border-[var(--border-card)]'
              }`}
            >
              <button
                onClick={() => setExpanded(isExpanded ? null : release.id)}
                className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-[var(--bg-input)] transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-white">v{release.version}</span>
                  {isLatest && (
                    <span className="text-[9px] font-bold text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.5 rounded tracking-wider">
                      LATEST
                    </span>
                  )}
                  <span className="text-sm text-[var(--text-secondary)]">{release.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-input)] px-1.5 py-0.5 rounded">
                    {release.tool_count} tools
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {new Date(release.published_at).toLocaleDateString()}
                  </span>
                  <svg
                    className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-[var(--border-card)]">
                  {release.highlights.length > 0 && (
                    <div className="mt-3 mb-4 rounded-lg bg-[var(--bg-input)] p-3">
                      <h3 className="text-xs font-semibold text-white mb-2">Highlights</h3>
                      <ul className="space-y-1">
                        {release.highlights.map((h, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                            <span className="text-[var(--accent)] mt-0.5">•</span>
                            {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                    {release.body}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center text-sm text-[var(--text-muted)] py-8">
            No releases for this month.
          </div>
        )}
      </div>
    </div>
  );
}
