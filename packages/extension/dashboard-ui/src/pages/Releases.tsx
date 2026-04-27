import { useState, useEffect, useMemo } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import { Select } from '../components/Select';
import type { ReleaseNote } from '../types/messages';

function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const PLAT_COLOURS: Record<string, string> = { core: '#89b4fa', extension: '#a855f7', ide: '#a6e3a1', companion: '#fab387' };
const PLAT_LABELS: Record<string, string> = { core: 'Core', extension: 'Extension', ide: 'IDE', companion: 'Companion' };

export function Releases({ releases }: { releases: ReleaseNote[] }) {
  useLocale();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [platformTab, setPlatformTab] = useState('all');

  useEffect(() => { post({ type: 'load_releases' }); }, []);

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
      if (!seen.has(key)) seen.set(key, formatMonth(new Date(r.published_at)));
    }
    return Array.from(seen.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [releases]);

  const filtered = useMemo(() => {
    let list = releases as any[];
    if (platformTab !== 'all') list = list.filter(r => (r.platform || 'extension') === platformTab);
    if (selectedMonth) list = list.filter(r => getMonthKey(r.published_at) === selectedMonth);
    return list;
  }, [releases, selectedMonth, platformTab]);

  if (releases.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-[var(--text-muted)]">
        Loading release notes...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.releases.title')}</h1>
          <p className="text-[13px] text-[#6c7086] mt-1.5">
            {t('dash.releases.subtitle')}
          </p>
        </div>

        <div style={{ width: 160 }}>
          <Select
            value={selectedMonth}
            onChange={setSelectedMonth}
            options={[
              { value: '', label: 'All months' },
              ...months.map(([key, label]) => ({ value: key, label })),
            ]}
          />
        </div>
      </div>

      {/* Platform tabs */}
      <div className="flex gap-1 mb-5 flex-wrap">
        {['all', 'core', 'extension', 'ide', 'companion'].map(tab => (
          <button
            key={tab}
            onClick={() => setPlatformTab(tab)}
            className="px-3 py-1 rounded-full text-[11px] font-semibold border-none cursor-pointer transition"
            style={{
              background: platformTab === tab ? (tab === 'all' ? 'var(--accent)' : PLAT_COLOURS[tab]) : 'var(--bg-input)',
              color: platformTab === tab ? (tab === 'core' || tab === 'extension' ? '#fff' : '#11111b') : 'var(--text-muted)',
            }}
          >
            {tab === 'all' ? t('dash.releases.all') : PLAT_LABELS[tab]}
          </button>
        ))}
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
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase"
                    style={{
                      color: PLAT_COLOURS[(release as any).platform || 'extension'] || '#6c7086',
                      background: `${PLAT_COLOURS[(release as any).platform || 'extension'] || '#6c7086'}18`,
                    }}
                  >
                    {PLAT_LABELS[(release as any).platform || 'extension'] || 'Extension'}
                  </span>
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
                    {new Date(release.published_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
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
                        {release.highlights.map((h: string, i: number) => (
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
