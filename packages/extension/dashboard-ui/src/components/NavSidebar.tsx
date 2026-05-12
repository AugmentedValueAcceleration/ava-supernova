import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { t, tt, useLocale } from '../i18n';
import { post } from '../App';
import type { Page, DashboardJournalDaySummary } from '../types/messages';
import { DataPortability } from './DataPortability';
import {
  Lightning, ChatCircleDots, ListChecks, Books, Palette,
  Brain, ChartLineUp, Cpu, GearSix, Question, Barbell,
} from '@phosphor-icons/react';

interface NavSidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  mode: 'platform' | 'byok';
  email?: string | null;
  isAdmin?: boolean;
  /** Subscription tier — drives the colored badge below the email
   *  in the account block. Mirrors the IDE Sidebar at Sidebar.tsx:1012. */
  tier?: 'free' | 'pro' | 'ultra' | 'enterprise' | 'admin' | string;
  /** True when the user has a platform account but is using BYOK keys
   *  instead. Drives the Platform / API Key pill state. The user can
   *  hold both — this flag chooses which one routes requests. */
  byokMode?: boolean;
  /** Toggle between platform-routed and BYOK-routed requests. Only
   *  shown to signed-in users. Mirrors IDE Sidebar.tsx:1026-1037. */
  onSetByokMode?: (byok: boolean) => void;
  /** True while the host is fetching the account snapshot (init
   *  arrived with a platformKey but account is still null). Drives
   *  a loading skeleton in the account block instead of flashing
   *  the signed-out Connect screen. */
  accountLoading?: boolean;
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
  /** When true the sidebar renders as a narrow icon rail. Click any icon
   *  to navigate; click the rail's toggle to expand back. Previously a
   *  collapsed sidebar was removed from the DOM entirely, which made it
   *  impossible to navigate without first clicking "expand" from inside
   *  the chat header — the rail fixes that. */
  collapsed?: boolean;
}

const RAIL_WIDTH = 56;

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

// tt() helper moved to ../i18n.ts so it's shared across pages.

