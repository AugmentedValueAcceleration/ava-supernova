import { useState, useEffect, useMemo } from 'react';
import { TierBadge } from '../components/TierBadge';
import { SectionGroup } from '../components/SectionGroup';
import { post } from '../App';
import { BoltIcon, ChartBarIcon } from '../components/Icons';
import type {
  AccountInfo,
  ConnectionStatus,
  DashboardJournalDay,
  DashboardLearningCurriculum,
  DashboardTaskEntry,
  MemoryEntry,
  Page,
  SessionStats,
  UsageLogEntry,
} from '../types/messages';

// ── Weather types ────────────────────────────────────────────────────────────

interface WeatherCondition {
  temp_C: string;
  temp_F: string;
  humidity: string;
  windspeedKmph: string;
  weatherDesc: { value: string }[];
  weatherCode: string;
}

interface WeatherForecast {
  date: string;
  maxtempC: string;
  mintempC: string;
  hourly: { weatherCode: string; weatherDesc: { value: string }[] }[];
}

interface WeatherData {
  current_condition: WeatherCondition[];
  nearest_area: { areaName: { value: string }[]; country: { value: string }[] }[];
  weather: WeatherForecast[];
}

// ── News types ───────────────────────────────────────────────────────────────

interface NewsArticle {
  id: string;
  title: string;
  slug: string;
  category: string;
  reading_time: number;
  published_at: string;
  excerpt?: string;
}

// ── Release types ────────────────────────────────────────────────────────────

interface ReleaseInfo {
  id: string;
  version: string;
  title: string;
  published_at: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const WEATHER_CACHE_KEY = 'ava_weather_cache';
const WEATHER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-green-400',
  medium: 'bg-blue-400',
  high: 'bg-amber-400',
  urgent: 'bg-red-400',
};

const MOOD_EMOJI: Record<number, string> = {
  1: '\u{1F614}', // pensive
  2: '\u{1F615}', // confused
  3: '\u{1F610}', // neutral
  4: '\u{1F60A}', // blush
  5: '\u{1F604}', // grin
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function weatherEmoji(code: string, desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('thunder')) return '\u26C8\uFE0F';
  if (d.includes('snow') || d.includes('blizzard') || d.includes('sleet')) return '\u2744\uFE0F';
  if (d.includes('rain') || d.includes('drizzle') || d.includes('shower')) return '\u{1F327}\uFE0F';
  if (d.includes('fog') || d.includes('mist') || d.includes('haze')) return '\u{1F32B}\uFE0F';
  if (d.includes('overcast')) return '\u2601\uFE0F';
  if (d.includes('cloud') || d.includes('partly')) return '\u26C5';
  if (d.includes('sun') || d.includes('clear')) return '\u2600\uFE0F';
  // Fallback by code ranges
  const c = parseInt(code, 10);
  if (c <= 113) return '\u2600\uFE0F';
  if (c <= 176) return '\u26C5';
  if (c <= 248) return '\u2601\uFE0F';
  if (c <= 299) return '\u{1F327}\uFE0F';
  if (c <= 338) return '\u2744\uFE0F';
  return '\u2601\uFE0F';
}

function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len).trimEnd() + '...';
}

// ── Props ────────────────────────────────────────────────────────────────────

interface OverviewProps {
  account: AccountInfo | null;
  connections: ConnectionStatus;
  onNavigate: (page: Page) => void;
  logs: UsageLogEntry[];
  sessionStats?: SessionStats | null;
  mode: 'platform' | 'byok';
  tasks: DashboardTaskEntry[];
  journalDay: DashboardJournalDay | null;
  learningCurriculums: DashboardLearningCurriculum[];
  memories: MemoryEntry[];
}

// ── Main Component ───────────────────────────────────────────────────────────

