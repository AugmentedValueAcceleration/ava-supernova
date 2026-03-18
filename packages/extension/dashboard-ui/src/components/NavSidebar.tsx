import { useState, useMemo } from 'react';
import { post } from '../App';
import type { Page, DashboardJournalDaySummary } from '../types/messages';
import { BoltIcon, KeyIcon, ChartBarIcon, SparklesIcon, ChecklistIcon, BookIcon, GraduationCapIcon, CloudUpIcon, MegaphoneIcon, ClockIcon, HelpCircleIcon, CogIcon, ShieldIcon, WrenchIcon, PhotoIcon } from './Icons';

interface NavSidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  mode: 'platform' | 'byok';
  email?: string | null;
  isAdmin?: boolean;
  onConnectAccount?: () => void;
  // Journal calendar
  journalSummaries?: DashboardJournalDaySummary[];
  selectedJournalDate?: string;
  onSelectJournalDate?: (date: string) => void;
  onLoadJournalSummaries?: (from: string, to: string) => void;
}

// ── Nav structure ────────────────────────────────────────────────────────────

interface NavGroup {
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
}

interface NavItem {
  page: Page;
  label: string;
  icon: React.FC<{ className?: string }>;
  platformOnly?: boolean;
  adminOnly?: boolean;
  comingSoon?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Configuration',
    items: [
      { page: 'keys', label: 'API Keys', icon: KeyIcon },
      { page: 'settings', label: 'Settings', icon: CogIcon },
    ],
  },
  {
    label: 'Productivity',
    items: [
      { page: 'tasks', label: 'Tasks', icon: ChecklistIcon },
      { page: 'journal', label: 'Journal', icon: BookIcon },
      { page: 'learning', label: 'Learning', icon: GraduationCapIcon },
    ],
  },
  {
    label: 'Creative',
    items: [
      { page: 'library', label: 'Library', icon: PhotoIcon },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { page: 'memory', label: 'Memory', icon: SparklesIcon },
      { page: 'usage', label: 'Usage', icon: ChartBarIcon },
      { page: 'history', label: 'History', icon: ClockIcon, platformOnly: true },
      { page: 'releases', label: 'Release Notes', icon: MegaphoneIcon },
      { page: 'sync', label: 'Cloud Sync', icon: CloudUpIcon, platformOnly: true },
    ],
  },
  {
    label: 'Help',
    items: [
      { page: 'support', label: 'Support', icon: HelpCircleIcon },
    ],
  },
  {
    label: 'Admin',
    adminOnly: true,
    items: [
      { page: 'admin_support', label: 'Support', icon: ShieldIcon, platformOnly: true, adminOnly: true },
      { page: 'admin_proposals', label: 'Proposals', icon: WrenchIcon, platformOnly: true, adminOnly: true },
    ],
  },
];

// ── Calendar helpers ─────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Component ────────────────────────────────────────────────────────────────

