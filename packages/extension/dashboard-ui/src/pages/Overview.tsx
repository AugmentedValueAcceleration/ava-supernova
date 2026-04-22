import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { t, useLocale } from '../i18n';
import { TierBadge } from '../components/TierBadge';
import { SectionGroup } from '../components/SectionGroup';
import { post } from '../App';
import {
  Lightning, ChartBar, Clock, CloudSun, Newspaper, CheckCircle,
  Brain, BookOpen, Sparkle, Rocket, ArrowsClockwise,
} from '@phosphor-icons/react';
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

// ── Weather data (from extension host via Open-Meteo) ────────────────────────

interface WeatherData {
  location: string;
  temp_c: number;
  condition: string;
  emoji: string;
  humidity: number;
  wind_kmph: number;
  forecast: Array<{ date: string; day: string; max_c: number; min_c: number; condition: string; emoji: string }>;
}

// ── News article (from extension host) ───────────────────────────────────────

interface NewsArticle {
  title: string;
  slug: string;
  category: string;
  reading_time: number;
  date: string;
}

// ── Release info (from extension host) ───────────────────────────────────────

interface ReleaseInfo {
  version: string;
  title: string;
  published_at: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-green-400',
  medium: 'bg-blue-400',
  high: 'bg-amber-400',
  urgent: 'bg-red-400',
};

const MOOD_EMOJI: Record<number, string> = {
  1: '😔',
  2: '😕',
  3: '😐',
  4: '😊',
  5: '😄',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return t('dash.tasks.today');
  if (diffDays === 1) return t('dash.cc.yesterday');
  if (diffDays < 7) return t('dash.cc.days_ago', { n: diffDays });
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
  memoryTotal?: number;
  weatherData: WeatherData | null;
  newsArticles: NewsArticle[];
  latestRelease: ReleaseInfo | null;
  articleLoading?: boolean;
  onOpenArticle?: (slug: string) => void;
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
  memoryTotal,
  weatherData,
  newsArticles,
  latestRelease,
  articleLoading,
  onOpenArticle,
}: OverviewProps) {
  useLocale();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(account?.name ?? '');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (logs.length === 0 && account) {
      post({ type: 'load_usage_logs', period: '30d' });
    }
  }, []);

  // Update name when account changes
  useEffect(() => { setNameValue(account?.name ?? ''); }, [account?.name]);

  if (mode === 'byok' || !account) {
    return (
      <ByokOverview
        stats={stats}
        onNavigate={onNavigate}
        tasks={tasks}
        journalDay={journalDay}
        learningCurriculums={learningCurriculums}
        memories={memories}
        weatherData={weatherData}
        newsArticles={newsArticles}
        latestRelease={latestRelease}
        articleLoading={articleLoading}
        onOpenArticle={onOpenArticle}
      />
    );
  }

  const saveName = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== account.name) {
      post({ type: 'update_name', name: trimmed });
    }
    setEditingName(false);
  };
  const usage = account.usage ?? {
    credits_used: 0,
    credits_limit: null as number | null,
    requests_count: 0,
    period_start: null as string | null,
    period_end: null as string | null,
    free_credits_used: 0,
    free_credits_limit: 1_500,
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
          <h1 className="text-xl font-bold">{t('dash.nav.command_centre')}</h1>
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
                {account.name || t('dash.cc.set_name')}
              </button>
            )}
            <span className="text-xs text-[var(--text-muted)]">&middot;</span>
            <span className="text-sm text-[var(--text-muted)]">{account.email}</span>
          </div>
        </div>
        <TierBadge tier={account.tier} />
      </div>

      {/* ── Weather + Working Hours ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <WeatherWidget weather={weatherData} />
        <WorkingHoursClock />
      </div>

      {/* ── Statistics Row ────────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t('dash.cc.statistics')}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<ChartBar weight="duotone" size={20} />}
            value={formatNumber(usage.credits_used || logsTotal.total)}
            label={t('dash.cc.credits_used')}
            subtext={usage.period_start ? t('dash.cc.since', { date: new Date(usage.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }) : (logsTotal.count > 0 ? t('dash.cc.from_requests', { count: logsTotal.count }) : undefined)}
          />
          <StatCard
            icon={<Lightning weight="duotone" size={20} />}
            value={String(usage.requests_count || logsTotal.count)}
            label={t('dash.cc.requests')}
            subtext={t('dash.cc.this_period')}
          />
        </div>
      </div>

      {/* ── News + Tasks (2-col) ──────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NewsWidget articles={newsArticles} articleLoading={articleLoading} onOpenArticle={onOpenArticle} />
        <TasksWidget tasks={tasks} onNavigate={onNavigate} />
      </div>

      {/* ── Journal + Learning + Memory + Release (2x2) ───────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <JournalWidget journalDay={journalDay} onNavigate={onNavigate} />
        <LearningWidget curriculums={learningCurriculums} onNavigate={onNavigate} />
        <MemoryWidget memories={memories} onNavigate={onNavigate} total={memoryTotal} />
        <ReleaseWidget release={latestRelease} />
      </div>

      {/* ── Quick Actions ──────────────────────────────────────────── */}
      <SectionGroup label={t('dash.nav.billing')}>
        <div className="grid grid-cols-2 gap-3">
          <ActionCard label={t('dash.nav.billing')} onClick={() => onNavigate('billing')} />
          <ActionCard label={t('dash.chat.new_chat')} onClick={() => post({ type: 'open_chat' })} />
        </div>
      </SectionGroup>
    </div>
  );
}