export function Overview({
  account,
  connections: _connections,
  onNavigate,
  logs,
  sessionStats: stats,
  mode,
  tasks,
  journalDay,
  learningCurriculums,
  memories,
}: OverviewProps) {
  if (mode === 'byok' || !account) {
    return (
      <ByokOverview
        stats={stats}
        onNavigate={onNavigate}
        tasks={tasks}
        journalDay={journalDay}
        learningCurriculums={learningCurriculums}
        memories={memories}
      />
    );
  }

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(account.name ?? '');
  const [refreshing, setRefreshing] = useState(false);

  // Load usage logs on mount so we have fallback stats
  useEffect(() => {
    if (logs.length === 0) {
      post({ type: 'load_usage_logs', period: '30d' });
    }
  }, []);

  const saveName = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== account.name) {
      post({ type: 'update_name', name: trimmed });
    }
    setEditingName(false);
  };
  const usage = account.usage ?? {
    tokens_used: 0,
    tokens_limit: null as number | null,
    requests_count: 0,
    period_start: null as string | null,
    period_end: null as string | null,
    free_tokens_used: 0,
    free_tokens_limit: 500_000,
  };

  // Derive stats from logs as fallback when account.usage is stale/empty
  const logsTotal = useMemo(() => {
    let total = 0;
    for (const log of logs) { total += log.input_tokens + log.output_tokens; }
    return { total, count: logs.length };
  }, [logs]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Page Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Command Centre</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') { setNameValue(account.name ?? ''); setEditingName(false); }
                }}
                placeholder="Your name"
                className="rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-0.5 text-sm text-white outline-none focus:border-[var(--accent)]"
              />
            ) : (
              <button
                onClick={() => { setNameValue(account.name ?? ''); setEditingName(true); }}
                className="text-sm text-[var(--text-secondary)] hover:text-white transition"
                title="Click to edit name"
              >
                {account.name || 'Set your name'}
              </button>
            )}
            <span className="text-xs text-[var(--text-muted)]">&middot;</span>
            <span className="text-sm text-[var(--text-muted)]">{account.email}</span>
          </div>
        </div>
        <TierBadge tier={account.tier} />
      </div>

      {/* ── Weather (full width) ──────────────────────────────────────── */}
      <div className="mb-4">
        <WeatherWidget />
      </div>

      {/* ── Statistics Row ────────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Statistics</h2>
          <button
            onClick={() => {
              setRefreshing(true);
              post({ type: 'refresh_account' });
              setTimeout(() => setRefreshing(false), 1500);
            }}
            title="Refresh stats"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-[var(--text-muted)] transition hover:bg-[var(--bg-input)] hover:text-white"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className={refreshing ? 'animate-spin' : ''}>
              <path d="M13.507 12.324a7 7 0 0 0 .065-8.56A7 7 0 0 0 2 4.393V2H1v3.5l.5.5H5V5H2.811a6.008 6.008 0 1 1-.135 5.77l-.887.462a7 7 0 0 0 11.718 1.092zM8 4h1v4.28l3.35 2.01-.51.858L8 8.72V4z"/>
            </svg>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<ChartBarIcon className="h-5 w-5 text-[var(--gradient-start)]" />}
            value={formatNumber(usage.tokens_used || logsTotal.total)}
            label="Tokens Used"
            subtext={usage.period_start ? `Since ${new Date(usage.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : (logsTotal.count > 0 ? `from ${logsTotal.count} requests` : undefined)}
          />
          <StatCard
            icon={<BoltIcon className="h-5 w-5 text-[var(--gradient-start)]" />}
            value={String(usage.requests_count || logsTotal.count)}
            label="Requests"
            subtext="This period"
          />
        </div>
      </div>

      {/* ── News + Tasks (2-col) ──────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NewsWidget />
        <TasksWidget tasks={tasks} onNavigate={onNavigate} />
      </div>

      {/* ── Journal + Learning + Memory + Release (2x2) ───────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <JournalWidget journalDay={journalDay} onNavigate={onNavigate} />
        <LearningWidget curriculums={learningCurriculums} onNavigate={onNavigate} />
        <MemoryWidget memories={memories} onNavigate={onNavigate} />
        <ReleaseWidget />
      </div>

      {/* ── Quick Actions ──────────────────────────────────────────── */}
      <SectionGroup label="Quick Actions">
        <div className="grid grid-cols-2 gap-3">
          <ActionCard label="Manage Billing" onClick={() => onNavigate('billing')} />
          <ActionCard label="Open Chat" onClick={() => post({ type: 'open_chat' })} />
        </div>
      </SectionGroup>
    </div>
  );
}

// ── Weather Widget ───────────────────────────────────────────────────────────

