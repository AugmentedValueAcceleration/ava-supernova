import { useState, useEffect } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import type { Page, DashboardJournalDaySummary } from '../types/messages';

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

function getSections(): NavSection[] {
  return [
    {
      title: 'Workspace',
      items: [
        { page: 'memory', icon: '\uD83E\uDDE0', label: tt('dash.nav.memory', 'Memory'), description: 'Patterns, preferences, decisions' },
        { page: 'tasks', icon: '\u2705', label: tt('dash.nav.tasks', 'Tasks'), description: "Today's plan and priorities" },
        { page: 'journal', icon: '\uD83D\uDCD3', label: tt('dash.nav.journal', 'Journal'), description: 'Daily reflections' },
        { page: 'learning', icon: '\uD83C\uDF93', label: tt('dash.nav.learning', 'Learning'), description: 'Curriculums and progress' },
        { page: 'library', icon: '\uD83D\uDDBC\uFE0F', label: tt('dash.nav.library', 'Library'), description: 'Project files and media' },
      ],
    },
    {
      title: 'Personalise',
      items: [
        { page: 'personality', icon: '\uD83C\uDFA8', label: tt('dash.nav.personality', 'Personality'), description: 'Customise your AI' },
        { page: 'sync', icon: '\u2601\uFE0F', label: tt('dash.nav.sync', 'Sync'), description: 'Push to cloud', platformOnly: true },
      ],
    },
    {
      title: 'Account',
      items: [
        { page: 'history', icon: '\uD83D\uDCCA', label: tt('dash.nav.history', 'Usage & History'), description: 'Tokens, sessions, models' },
        { page: 'billing', icon: '\uD83D\uDCB3', label: tt('dash.nav.billing', 'Billing'), description: 'Plans and top-ups', platformOnly: true },
        { page: 'settings', icon: '\u2699\uFE0F', label: tt('dash.nav.settings', 'Settings'), description: 'Preferences and API keys' },
        { page: 'connections', icon: '\uD83D\uDD17', label: tt('dash.nav.connections', 'Connections'), description: 'GitHub, Slack, email', comingSoon: true },
      ],
    },
    {
      title: 'Help',
      items: [
        { page: 'releases', icon: '\uD83D\uDCCB', label: tt('dash.nav.releases', 'Releases'), description: "What's new" },
        { page: 'support', icon: '\u2753', label: tt('dash.nav.support', 'Support'), description: 'Get help' },
      ],
    },
    {
      title: 'Admin',
      adminOnly: true,
      items: [
        { page: 'admin_support', icon: '\uD83D\uDEE1\uFE0F', label: 'Admin Support', description: 'All user tickets', adminOnly: true },
        { page: 'admin_proposals', icon: '\uD83D\uDD27', label: 'Tool Proposals', description: 'Review and approve', adminOnly: true },
      ],
    },
  ];
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
}: NavSidebarProps) {
  useLocale();

  // Section collapse state — persisted
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; }
    catch { return {}; }
  });

  const toggleSection = (title: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [title]: !prev[title] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  };

  // Load task dates for calendar on mount
  useEffect(() => { onLoadTaskDates?.(); }, []);

  const handleNavigate = (page: Page) => {
    onNavigate(page);
    // Auto-expand section containing the page
    const sections = getSections();
    for (const s of sections) {
      if (s.items.some(i => i.page === page) && collapsed[s.title]) {
        toggleSection(s.title);
      }
    }
  };

  const sections = getSections();

  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-[var(--border-card)] bg-[var(--bg-card)]">
      {/* Logo */}
      <div className="border-b border-[var(--border-card)] px-5 py-3">
        <span className="bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] bg-clip-text text-sm font-light text-transparent">
          {aiName || 'Ava'} | Supernova
        </span>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {/* Chat — primary action */}
        <NavItem
          page="chat"
          icon={'\uD83D\uDCAC'}
          label={tt('dash.nav.chat', 'Chat with Ava')}
          description="Talk, build, create"
          isActive={currentPage === 'chat'}
          onClick={() => handleNavigate('chat')}
        />

        {/* Command Centre */}
        <NavItem
          page="overview"
          icon={'\u26A1'}
          label={tt('dash.nav.command_centre', 'Command Centre')}
          description="Your daily overview"
          isActive={currentPage === 'overview'}
          onClick={() => handleNavigate('overview')}
        />

        <div className="mt-1" />

        {/* Grouped sections */}
        {sections.map(section => {
          if (section.adminOnly && !isAdmin) return null;

          const visibleItems = section.items.filter(item => {
            if (mode === 'byok' && item.platformOnly) return false;
            if (item.adminOnly && !isAdmin) return false;
            return true;
          });

          if (visibleItems.length === 0) return null;

          const isCollapsed = collapsed[section.title];
          const hasActivePage = visibleItems.some(item => item.page === currentPage);

          return (
            <div key={section.title} className="mt-1">
              {/* Section header */}
              <button
                onClick={() => toggleSection(section.title)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left border-none cursor-pointer transition bg-transparent hover:bg-[var(--bg-input)]/50"
              >
                <svg
                  width="8" height="8" viewBox="0 0 16 16" fill="currentColor"
                  className="opacity-40 transition-transform shrink-0"
                  style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
                >
                  <path d="M6 4l4 4-4 4V4z"/>
                </svg>
                <span className={`text-[9px] font-light uppercase tracking-wider ${section.adminOnly ? 'text-red-400/70' : 'text-[var(--text-muted)]'}`}>
                  {section.title}
                </span>
                {isCollapsed && hasActivePage && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                )}
              </button>

              {/* Items */}
              {!isCollapsed && (
                <div className="mt-0.5">
                  {visibleItems.map(item => (
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
              )}
            </div>
          );
        })}
      </div>

      {/* Mini Calendar — always visible, task-focused */}
      <TaskCalendar
        taskDates={taskDates || []}
        onDayClick={(date) => {
          // Navigate to tasks with date filter
          handleNavigate('tasks');
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
  const label = target.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
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
