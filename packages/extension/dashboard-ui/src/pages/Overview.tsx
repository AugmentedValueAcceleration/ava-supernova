import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { t, tt, useLocale } from '../i18n';
import { SectionGroup } from '../components/SectionGroup';
import { Skeleton } from '../components/Skeleton';
import { Icon } from '../components/Icon';
import { post } from '../App';
import {
  Lightning, ChartBar, Clock, CloudSun, Newspaper, Rocket,
} from '@phosphor-icons/react';
import type {
  AccountInfo,
  ConnectionStatus,
  DashboardJournalDay,
  DashboardLearningCurriculum,
  DashboardTaskEntry,
  HealthPlan,
  MemoryEntry,
  Page,
  SessionStats,
  UsageLogEntry,
} from '../types/messages';
import { HealthDashboard } from './HealthDashboard';

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
  image_url?: string | null;
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
  // Command Center health tab — active plans for the Today / This-week glance.
  activeHealthPlans: HealthPlan[];
  // Per-source load signals — true once the first load has landed.
  // Drive the Daily widgets' skeleton-vs-content decision so they
  // never flash a misleading empty state before data arrives.
  tasksLoaded: boolean;
  journalLoaded: boolean;
  weatherLoaded: boolean;
}

// ── Inner-tab type — mirrors the IDE Command Centre's lenses, plus
// the Health Dashboard which lives here too (separate sidebar entry
// felt too heavyweight for what's the operator's daily view).
type CcTab = 'daily' | 'briefing' | 'reflect' | 'health';

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
  activeHealthPlans,
  tasksLoaded,
  journalLoaded,
  weatherLoaded,
}: OverviewProps) {
  useLocale();
  // Inner tab state — Command Centre always opens on Daily. The previous
  // session's tab is intentionally NOT restored: opening the Command
  // Centre is a fresh "where am I today" moment, so the first lens is
  // always the one that orients the operator.
  const [tab, setTab] = useState<CcTab>('daily');
  const switchTab = (next: CcTab) => setTab(next);

  useEffect(() => {
    if (logs.length === 0 && account) {
      post({ type: 'load_usage_logs', period: '30d' });
    }
  }, []);

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
        tasksLoaded={tasksLoaded}
        journalLoaded={journalLoaded}
        weatherLoaded={weatherLoaded}
      />
    );
  }

  // Hero strip — mirrors the IDE Command Centre header exactly. Greeting
  // + date on the left; weather, working-hours, and latest-version pills
  // on the right. Replaces the previous flat "Command Centre" h1 + name
  // editor + email + tier badge so a user moving from extension to IDE
  // (or the other way) sees the same top-of-page on both surfaces.
  // Step 1 of the extension↔IDE Command Centre alignment plan.
  const hour = new Date().getHours();
  const greeting = hour < 12
    ? t('dash.cc.greeting_morning')
    : hour < 18
      ? t('dash.cc.greeting_afternoon')
      : t('dash.cc.greeting_evening');

  // Editable display name. Mirrors the IDE Command Centre's behaviour
  // (DashboardPages.tsx) so users on either surface get the same
  // click-to-edit affordance. localStorage override takes priority over
  // account.name so the user can pick what Ava calls them without
  // touching the platform-side account record. Falls back to first
  // word of account.name, then email prefix.
  const resolveDisplayName = (): string => {
    try {
      const stored = (localStorage.getItem('ava-extension-user-name') ?? '').trim();
      if (stored) return stored;
    } catch { /* webview localStorage disabled — fall through */ }
    return (account.name?.trim().split(/\s+/)[0]) || account.email?.split('@')[0] || '';
  };
  const [firstName, setFirstName] = useState<string>(resolveDisplayName);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameHover, setNameHover] = useState(false);
  useEffect(() => {
    setFirstName(resolveDisplayName());
    const refresh = () => setFirstName(resolveDisplayName());
    window.addEventListener('ava-extension-name-changed', refresh);
    return () => window.removeEventListener('ava-extension-name-changed', refresh);
    // account dependency — when sign-in/out arrives via postMessage, the
    // account prop changes and the displayed name needs to re-resolve in
    // case the localStorage override was cleared by a sign-out elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.name, account.email]);
  const saveDisplayName = () => {
    const next = nameInput.trim();
    try {
      if (next) localStorage.setItem('ava-extension-user-name', next);
      else localStorage.removeItem('ava-extension-user-name');
    } catch { /* storage disabled — keep in-memory only */ }
    setFirstName(next || (account.name?.trim().split(/\s+/)[0]) || account.email?.split('@')[0] || '');
    // Push to the platform via the host. The host's update_name handler
    // PATCHes /account-info and posts account_updated back, which App.tsx
    // sets on the account prop — the useEffect below picks the new value
    // up automatically. No-op when not signed in (host early-returns).
    // Local-first means the UI commits regardless; the round-trip exists
    // so the IDE / companion / web dashboard read the same name.
    if (next) post({ type: 'update_name', name: next });
    window.dispatchEvent(new CustomEvent('ava-extension-name-changed'));
    setEditingName(false);
  };

  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const workStart = (() => {
    try { return Number(localStorage.getItem('ava-work-start')) || 9; } catch { return 9; }
  })();
  const workEnd = (() => {
    try { return Number(localStorage.getItem('ava-work-end')) || 17; } catch { return 17; }
  })();

  return (
    <div className="w-full">
      {/* ── Hero strip — matches IDE Command Centre framing ──────────── */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-light text-white mb-1 flex items-center flex-wrap gap-1">
            <span>{greeting}{firstName || editingName ? ',' : ''}</span>
            {editingName ? (
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onBlur={saveDisplayName}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); saveDisplayName(); }
                  else if (e.key === 'Escape') { setEditingName(false); setNameInput(''); }
                }}
                placeholder={t('dash.cc.name_placeholder')}
                maxLength={40}
                className="text-2xl font-light text-white outline-none rounded-md px-2 py-0 bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                style={{ minWidth: 220, fontFamily: 'inherit' }}
              />
            ) : firstName ? (
              <span
                onClick={() => { setNameInput(firstName); setEditingName(true); }}
                onMouseEnter={() => setNameHover(true)}
                onMouseLeave={() => setNameHover(false)}
                title={t('dash.cc.name_change_title')}
                style={{
                  cursor: 'pointer',
                  borderBottom: nameHover ? '1px dashed var(--accent)' : '1px dashed transparent',
                  transition: 'border-color 0.15s',
                }}
              >
                {firstName}
              </span>
            ) : (
              <span
                onClick={() => { setNameInput(''); setEditingName(true); }}
                title={t('dash.cc.name_set_title')}
                style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: 16, marginLeft: 4 }}
              >
                {t('dash.cc.add_name')}
              </span>
            )}
          </div>
          <div className="text-sm text-[var(--text-muted)]">{dateStr}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {weatherData && (
            <HeroPill
              icon={<CloudSun weight="duotone" size={14} />}
              text={`${Math.round(weatherData.temp_c)}° ${weatherData.condition}`}
              title={t('dash.cc.weather')}
            />
          )}
          <HeroPill
            icon={<Clock weight="duotone" size={14} />}
            text={`${workStart}:00 - ${workEnd}:00`}
            title={t('dash.cc.working_hours')}
          />
          {latestRelease && (
            <HeroPill
              icon={<Rocket weight="duotone" size={14} />}
              text={`v${latestRelease.version}`}
              title={t('dash.cc.latest_release') || 'Latest release'}
            />
          )}
        </div>
      </div>

      {/* ── Tab nav ──────────────────────────────────────────────────── */}
      <div className="mb-5 flex gap-1 border-b border-[var(--border-card)]">
        <TabBtn id="daily" label={tt('dash.chat.tab.daily', 'Daily')} active={tab === 'daily'} onClick={() => switchTab('daily')} />
        <TabBtn id="briefing" label={tt('dash.chat.tab.briefing', 'Briefing')} active={tab === 'briefing'} onClick={() => switchTab('briefing')} />
        <TabBtn id="reflect" label={tt('dash.chat.tab.reflect', 'Reflect')} active={tab === 'reflect'} onClick={() => switchTab('reflect')} />
        <TabBtn id="health" label={tt('dash.chat.tab.health', 'Health')} active={tab === 'health'} onClick={() => switchTab('health')} />
      </div>

      {/* ── Daily tab — Tasks + Journal, then Working Hours + Weather ── */}
      {tab === 'daily' && (
        <>
          <div
            className="mb-4 grid gap-4"
            style={{ gridTemplateColumns: '2fr 1fr' }}
          >
            <TasksWidget tasks={tasks} loaded={tasksLoaded} onNavigate={onNavigate} />
            <JournalWidget journalDay={journalDay} loaded={journalLoaded} onNavigate={onNavigate} />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-4">
            <WorkingHoursClock />
            <WeatherWidget weather={weatherData} loaded={weatherLoaded} />
          </div>
        </>
      )}

      {/* ── Briefing tab — News + Releases ───────────────────────────── */}
      {tab === 'briefing' && (
        <>
          <div className="mb-4">
            <NewsWidget articles={newsArticles} articleLoading={articleLoading} onOpenArticle={onOpenArticle} />
          </div>
          <div className="mb-4">
            <ReleaseWidget release={latestRelease} />
          </div>
        </>
      )}

      {/* ── Reflect tab — Memory + Learning ──────────────────────────── */}
      {tab === 'reflect' && (
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MemoryWidget memories={memories} onNavigate={onNavigate} total={memoryTotal} />
          <LearningWidget curriculums={learningCurriculums} onNavigate={onNavigate} />
        </div>
      )}

      {/* ── Health tab — Today / This week glance from active plans ───── */}
      {tab === 'health' && (
        <HealthDashboard activePlans={activeHealthPlans} />
      )}

    </div>
  );
}