function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Check cache first
    try {
      const cached = localStorage.getItem(WEATHER_CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < WEATHER_CACHE_TTL) {
          setWeather(data);
          setLoading(false);
          return;
        }
      }
    } catch { /* ignore corrupt cache */ }

    fetch('https://wttr.in/?format=j1')
      .then(res => {
        if (!res.ok) throw new Error('Weather fetch failed');
        return res.json();
      })
      .then((data: WeatherData) => {
        setWeather(data);
        setLoading(false);
        try {
          localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
        } catch { /* storage full */ }
      })
      .catch(() => {
        setLoading(false);
        setError(true);
      });
  }, []);

  if (loading) {
    return (
      <WidgetCard title="Weather" icon="\u{1F324}\uFE0F">
        <div className="flex items-center gap-2 py-4 text-xs text-[var(--text-muted)]">
          <span className="animate-pulse">Loading weather...</span>
        </div>
      </WidgetCard>
    );
  }

  if (error || !weather || !weather.current_condition?.[0]) {
    return (
      <WidgetCard title="Weather" icon="\u{1F324}\uFE0F">
        <p className="py-2 text-xs text-[var(--text-muted)]">Unable to load weather data.</p>
      </WidgetCard>
    );
  }

  const current = weather.current_condition[0];
  const area = weather.nearest_area?.[0];
  const location = area
    ? `${area.areaName?.[0]?.value ?? ''}, ${area.country?.[0]?.value ?? ''}`
    : 'Unknown location';
  const desc = current.weatherDesc?.[0]?.value ?? 'Unknown';
  const emoji = weatherEmoji(current.weatherCode, desc);
  const forecast = weather.weather?.slice(0, 3) ?? [];

  return (
    <WidgetCard title="Weather" icon="\u{1F324}\uFE0F" subtitle={location}>
      {/* Current conditions */}
      <div className="flex items-center gap-4">
        <span className="text-3xl">{emoji}</span>
        <div>
          <div className="text-2xl font-bold">{current.temp_C}&deg;C</div>
          <div className="text-xs text-[var(--text-secondary)]">{desc}</div>
        </div>
        <div className="ml-auto grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
          <span>Humidity</span>
          <span className="text-[var(--text-secondary)]">{current.humidity}%</span>
          <span>Wind</span>
          <span className="text-[var(--text-secondary)]">{current.windspeedKmph} km/h</span>
        </div>
      </div>

      {/* 3-day forecast */}
      {forecast.length > 0 && (
        <div className="mt-3 flex gap-3 border-t border-[var(--border-card)] pt-3">
          {forecast.map((day, i) => {
            const dayDesc = day.hourly?.[4]?.weatherDesc?.[0]?.value ?? '';
            const dayCode = day.hourly?.[4]?.weatherCode ?? '116';
            const dayName = i === 0 ? 'Today' : new Date(day.date).toLocaleDateString('en', { weekday: 'short' });
            return (
              <div key={day.date} className="flex-1 text-center">
                <div className="text-[10px] text-[var(--text-muted)]">{dayName}</div>
                <div className="text-lg">{weatherEmoji(dayCode, dayDesc)}</div>
                <div className="text-[10px]">
                  <span className="text-white">{day.maxtempC}&deg;</span>
                  <span className="text-[var(--text-muted)]"> / {day.mintempC}&deg;</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}

// ── News Widget ──────────────────────────────────────────────────────────────

function NewsWidget() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('https://ava-supernova.com/api/news?limit=5&featured=true')
      .then(res => {
        if (!res.ok) throw new Error('News fetch failed');
        return res.json();
      })
      .then((data: { articles?: NewsArticle[] } | NewsArticle[]) => {
        const list = Array.isArray(data) ? data : (data.articles ?? []);
        setArticles(list);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  return (
    <WidgetCard title="Latest News" icon="\u{1F4F0}">
      {loading ? (
        <p className="py-4 text-xs text-[var(--text-muted)] animate-pulse">Loading news...</p>
      ) : articles.length === 0 ? (
        <p className="py-4 text-xs text-[var(--text-muted)]">No news articles available.</p>
      ) : (
        <div className="space-y-2">
          {articles.map(article => (
            <button
              key={article.id}
              onClick={() => post({ type: 'open_url', url: `https://ava-supernova.com/news/${article.slug}` })}
              className="block w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)]/30 p-3 text-left transition hover:border-[var(--accent)]/30"
            >
              <div className="flex items-center gap-2 mb-1">
                {article.category && (
                  <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[9px] font-medium text-[var(--accent)]">
                    {article.category}
                  </span>
                )}
                {article.reading_time > 0 && (
                  <span className="text-[9px] text-[var(--text-muted)]">{article.reading_time} min read</span>
                )}
              </div>
              <p className="text-xs font-medium text-white leading-snug">{article.title}</p>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">{formatRelativeDate(article.published_at)}</p>
            </button>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// ── Tasks Widget ─────────────────────────────────────────────────────────────

function TasksWidget({ tasks, onNavigate }: { tasks: DashboardTaskEntry[]; onNavigate: (p: Page) => void }) {
  const today = new Date().toISOString().slice(0, 10);

  const todayTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.status === 'done' || t.status === 'archived') return false;
      // Overdue or due today
      if (t.due_date && t.due_date <= today) return true;
      // In-progress tasks
      if (t.status === 'in-progress') return true;
      // No due date but active today
      if (!t.due_date && t.status === 'todo') return false;
      return false;
    }).sort((a, b) => {
      // Overdue first, then by priority
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      const aOverdue = a.due_date && a.due_date < today ? -1 : 0;
      const bOverdue = b.due_date && b.due_date < today ? -1 : 0;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
    }).slice(0, 6);
  }, [tasks, today]);

  return (
    <WidgetCard
      title="Today's Tasks"
      icon="\u2705"
      action={tasks.length > 0 ? { label: 'View all', onClick: () => onNavigate('tasks') } : undefined}
    >
      {todayTasks.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <span className="mb-2 text-2xl opacity-30">{'\u{1F389}'}</span>
          <p className="text-xs text-[var(--text-muted)]">No tasks today. Enjoy the clear board!</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {todayTasks.map(task => {
            const isOverdue = task.due_date && task.due_date < today;
            return (
              <div
                key={task.id}
                className={`group flex items-center gap-2.5 rounded-lg border p-2.5 transition ${
                  isOverdue
                    ? 'border-red-500/20 bg-red-500/5'
                    : 'border-[var(--border-card)] bg-[var(--bg-input)]/30 hover:border-[var(--accent)]/20'
                }`}
              >
                {/* Complete button */}
                <button
                  onClick={() => post({ type: 'complete_task', id: task.id })}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border-card)] text-[var(--text-muted)] transition hover:border-emerald-500 hover:text-emerald-400"
                  title="Complete task"
                >
                  <span className="text-[10px]">{task.status === 'in-progress' ? '\u27F3' : '\u25CB'}</span>
                </button>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{task.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[task.priority] ?? 'bg-blue-400'}`} />
                    <span className="text-[9px] text-[var(--text-muted)]">
                      {task.priority}
                    </span>
                    {isOverdue && (
                      <span className="text-[9px] font-medium text-red-400">Overdue</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}

// ── Journal Widget ───────────────────────────────────────────────────────────

function JournalWidget({ journalDay, onNavigate }: { journalDay: DashboardJournalDay | null; onNavigate: (p: Page) => void }) {
  const userEntry = journalDay?.user_entry;
  const avaEntry = journalDay?.ava_entry;
  const hasContent = Boolean(userEntry || avaEntry);

  return (
    <WidgetCard
      title="Today's Journal"
      icon="\u{1F4D3}"
      action={{ label: hasContent ? 'Open journal' : 'Write entry', onClick: () => onNavigate('journal') }}
    >
      {!hasContent ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="mb-2 text-2xl opacity-30">{'\u{1F4DD}'}</span>
          <p className="text-xs text-[var(--text-muted)]">No journal entries today.</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">Take a moment to reflect.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {userEntry && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-medium text-[var(--text-secondary)]">Your entry</span>
                {userEntry.mood && (
                  <span className="text-sm">{MOOD_EMOJI[userEntry.mood] ?? ''}</span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {truncate(userEntry.content, 120)}
              </p>
            </div>
          )}
          {avaEntry && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-medium" style={{ color: '#A855F7' }}>Ava's entry</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {truncate(avaEntry.content, 120)}
              </p>
            </div>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

// ── Learning Widget ──────────────────────────────────────────────────────────

function LearningWidget({ curriculums, onNavigate }: { curriculums: DashboardLearningCurriculum[]; onNavigate: (p: Page) => void }) {
  const active = useMemo(() => {
    return curriculums.filter(c => c.status !== 'completed').slice(0, 3);
  }, [curriculums]);

  return (
    <WidgetCard
      title="Learning"
      icon="\u{1F393}"
      action={curriculums.length > 0 ? { label: 'Continue learning', onClick: () => onNavigate('learning') } : undefined}
    >
      {active.length === 0 ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="mb-2 text-2xl opacity-30">{'\u{1F4DA}'}</span>
          <p className="text-xs text-[var(--text-muted)]">No active learning paths.</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">Tell Ava what you want to learn.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {active.map(curr => (
            <div key={curr.id}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-white truncate flex-1">{curr.title}</p>
                <span className="text-[10px] font-medium text-[var(--text-secondary)] ml-2 shrink-0">
                  {Math.round(curr.progress_percent)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-input)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${curr.progress_percent}%`,
                    background: 'linear-gradient(to right, var(--gradient-start), var(--gradient-end))',
                  }}
                />
              </div>
              <p className="mt-0.5 text-[9px] text-[var(--text-muted)]">{curr.subject}</p>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// ── Memory Widget ────────────────────────────────────────────────────────────

function MemoryWidget({ memories, onNavigate }: { memories: MemoryEntry[]; onNavigate: (p: Page) => void }) {
  const activeCount = memories.filter(m => !m.archived).length;
  const lastMemory = memories.length > 0
    ? memories.reduce((latest, m) => {
        const mDate = m.updated_at ?? m.created_at;
        const latestDate = latest.updated_at ?? latest.created_at;
        return mDate > latestDate ? m : latest;
      })
    : null;

  return (
    <WidgetCard
      title="Memory"
      icon="\u{1F9E0}"
      action={{ label: 'View all', onClick: () => onNavigate('memory') }}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-2xl font-bold">{activeCount}</div>
            <div className="text-[10px] text-[var(--text-muted)]">Active memories</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-lg font-semibold text-[var(--text-secondary)]">{memories.length}</div>
            <div className="text-[10px] text-[var(--text-muted)]">Total</div>
          </div>
        </div>
        {lastMemory && (
          <div className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)]/30 p-2.5">
            <p className="text-[10px] text-[var(--text-muted)] mb-0.5">Last saved</p>
            <p className="text-xs text-[var(--text-secondary)] truncate">{lastMemory.key || truncate(lastMemory.content, 60)}</p>
            <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{formatRelativeDate(lastMemory.updated_at ?? lastMemory.created_at)}</p>
          </div>
        )}
      </div>
    </WidgetCard>
  );
}

// ── Release Widget ───────────────────────────────────────────────────────────

function ReleaseWidget() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('https://ava-supernova.com/api/releases?limit=1')
      .then(res => {
        if (!res.ok) throw new Error('Releases fetch failed');
        return res.json();
      })
      .then((data: { releases?: ReleaseInfo[] } | ReleaseInfo[]) => {
        const list = Array.isArray(data) ? data : (data.releases ?? []);
        if (list.length > 0) setRelease(list[0]);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  return (
    <WidgetCard title="Latest Release" icon="\u{1F680}">
      {loading ? (
        <p className="py-4 text-xs text-[var(--text-muted)] animate-pulse">Checking releases...</p>
      ) : !release ? (
        <p className="py-4 text-xs text-[var(--text-muted)]">No release info available.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--accent)]/15 px-2.5 py-0.5 text-xs font-bold text-[var(--accent)]">
              v{release.version}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">{formatRelativeDate(release.published_at)}</span>
          </div>
          <p className="text-xs font-medium text-white">{release.title}</p>
          <button
            onClick={() => post({ type: 'open_url', url: 'https://ava-supernova.com/releases' })}
            className="text-[10px] text-[var(--accent)] hover:underline"
          >
            View release notes &rarr;
          </button>
        </div>
      )}
    </WidgetCard>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function WidgetCard({
  title,
  icon,
  subtitle,
  action,
  children,
}: {
  title: string;
  icon: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{title}</h3>
          {subtitle && (
            <span className="text-[10px] text-[var(--text-muted)]">&middot; {subtitle}</span>
          )}
        </div>
        {action && (
          <button
            onClick={action.onClick}
            className="text-[10px] text-[var(--accent)] hover:underline transition"
          >
            {action.label} &rarr;
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function StatCard({ icon, value, label, subtext }: { icon: React.ReactNode; value: string; label: string; subtext?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-input)]">
        {icon}
      </div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
      {subtext && <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{subtext}</div>}
    </div>
  );
}

function ActionCard({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5 text-left text-sm text-[var(--text-secondary)] transition hover:border-[var(--accent)]/30 hover:text-white"
    >
      {label}
    </button>
  );
}

// ── BYOK Overview ────────────────────────────────────────────────────────────

function ByokOverview({
  stats,
  onNavigate,
  tasks,
  journalDay,
  learningCurriculums,
  memories,
}: {
  stats?: SessionStats | null;
  onNavigate: (page: Page) => void;
  tasks: DashboardTaskEntry[];
  journalDay: DashboardJournalDay | null;
  learningCurriculums: DashboardLearningCurriculum[];
  memories: MemoryEntry[];
}) {
  const totalTokens = stats ? stats.total_input_tokens + stats.total_output_tokens : 0;
  const sessionDuration = stats ? timeSince(stats.session_start) : '\u2014';

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Command Centre</h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Your personal dashboard at a glance.
        </p>
      </div>

      {/* ── Weather (full width) ──────────────────────────────────────── */}
      <div className="mb-4">
        <WeatherWidget />
      </div>

      {/* Session Stats */}
      <div className="mb-4">
        <SectionGroup label="Session Stats">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<BoltIcon className="h-5 w-5 text-[var(--gradient-start)]" />}
              value={String(stats?.messages ?? 0)}
              label="Messages"
              subtext="This session"
            />
            <StatCard
              icon={<ChartBarIcon className="h-5 w-5 text-[var(--gradient-start)]" />}
              value={formatNumber(totalTokens)}
              label="Tokens Used"
              subtext={`In: ${formatNumber(stats?.total_input_tokens ?? 0)} / Out: ${formatNumber(stats?.total_output_tokens ?? 0)}`}
            />
            <StatCard
              icon={<BoltIcon className="h-5 w-5 text-[var(--gradient-start)]" />}
              value={String(stats?.tool_calls ?? 0)}
              label="Tool Calls"
              subtext="This session"
            />
            <StatCard
              icon={<ChartBarIcon className="h-5 w-5 text-[var(--gradient-start)]" />}
              value={sessionDuration}
              label="Session Duration"
              subtext={stats ? `Since ${new Date(stats.session_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : undefined}
            />
          </div>
        </SectionGroup>
      </div>

      {/* ── News + Tasks (2-col) ──────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NewsWidget />
        <TasksWidget tasks={tasks} onNavigate={onNavigate} />
      </div>

      {/* ── Journal + Learning + Memory + Release (2x2) ───────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <JournalWidget journalDay={journalDay} onNavigate={onNavigate} />
        <LearningWidget curriculums={learningCurriculums} onNavigate={onNavigate} />
        <MemoryWidget memories={memories} onNavigate={onNavigate} />
        <ReleaseWidget />
      </div>

      {/* Upgrade Comparison */}
      <div className="mb-6">
        <SectionGroup label="Get More from Ava">
          <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">What you have</h3>
                <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
                  <li className="flex items-center gap-2"><span className="text-green-400">&#10003;</span> Local memory storage</li>
                  <li className="flex items-center gap-2"><span className="text-green-400">&#10003;</span> Session-based usage stats</li>
                  <li className="flex items-center gap-2"><span className="text-green-400">&#10003;</span> Your own API keys</li>
                  <li className="flex items-center gap-2"><span className="text-green-400">&#10003;</span> All 45 tools</li>
                  <li className="flex items-center gap-2"><span className="text-green-400">&#10003;</span> 2 free models</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--gradient-start)]">With a connected account (free)</h3>
                <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
                  <li className="flex items-center gap-2"><span className="text-[var(--gradient-start)]">&#10003;</span> Memory sync across devices</li>
                  <li className="flex items-center gap-2"><span className="text-[var(--gradient-start)]">&#10003;</span> Full usage history</li>
                  <li className="flex items-center gap-2"><span className="text-[var(--gradient-start)]">&#10003;</span> Priority support with ticket tracking</li>
                  <li className="flex items-center gap-2"><span className="text-[var(--gradient-start)]">&#10003;</span> 500K free tokens every month</li>
                  <li className="flex items-center gap-2"><span className="text-[var(--gradient-start)]">&#10003;</span> Conversation history & backup</li>
                </ul>
              </div>
            </div>
            <div className="mt-5 border-t border-[var(--border-card)] pt-4 text-center">
              <p className="mb-3 text-xs text-[var(--text-muted)]">
                Keep using your own API keys &mdash; a connected account just adds sync, history, and support.
              </p>
              <button
                onClick={() => post({ type: 'open_url', url: 'https://ava-supernova.com/signup' })}
                className="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)]"
              >
                Connect Account &mdash; Free
              </button>
            </div>
          </div>
        </SectionGroup>
      </div>

      {/* Quick Actions */}
      <SectionGroup label="Quick Actions">
        <div className="grid grid-cols-2 gap-3">
          <ActionCard label="Open Chat" onClick={() => post({ type: 'open_chat' })} />
          <ActionCard label="Manage API Keys" onClick={() => onNavigate('keys')} />
        </div>
      </SectionGroup>
    </div>
  );
}

// ── Utility functions ────────────────────────────────────────────────────────

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  return `${hours}h ${remaining}m`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
