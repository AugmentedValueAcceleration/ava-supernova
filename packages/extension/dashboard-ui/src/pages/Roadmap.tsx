import { useLocale } from '../i18n';

interface ThemeItem {
  label: string;
  shipped: boolean;
}

interface RoadmapTheme {
  title: string;
  icon: string;
  color: string;
  colorBg: string;
  items: ThemeItem[];
}

const themes: RoadmapTheme[] = [
  {
    title: 'Intelligence',
    icon: '\uD83E\uDDE0',
    color: '#a855f7',
    colorBg: 'rgba(168, 85, 247, 0.08)',
    items: [
      { label: 'Core agent loop with 56 tools', shipped: true },
      { label: '6 thinking modes', shipped: true },
      { label: '24 specialist personas with conductor', shipped: true },
      { label: '5-layer memory with TF-IDF recall', shipped: true },
      { label: 'Memory Agent — curated briefs, not raw dumps', shipped: true },
      { label: 'Auto Mode — best model per task routing', shipped: true },
      { label: 'Self-inspect pipeline — Ava reads her own code from Supabase', shipped: true },
      { label: '10 knowledge packs (game dev, web, mobile, API, DevOps, systems, data science)', shipped: true },
      { label: 'Self-improvement vault', shipped: true },
      { label: 'Flat system prompt (80% token reduction)', shipped: true },
      { label: 'Direct mode — no auto-orchestration', shipped: true },
      { label: 'Qwen 3.6 + MiniMax M2.7 multimodal models', shipped: true },
      { label: 'Intent detection (thinking out loud vs instruction)', shipped: true },
      { label: 'Voice system (Kokoro TTS)', shipped: false },
      { label: 'Computer use (browser + desktop)', shipped: false },
    ],
  },
  {
    title: 'Surfaces',
    icon: '\uD83D\uDCBB',
    color: '#f97316',
    colorBg: 'rgba(249, 115, 22, 0.08)',
    items: [
      { label: 'VS Code extension (unified panel)', shipped: true },
      { label: 'Ava IDE (Tauri desktop)', shipped: true },
      { label: 'Companion web/mobile app', shipped: true },
      { label: 'CLI agent', shipped: true },
      { label: 'Consolidated sidebar — 7 items, identical across extension + IDE', shipped: true },
      { label: 'IDE file explorer with syntax highlighting', shipped: true },
      { label: 'Resizable sidebar with flip', shipped: true },
      { label: 'Single-bubble responses', shipped: true },
      { label: 'Data portability (export/import)', shipped: true },
      { label: 'Game engine integrations', shipped: false },
      { label: 'Plugin marketplace', shipped: false },
      { label: 'Code signing', shipped: false },
    ],
  },
  {
    title: 'Education',
    icon: '\uD83C\uDF93',
    color: '#3b82f6',
    colorBg: 'rgba(59, 130, 246, 0.08)',
    items: [
      { label: 'Teach mode with curriculums', shipped: true },
      { label: 'Spaced repetition', shipped: true },
      { label: 'Fact-checked content', shipped: true },
      { label: '20 language support', shipped: true },
      { label: 'Game dev knowledge pack', shipped: true },
      { label: 'AI-era learning paths', shipped: false },
      { label: 'Community knowledge packs', shipped: false },
    ],
  },
  {
    title: 'Privacy & Security',
    icon: '\uD83D\uDD12',
    color: '#10b981',
    colorBg: 'rgba(16, 185, 129, 0.08)',
    items: [
      { label: 'Local-first architecture', shipped: true },
      { label: 'Cloud sync opt-in (15-min auto)', shipped: true },
      { label: 'BYOK fully private', shipped: true },
      { label: 'Secret vault', shipped: true },
      { label: 'Security audit mode (OWASP)', shipped: true },
      { label: 'Atomic token enforcement', shipped: true },
      { label: '3-layer hub auth + inactivity lock', shipped: true },
      { label: 'Independent security audit', shipped: false },
      { label: 'E2E encryption for cloud sync', shipped: false },
    ],
  },
  {
    title: 'Platform & Business',
    icon: '\uD83D\uDE80',
    color: '#ec4899',
    colorBg: 'rgba(236, 72, 153, 0.08)',
    items: [
      { label: 'Web platform with auth', shipped: true },
      { label: 'Company hub (Tauri admin)', shipped: true },
      { label: 'Qwen partnership (50% pricing)', shipped: true },
      { label: 'Qwen 3.6 Plus — primary model', shipped: true },
      { label: '10 providers, 15+ models', shipped: true },
      { label: '3M free Qwen tokens for all', shipped: true },
      { label: 'Device sessions (1 key, 3 platforms)', shipped: true },
      { label: 'Creative studio with sectioned prompts', shipped: true },
      { label: 'Delete all memories (local + platform)', shipped: true },
      { label: 'Live chat support — Ava first-line triage', shipped: true },
      { label: 'Token usage bar with real-time deduction', shipped: true },
      { label: 'Period rollover for paid plans', shipped: true },
      { label: 'Paid plans (Pro, Ultra, Enterprise)', shipped: false },
      { label: 'Contributor marketplace — users get paid', shipped: false },
      { label: 'Token top-ups', shipped: false },
      { label: 'OAuth connections', shipped: false },
      { label: 'Ava Foundation (40% of earnings)', shipped: false },
    ],
  },
];

export function Roadmap() {
  useLocale();

  const totalShipped = themes.reduce((sum, t) => sum + t.items.filter(i => i.shipped).length, 0);
  const totalAll = themes.reduce((sum, t) => sum + t.items.length, 0);
  const pct = Math.round((totalShipped / totalAll) * 100);

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Header */}
      <h1 className="text-2xl font-light mb-1">Roadmap</h1>
      <p className="text-xs font-light text-[var(--text-muted)] mb-6">Where Ava has been and where she's heading.</p>

      {/* Stats */}
      <div className="flex gap-6 mb-8">
        <div>
          <div className="text-2xl font-light" style={{ color: 'var(--accent, #a855f7)' }}>{pct}%</div>
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
          const themePct = Math.round((shipped / total) * 100);

          return (
            <div key={theme.title} className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] overflow-hidden">
              {/* Theme header */}
              <div className="flex items-center gap-3 px-5 py-4">
                <span className="text-xl">{theme.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-light text-white">{theme.title}</span>
                    <span className="text-[10px] font-light text-[var(--text-muted)]">{shipped}/{total}</span>
                  </div>
                  <div className="mt-1.5 h-1 w-full rounded-full" style={{ background: theme.colorBg }}>
                    <div className="h-full rounded-full" style={{ width: `${themePct}%`, background: theme.color, transition: 'width 0.5s' }} />
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="px-5 pb-4 grid grid-cols-2 gap-1">
                {theme.items.map(item => (
                  <div key={item.label} className="flex items-start gap-2 rounded-md px-2 py-1.5" style={{ background: item.shipped ? 'transparent' : theme.colorBg }}>
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
    </div>
  );
}
