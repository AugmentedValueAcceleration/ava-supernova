import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { t, tt, useLocale } from '../i18n';
import { post } from '../App';
import type { Page, DashboardJournalDaySummary, HealthPlanSummary, ProviderKeyStatus } from '../types/messages';
import {
  Lightning, ChatCircleDots, ListChecks, Books, Palette,
  Brain, ChartLineUp, GearSix, Question, Barbell, GraduationCap,
  ArrowsLeftRight, CaretLeft, CaretRight,
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
  /** Which BYOK providers already hold a key. Presence flags only — the host
   *  keeps the values in SecretStorage and never sends them to the webview.
   *  Drives the collapsible API Keys block below the account, mirroring the
   *  IDE sidebar. */
  providerKeys?: ProviderKeyStatus;
  aiName?: string;
  journalSummaries?: DashboardJournalDaySummary[];
  selectedJournalDate?: string;
  onSelectJournalDate?: (date: string) => void;
  onLoadJournalSummaries?: (from: string, to: string) => void;
  taskDates?: string[];
  onLoadTaskDates?: () => void;
  /** Health plan summaries — drive the plan dots on the mini-calendar so
   *  it shows the same training/meal marks as the Plans calendar. */
  healthPlans?: HealthPlanSummary[];
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
  /** Jobs rendering right now, plus anything finished in the last 30s. */
  generationJobs?: GenerationJobLite[];
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
  /** Shipped and usable, but still moving. Mirrored in the IDE sidebar. */
  earlyAccess?: boolean;
}

// tt() helper moved to ../i18n.ts so it's shared across pages.

