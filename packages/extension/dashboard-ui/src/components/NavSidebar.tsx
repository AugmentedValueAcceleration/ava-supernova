import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import type { Page, DashboardJournalDaySummary } from '../types/messages';
import { DataPortability } from './DataPortability';
import {
  Lightning, ChatCircleDots, ListChecks, Books, Palette,
  Brain, ChartBar, GearSix, Question, ShieldCheck, Wrench,
} from '@phosphor-icons/react';

interface NavSidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  mode: 'platform' | 'byok';
  email?: string | null;
  isAdmin?: boolean;
  onConnectAccount?: () => void;
  aiName?: string;
  journalSummaries?: DashboardJournalDaySummary[];
  selectedJournalDate?: string;
  onSelectJournalDate?: (date: string) => void;
  onLoadJournalSummaries?: (from: string, to: string) => void;
  taskDates?: string[];
  onLoadTaskDates?: () => void;
  onToggleSidebar?: () => void;
  onFlipSidebar?: () => void;
  sidebarSide?: 'left' | 'right';
  onNewChat?: () => void;
  onOpenHistory?: () => void;
  supportUnread?: number;
  avatarUrl?: string;
}

/* ── Nav structure ────────────────────────────────────────────────────── */

interface NavItem {
  page: Page;
  icon: ReactNode;
  label: string;
  description: string;
  platformOnly?: boolean;
  adminOnly?: boolean;
  comingSoon?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const STORAGE_KEY = 'ava-dash-sidebar-sections';

/** Translate with fallback — returns fallback if t() returns the raw key */
function tt(key: string, fallback: string): string {
  const val = t(key);
  return val === key ? fallback : val;
}

function getNavItems(isAdmin?: boolean): NavItem[] {
  const items: NavItem[] = [
    { page: 'overview', icon: <Lightning weight="duotone" size={18} />, label: tt('dash.nav.command_centre', 'Command Centre'), description: tt('dash.nav.command_centre_desc', 'Your daily overview') },
    { page: 'chat', icon: <ChatCircleDots weight="duotone" size={18} />, label: tt('dash.nav.ava_chat', 'Chat'), description: tt('dash.nav.ava_chat_desc', 'Talk, build, create') },
    { page: 'planner', icon: <ListChecks weight="duotone" size={18} />, label: tt('dash.nav.planner', 'Planner'), description: tt('dash.nav.planner_desc', 'Tasks, journal, learning') },
    { page: 'learning-library', icon: <Books weight="duotone" size={18} />, label: tt('dash.nav.learning_library', 'Learning Library'), description: tt('dash.nav.learning_library_desc', 'Browse and start learning paths') },
    { page: 'creative-studio', icon: <Palette weight="duotone" size={18} />, label: tt('dash.nav.creative_studio', 'Creative Studio'), description: tt('dash.nav.creative_studio_desc', 'Images, music, video, voice') },
    { page: 'memory', icon: <Brain weight="duotone" size={18} />, label: tt('dash.nav.memory', 'Memory'), description: tt('dash.nav.memory_desc', 'Patterns, preferences, decisions') },
    { page: 'history', icon: <ChartBar weight="duotone" size={18} />, label: tt('dash.nav.usage', 'History'), description: tt('dash.nav.usage_desc', 'Tokens, sessions, models') },
    { page: 'account', icon: <GearSix weight="duotone" size={18} />, label: tt('dash.nav.account', 'Account'), description: tt('dash.nav.account_desc', 'Settings, billing, personalisation') },
    { page: 'help', icon: <Question weight="duotone" size={18} />, label: tt('dash.nav.help', 'Help'), description: tt('dash.nav.help_desc', 'Support, releases, roadmap') },
  ];

  if (isAdmin) {
    items.push(
      { page: 'admin_support', icon: <ShieldCheck weight="duotone" size={18} />, label: tt('dash.nav.admin_support', 'Admin Support'), description: tt('dash.nav.admin_support_desc', 'All user tickets'), adminOnly: true },
      { page: 'admin_proposals', icon: <Wrench weight="duotone" size={18} />, label: tt('dash.nav.proposals', 'Tool Proposals'), description: tt('dash.nav.proposals_desc', 'Review and approve'), adminOnly: true },
    );
  }

  return items;
}

/* ── Exports ───────────────────────────────────────────────────────────── */

export type { Page };

export function NavSidebar({
  currentPage,
  onNavigate,
  mode,
  email,
  isAdmin,
  onConnectAccount,
  aiName,
  journalSummaries,
  selectedJournalDate,
  onSelectJournalDate,
  onLoadJournalSummaries,
  taskDates,
  onLoadTaskDates,
  onToggleSidebar,
  onFlipSidebar,
  sidebarSide,
  onNewChat,
  onOpenHistory,
  supportUnread,
  avatarUrl,
}: NavSidebarProps) {
  useLocale();

  // Load task dates for calendar on mount
  useEffect(() => { onLoadTaskDates?.(); }, []);

  const handleNavigate = (page: Page) => {
    onNavigate(page);
  };

  const navItems = getNavItems(isAdmin);

  // Resizable sidebar width — persisted
  const [dataPortOpen, setDataPortOpen] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('ava-sidebar-width');
    return saved ? Math.max(180, Math.min(400, Number(saved))) : 224;
  });
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(224);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;
    const isRight = sidebarSide === 'right';

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = ev.clientX - dragStartX.current;
      const newWidth = Math.max(180, Math.min(400, dragStartWidth.current + (isRight ? -delta : delta)));
      setSidebarWidth(newWidth);
    };

    const onUp = () => {
      isDragging.current = false;
      localStorage.setItem('ava-sidebar-width', String(sidebarWidth));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth, sidebarSide]);

  // Save width on change (debounced via mouseup above)
  useEffect(() => {
    localStorage.setItem('ava-sidebar-width', String(sidebarWidth));
  }, [sidebarWidth]);

  return (
    <nav className="relative flex shrink-0 flex-col h-full border-r border-[var(--border-card)] bg-[var(--bg-card)]" style={{ width: sidebarWidth }}>
      {/* Drag handle — on the edge facing the content */}
      <div
        onMouseDown={handleDragStart}
        className="absolute top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-[rgba(168,85,247,0.3)] transition-colors"
        style={{ [sidebarSide === 'right' ? 'left' : 'right']: 0 }}
      />
      {/* Logo + action buttons */}
      <div className="border-b border-[var(--border-card)] px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <img src={document.getElementById('root')?.getAttribute('data-icon-uri') || ''} width="20" height="20" alt="" style={{ borderRadius: 4 }} />
          <span className="bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] bg-clip-text text-sm font-light text-transparent">
            {aiName || 'Ava'} Supernova
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onToggleSidebar && (
            <button onClick={onToggleSidebar} title="Hide sidebar" className="flex items-center justify-center w-6 h-6 rounded hover:bg-[rgba(168,85,247,0.15)] text-[var(--text-muted)] opacity-60 hover:opacity-100 bg-transparent border-none cursor-pointer">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={sidebarSide === 'right' ? { transform: 'scaleX(-1)' } : undefined}>
                <path d="M1 2h14v12H1V2zm1 1v10h4V3H2zm5 0v10h7V3H7z"/>
              </svg>
            </button>
          )}
          {onFlipSidebar && (
            <button onClick={onFlipSidebar} title={sidebarSide === 'left' ? 'Move sidebar to right' : 'Move sidebar to left'} className="flex items-center justify-center w-6 h-6 rounded hover:bg-[rgba(168,85,247,0.15)] text-[var(--text-muted)] opacity-60 hover:opacity-100 bg-transparent border-none cursor-pointer">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 8l3-3v2h6V5l3 3-3 3V9H5v2L2 8z"/>
              </svg>
            </button>
          )}
          {onOpenHistory && (
            <button onClick={onOpenHistory} title="History" className="flex items-center justify-center w-6 h-6 rounded hover:bg-[rgba(168,85,247,0.15)] text-[var(--text-muted)] opacity-60 hover:opacity-100 bg-transparent border-none cursor-pointer">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.507 12.324a7 7 0 0 0 .065-8.56A7 7 0 0 0 2 4.393V2H1v3.5l.5.5H5V5H2.811a6.008 6.008 0 1 1-.135 5.77l-.887.462a7 7 0 0 0 11.718 1.092zM8 4h1v4.28l3.35 2.01-.51.858L8 8.72V4z"/>
              </svg>
            </button>
          )}
          {onNewChat && (
            <button onClick={onNewChat} title="New chat" className="flex items-center justify-center w-6 h-6 rounded hover:bg-[rgba(168,85,247,0.15)] text-[var(--text-muted)] opacity-60 hover:opacity-100 bg-transparent border-none cursor-pointer">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/>
              </svg>
            </button>
          )}
          {/* Data portability */}
          <div className="relative">
            <button onClick={() => setDataPortOpen(!dataPortOpen)} title="Export / Import data" className="flex items-center justify-center w-6 h-6 rounded hover:bg-[rgba(168,85,247,0.15)] text-[var(--text-muted)] opacity-60 hover:opacity-100 bg-transparent border-none cursor-pointer"
              style={dataPortOpen ? { opacity: 1, background: 'rgba(168,85,247,0.15)' } : undefined}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1v10.293L4.854 8.146l-.708.708L8 12.707l3.854-3.853-.708-.708L8 11.293V1H8zM2 14h12v1H2v-1z"/>
              </svg>
            </button>
            <DataPortability isOpen={dataPortOpen} onClose={() => setDataPortOpen(false)} />
          </div>
        </div>
      </div>

      {/* Navigation — flat, 6 items */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {navItems.map(item => (
          <NavItem
            key={item.page}
            page={item.page}
            icon={item.icon}
            label={item.label}
            description={item.description}
            isActive={currentPage === item.page}
            onClick={() => handleNavigate(item.page)}
            comingSoon={item.comingSoon}
            badge={item.page === 'help' ? supportUnread : undefined}
          />
        ))}
      </div>

      {/* Mini Calendar — always visible, task-focused */}
      <TaskCalendar
        taskDates={taskDates || []}
        onDayClick={(date) => {
          // Navigate to planner (tasks tab)
          handleNavigate('planner');
        }}
        onRefresh={onLoadTaskDates}
      />

      {/* Account section */}
      <div className="border-t border-[var(--border-card)] p-4">
        {mode === 'platform' ? (
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-sm font-light text-purple-400">
                {email?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="truncate text-[11px] font-medium text-white">{email}</p>
              {isAdmin && (
                <span className="inline-block mt-0.5 rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[8px] font-light text-purple-400 uppercase tracking-wider">Admin</span>
              )}
            </div>
            <button
              onClick={() => post({ type: 'disconnect_account' })}
              className="shrink-0 rounded-md border border-[var(--border-card)] px-2 py-1 text-[10px] text-[var(--text-muted)] transition hover:border-red-500/30 hover:text-red-400"
            >
              {t('dash.auth.disconnect')}
            </button>
          </div>
        ) : (
          <SidebarConnect />
        )}
      </div>
    </nav>
  );
}