// ── Weather Widget ───────────────────────────────────────────────────────────

function WorkingHoursClock() {
  const [start, setStart] = useState<number>(() => {
    try { return Number(localStorage.getItem('ava-work-start')) || 9; } catch { return 9; }
  });
  const [end, setEnd] = useState<number>(() => {
    try { return Number(localStorage.getItem('ava-work-end')) || 17; } catch { return 17; }
  });
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  const clockRef = useRef<SVGSVGElement>(null);

  const save = useCallback((s: number, e: number) => {
    try {
      localStorage.setItem('ava-work-start', String(s));
      localStorage.setItem('ava-work-end', String(e));
    } catch {}
    post({ type: 'set_working_hours', start: s, end: e });
  }, []);

  const angleForHour = (h: number) => ((h / 24) * 360 - 90) * (Math.PI / 180);
  const hourFromAngle = (angleDeg: number) => {
    let h = Math.round(((angleDeg + 90) / 360) * 24) % 24;
    if (h < 0) h += 24;
    return h;
  };

  const getAngleFromEvent = useCallback((e: MouseEvent) => {
    if (!clockRef.current) return 0;
    const rect = clockRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const hour = hourFromAngle(getAngleFromEvent(e));
      if (dragging === 'start') { setStart(hour); save(hour, end); }
      else { setEnd(hour); save(start, hour); }
    };
    const onUp = () => setDragging(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [dragging, start, end, save, getAngleFromEvent]);

  const size = 120;
  const cx = size / 2, cy = size / 2, r = 46;
  const pinPos = (h: number) => {
    const a = angleForHour(h);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const startPos = pinPos(start);
  const endPos = pinPos(end);

  const arcPath = () => {
    const a1 = angleForHour(start), a2 = angleForHour(end);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const diff = ((end - start) % 24 + 24) % 24;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${diff > 12 ? 1 : 0} 1 ${x2} ${y2}`;
  };

  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const now = new Date().getHours();
  const isWorking = start <= end ? (now >= start && now < end) : (now >= start || now < end);

  return (
    <WidgetCard title={t('dash.cc.working_hours')} icon={<Clock weight="duotone" size={16} />}>
      <div className="flex items-center gap-4">
        <svg ref={clockRef} width={size} height={size} className="shrink-0">
          <circle cx={cx} cy={cy} r={r + 6} fill="var(--bg-input)" stroke="var(--border-card)" strokeWidth={1} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-card)" strokeWidth={1.5} />
          {Array.from({ length: 24 }, (_, i) => {
            const a = angleForHour(i);
            const inner = r - (i % 6 === 0 ? 8 : 4);
            return <line key={i} x1={cx + inner * Math.cos(a)} y1={cy + inner * Math.sin(a)} x2={cx + (r - 2) * Math.cos(a)} y2={cy + (r - 2) * Math.sin(a)} stroke={i % 6 === 0 ? 'var(--text-muted)' : 'var(--border-card)'} strokeWidth={i % 6 === 0 ? 1.2 : 0.6} />;
          })}
          {[0, 6, 12, 18].map(h => {
            const a = angleForHour(h);
            return <text key={h} x={cx + (r - 15) * Math.cos(a)} y={cy + (r - 15) * Math.sin(a) + 3} fontSize={8} fill="var(--text-muted)" textAnchor="middle">{h}</text>;
          })}
          <path d={arcPath()} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" opacity={0.6} />
          {(() => { const a = angleForHour(now); return <circle cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={2.5} fill={isWorking ? '#a6e3a1' : 'var(--text-muted)'} />; })()}
          <circle cx={startPos.x} cy={startPos.y} r={6} fill="var(--accent)" stroke="var(--bg-card)" strokeWidth={2} style={{ cursor: 'grab' }} onMouseDown={(e) => { e.preventDefault(); setDragging('start'); }} />
          <circle cx={endPos.x} cy={endPos.y} r={6} fill="#f5c2e7" stroke="var(--bg-card)" strokeWidth={2} style={{ cursor: 'grab' }} onMouseDown={(e) => { e.preventDefault(); setDragging('end'); }} />
        </svg>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white mb-1">{fmt(start)} — {fmt(end)}</div>
          <div className={`text-xs mb-2 ${isWorking ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
            {isWorking ? `\u25CF ${t('dash.cc.currently_working')}` : `\u25CB ${t('dash.cc.outside_hours')}`}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] leading-relaxed">
            {t('dash.cc.working_hours_hint')}
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}

function WeatherWidget({ weather }: { weather: WeatherData | null }) {
  if (weather === undefined) {
    return (
      <WidgetCard title={t('dash.cc.weather')} icon={<CloudSun weight="duotone" size={16} />}>
        <div className="flex items-center gap-2 py-4 text-xs text-[var(--text-muted)]">
          <span className="animate-pulse">{t('dash.cc.weather_loading')}</span>
        </div>
      </WidgetCard>
    );
  }

  if (!weather) {
    return (
      <WidgetCard title={t('dash.cc.weather')} icon={<CloudSun weight="duotone" size={16} />}>
        <p className="py-2 text-xs text-[var(--text-muted)]">{t('dash.cc.weather_error')}</p>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard title={t('dash.cc.weather')} icon={<CloudSun weight="duotone" size={16} />} subtitle={weather.location} onRefresh={() => post({ type: 'load_weather' })}>
      {/* Current conditions */}
      <div className="flex items-center gap-4">
        <span className="text-3xl">{weather.emoji}</span>
        <div>
          <div className="text-2xl font-bold">{weather.temp_c}&deg;C</div>
          <div className="text-xs text-[var(--text-secondary)]">{weather.condition}</div>
        </div>
        <div className="ml-auto grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
          <span>{t('weather.humidity')}</span>
          <span className="text-[var(--text-secondary)]">{weather.humidity}%</span>
          <span>{t('weather.wind')}</span>
          <span className="text-[var(--text-secondary)]">{weather.wind_kmph} km/h</span>
        </div>
      </div>

      {/* 3-day forecast */}
      {weather.forecast.length > 0 && (
        <div className="mt-3 flex gap-3 border-t border-[var(--border-card)] pt-3">
          {weather.forecast.map(day => (
            <div key={day.date} className="flex-1 text-center">
              <div className="text-[10px] text-[var(--text-muted)]">{day.day}</div>
              <div className="text-lg">{day.emoji}</div>
              <div className="text-[10px]">
                <span className="text-white">{day.max_c}&deg;</span>
                <span className="text-[var(--text-muted)]"> / {day.min_c}&deg;</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// ── News Widget ──────────────────────────────────────────────────────────────

const NEWS_CATEGORIES = [
  'ai-agents', 'models', 'dev-tools', 'open-source', 'education',
  'productivity', 'companions', 'health', 'enterprise', 'industry',
] as const;

function formatCategoryLabel(slug: string): string {
  // Try i18n key first (e.g. 'ai-agents' → 'news.ai_agents')
  const i18nKey = `news.${slug.replace(/-/g, '_')}`;
  const translated = t(i18nKey);
  if (translated !== i18nKey) return translated;
  // Fallback: title-case
  return slug
    .split('-')
    .map(word => {
      if (word === 'ai') return 'AI';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function NewsWidget({ articles: rawArticles, articleLoading, onOpenArticle }: { articles: NewsArticle[]; articleLoading?: boolean; onOpenArticle?: (slug: string) => void }) {
  const articles = Array.isArray(rawArticles) ? rawArticles : [];
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const handleCategoryChange = (cat: string | null) => {
    setSelectedCategory(cat);
    if (cat) {
      post({ type: 'load_news', category: cat });
    } else {
      post({ type: 'load_news' });
    }
  };

  const handleArticleClick = (slug: string) => {
    if (onOpenArticle) {
      onOpenArticle(slug);
    } else {
      post({ type: 'open_url', url: `https://ava-supernova.com/news/${slug}` });
    }
  };

  return (
    <WidgetCard title={t('dash.cc.latest_news')} icon={<Newspaper weight="duotone" size={16} />} onRefresh={() => post({ type: 'load_news' })}>
      {/* Category carousel */}
      <div
        className="news-carousel mb-3 flex gap-1.5 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style>{`.news-carousel::-webkit-scrollbar { display: none; }`}</style>
        <button
          onClick={() => handleCategoryChange(null)}
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
            selectedCategory === null
              ? 'bg-[var(--accent)] text-white'
              : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {t('news.all')}
        </button>
        {NEWS_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => handleCategoryChange(cat)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
              selectedCategory === cat
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {formatCategoryLabel(cat)}
          </button>
        ))}
      </div>

      {articleLoading && (
        <div className="flex items-center justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <span className="ml-2 text-xs text-[var(--text-muted)]">Loading article...</span>
        </div>
      )}

      {!articleLoading && articles.length === 0 ? (
        <p className="py-4 text-xs text-[var(--text-muted)]">{t('dash.cc.no_news')}</p>
      ) : !articleLoading && (
        <div className="space-y-2">
          {articles.map((article, idx) => (
            <button
              key={article.slug || idx}
              onClick={() => handleArticleClick(article.slug)}
              className="group block w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3.5 text-left transition hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/[0.03]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5 text-[var(--accent)]" style={{ background: 'rgba(168,85,247,0.08)' }}>
                  <Newspaper weight="duotone" size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-white leading-snug group-hover:text-[var(--accent)] transition-colors">{article.title}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {article.category && (
                      <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[9px] font-medium text-[var(--accent)]">
                        {formatCategoryLabel(article.category)}
                      </span>
                    )}
                    {article.reading_time > 0 && (
                      <span className="text-[9px] text-[var(--text-muted)]">{t('news.min_read', { n: article.reading_time })}</span>
                    )}
                    <span className="text-[9px] text-[var(--text-muted)]">{formatRelativeDate(article.date)}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// ── Tasks Widget ─────────────────────────────────────────────────────────────

function TasksWidget({ tasks: rawTasks, onNavigate }: { tasks: DashboardTaskEntry[]; onNavigate: (p: Page) => void }) {
  const tasks = Array.isArray(rawTasks) ? rawTasks : [];
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
      title={t('dash.cc.todays_tasks')}
      icon="✅"
      action={tasks.length > 0 ? { label: t('dash.cc.view_all'), onClick: () => onNavigate('tasks') } : undefined}
      onRefresh={() => post({ type: 'load_tasks' })}
    >
      {todayTasks.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <span className="mb-2 text-2xl opacity-30">{'🎉'}</span>
          <p className="text-xs text-[var(--text-muted)]">{t('dash.cc.no_tasks').replace('\n', ' ')}</p>
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
                      <span className="text-[9px] font-medium text-red-400">{t('dash.tasks.overdue')}</span>
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
      title={t('dash.cc.todays_journal')}
      icon="📓"
      action={{ label: hasContent ? t('dash.cc.open_journal') : t('dash.cc.write_entry'), onClick: () => onNavigate('journal') }}
      onRefresh={() => post({ type: 'load_journal_day', date: new Date().toISOString().slice(0, 10) })}
    >
      {!hasContent ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="mb-2 text-2xl opacity-30">{'📝'}</span>
          <p className="text-xs text-[var(--text-muted)]">{t('dash.cc.no_journal').replace('\n', ' ')}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {userEntry && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-medium text-[var(--text-secondary)]">{t('dash.journal.your_entries')}</span>
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
                <span className="text-[10px] font-medium" style={{ color: '#A855F7' }}>{t('dash.journal.ava_entries')}</span>
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

function LearningWidget({ curriculums: rawCurriculums, onNavigate }: { curriculums: DashboardLearningCurriculum[]; onNavigate: (p: Page) => void }) {
  const curriculums = Array.isArray(rawCurriculums) ? rawCurriculums : [];
  const active = useMemo(() => {
    return curriculums.filter(c => c.status !== 'completed').slice(0, 3);
  }, [curriculums]);

  return (
    <WidgetCard
      title={t('dash.cc.learning')}
      icon="🎓"
      action={curriculums.length > 0 ? { label: t('dash.cc.continue_learning'), onClick: () => onNavigate('learning') } : undefined}
      onRefresh={() => post({ type: 'load_learning' })}
    >
      {active.length === 0 ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="mb-2 text-2xl opacity-30">{'📚'}</span>
          <p className="text-xs text-[var(--text-muted)]">{t('dash.cc.no_learning').replace('\n', ' ')}</p>
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

function MemoryWidget({ memories: rawMemories, onNavigate, total }: { memories: MemoryEntry[]; onNavigate: (p: Page) => void; total?: number }) {
  const memories = Array.isArray(rawMemories) ? rawMemories : [];
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
      title={t('dash.cc.memory')}
      icon="🧠"
      action={{ label: t('dash.cc.view_all'), onClick: () => onNavigate('memory') }}
      onRefresh={() => post({ type: 'load_memories' })}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-2xl font-bold">{activeCount}</div>
            <div className="text-[10px] text-[var(--text-muted)]">{t('dash.memory.title')}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-lg font-semibold text-[var(--text-secondary)]">{total ?? memories.length}</div>
            <div className="text-[10px] text-[var(--text-muted)]">{t('dash.memory.total')}</div>
          </div>
        </div>
        {lastMemory && (
          <div className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)]/30 p-2.5">
            <p className="text-[10px] text-[var(--text-muted)] mb-0.5">{t('dash.memory.last_saved')}</p>
            <p className="text-xs text-[var(--text-secondary)] truncate">{lastMemory.key || truncate(lastMemory.content, 60)}</p>
            <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{formatRelativeDate(lastMemory.updated_at ?? lastMemory.created_at)}</p>
          </div>
        )}
      </div>
    </WidgetCard>
  );
}

// ── Release Widget ───────────────────────────────────────────────────────────

function ReleaseWidget({ release }: { release: ReleaseInfo | null }) {
  return (
    <WidgetCard title={t('dash.cc.latest_release')} icon={<Rocket weight="duotone" size={16} />} onRefresh={() => post({ type: 'load_latest_release' })}>
      {!release ? (
        <p className="py-4 text-xs text-[var(--text-muted)]">{t('dash.cc.no_release')}</p>
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
            {t('dash.nav.release_notes')} &rarr;
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
  onRefresh,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  onRefresh?: () => void;
  children: React.ReactNode;
}) {
  const [spinning, setSpinning] = useState(false);
  const handleRefresh = () => {
    if (!onRefresh || spinning) return;
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 1000);
  };
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[var(--accent)] shrink-0">{icon}</span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{title}</h3>
          {subtitle && (
            <span className="text-[10px] text-[var(--text-muted)]">&middot; {subtitle}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={handleRefresh}
              className="text-[var(--text-muted)] hover:text-[var(--accent)] transition"
              title={`Refresh ${title.toLowerCase()}`}
            >
              <svg className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        {action && (
          <button
            onClick={action.onClick}
            className="text-[10px] text-[var(--accent)] hover:underline transition"
          >
            {action.label} &rarr;
          </button>
        )}
        </div>
      </div>
      {children}
    </div>
  );
}

function StatCard({ icon, value, label, subtext }: { icon: React.ReactNode; value: string; label: string; subtext?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 transition hover:border-[var(--accent)]/20">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl text-[var(--accent)]" style={{ background: 'rgba(168,85,247,0.1)' }}>
        {icon}
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">{label}</div>
      {subtext && <div className="mt-1 text-[10px] text-[var(--text-muted)]">{subtext}</div>}
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
  weatherData,
  newsArticles,
  latestRelease,
  articleLoading,
  onOpenArticle,
}: {
  stats?: SessionStats | null;
  onNavigate: (page: Page) => void;
  tasks: DashboardTaskEntry[];
  journalDay: DashboardJournalDay | null;
  learningCurriculums: DashboardLearningCurriculum[];
  memories: MemoryEntry[];
  weatherData: WeatherData | null;
  newsArticles: NewsArticle[];
  articleLoading?: boolean;
  onOpenArticle?: (slug: string) => void;
  latestRelease: ReleaseInfo | null;
}) {
  const totalTokens = stats ? stats.total_input_tokens + stats.total_output_tokens : 0;
  const sessionDuration = stats ? timeSince(stats.session_start) : '\u2014';

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">{t('dash.nav.command_centre')}</h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {t('dash.nav.command_centre_desc')}
        </p>
      </div>

      {/* ── Weather + Working Hours ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <WeatherWidget weather={weatherData} />
        <WorkingHoursClock />
      </div>

      {/* Session Stats */}
      <div className="mb-4">
        <SectionGroup label={t('dash.cc.session_stats')}>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Lightning weight="duotone" size={20} />}
              value={String(stats?.messages ?? 0)}
              label={t('dash.usage.messages')}
              subtext={t('dash.usage.session')}
            />
            <StatCard
              icon={<ChartBar weight="duotone" size={20} />}
              value={formatNumber(totalTokens)}
              label={t('dash.cc.credits_used')}
              subtext={`${t('dash.usage.input_tokens')}: ${formatNumber(stats?.total_input_tokens ?? 0)} / ${t('dash.usage.output_tokens')}: ${formatNumber(stats?.total_output_tokens ?? 0)}`}
            />
            <StatCard
              icon={<Lightning weight="duotone" size={20} />}
              value={String(stats?.tool_calls ?? 0)}
              label={t('dash.usage.tool_calls')}
              subtext={t('dash.usage.session')}
            />
            <StatCard
              icon={<ChartBar weight="duotone" size={20} />}
              value={sessionDuration}
              label={t('dash.usage.session')}
              subtext={stats ? t('dash.usage.since', { time: new Date(stats.session_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) }) : undefined}
            />
          </div>
        </SectionGroup>
      </div>

      {/* ── News + Tasks (2-col) ──────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NewsWidget articles={newsArticles} articleLoading={articleLoading} onOpenArticle={onOpenArticle} />
        <TasksWidget tasks={tasks} onNavigate={onNavigate} />
      </div>

      {/* ── Journal + Learning + Memory + Release (2x2) ───────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <JournalWidget journalDay={journalDay} onNavigate={onNavigate} />
        <LearningWidget curriculums={learningCurriculums} onNavigate={onNavigate} />
        <MemoryWidget memories={memories} onNavigate={onNavigate} />
        <ReleaseWidget release={latestRelease} />
      </div>

      {/* Upgrade Comparison */}
      <div className="mb-6">
        <SectionGroup label={t('dash.cc.get_more')}>
          <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t('dash.cc.what_you_have')}</h3>
                <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
                  <li className="flex items-center gap-2"><span className="text-green-400">&#10003;</span> {t('dash.cc.local_memory')}</li>
                  <li className="flex items-center gap-2"><span className="text-green-400">&#10003;</span> {t('dash.cc.session_usage')}</li>
                  <li className="flex items-center gap-2"><span className="text-green-400">&#10003;</span> {t('dash.cc.own_keys')}</li>
                  <li className="flex items-center gap-2"><span className="text-green-400">&#10003;</span> {t('dash.cc.all_tools')}</li>
                  <li className="flex items-center gap-2"><span className="text-green-400">&#10003;</span> {t('dash.cc.free_models')}</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--gradient-start)]">{t('dash.cc.with_account')}</h3>
                <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
                  <li className="flex items-center gap-2"><span className="text-[var(--gradient-start)]">&#10003;</span> {t('dash.cc.memory_sync')}</li>
                  <li className="flex items-center gap-2"><span className="text-[var(--gradient-start)]">&#10003;</span> {t('dash.cc.full_history')}</li>
                  <li className="flex items-center gap-2"><span className="text-[var(--gradient-start)]">&#10003;</span> {t('dash.cc.priority_support')}</li>
                  <li className="flex items-center gap-2"><span className="text-[var(--gradient-start)]">&#10003;</span> {t('dash.cc.free_credits')}</li>
                  <li className="flex items-center gap-2"><span className="text-[var(--gradient-start)]">&#10003;</span> {t('dash.cc.conversation_backup')}</li>
                </ul>
              </div>
            </div>
            <div className="mt-5 border-t border-[var(--border-card)] pt-4 text-center">
              <p className="mb-3 text-xs text-[var(--text-muted)]">
                {t('dash.cc.upgrade_hint')}
              </p>
              <button
                onClick={() => post({ type: 'open_url', url: 'https://ava-supernova.com/signup' })}
                className="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)]"
              >
                {t('dash.cc.connect_free')}
              </button>
            </div>
          </div>
        </SectionGroup>
      </div>

      {/* Quick Actions */}
      <SectionGroup label={t('dash.cc.quick_actions')}>
        <div className="grid grid-cols-2 gap-3">
          <ActionCard label={t('dash.chat.new_chat')} onClick={() => post({ type: 'open_chat' })} />
          <ActionCard label={t('dash.settings.provider_keys')} onClick={() => onNavigate('keys')} />
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