function getNavItems(isAdmin?: boolean): NavItem[] {
  const items: NavItem[] = [
    { page: 'overview', icon: <Lightning weight="duotone" size={18} />, label: tt('dash.nav.command_centre', 'Command Centre'), description: tt('dash.nav.command_centre_desc', 'Your daily overview') },
    { page: 'chat', icon: <ChatCircleDots weight="duotone" size={18} />, label: tt('dash.nav.ava_chat', 'Chat'), description: tt('dash.nav.ava_chat_desc', 'Talk, build, create') },
    { page: 'planner', icon: <ListChecks weight="duotone" size={18} />, label: tt('dash.nav.planner', 'Planner'), description: tt('dash.nav.planner_desc', 'Tasks, journal, plans') },
    { page: 'library', icon: <Books weight="duotone" size={18} />, label: tt('dash.nav.library', 'Library'), description: tt('dash.nav.library_desc', 'Papers, assets, and documents') },
    { page: 'health', icon: <Barbell weight="duotone" size={18} />, label: tt('dash.nav.health', 'Health & Nutrition'), description: tt('dash.nav.health_desc', 'Exercises, recipes, plans'), earlyAccess: true },
    { page: 'learning-room', icon: <GraduationCap weight="duotone" size={18} />, label: tt('dash.nav.learning', 'Learning'), description: tt('dash.nav.learning_desc', 'Courses, lessons, and teaching'), earlyAccess: true },
    // earlyAccess marks the rooms that are shipped and usable but still evolving —
    // Health, Learning, Creative Studio. Not a warning: it tells someone where a
    // feature actually is in its development. Keep in step with the IDE Sidebar.
    { page: 'creative-studio', icon: <Palette weight="duotone" size={18} />, label: tt('dash.nav.creative_studio', 'Creative Studio'), description: tt('dash.nav.creative_studio_desc', 'Images, music, video, voice'), earlyAccess: true },
    { page: 'memory', icon: <Brain weight="duotone" size={18} />, label: tt('dash.nav.memory', 'Memory'), description: tt('dash.nav.memory_desc', 'Patterns, preferences, decisions') },
    // Labelled 'History' to match the IDE Sidebar (Sidebar.tsx:1116) —
    // the previous tt('dash.nav.usage', 'History') resolved to "Usage"
    // because the i18n key exists in the locale (the fallback only fires
    // for missing keys). Hardcoding the label like the IDE does.
    { page: 'history', icon: <ChartLineUp weight="duotone" size={18} />, label: tt('dash.nav.history', 'History'), description: tt('dash.nav.history_desc', 'Credits, sessions, models') },
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
  providerKeys,
  aiName,
  selectedJournalDate,
  onSelectJournalDate,
  taskDates,
  onLoadTaskDates,
  healthPlans,
  onToggleSidebar,
  onFlipSidebar,
  sidebarSide,
  // onNewChat + onOpenHistory removed from destructure — both now route
  // through the dashboard nav (History as a top-level page; New Chat as
  // a chat-header pill). Props stay in NavSidebarProps for caller shape.
  supportUnread,
  avatarUrl,
  collapsed,
  generationJobs,
}: NavSidebarProps) {
  useLocale();

  // ── All hooks declared up-front so the count stays constant across
  // collapsed/expanded transitions. Previously I returned early for the
  // collapsed branch AFTER useLocale + useEffect but BEFORE the useState,
  // useRef and useCallback hooks below — toggling collapse changed the
  // hook count mid-render and React threw #300. Keep hooks above any
  // conditional returns. (Rules of Hooks.) ────────────────────────────────
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
  // Jobs actually in flight. Finished ones linger in the list for a few
  // seconds so the rail can show a result, but they must not keep a count
  // badge lit after the work is done.
  const runningJobs = (generationJobs || [])
    .filter(j => j.status !== 'complete' && j.status !== 'failed').length;

  if (collapsed) {
    return (
      <nav
        className="relative flex shrink-0 flex-col h-full border-r border-[var(--border-card)] bg-[var(--bg-card)] items-center py-3 gap-1"
        style={{ width: RAIL_WIDTH }}
      >
        {/* Expand — the SAME handle, in the SAME place, as the collapse control on
            the expanded panel. It was a different glyph in a different position,
            so the control moved on you the moment you used it. The arrow points
            outward: the way the panel will come back. */}
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            title={t('dash.nav.expand_sidebar')}
            className="absolute z-20 flex h-14 w-[14px] -translate-y-1/2 items-center justify-center border border-[var(--border-card)] bg-[var(--bg-card)] text-[#6c7086] transition-colors hover:bg-[var(--bg-input)] hover:text-[#cdd6f4]"
            style={
              sidebarSide === 'right'
                ? { top: '50%', left: -1, borderRadius: '4px 0 0 4px', borderRight: 'none' }
                : { top: '50%', right: -1, borderRadius: '0 4px 4px 0', borderLeft: 'none' }
            }
          >
            {sidebarSide === 'right'
              ? <CaretLeft weight="bold" size={11} />
              : <CaretRight weight="bold" size={11} />}
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
              title={`${item.label}${item.comingSoon ? ` (${t('dash.nav.coming_soon_full')})` : ''}`}
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
              {/* Collapsed: the rail lives beside the calendar and NEITHER is
                  rendered here, so this dot is the only way a background render
                  stays visible once the sidebar is tucked away — which is
                  exactly when someone has gone off to work on something else. */}
              {item.page === 'creative-studio' && runningJobs > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-[var(--accent)] px-0.5 text-[7px] font-bold text-white">{runningJobs}</span>
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
        className="absolute top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors"
        style={{ [sidebarSide === 'right' ? 'left' : 'right']: 0 }}
      />

      {/* Collapse — a handle on the border facing the content, halfway down.
          It used to be a 22px icon buried in a row of three at the top, where you
          neither look for it nor reach for it. On the edge it is where the hand
          already is, and the arrow points the way the panel will actually go: left
          when the sidebar is docked left, right when it's flipped. */}
      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          title={t('dash.nav.hide_sidebar')}
          className="group absolute z-20 flex h-14 w-[14px] -translate-y-1/2 items-center justify-center border border-[var(--border-card)] bg-[var(--bg-card)] text-[#6c7086] transition-colors hover:bg-[var(--bg-input)] hover:text-[#cdd6f4]"
          style={
            sidebarSide === 'right'
              ? { top: '50%', left: -1, borderRadius: '4px 0 0 4px', borderRight: 'none' }
              : { top: '50%', right: -1, borderRadius: '0 4px 4px 0', borderLeft: 'none' }
          }
        >
          {sidebarSide === 'right'
            ? <CaretRight weight="bold" size={11} />
            : <CaretLeft weight="bold" size={11} />}
        </button>
      )}
      {/* Logo + action buttons */}
      <div className="border-b border-[var(--border-card)] px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <img src={document.getElementById('root')?.getAttribute('data-icon-uri') || ''} width="20" height="20" alt="" style={{ borderRadius: 4 }} />
          <span className="bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] bg-clip-text text-sm font-light text-transparent">
            {aiName || 'Ava'} Supernova
          </span>
        </div>
        {/* Sidebar controls.
            Only the flip lives up here now. Collapse moved to a handle on the
            sidebar's inner border (where you actually reach for it), and Export /
            Import moved to Settings → Data (where you'd look for it). Icons are
            Phosphor duotone, the same pack as the nav below — the hand-rolled SVGs
            were a second icon language in a 22px space. */}
        <div className="flex items-center gap-0.5">
          {onFlipSidebar && (
            <button
              onClick={onFlipSidebar}
              title={sidebarSide === 'left' ? t('dash.nav.move_sidebar_right') : t('dash.nav.move_sidebar_left')}
              className="flex h-[22px] w-[22px] items-center justify-center rounded bg-transparent border-none cursor-pointer text-[#6c7086] hover:text-[#cdd6f4] transition-colors"
            >
              <ArrowsLeftRight weight="duotone" size={15} />
            </button>
          )}
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
            earlyAccess={item.earlyAccess}
            badge={item.page === 'help' ? supportUnread : undefined}
          />
        ))}
      </div>

      {/* What is rendering right now — above the calendar, on every page. */}
      <GenerationRail jobs={generationJobs || []} onOpen={() => handleNavigate('creative-studio')} />

      {/* Mini Calendar — always visible, task-focused */}
      <TaskCalendar
        taskDates={taskDates || []}
        healthPlans={healthPlans || []}
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
                      /* House button style — the chat header's "New Chat" pill:
                         translucent accent fill, accent border + text. The
                         selected side sits at 18%/40%, the unselected at
                         transparent with a muted border, so the pair still
                         reads as one segmented control. Was solid-accent +
                         white vs flat grey, which matched nothing else. */
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)'; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                      className="flex-1 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                      style={{
                        padding: '5px 0',
                        background: active ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent',
                        border: active
                          ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)'
                          : '1px solid var(--border-card)',
                        color: active ? 'var(--accent)' : '#6c7086',
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
            {/* House button — mirrors the IDE sidebar: translucent accent
                fill, accent border + text, at the same 18% / 40% weights the
                Platform / API Key toggle above uses when selected. Was solid
                accent with white text on both surfaces. */}
            <button
              onClick={onConnectAccount}
              className="w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition mb-1.5"
              style={{
                border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
                color: 'var(--accent)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 26%, transparent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 18%, transparent)'; }}
            >
              {t('dash.auth.connect')}
            </button>
            <p className="text-center text-[10px] text-[var(--text-muted)]">{t('dash.auth.byok_hint')}</p>
          </div>
        )}
      </div>

      {/* API Keys (BYOK) — mirrors the IDE sidebar, which puts this right below
          the account block. Always available (signed in or not): BYOK is the
          zero-cost path and shouldn't be buried in Settings. */}
      <SidebarApiKeys providerKeys={providerKeys} />
    </nav>
  );
}