/* ── SidebarConnect — inline connect form matching IDE ──────────────── */

function SidebarConnect() {
  const [showForm, setShowForm] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = () => {
    const trimmed = keyInput.trim();
    if (!trimmed.startsWith('sk-ava-')) { setError('Key must start with sk-ava-'); return; }
    setError('');
    setLoading(true);
    post({ type: 'connect_account', key: trimmed });
    setTimeout(() => setLoading(false), 8000);
  };

  if (!showForm) {
    return (
      <>
        <button
          onClick={() => setShowForm(true)}
          className="w-full rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 mb-1.5"
        >
          {t('dash.auth.connect')}
        </button>
        <p className="text-center text-[10px] text-[var(--text-muted)]">{t('dash.auth.byok_hint')}</p>
      </>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
        1. Sign up at ava-supernova.com<br/>
        2. Dashboard → API Keys<br/>
        3. Paste your sk-ava-... key below
      </p>
      <input
        type="password"
        placeholder="sk-ava-. . ."
        value={keyInput}
        onChange={(e) => { setKeyInput(e.target.value); setError(''); }}
        onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
        className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-1.5 font-mono text-[11px] text-white placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
        autoFocus
      />
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <div className="flex gap-1.5">
        <button
          onClick={handleConnect}
          disabled={loading}
          className="flex-1 rounded-lg bg-[var(--accent)] py-1.5 text-[11px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Connecting...' : t('dash.auth.connect')}
        </button>
        <button
          onClick={() => { setShowForm(false); setKeyInput(''); setError(''); }}
          className="flex-1 rounded-lg border border-[var(--border-card)] bg-transparent py-1.5 text-[11px] text-[var(--text-muted)] transition hover:text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── NavItem ──────────────────────────────────────────────────────────── */

function NavItem({
  page,
  icon,
  label,
  description,
  isActive,
  onClick,
  comingSoon,
  badge,
}: {
  page: string;
  icon: ReactNode;
  label: string;
  description: string;
  isActive: boolean;
  onClick: () => void;
  comingSoon?: boolean;
  badge?: number;
}) {
  if (comingSoon) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[var(--text-muted)] cursor-not-allowed opacity-50">
        <span className="w-5 text-center text-sm shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px]">{label}</span>
            <span className="rounded bg-[var(--bg-input)] px-1 py-0.5 text-[8px]">Soon</span>
          </div>
          <p className="text-[9px] text-[var(--text-muted)] truncate">{description}</p>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left border-none cursor-pointer transition ${
        isActive
          ? 'bg-[var(--bg-input)] border-l-2 border-l-[var(--accent)]'
          : 'bg-transparent hover:bg-[var(--bg-input)]/50'
      }`}
      style={{ borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent' }}
    >
      <span className="w-5 text-center text-sm shrink-0 relative">
        {icon}
        {badge && badge > 0 ? (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-[var(--accent)] px-0.5 text-[7px] font-bold text-white">{badge}</span>
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <span className={`text-[12px] block ${isActive ? 'text-white' : 'text-[var(--text-secondary)]'}`}>
          {label}
        </span>
        <p className="text-[9px] text-[var(--text-muted)] truncate">{description}</p>
      </div>
    </button>
  );
}

/* ── Task Calendar ────────────────────────────────────────────────────── */

function TaskCalendar({
  taskDates,
  onDayClick,
  onRefresh,
}: {
  taskDates: string[];
  onDayClick: (date: string) => void;
  onRefresh?: () => void;
}) {
  const [monthOffset, setMonthOffset] = useState(0);
  const taskSet = new Set(taskDates);

  useEffect(() => { onRefresh?.(); }, [monthOffset]);

  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = target.getFullYear();
  const month = target.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const label = target.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  const todayStr = now.toISOString().slice(0, 10);

  return (
    <div className="border-t border-[var(--border-card)] px-3 py-2.5 shrink-0">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-1.5">
        <button onClick={() => setMonthOffset(o => o - 1)} className="text-[10px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer hover:text-white">{'\u25C0'}</button>
        <span className="text-[10px] font-light text-[var(--text-secondary)]">{label}</span>
        <button onClick={() => setMonthOffset(o => o + 1)} className="text-[10px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer hover:text-white">{'\u25B6'}</button>
      </div>
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 text-center mb-0.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="text-[8px] text-[var(--text-muted)]">{d}</span>
        ))}
      </div>
      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {days.map(day => {
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = iso === todayStr;
          const hasTask = taskSet.has(iso);
          return (
            <button
              key={day}
              onClick={() => onDayClick(iso)}
              className="relative flex flex-col items-center justify-center border-none cursor-pointer transition"
              style={{
                width: 22, height: 22, borderRadius: '50%',
                background: isToday ? 'rgba(168,85,247,0.2)' : 'transparent',
                color: isToday ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 9, fontWeight: isToday ? 500 : 300,
              }}
            >
              {day}
              {hasTask && (
                <span className="absolute" style={{ bottom: 1, width: 3, height: 3, borderRadius: '50%', background: isToday ? 'var(--accent)' : '#f59e0b' }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
