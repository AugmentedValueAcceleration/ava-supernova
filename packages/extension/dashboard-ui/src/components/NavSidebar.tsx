import { useState, useEffect, useCallback, useRef } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import type { Page, DashboardJournalDaySummary } from '../types/messages';
import { DataPortability } from './DataPortability';

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
}

/* ── Nav structure ────────────────────────────────────────────────────── */

interface NavItem {
  page: Page;
  icon: string;
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
    { page: 'chat', icon: '\uD83D\uDCAC', label: tt('dash.nav.ava_chat', 'Chat'), description: tt('dash.nav.ava_chat_desc', 'Talk, build, create') },
    { page: 'planner', icon: '\uD83D\uDCCB', label: 'Planner', description: 'Tasks, journal, learning' },
    { page: 'memory', icon: '\uD83E\uDDE0', label: tt('dash.nav.memory', 'Memory'), description: tt('dash.nav.memory_desc', 'Patterns, preferences, decisions') },
    { page: 'history', icon: '\uD83D\uDCCA', label: tt('dash.nav.usage', 'History'), description: tt('dash.nav.usage_desc', 'Tokens, sessions, models') },
    { page: 'account', icon: '\u2699\uFE0F', label: 'Account', description: 'Settings, billing, personalisation' },
    { page: 'help', icon: '\u2753', label: tt('dash.nav.support', 'Help'), description: 'Support, releases, roadmap' },
  ];

  if (isAdmin) {
    items.push(
      { page: 'admin_support', icon: '\uD83D\uDEE1\uFE0F', label: 'Admin Support', description: 'All user tickets', adminOnly: true },
      { page: 'admin_proposals', icon: '\uD83D\uDD27', label: tt('dash.nav.proposals', 'Tool Proposals'), description: 'Review and approve', adminOnly: true },
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
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-sm font-light text-purple-400">
              {email?.[0]?.toUpperCase() || '?'}
            </div>
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
          <>
            <p className="mb-2 px-3 text-[10px] text-[var(--text-muted)]">{t('dash.auth.byok_hint')}</p>
            <button
              onClick={onConnectAccount}
              className="w-full rounded-lg border border-[var(--accent)]/40 bg-transparent px-3 py-1.5 text-xs text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
            >
              {t('dash.auth.connect')}
            </button>
          </>
        )}
      </div>
    </nav>
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
}: {
  page: string;
  icon: string;
  label: string;
  description: string;
  isActive: boolean;
  onClick: () => void;
  comingSoon?: boolean;
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
      <span className="w-5 text-center text-sm shrink-0">{icon}</span>
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