/* ── SidebarApiKeys ───────────────────────────────────────────────────────── */
/**
 * Collapsible BYOK key block for the sidebar. Mirrors the IDE's Sidebar
 * section, but NOT its storage: the IDE keeps keys in localStorage, whereas the
 * extension hands them to the host, which puts them in VS Code SecretStorage.
 * The webview therefore never holds a key value — it only learns WHICH
 * providers have one (`providerKeys`, booleans). So a configured provider shows
 * as saved with a Remove action rather than echoing dots we don't have.
 *
 * The eight providers here are the same set (and wording) as Settings' PROVIDERS.
 * Anthropic left both on 2026-09-01: the models were withdrawn on 13 August
 * and this list kept asking for a key that could not reach anything.
 */
// Explicit union rather than `keyof ProviderKeyStatus` — that interface carries
// a `[key: string]: boolean` index signature, so keyof widens to string | number
// and stops meaning anything. These eight are the real providers.
type SidebarProviderId =
  | 'deepseek' | 'kimi' | 'glm' | 'qwen'
  | 'mistral' | 'xiaomi' | 'tencent' | 'nvidia';

const SIDEBAR_PROVIDERS: Array<{ id: SidebarProviderId; label: string; placeholder: string }> = [
  { id: 'deepseek', label: 'DeepSeek', placeholder: 'sk-...' },
  { id: 'kimi', label: 'Kimi (Moonshot)', placeholder: 'sk-...' },
  { id: 'glm', label: 'GLM (Zhipu AI)', placeholder: '...' },
  { id: 'qwen', label: 'Qwen (Alibaba)', placeholder: 'sk-...' },
  { id: 'mistral', label: 'Mistral AI', placeholder: '...' },
  { id: 'xiaomi', label: 'Xiaomi (MiMo)', placeholder: '...' },
  { id: 'tencent', label: 'Tencent Hunyuan', placeholder: '...' },
  { id: 'nvidia', label: 'NVIDIA', placeholder: 'nvapi-...' },
];