// ── Tab button ───────────────────────────────────────────────────────────────
// Inner-tab nav for the Command Centre's three lenses. Active tab gets the
// purple underline + brighter text; inactive tabs are muted and hover-lift to
// the secondary text colour. Mirrors the IDE Command Centre's TabBtn exactly.

function TabBtn({ id: _id, label, active, onClick }: { id: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-4 py-2 text-sm transition border-b-2 -mb-px',
        active
          ? 'border-[var(--accent)] text-[var(--text-primary)] font-medium'
          : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ── Hero pill ────────────────────────────────────────────────────────────────
// Small purple-tinted chip matching the IDE Command Centre's HeroPill, used
// for the weather / working-hours / latest-version pills in the page header.

function HeroPill({ icon, text, title }: { icon: React.ReactNode; text: string; title?: string }) {
  return (
    <div
      title={title}
      className="flex items-center gap-1.5 rounded-full border border-[var(--border-card)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
    >
      <span className="text-[var(--accent)]">{icon}</span>
      <span>{text}</span>
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

function WeatherWidget({ weather, loaded }: { weather: WeatherData | null; loaded: boolean }) {
  if (!loaded) {
    return (
      <WidgetCard title={t('dash.cc.weather')} icon={<CloudSun weight="duotone" size={16} />}>
        <div className="flex items-center gap-4">
          <Skeleton width={40} height={40} circle />
          <div className="flex-1 space-y-1.5">
            <Skeleton height={20} width={70} />
            <Skeleton height={11} width={110} />
          </div>
        </div>
        <div className="mt-3 flex gap-3 border-t border-[var(--border-card)] pt-3">
          {[0, 1, 2].map(i => <Skeleton key={i} height={48} width="100%" radius={8} />)}
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

// Mirrors packages/web/src/lib/news-categories.ts — IDs MUST match it.
const NEWS_CATEGORIES = [
  'world', 'ai', 'technology', 'open-source', 'security-privacy',
  'business', 'science', 'health', 'food', 'education', 'sport',
] as const;

const NEWS_CATEGORY_LABELS: Record<string, string> = {
  world: 'World News', ai: 'AI', technology: 'Technology', 'open-source': 'Open Source',
  'security-privacy': 'Security & Privacy', sport: 'Sport',
  business: 'Business & Economy', science: 'Science', health: 'Health & Fitness',
  food: 'Food & Nutrition', education: 'Education',
};

function formatCategoryLabel(slug: string): string {
  // Localised name if we have a translation, else the canonical English label,
  // else a title-cased fallback.
  const i18nKey = `news.${slug.replace(/-/g, '_')}`;
  const translated = t(i18nKey);
  if (translated !== i18nKey) return translated;
  if (NEWS_CATEGORY_LABELS[slug]) return NEWS_CATEGORY_LABELS[slug];
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
  const [page, setPage] = useState(0);

  const PER_PAGE = 6;
  const totalPages = Math.max(1, Math.ceil(articles.length / PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pageArticles = articles.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  const handleCategoryChange = (cat: string | null) => {
    setSelectedCategory(cat);
    setPage(0);
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
          <span className="ml-2 text-xs text-[var(--text-muted)]">{t('dash.cc.loading_article')}</span>
        </div>
      )}

      {!articleLoading && articles.length === 0 ? (
        <p className="py-4 text-xs text-[var(--text-muted)]">{t('dash.cc.no_news')}</p>
      ) : !articleLoading && (
        <>
        <div className="space-y-2">
          {pageArticles.map((article, idx) => (
            <button
              key={article.slug || idx}
              onClick={() => handleArticleClick(article.slug)}
              className="group block w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3.5 text-left transition hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/[0.03]"
            >
              <div className="flex items-start gap-3">
                {article.image_url ? (
                  <img src={article.image_url} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg object-cover mt-0.5" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5 text-[var(--accent)]" style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
                    <Newspaper weight="duotone" size={14} />
                  </div>
                )}
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
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between border-t border-[var(--border-card)] pt-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] transition enabled:hover:text-[var(--text-secondary)] disabled:opacity-30"
            >‹ Prev</button>
            <span className="text-[10px] text-[var(--text-muted)]">{safePage + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] transition enabled:hover:text-[var(--text-secondary)] disabled:opacity-30"
            >Next ›</button>
          </div>
        )}
        </>
      )}
    </WidgetCard>
  );
}

// ── Tasks Widget ─────────────────────────────────────────────────────────────

function TasksWidget({ tasks: rawTasks, loaded, onNavigate }: { tasks: DashboardTaskEntry[]; loaded: boolean; onNavigate: (p: Page) => void }) {
  const tasks = Array.isArray(rawTasks) ? rawTasks : [];
  const today = new Date().toISOString().slice(0, 10);

  const todayTasks = useMemo(() => {
    return tasks.filter(tk => {
      if (tk.status === 'done' || tk.status === 'archived') return false;
      // Overdue or due today
      if (tk.due_date && tk.due_date <= today) return true;
      // In-progress tasks
      if (tk.status === 'in-progress') return true;
      // No due date but active today
      if (!tk.due_date && tk.status === 'todo') return false;
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
      icon={<Icon.done size={16} />}
      action={tasks.length > 0 ? { label: t('dash.cc.view_all'), onClick: () => onNavigate('tasks') } : undefined}
      onRefresh={() => post({ type: 'load_tasks' })}
    >
      {!loaded ? (
        <div className="space-y-1.5">
          {[0, 1, 2].map(i => <Skeleton key={i} height={46} radius={8} />)}
        </div>
      ) : todayTasks.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <span className="mb-2 opacity-30"><Icon.party size={24} /></span>
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
                  title={t('dash.cc.complete_task')}
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

function JournalWidget({ journalDay, loaded, onNavigate }: { journalDay: DashboardJournalDay | null; loaded: boolean; onNavigate: (p: Page) => void }) {
  const entries = journalDay?.entries ?? [];
  const userEntry = entries.find((e) => e.author === 'user');
  const avaEntry = entries.find((e) => e.author === 'ava');
  const hasContent = entries.length > 0;

  return (
    <WidgetCard
      title={t('dash.cc.todays_journal')}
      icon={<Icon.note size={16} />}
      action={{ label: hasContent ? t('dash.cc.open_journal') : t('dash.cc.write_entry'), onClick: () => onNavigate('journal') }}
      onRefresh={() => post({ type: 'load_journal_day', date: new Date().toISOString().slice(0, 10) })}
    >
      {!loaded ? (
        <div className="space-y-2.5">
          <Skeleton height={12} width="40%" />
          <Skeleton height={12} />
          <Skeleton height={12} width="75%" />
        </div>
      ) : !hasContent ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="mb-2 opacity-30"><Icon.note size={24} /></span>
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
                <span className="text-[10px] font-medium" style={{ color: 'var(--accent)' }}>{t('dash.journal.ava_entries')}</span>
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
      icon={<Icon.course size={16} />}
      action={curriculums.length > 0 ? { label: t('dash.cc.continue_learning'), onClick: () => onNavigate('learning-room') } : undefined}
      onRefresh={() => post({ type: 'load_learning' })}
    >
      {active.length === 0 ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="mb-2 opacity-30"><Icon.books size={24} /></span>
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
      icon={<Icon.brain size={16} />}
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
              title={t('dash.cc.refresh_widget', { name: title.toLowerCase() })}
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
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl text-[var(--accent)]" style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
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
  tasksLoaded,
  journalLoaded,
  weatherLoaded,
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
  tasksLoaded: boolean;
  journalLoaded: boolean;
  weatherLoaded: boolean;
}) {
  const totalTokens = stats ? stats.total_input_tokens + stats.total_output_tokens : 0;
  const sessionDuration = stats ? timeSince(stats.session_start) : '\u2014';

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.nav.command_centre')}</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">
          {t('dash.nav.command_centre_desc')}
        </p>
      </div>

      {/* ── Weather + Working Hours ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <WeatherWidget weather={weatherData} loaded={weatherLoaded} />
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
        <TasksWidget tasks={tasks} loaded={tasksLoaded} onNavigate={onNavigate} />
      </div>

      {/* ── Journal + Learning + Memory + Release (2x2) ───────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <JournalWidget journalDay={journalDay} loaded={journalLoaded} onNavigate={onNavigate} />
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

function formatNumber(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(Math.round(v));
}
