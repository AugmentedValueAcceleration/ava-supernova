import { useLocale } from '../i18n';
import { Skeleton } from '../components/Skeleton';
import type { RoadmapTheme } from '../types/messages';

/**
 * Roadmap surface inside the Help page. Renders the theme-grouped
 * payload pushed by the host (load_roadmap → /api/roadmap →
 * roadmap_loaded). Pure presentation — App.tsx owns the fetch and
 * the loading gate.
 */

interface Props {
  themes: RoadmapTheme[];
  loading: boolean;
}

export function Roadmap({ themes, loading }: Props) {
  useLocale();

  const totalShipped = themes.reduce((sum, t) => sum + t.items.filter(i => i.shipped).length, 0);
  const totalAll = themes.reduce((sum, t) => sum + t.items.length, 0);
  const pct = totalAll > 0 ? Math.round((totalShipped / totalAll) * 100) : 0;

  return (
    <div className="w-full">
      {/* Header */}
      <h1 className="text-[22px] font-semibold text-[#cdd6f4] mb-1.5">Roadmap</h1>
      <p className="text-[13px] text-[#6c7086] mb-6">Where Ava has been and where she&apos;s heading.</p>

      {loading && themes.length === 0 && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map(i => <Skeleton key={i} height={96} radius={12} />)}
        </div>
      )}

      {!loading && themes.length === 0 && (
        <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-6 py-10 text-center text-sm text-[var(--text-muted)]">
          No roadmap items yet. New ones land here as they ship.
        </div>
      )}

      {themes.length > 0 && (
        <>
          {/* Stats */}
          <div className="flex gap-6 mb-8">
            <div>
              <div className="text-2xl font-light" style={{ color: 'var(--accent)' }}>{pct}%</div>
              <div className="text-[10px] font-light uppercase tracking-wider text-[var(--text-muted)]">Complete</div>
            </div>
            <div>
              <div className="text-2xl font-light text-green-400">{totalShipped}</div>
              <div className="text-[10px] font-light uppercase tracking-wider text-[var(--text-muted)]">Shipped</div>
            </div>
            <div>
              <div className="text-2xl font-light text-blue-400">{totalAll - totalShipped}</div>
              <div className="text-[10px] font-light uppercase tracking-wider text-[var(--text-muted)]">Coming</div>
            </div>
          </div>

          {/* Themes */}
          <div className="space-y-4">
            {themes.map(theme => {
              const shipped = theme.items.filter(i => i.shipped).length;
              const total = theme.items.length;
              const themePct = total > 0 ? Math.round((shipped / total) * 100) : 0;
              if (total === 0) return null;

              return (
                <div key={theme.id} className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4">
                    <span className="text-xl">{theme.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-light text-white">{theme.title}</span>
                        <span className="text-[10px] font-light text-[var(--text-muted)]">{shipped}/{total}</span>
                      </div>
                      <div className="mt-1.5 h-1 w-full rounded-full" style={{ background: theme.color_bg }}>
                        <div className="h-full rounded-full" style={{ width: `${themePct}%`, background: theme.color, transition: 'width 0.5s' }} />
                      </div>
                    </div>
                  </div>

                  <div className="px-5 pb-4 grid grid-cols-2 gap-1">
                    {theme.items.map(item => (
                      <div key={item.id} className="flex items-start gap-2 rounded-md px-2 py-1.5" style={{ background: item.shipped ? 'transparent' : theme.color_bg }}>
                        {item.shipped ? (
                          <svg width="12" height="12" viewBox="0 0 16 16" className="mt-0.5 shrink-0" style={{ color: theme.color }}>
                            <path fill="currentColor" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                          </svg>
                        ) : (
                          <span className="mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: theme.color }}>
                            <span className="h-1 w-1 rounded-full" style={{ background: theme.color, opacity: 0.5 }} />
                          </span>
                        )}
                        <span className={`text-[11px] font-light leading-snug ${item.shipped ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary,#cdd6f4)]'}`}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