function SidebarApiKeys({ providerKeys }: { providerKeys?: ProviderKeyStatus }) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const saveKey = (id: string) => {
    const apiKey = drafts[id]?.trim();
    if (!apiKey) return;
    post({ type: 'save_provider_key', provider: id as never, apiKey });
    setDrafts(prev => ({ ...prev, [id]: '' }));
  };

  const configured = providerKeys ? Object.values(providerKeys).filter(Boolean).length : 0;

  return (
    <div className="border-t border-[var(--border-card)] px-4 py-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between border-none bg-transparent p-0 text-[11px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)] cursor-pointer"
      >
        <span>
          {tt('dash.settings.section.api_keys', 'API Keys')}
          {configured > 0 && (
            <span className="ml-1.5 font-normal text-[var(--accent)]">{configured}</span>
          )}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="pt-2">
          {SIDEBAR_PROVIDERS.map(p => {
            const isSet = !!providerKeys?.[p.id];
            return (
              <div key={p.id} className="mb-1.5">
                <div className="mb-0.5 flex items-center justify-between">
                  <span className="text-[10px] text-[var(--text-muted)]">{p.label}</span>
                  {isSet && (
                    <button
                      onClick={() => post({ type: 'remove_provider_key', provider: p.id as never })}
                      className="border-none bg-transparent p-0 text-[9px] text-[var(--text-muted)] transition hover:text-red-400 cursor-pointer"
                    >
                      {tt('dash.settings.remove', 'Remove')}
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  value={drafts[p.id] ?? ''}
                  onChange={e => setDrafts(prev => ({ ...prev, [p.id]: e.target.value }))}
                  onBlur={() => saveKey(p.id)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveKey(p.id); } }}
                  // The host holds the real key; we can't echo it back. Say so
                  // plainly rather than faking dots in an empty box.
                  placeholder={isSet ? tt('dash.settings.key_saved', 'Saved — paste to replace') : p.placeholder}
                  className="h-6 w-full rounded border border-[var(--border-card)] bg-[var(--bg-input)] px-2 text-[11px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                  style={isSet ? { borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' } : undefined}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
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
  earlyAccess,
  badge,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  isActive: boolean;
  onClick: () => void;
  comingSoon?: boolean;
  /** Shipped and usable, but still moving. Not a warning — the honest state of a
   *  surface that hasn't settled. Cheaper to say than to let someone find out. */
  earlyAccess?: boolean;
  badge?: number;
}) {
  useLocale();
  if (comingSoon) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[var(--text-muted)] cursor-not-allowed opacity-50">
        <span className="w-5 text-center text-sm shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px]">{label}</span>
            <span className="rounded bg-[var(--bg-input)] px-1 py-0.5 text-[8px]">{t('dash.nav.coming_soon')}</span>
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
        <span className={`flex items-center gap-1.5 text-[12px] ${isActive ? 'text-white' : 'text-[var(--text-secondary)]'}`}>
          {label}
          {earlyAccess && (
            <span className="shrink-0 rounded border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-1 py-px text-[8px] font-bold uppercase leading-tight tracking-wider text-[var(--accent)]">
              {t('dash.nav.early_access')}
            </span>
          )}
        </span>
        <p className="text-[9px] text-[var(--text-muted)] truncate">{description}</p>
      </div>
    </button>
  );
}


/* ── Generation rail ──────────────────────────────────────────────── */
/* What is rendering right now, on every page.
 *
 * A clip takes minutes, so people navigate away — and the host has always kept
 * polling, because the job lives in the extension process rather than the
 * webview. What was missing was anywhere to SEE it: the page that started the
 * render was unmounted, and its result arrived with nobody listening.
 *
 * The bar fills by STAGE. Wan gives a state and never a percentage, so stops
 * that mean something (queued → generating → downloading → done) are the only
 * honest way to fill it; within a stage it pulses instead of creeping. The
 * elapsed clock on the right is the one real number, and it is the one that
 * answers "is this stuck?".
 */

export interface GenerationJobLite {
  id: string;
  type: string;
  status: 'queued' | 'generating' | 'downloading' | 'complete' | 'failed';
  prompt: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

/** Real stops, not a guessed percentage. */
const STAGE_FILL: Record<GenerationJobLite['status'], number> = {
  queued: 8,
  generating: 55,
  downloading: 88,
  complete: 100,
  failed: 100,
};

function elapsedLabel(fromIso: string, toIso: string | undefined, now: number): string {
  const start = Date.parse(fromIso);
  if (!Number.isFinite(start)) return '';
  const end = toIso ? Date.parse(toIso) : now;
  const secs = Math.max(0, Math.floor((end - start) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function GenerationRail({ jobs, onOpen }: { jobs: GenerationJobLite[]; onOpen: () => void }) {
  // Ticks only while something is actually running — a finished job's clock is
  // frozen at its final time, so there is nothing to re-render for.
  const running = jobs.some(j => j.status !== 'complete' && j.status !== 'failed');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  // Deliberately rendered even when empty. A status area that only exists while
  // it is busy is one nobody can learn the location of — the first time you need
  // it is the first time you have ever seen it. Empty, it is one quiet line, and
  // it teaches where to look before there is anything to look at.
  return (
    <div className="px-3 pb-2 flex flex-col gap-1.5">
      <div className="text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {tt('dash.nav.studio_jobs', 'Studio')}
      </div>
      {jobs.length === 0 ? (
        <div className="text-[11px] text-[var(--text-muted)] opacity-60">
          {tt('dash.nav.studio_idle', 'Nothing rendering')}
        </div>
      ) : null}
      {jobs.map(job => {
        const done = job.status === 'complete';
        const failed = job.status === 'failed';
        const fill = STAGE_FILL[job.status] ?? 8;
        const colour = failed ? 'var(--error, #f87171)' : done ? 'var(--success, #4ade80)' : 'var(--accent)';
        return (
          <button
            key={job.id}
            onClick={onOpen}
            title={job.error || job.prompt}
            className="w-full text-left bg-transparent border-0 p-0 cursor-pointer flex flex-col gap-1"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-[var(--text-secondary)] truncate capitalize">
                {failed ? `${job.type} failed` : job.type}
              </span>
              <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                {elapsedLabel(job.startedAt, job.completedAt, now)}
              </span>
            </div>
            <div className="h-[3px] w-full rounded-full overflow-hidden bg-[var(--border)]">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${done || failed ? '' : 'animate-pulse'}`}
                style={{ width: `${fill}%`, background: colour }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── Task Calendar ────────────────────────────────────────────────────── */

function TaskCalendar({
  taskDates,
  healthPlans,
  selectedDate,
  onDayClick,
  onRefresh,
}: {
  taskDates: string[];
  healthPlans: HealthPlanSummary[];
  /** ISO date currently selected in the planner. Renders with a
   *  distinct outline so the click registers visually — without this
   *  the calendar felt unclickable because only "today" was styled
   *  and clicking any other day produced no visible change. */
  selectedDate?: string;
  onDayClick: (date: string) => void;
  onRefresh?: () => void;
}) {
  useLocale();
  const [monthOffset, setMonthOffset] = useState(0);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('ava.sidebarCalCollapsed') === '1'; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed(c => {
    const next = !c;
    try { localStorage.setItem('ava.sidebarCalCollapsed', next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });
  const taskSet = new Set(taskDates);

  // Plan dots — same training (accent) / meal (amber) marks as the Plans
  // calendar, so the schedule reads identically in both places.
  const planMarks = useMemo(() => {
    const map = new Map<string, { training: boolean; meals: boolean }>();
    for (const p of healthPlans) {
      if (!p.start_date) continue;
      const start = new Date(`${p.start_date}T00:00:00`);
      if (isNaN(start.getTime())) continue;
      const training = p.type === 'fitness' || p.type === 'combined';
      const meals = p.type === 'meal' || p.type === 'combined';
      for (let i = 0; i < p.duration_days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const prev = map.get(key) ?? { training: false, meals: false };
        map.set(key, { training: prev.training || training, meals: prev.meals || meals });
      }
    }
    return map;
  }, [healthPlans]);

  // Only refetch task dates when the (expanded) calendar changes month.
  useEffect(() => { if (!collapsed) onRefresh?.(); }, [monthOffset, collapsed]);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Collapsed — just today's date with a chevron to expand.
  if (collapsed) {
    return (
      <div className="border-t border-[var(--border-card)] px-3 py-2.5 shrink-0">
        <button
          onClick={toggleCollapsed}
          title={t('dash.nav.show_calendar')}
          className="flex w-full items-center justify-between border-none bg-transparent cursor-pointer text-[var(--text-secondary)] hover:text-white transition"
        >
          <span className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[9px] font-semibold text-white">{now.getDate()}</span>
            <span className="text-[11px]">{now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </span>
          <span className="text-[9px] text-[var(--text-muted)]">{'▼'}</span>
        </button>
      </div>
    );
  }

  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = target.getFullYear();
  const month = target.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const label = target.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

  return (
    <div className="border-t border-[var(--border-card)] px-3 py-2.5 shrink-0">
      {/* Month nav + collapse */}
      <div className="flex items-center justify-between mb-1.5">
        <button onClick={() => setMonthOffset(o => o - 1)} className="text-[10px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer hover:text-white">{'\u25C0'}</button>
        <span className="text-[10px] font-light text-[var(--text-secondary)]">{label}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonthOffset(o => o + 1)} className="text-[10px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer hover:text-white">{'\u25B6'}</button>
          <button onClick={toggleCollapsed} title={t('dash.nav.hide_calendar')} className="text-[9px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer hover:text-white">{'\u25B2'}</button>
        </div>
      </div>
      {/* Legend \u2014 colour code for the day dots */}
      <div className="flex items-center justify-center gap-2.5 mb-1.5 text-[8px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />{t('health.plans.training')}</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: '#f59e0b' }} />{t('health.plans.meals')}</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: '#38bdf8' }} />{t('dash.nav.tasks')}</span>
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
          const mk = planMarks.get(iso);
          // Dots in legend order: training (accent), meals (amber), task (sky).
          const dots: string[] = [];
          if (mk?.training) dots.push('var(--accent)');
          if (mk?.meals) dots.push('#f59e0b');
          if (taskSet.has(iso)) dots.push('#38bdf8');
          // Selected wins on background (filled accent), today gets a
          // subtle ring underneath. When today is also selected, the
          // filled state covers it. Selection is the dominant signal —
          // without it the click had no visible reaction.
          const background = isSelected
            ? 'var(--accent)'
            : isToday
              ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
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
                outline: isToday && !isSelected ? '1px solid color-mix(in srgb, var(--accent) 50%, transparent)' : 'none',
                outlineOffset: -1,
              }}
            >
              {day}
              {dots.length > 0 && (
                <span className="absolute flex" style={{ bottom: 1, gap: 1 }}>
                  {dots.map((c, di) => (
                    <span key={di} style={{ width: 3, height: 3, borderRadius: '50%', background: isSelected ? '#fff' : c }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