function getNavItems(isAdmin?: boolean): NavItem[] {
  const items: NavItem[] = [
    { page: 'overview', icon: <Lightning weight="duotone" size={18} />, label: tt('dash.nav.command_centre', 'Command Centre'), description: tt('dash.nav.command_centre_desc', 'Your daily overview') },
    { page: 'chat', icon: <ChatCircleDots weight="duotone" size={18} />, label: tt('dash.nav.ava_chat', 'Chat'), description: tt('dash.nav.ava_chat_desc', 'Talk, build, create') },
    { page: 'planner', icon: <ListChecks weight="duotone" size={18} />, label: tt('dash.nav.planner', 'Planner'), description: tt('dash.nav.planner_desc', 'Tasks, journal, learning') },
    { page: 'library', icon: <Books weight="duotone" size={18} />, label: tt('dash.nav.library', 'Library'), description: tt('dash.nav.library_desc', 'Courses, assets, and documents') },
    { page: 'health', icon: <Barbell weight="duotone" size={18} />, label: tt('dash.nav.health', 'Health'), description: tt('dash.nav.health_desc', 'Exercises, recipes, plans') },
    { page: 'creative-studio', icon: <Palette weight="duotone" size={18} />, label: tt('dash.nav.creative_studio', 'Creative Studio'), description: tt('dash.nav.creative_studio_desc', 'Images, music, video, voice') },
    { page: 'memory', icon: <Brain weight="duotone" size={18} />, label: tt('dash.nav.memory', 'Memory'), description: tt('dash.nav.memory_desc', 'Patterns, preferences, decisions') },
    // Labelled 'History' to match the IDE Sidebar (Sidebar.tsx:1116) —
    // the previous tt('dash.nav.usage', 'History') resolved to "Usage"
    // because the i18n key exists in the locale (the fallback only fires
    // for missing keys). Hardcoding the label like the IDE does.
    { page: 'history', icon: <ChartLineUp weight="duotone" size={18} />, label: tt('dash.nav.history', 'History'), description: tt('dash.nav.history_desc', 'Credits, sessions, models') },
    { page: 'models', icon: <Cpu weight="duotone" size={18} />, label: tt('dash.nav.models', 'Models'), description: tt('dash.nav.models_desc', 'Public benchmark · auditable receipts') },
    { page: 'account', icon: <GearSix weight="duotone" size={18} />, label: tt('dash.nav.account', 'Account'), description: tt('dash.nav.account_desc', 'Settings, billing, personalisation') },
    // Documentation folded under Help to match the IDE Sidebar — the IDE
    // doesn't carry a separate Documentation row; docs are reachable
    // from inside Help. Existing /documentation deep links still resolve
    // (the page route is unchanged), the nav-item is just retired.
    { page: 'help', icon: <Question weight="duotone" size={18} />, label: tt('dash.nav.help', 'Help'), description: tt('dash.nav.help_desc', 'Support, releases, roadmap') },
  ];

  if (isAdmin) {
    items.push(
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
  tier,
  byokMode,
  onSetByokMode,
  accountLoading,
  onConnectAccount,
  aiName,
  selectedJournalDate,
  onSelectJournalDate,
  taskDates,
  onLoadTaskDates,
  onToggleSidebar,
  onFlipSidebar,
  sidebarSide,
  // onNewChat + onOpenHistory removed from destructure — both now route
  // through the dashboard nav (History as a top-level page; New Chat as
  // a chat-header pill). Props stay in NavSidebarProps for caller shape.
  supportUnread,
  avatarUrl,
  collapsed,
}: NavSidebarProps) {
  useLocale();

  // ── All hooks declared up-front so the count stays constant across
  // collapsed/expanded transitions. Previously I returned early for the
  // collapsed branch AFTER useLocale + useEffect but BEFORE the useState,
  // useRef and useCallback hooks below — toggling collapse changed the
  // hook count mid-render and React threw #300. Keep hooks above any
  // conditional returns. (Rules of Hooks.) ────────────────────────────────
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

  // Load task dates for calendar on mount. Skip in collapsed mode — the
  // calendar isn't rendered so the round-trip is wasted.
  useEffect(() => { if (!collapsed) onLoadTaskDates?.(); }, [collapsed]);

  // Persist sidebar width changes.
  useEffect(() => {
    localStorage.setItem('ava-sidebar-width', String(sidebarWidth));
  }, [sidebarWidth]);

  const handleNavigate = (page: Page) => {
    onNavigate(page);
  };

  const navItems = getNavItems(isAdmin);

  // ── Collapsed rail: icons-only, fixed 56px width ──────────────────────
  if (collapsed) {
    return (
      <nav
        className="flex shrink-0 flex-col h-full border-r border-[var(--border-card)] bg-[var(--bg-card)] items-center py-3 gap-1"
        style={{ width: RAIL_WIDTH }}
      >
        {/* Expand button */}
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            title="Expand sidebar"
            className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-[rgba(168,85,247,0.15)] text-[var(--text-muted)] hover:text-white bg-transparent border-none cursor-pointer mb-1"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={sidebarSide === 'right' ? { transform: 'scaleX(-1)' } : undefined}>
              <path d="M1 2h14v12H1V2zm1 1v10h4V3H2zm5 0v10h7V3H7z" />
            </svg>
          </button>
        )}

        {/* New Chat moved to the chat header — pill button there now
            (mirroring the IDE chat header). Dropped from the sidebar to
            stop the duplicate affordance. */}

        {/* Nav icons */}
        <div className="flex-1 flex flex-col gap-0.5 items-center overflow-y-auto">
          {navItems.map(item => (
            <button
              key={item.page}
              onClick={() => handleNavigate(item.page)}
              disabled={item.comingSoon}
              title={`${item.label}${item.comingSoon ? ' (coming soon)' : ''}`}
              className={`relative flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition border-none ${
                currentPage === item.page
                  ? 'bg-[var(--bg-input)] text-white'
                  : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-input)]/50 hover:text-white'
              } ${item.comingSoon ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {item.icon}
              {item.page === 'help' && supportUnread && supportUnread > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-[var(--accent)] px-0.5 text-[7px] font-bold text-white">{supportUnread}</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Account avatar at the bottom */}
        <div className="mt-auto pt-2 border-t border-[var(--border-card)] w-full flex justify-center">
          {mode === 'platform' ? (
            avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" title={email || undefined} />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/20 text-xs font-light text-purple-400" title={email || undefined}>
                {email?.[0]?.toUpperCase() || '?'}
              </div>
            )
          ) : (
            <button
              onClick={onConnectAccount}
              title={t('dash.auth.connect')}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--accent)] text-white text-xs font-medium border-none cursor-pointer"
            >
              {'\u2192'}
            </button>
          )}
        </div>
      </nav>
    );
  }

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
        {/* Sidebar control icons — stroke-based, matches IDE Sidebar at
            Sidebar.tsx:1338-1377. 24×24 viewBox, 14px render, stroke-2,
            currentColor → muted by default, cdd6f4 on hover. */}
        <div className="flex items-center gap-0.5">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              title="Hide sidebar"
              className="flex h-[22px] w-[22px] items-center justify-center rounded bg-transparent border-none cursor-pointer text-[#6c7086] hover:text-[#cdd6f4] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={sidebarSide === 'right' ? { transform: 'scaleX(-1)' } : undefined}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
          )}
          {onFlipSidebar && (
            <button
              onClick={onFlipSidebar}
              title={sidebarSide === 'left' ? 'Move sidebar to right' : 'Move sidebar to left'}
              className="flex h-[22px] w-[22px] items-center justify-center rounded bg-transparent border-none cursor-pointer text-[#6c7086] hover:text-[#cdd6f4] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </button>
          )}
          {/* Data portability */}
          <div className="relative">
            <button
              onClick={() => setDataPortOpen(!dataPortOpen)}
              title="Export / Import data"
              className="flex h-[22px] w-[22px] items-center justify-center rounded bg-transparent border-none cursor-pointer text-[#6c7086] hover:text-[#cdd6f4] transition-colors"
              style={dataPortOpen ? { color: '#cdd6f4' } : undefined}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
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
        selectedDate={selectedJournalDate}
        onDayClick={(iso) => {
          // Set the planner-wide selected date BEFORE navigating so
          // both Tasks and Journal land on the day the operator
          // clicked. Previously the iso was thrown away and Tasks
          // always showed today; the calendar felt unclickable.
          if (onSelectJournalDate) onSelectJournalDate(iso);
          handleNavigate('planner');
        }}
        onRefresh={onLoadTaskDates}
      />

      {/* Account section — mirrors IDE Sidebar at Sidebar.tsx:982-1037.
          Shows avatar + email + tier badge + Disconnect, then a
          Platform / API Key toggle that routes requests through the
          chosen source. Signed-out users see Connect + BYOK hint. */}
      <div className="border-t border-[var(--border-card)] p-4">
        {accountLoading ? (
          /* Skeleton — host is fetching the account snapshot. Avoids
             the signed-out Connect screen flashing into view for the
             first few seconds after dashboard open. */
          <div className="flex items-center gap-3 animate-pulse">
            <div className="h-9 w-9 shrink-0 rounded-full bg-[var(--bg-input)]" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="h-2.5 w-3/4 rounded bg-[var(--bg-input)]" />
              <div className="h-2 w-1/3 rounded bg-[var(--bg-input)]" />
            </div>
          </div>
        ) : mode === 'platform' || (email && byokMode) ? (
          <>
            <div className="flex items-center gap-3 mb-2">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-sm font-light text-purple-400">
                  {email?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate text-[11px] font-medium text-white">{email}</p>
                {tier && <TierBadge tier={tier} isAdmin={isAdmin} />}
              </div>
              <button
                onClick={() => post({ type: 'disconnect_account' })}
                className="shrink-0 rounded-md border border-[var(--border-card)] px-2 py-1 text-[10px] text-[var(--text-muted)] transition hover:border-red-500/30 hover:text-red-400"
              >
                {t('dash.auth.disconnect')}
              </button>
            </div>

            {/* Platform / API Key toggle — only shown when the caller
                wired the byok-mode setter. Stays hidden in surfaces
                that don't yet plumb the toggle through. */}
            {onSetByokMode && (
              <div className="flex gap-1">
                {([
                  { key: 'platform' as const, label: tt('dash.auth.platform', 'Platform') },
                  { key: 'byok' as const,     label: tt('dash.auth.api_key', 'API Key') },
                ]).map(opt => {
                  const active = opt.key === 'platform' ? !byokMode : !!byokMode;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => onSetByokMode(opt.key === 'byok')}
                      className="flex-1 rounded text-[11px] font-medium transition border-none cursor-pointer"
                      style={{
                        padding: '5px 0',
                        background: active ? '#a855f7' : 'rgba(49, 34, 68, 0.5)',
                        color: active ? '#fff' : '#6c7086',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div>
            <button
              onClick={onConnectAccount}
              className="w-full rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 mb-1.5"
            >
              {t('dash.auth.connect')}
            </button>
            <p className="text-center text-[10px] text-[var(--text-muted)]">{t('dash.auth.byok_hint')}</p>
          </div>
        )}
      </div>
    </nav>
  );
}

/* SidebarConnect removed — OAuth sign-in replaced the inline paste-key
 * form. The signed-out nav path above already routes users through the
 * ConnectAccount page which runs the GitHub / email OAuth flow. */

/* ── TierBadge ────────────────────────────────────────────────────────── */
// Matches IDE Sidebar.tsx:1012 — tier-coloured pill below the email.
// `isAdmin` overrides the tier-derived label so admins always see "Admin"
// even when their backing tier row is something else.
const TIER_COLORS: Record<string, string> = {
  free:       '#a6e3a1',
  pro:        '#89b4fa',
  ultra:      '#cba6f7',
  enterprise: '#f9e2af',
  admin:      '#f38ba8',
};

function TierBadge({ tier, isAdmin }: { tier: string; isAdmin?: boolean }) {
  const effective = isAdmin ? 'admin' : tier;
  const color = TIER_COLORS[effective] || '#a6e3a1';
  const label = effective.charAt(0).toUpperCase() + effective.slice(1);
  return (
    <span
      className="inline-block mt-0.5 rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider"
      style={{ color, background: `${color}18` }}
    >
      {label}
    </span>
  );
}

/* ── NavItem ──────────────────────────────────────────────────────────── */

function NavItem({
  icon,
  label,
  description,
  isActive,
  onClick,
  comingSoon,
  badge,
}: {
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
  selectedDate,
  onDayClick,
  onRefresh,
}: {
  taskDates: string[];
  /** ISO date currently selected in the planner. Renders with a
   *  distinct outline so the click registers visually — without this
   *  the calendar felt unclickable because only "today" was styled
   *  and clicking any other day produced no visible change. */
  selectedDate?: string;
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
          const isSelected = iso === selectedDate;
          const hasTask = taskSet.has(iso);
          // Selected wins on background (filled accent), today gets a
          // subtle ring underneath. When today is also selected, the
          // filled state covers it. Selection is the dominant signal —
          // without it the click had no visible reaction.
          const background = isSelected
            ? 'var(--accent)'
            : isToday
              ? 'rgba(168,85,247,0.2)'
              : 'transparent';
          const color = isSelected
            ? '#fff'
            : isToday
              ? 'var(--accent)'
              : 'var(--text-secondary)';
          return (
            <button
              key={day}
              onClick={() => onDayClick(iso)}
              className="relative flex flex-col items-center justify-center border-none cursor-pointer transition"
              style={{
                width: 22, height: 22, borderRadius: '50%',
                background,
                color,
                fontSize: 9,
                fontWeight: isSelected || isToday ? 500 : 300,
                outline: isToday && !isSelected ? '1px solid rgba(168,85,247,0.5)' : 'none',
                outlineOffset: -1,
              }}
            >
              {day}
              {hasTask && (
                <span
                  className="absolute"
                  style={{
                    bottom: 1,
                    width: 3, height: 3, borderRadius: '50%',
                    background: isSelected ? '#fff' : isToday ? 'var(--accent)' : '#f59e0b',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
