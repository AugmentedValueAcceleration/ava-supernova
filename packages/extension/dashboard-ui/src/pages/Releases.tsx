import { useState, useEffect } from 'react';
import type { ReleaseNote } from '../types/messages';

export function Releases() {
  const [releases, setReleases] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('https://ava-supernova.com/api/releases')
      .then(res => res.json())
      .then(data => {
        setReleases(Array.isArray(data) ? data : []);
        // Auto-expand the latest
        if (Array.isArray(data) && data.length > 0) setExpanded(data[0].id);
      })
      .catch(() => setReleases([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-[var(--text-muted)]">
        Loading release notes...
      </div>
    );
  }

  if (releases.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-[var(--text-muted)]">
        No release notes yet.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Release Notes</h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          What&apos;s new in each version of Ava | Supernova
        </p>
      </div>

      <div className="space-y-3">
        {releases.map((release) => {
          const isExpanded = expanded === release.id;
          const isLatest = release.id === releases[0]?.id;

          return (
            <div
              key={release.id}
              className={`rounded-lg border bg-[var(--bg-card)] overflow-hidden transition ${
                isLatest ? 'border-[var(--accent)]/30' : 'border-[var(--border-card)]'
              }`}
            >
              {/* Header — always visible */}
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

              {/* Body — expanded */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-[var(--border-card)]">
                  {/* Highlights */}
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

                  {/* Body */}
                  <div className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                    {release.body}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