export function NavSidebar({
  currentPage,
  onNavigate,
  mode,
  email,
  isAdmin,
  onConnectAccount,
  journalSummaries = [],
  selectedJournalDate,
  onSelectJournalDate,
  onLoadJournalSummaries,
}: NavSidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    // Auto-expand the group containing the current page
    const initial = new Set<string>();
    for (const group of NAV_GROUPS) {
      if (group.items.some(item => item.page === currentPage)) {
        initial.add(group.label);
      }
    }
    return initial;
  });

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleNavigate = (page: Page) => {
    onNavigate(page);
    // Auto-expand the group when navigating
    for (const group of NAV_GROUPS) {
      if (group.items.some(item => item.page === page)) {
        setExpandedGroups(prev => new Set(prev).add(group.label));
      }
    }
  };

  const showJournalCalendar = currentPage === 'journal';

  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-[var(--border-card)] bg-[var(--bg-card)]">
      {/* Logo */}
      <div className="border-b border-[var(--border-card)] px-6 py-4">
        <span className="bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] bg-clip-text text-sm font-semibold text-transparent">
          Ava | Supernova
        </span>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Command Centre — standalone */}
        <NavButton
          page="overview"
          label="Command Centre"
          icon={BoltIcon}
          isActive={currentPage === 'overview'}
          onClick={() => handleNavigate('overview')}
        />

        <div className="mt-2" />

        {/* Grouped sections */}
        {NAV_GROUPS.map(group => {
          if (group.adminOnly && !isAdmin) return null;

          const visibleItems = group.items.filter(item => {
            if (mode === 'byok' && item.platformOnly) return false;
            if (item.adminOnly && !isAdmin) return false;
            return true;
          });

          if (visibleItems.length === 0) return null;

          const isExpanded = expandedGroups.has(group.label);
          const hasActivePage = visibleItems.some(item => item.page === currentPage);

          return (
            <div key={group.label} className="mt-1">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.label)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left border-none cursor-pointer transition
                  ${hasActivePage && !isExpanded
                    ? 'text-white bg-[var(--bg-input)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-transparent hover:bg-[var(--bg-input)]/50'
                  }`}
              >
                <svg
                  width="8" height="8" viewBox="0 0 16 16" fill="currentColor"
                  className="opacity-40 transition-transform shrink-0"
                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  <path d="M6 4l4 4-4 4V4z"/>
                </svg>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${group.adminOnly ? 'text-red-400/70' : ''}`}>
                  {group.label}
                </span>
              </button>

              {/* Group items */}
              {isExpanded && (
                <div className="ml-2 mt-0.5 flex flex-col gap-0.5">
                  {visibleItems.map(item => {
                    if (item.comingSoon) {
                      return (
                        <div key={item.page} className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-[12px] text-[var(--text-muted)] cursor-not-allowed">
                          <span className="w-4 shrink-0"><item.icon className="h-3.5 w-3.5" /></span>
                          <span>{item.label}</span>
                          <span className="ml-auto rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-[9px]">Soon</span>
                        </div>
                      );
                    }

                    return (
                      <NavButton
                        key={item.page}
                        page={item.page}
                        label={item.label}
                        icon={item.icon}
                        isActive={currentPage === item.page}
                        onClick={() => handleNavigate(item.page)}
                        isAdmin={item.adminOnly}
                        small
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Journal Calendar — shows when on journal page */}
      {showJournalCalendar && onSelectJournalDate && onLoadJournalSummaries && (
        <MiniCalendar
          summaries={journalSummaries}
          selectedDate={selectedJournalDate || getToday()}
          onSelectDate={onSelectJournalDate}
          onLoadSummaries={onLoadJournalSummaries}
        />
      )}

      {/* Account section */}
      <div className="border-t border-[var(--border-card)] p-4">
        {mode === 'platform' ? (
          <>
            {email && (
              <p className="mb-2 truncate px-3 text-[10px] text-[var(--text-muted)]">{email}</p>
            )}
            <button
              onClick={() => post({ type: 'disconnect_account' })}
              className="w-full rounded-lg border border-red-500/30 bg-transparent px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10"
            >
              Disconnect Account
            </button>
          </>
        ) : (
          <>
            <p className="mb-2 px-3 text-[10px] text-[var(--text-muted)]">Using your own API keys</p>
            <button
              onClick={onConnectAccount}
              className="w-full rounded-lg border border-[var(--accent)]/40 bg-transparent px-3 py-1.5 text-xs text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
            >
              Connect Account
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

// ── NavButton ────────────────────────────────────────────────────────────────

function NavButton({
  page,
  label,
  icon: Icon,
  isActive,
  onClick,
  isAdmin,
  small,
}: {
  page: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  isActive: boolean;
  onClick: () => void;
  isAdmin?: boolean;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg border-none px-3 ${small ? 'py-1.5' : 'py-2'} text-left ${small ? 'text-[12px]' : 'text-sm'} transition cursor-pointer ${
        isActive
          ? 'bg-[var(--bg-input)] font-medium text-white'
          : isAdmin
            ? 'text-red-400/70 hover:bg-[var(--bg-input)] hover:text-red-300 bg-transparent'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-white bg-transparent'
      }`}
    >
      <span className="w-4 shrink-0"><Icon className={small ? 'h-3.5 w-3.5' : 'h-4 w-4'} /></span>
      <span>{label}</span>
    </button>
  );
}

// ── MiniCalendar ─────────────────────────────────────────────────────────────

function MiniCalendar({
  summaries,
  selectedDate,
  onSelectDate,
  onLoadSummaries,
}: {
  summaries: DashboardJournalDaySummary[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onLoadSummaries: (from: string, to: string) => void;
}) {
  const today = getToday();
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());

  const handlePrev = () => {
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    setViewMonth(m);
    setViewYear(y);
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const last = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    onLoadSummaries(from, to);
  };

  const handleNext = () => {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    setViewMonth(m);
    setViewYear(y);
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const last = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    onLoadSummaries(from, to);
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startDow = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const summaryMap = new Map(summaries.map(s => [s.date, s]));
    const cells: Array<{ date: string; day: number; summary?: DashboardJournalDaySummary } | null> = [];

    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ date, day: d, summary: summaryMap.get(date) });
    }
    return cells;
  }, [viewYear, viewMonth, summaries]);

  return (
    <div className="border-t border-[var(--border-card)] p-3">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-1.5">
        <button onClick={handlePrev} className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-white bg-transparent border-none cursor-pointer transition">
          &lt;
        </button>
        <span className="text-[10px] font-semibold text-white">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button onClick={handleNext} className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-white bg-transparent border-none cursor-pointer transition">
          &gt;
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px mb-px">
        {DAY_HEADERS.map(h => (
          <div key={h} className="text-center text-[8px] font-semibold text-[var(--text-muted)] py-0.5">{h}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px">
        {calendarDays.map((cell, i) => {
          if (!cell) return <div key={`e-${i}`} />;
          const isSelected = cell.date === selectedDate;
          const isToday = cell.date === today;
          const hasUser = cell.summary?.has_user_entry;
          const hasAva = cell.summary?.has_ava_entry;

          return (
            <button
              key={cell.date}
              onClick={() => onSelectDate(cell.date)}
              className={`relative flex flex-col items-center justify-center py-0.5 rounded text-[9px] border-none cursor-pointer transition
                ${isSelected
                  ? 'bg-[#A855F7] text-white font-bold'
                  : isToday
                    ? 'bg-[var(--bg-input)] text-white'
                    : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
                }`}
            >
              {cell.day}
              {(hasUser || hasAva) && (
                <div className="flex gap-px">
                  {hasUser && <span className="w-0.5 h-0.5 rounded-full bg-white" />}
                  {hasAva && <span className="w-0.5 h-0.5 rounded-full bg-[#A855F7]" />}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 justify-center">
        <div className="flex items-center gap-1 text-[8px] text-[var(--text-muted)]">
          <span className="w-1 h-1 rounded-full bg-white" /> You
        </div>
        <div className="flex items-center gap-1 text-[8px] text-[var(--text-muted)]">
          <span className="w-1 h-1 rounded-full bg-[#A855F7]" /> Ava
        </div>
      </div>
    </div>
  );
}
