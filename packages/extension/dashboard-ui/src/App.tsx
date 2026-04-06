import { useState, useEffect, useCallback, useRef } from 'react';
import { initLocale, useLocale } from './i18n';
import { post } from './vscode';

import { NavSidebar } from './components/NavSidebar';
import { ConnectAccount } from './pages/ConnectAccount';
import { Overview } from './pages/Overview';
import { Usage } from './pages/Usage';
import { Memory } from './pages/Memory';
import { Connections } from './pages/Connections';
import { History } from './pages/History';
import { Support } from './pages/Support';
import { Billing } from './pages/Billing';
import { Settings } from './pages/Settings';
import { AdminSupport } from './pages/AdminSupport';
import { AdminProposals } from './pages/AdminProposals';
import { Tasks } from './pages/Tasks';
import { Journal } from './pages/Journal';
import { Learning } from './pages/Learning';
import { Sync } from './pages/Sync';
import { Releases } from './pages/Releases';
import { Roadmap } from './pages/Roadmap';
import { Library } from './pages/Library';
import { Personality } from './pages/Personality';
import { Chat } from './pages/Chat';
import { Planner } from './pages/Planner';
import { LearningLibrary } from './pages/LearningLibrary';
import { AccountPage } from './pages/AccountPage';
import { HelpPage } from './pages/HelpPage';
import type {
  Page,
  AccountInfo,
  AdminToolProposal,
  ConnectionStatus,
  ConversationEntry,
  DashboardTaskEntry,
  DashboardJournalDay,
  DashboardJournalDaySummary,
  SessionStats,
  UsageHistoryData,
  SupportTicket,
  DashboardSettings,
  MemoryEntry,
  ProviderKeyStatus,
  UsageLogEntry,
  ExtToDashboardMessage,
  DashboardLearningCurriculum,
  SyncStatus,
  ReleaseNote,
  LibraryImage,
  LibraryPath,
  LibraryPathDetail,
  PersonalityData,
} from './types/messages';

export { post };

export function App() {
  useLocale(); // re-render on language change
  const [initialized, setInitialized] = useState(false);
  const [page, setPage] = useState<Page>(() => {
    const saved = localStorage.getItem('ava-dashboard-page') as Page | null;
    return saved || 'overview';
  });

  // Chat page dispatch — forwards extension messages to the Chat reducer
  const chatDispatchRef = useRef<((msg: ExtToDashboardMessage) => void) | null>(null);
  const registerChatDispatch = useCallback((fn: (msg: ExtToDashboardMessage) => void) => {
    chatDispatchRef.current = fn;
  }, []);

  // Sidebar collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarCollapsed(prev => !prev), []);

  // Sidebar side (left or right) — persisted
  const [sidebarSide, setSidebarSide] = useState<'left' | 'right'>(() => {
    return (localStorage.getItem('ava-sidebar-side') as 'left' | 'right') || 'left';
  });
  const flipSidebar = useCallback(() => {
    setSidebarSide(prev => {
      const next = prev === 'left' ? 'right' : 'left';
      localStorage.setItem('ava-sidebar-side', next);
      return next;
    });
  }, []);
  // Persist active page
  const setPagePersist = (p: Page) => {
    setPage(p);
    localStorage.setItem('ava-dashboard-page', p);
  };
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [connections, setConnections] = useState<ConnectionStatus>({
    github: false,
    email: false,
    slack: false,
    discord: false,
  });
  const [settings, setSettings] = useState<DashboardSettings>({
    language: 'auto',
    permissionMode: 'strict',
    temperature: 0.7,
    maxTokens: 8192,
    activeModel: '',
    autoMemory: true,
    memoryLocalOnly: false,
    contributeSharedLearning: false,
    streamResponses: true,
  });
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [memoryTotal, setMemoryTotal] = useState(0);
  const [memoryHasMore, setMemoryHasMore] = useState(false);
  const [providerKeys, setProviderKeys] = useState<ProviderKeyStatus>({
    anthropic: false, deepseek: false, kimi: false, glm: false, qwen: false, mistral: false,
  });
  const [usageLogs, setUsageLogs] = useState<UsageLogEntry[]>([]);
  const [conversations, setConversations] = useState<ConversationEntry[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [byokMode, setByokMode] = useState(false);
  const [localMemories, setLocalMemories] = useState<MemoryEntry[]>([]);
  const [tasks, setTasks] = useState<DashboardTaskEntry[]>([]);
  const [sessionTasks, setSessionTasks] = useState<Array<{ id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }>>([]);
  const [journalDay, setJournalDay] = useState<DashboardJournalDay | null>(null);
  const [journalSummaries, setJournalSummaries] = useState<DashboardJournalDaySummary[]>([]);
  const [selectedJournalDate, setSelectedJournalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sessionStatsData, setSessionStatsData] = useState<SessionStats | null>(null);
  const [usageHistoryData, setUsageHistoryData] = useState<UsageHistoryData | null>(null);
  const [learningCurriculums, setLearningCurriculums] = useState<DashboardLearningCurriculum[]>([]);
  const [libraryPaths, setLibraryPaths] = useState<LibraryPath[]>([]);
  const [libraryPathDetail, setLibraryPathDetail] = useState<LibraryPathDetail | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Admin state
  const [adminTickets, setAdminTickets] = useState<SupportTicket[]>([]);
  const [adminTicketsTotal, setAdminTicketsTotal] = useState(0);
  const [adminTicketsLoading, setAdminTicketsLoading] = useState(false);
  const [adminProposals, setAdminProposals] = useState<AdminToolProposal[]>([]);
  const [adminProposalsTotal, setAdminProposalsTotal] = useState(0);
  const [adminProposalsLoading, setAdminProposalsLoading] = useState(false);
  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncingTypes, setSyncingTypes] = useState<Set<string>>(new Set());
  const [syncResults, setSyncResults] = useState<Record<string, { success: boolean; count?: number; error?: string }>>({});
  // Release notes state
  const [releases, setReleases] = useState<ReleaseNote[]>([]);
  // Library state
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
  const [libraryProjectRoot, setLibraryProjectRoot] = useState('');
  const [libraryHasFolder, setLibraryHasFolder] = useState(true);
  // Personality state
  const [personalityData, setPersonalityData] = useState<PersonalityData | null>(null);
  // Avatar state
  const [avatarDataUrl, setAvatarDataUrl] = useState('');
  // Task calendar dates
  const [taskDates, setTaskDates] = useState<string[]>([]);
  // Overview widget state
  const [weatherData, setWeatherData] = useState<{ location: string; temp_c: number; condition: string; emoji: string; humidity: number; wind_kmph: number; forecast: Array<{ date: string; day: string; max_c: number; min_c: number; condition: string; emoji: string }> } | null>(null);
  const [newsArticles, setNewsArticles] = useState<Array<{ title: string; category: string; reading_time: number; slug: string; date: string }>>([]);
  const [latestRelease, setLatestRelease] = useState<{ version: string; title: string; published_at: string } | null>(null);

  const handleMessage = useCallback((event: MessageEvent) => {
    // Ignore messages from unexpected origins (e.g. browser extensions)
    // Accept vscode-webview:// and vscode-file:// (Electron/WebView2 on Windows)
    if (event.origin && !event.origin.startsWith('vscode-webview://') && !event.origin.startsWith('vscode-file://')) return;
    const msg = event.data as ExtToDashboardMessage;

    // Forward ALL messages to chat dispatch — it filters internally
    chatDispatchRef.current?.(msg);

    switch (msg.type) {
      case 'init':
        setAccount(msg.account);
        setConnections(msg.connections);
        setSettings(msg.settings);
        setProviderKeys(msg.providerKeys);
        if (!msg.account && Object.values(msg.providerKeys).some(Boolean)) {
          setByokMode(true);
        }
        setInitialized(true);
        break;
      case 'account_updated':
        setAccount(msg.account);
        if (!msg.account && Object.values(providerKeys).some(Boolean)) {
          setByokMode(true);
        }
        break;
      case 'provider_keys_updated':
        setProviderKeys(msg.providerKeys);
        break;
      case 'memories_loaded':
        setMemories(msg.memories);
        setMemoryTotal(msg.total ?? msg.memories.length);
        setMemoryHasMore(msg.hasMore ?? false);
        break;
      case 'memories_more_loaded':
        setMemories(prev => [...prev, ...msg.memories]);
        setMemoryTotal(msg.total ?? 0);
        setMemoryHasMore(msg.hasMore ?? false);
        break;
      case 'memory_deleted':
        setMemories((prev) => prev.filter((m) => m.id !== msg.id));
        break;
      case 'memory_upserted':
        setMemories((prev) => {
          const idx = prev.findIndex((m) => m.id === msg.memory.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = msg.memory;
            return updated;
          }
          return [msg.memory, ...prev];
        });
        break;
      case 'connection_saved':
        setConnections((prev) => ({ ...prev, [msg.service]: true }));
        break;
      case 'connection_removed':
        setConnections((prev) => ({ ...prev, [msg.service]: false }));
        break;
      case 'usage_logs_loaded':
        setUsageLogs(msg.logs);
        break;
      case 'conversations_loaded':
        setConversations(msg.conversations);
        setConversationsLoading(false);
        break;
      case 'conversation_deleted':
        setConversations((prev) => prev.filter((c) => c.id !== msg.id));
        break;
      case 'conversation_pinned':
        setConversations((prev) => prev.map((c) => c.id === msg.id ? { ...c, pinned: msg.pinned } : c));
        break;
      case 'tickets_loaded':
        setTickets(msg.tickets);
        setTicketsLoading(false);
        break;
      case 'ticket_created':
        setTickets((prev) => [msg.ticket, ...prev]);
        break;
      case 'ticket_reply_sent':
        // Reload tickets to get updated messages
        post({ type: 'load_tickets' });
        break;
      // Admin messages
      case 'admin_tickets_loaded':
        setAdminTickets(msg.tickets);
        setAdminTicketsTotal(msg.total);
        setAdminTicketsLoading(false);
        break;
      case 'admin_proposals_loaded':
        setAdminProposals(msg.proposals);
        setAdminProposalsTotal(msg.total);
        setAdminProposalsLoading(false);
        break;
      case 'admin_proposal_updated':
        // Reload proposals
        post({ type: 'load_admin_proposals' });
        break;
      // BYOK messages
      case 'local_memories_loaded':
        setLocalMemories(msg.memories);
        break;
      case 'local_memory_deleted':
        setLocalMemories((prev) => prev.filter((m) => m.id !== msg.id));
        break;
      case 'local_memory_upserted':
        setLocalMemories((prev) => {
          const idx = prev.findIndex((m) => m.id === msg.memory.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = msg.memory;
            return updated;
          }
          return [msg.memory, ...prev];
        });
        break;
      case 'session_stats_loaded':
        setSessionStatsData(msg.stats);
        break;
      case 'usage_history_loaded':
        setUsageHistoryData(msg.data);
        break;
      // Task messages
      case 'tasks_loaded':
        setTasks(msg.tasks);
        break;
      case 'session_tasks_updated':
        setSessionTasks(msg.tasks);
        break;
      case 'task_upserted':
        setTasks((prev) => {
          const idx = prev.findIndex((t) => t.id === msg.task.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = msg.task;
            return updated;
          }
          return [msg.task, ...prev];
        });
        break;
      case 'task_deleted':
        setTasks((prev) => prev.filter((t) => t.id !== msg.id));
        break;
      case 'journal_day_loaded':
        setJournalDay(msg.day);
        break;
      case 'journal_day_updated':
        setJournalDay(msg.day);
        // Refresh calendar summaries after update/delete
        { const d = new Date(selectedJournalDate);
          const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
          const to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-31`;
          post({ type: 'load_journal_summaries', from, to });
        }
        break;
      case 'journal_summaries_loaded':
        setJournalSummaries(msg.summaries);
        break;
      case 'byok_support_sent':
        // Handled by Support page directly
        break;
      case 'learning_loaded':
        setLearningCurriculums(msg.curriculums);
        break;
      case 'curriculum_deleted':
        setLearningCurriculums(prev => prev.filter(c => c.id !== msg.id));
        break;
      case 'library_paths_loaded':
        setLibraryPaths(msg.paths);
        break;
      case 'library_path_detail_loaded':
        setLibraryPathDetail(msg.path);
        break;
      case 'library_path_forked':
        // Refresh learning list to show the new curriculum
        post({ type: 'load_learning' });
        break;
      case 'task_dates_loaded':
        setTaskDates(msg.dates);
        break;
      // Sync messages
      case 'sync_status':
        setSyncStatus(msg.data);
        break;
      case 'sync_started':
        setSyncingTypes(prev => new Set([...prev, msg.dataType]));
        setSyncResults(prev => { const next = { ...prev }; delete next[msg.dataType]; return next; });
        break;
      case 'sync_completed':
        setSyncingTypes(prev => { const next = new Set(prev); next.delete(msg.dataType); return next; });
        setSyncResults(prev => ({ ...prev, [msg.dataType]: { success: true, count: msg.count } }));
        break;
      case 'sync_error':
        setSyncingTypes(prev => { const next = new Set(prev); next.delete(msg.dataType); return next; });
        setSyncResults(prev => ({ ...prev, [msg.dataType]: { success: false, error: msg.message } }));
        break;
      case 'releases_loaded':
        setReleases(msg.releases);
        break;
      case 'library_loaded':
        setLibraryImages(msg.images);
        setLibraryProjectRoot(msg.projectRoot);
        setLibraryHasFolder(msg.hasFolder ?? true);
        break;
      case 'library_image_deleted':
        setLibraryImages(prev => prev.filter(i => i.path !== msg.path));
        break;
      // Avatar messages
      case 'avatar_loaded':
        setAvatarDataUrl(msg.dataUrl);
        break;
      case 'avatar_saved':
        setAvatarDataUrl(msg.dataUrl);
        break;
      case 'avatar_removed':
        setAvatarDataUrl('');
        break;
      // Personality messages
      case 'personality_loaded':
        setPersonalityData(msg.personality);
        break;
      case 'personality_saved':
        // Reload personality so sidebar header updates
        post({ type: 'load_personality' });
        break;
      case 'personality_reset':
        setPersonalityData(msg.personality);
        break;
      // Overview widget messages
      case 'weather_loaded':
        setWeatherData(msg.data);
        break;
      case 'news_loaded':
        setNewsArticles(msg.articles);
        break;
      case 'latest_release_loaded':
        setLatestRelease(msg.release);
        break;
      case 'error':
        setErrorMsg(msg.message);
        setTimeout(() => setErrorMsg(null), 5000);
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    post({ type: 'webview_ready' });
    // Initialise i18n from core locale strings
    initLocale().catch(() => {});
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Load data when navigating to pages
  useEffect(() => {
    if (page === 'history') {
      // Load session stats for everyone
      post({ type: 'load_session_stats' });
      // Load usage history for connected users
      if (account) {
        post({ type: 'load_usage_history' });
      }
      // Auto-refresh every 15 seconds while on this page
      const interval = setInterval(() => {
        post({ type: 'load_session_stats' });
        if (account) post({ type: 'load_usage_history' });
      }, 15_000);
      return () => clearInterval(interval);
    }
    if (page === 'support' && tickets.length === 0 && !ticketsLoading && account) {
      setTicketsLoading(true);
      post({ type: 'load_tickets' });
    }
    if (page === 'admin_support' && adminTickets.length === 0 && !adminTicketsLoading) {
      setAdminTicketsLoading(true);
      post({ type: 'load_admin_tickets' });
    }
    if (page === 'admin_proposals' && adminProposals.length === 0 && !adminProposalsLoading) {
      setAdminProposalsLoading(true);
      post({ type: 'load_admin_proposals' });
    }
    // Load learning when navigating to learning page
    if (page === 'learning') {
      post({ type: 'load_learning' });
    }
    // Load tasks when navigating to tasks page
    if (page === 'tasks') {
      if (tasks.length === 0) post({ type: 'load_tasks' });
      post({ type: 'load_session_tasks' });
    }
    // Load journal when navigating to journal page
    if (page === 'journal') {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const last = new Date(y, m + 1, 0).getDate();
      const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
      post({ type: 'load_journal_summaries', from, to });
      post({ type: 'load_journal_day', date: now.toISOString().slice(0, 10) });
    }
    // Load sync status when navigating to sync page
    if (page === 'sync') {
      post({ type: 'load_sync_status' });
    }
    // Load overview widget data
    if (page === 'overview') {
      post({ type: 'load_tasks' });
      post({ type: 'load_learning' });
      post({ type: 'load_journal_day', date: new Date().toISOString().slice(0, 10) });
      post({ type: 'load_weather' });
      post({ type: 'load_news' });
      post({ type: 'load_latest_release' });
      if (account) {
        post({ type: 'load_memories' });
      } else {
        post({ type: 'load_local_memories' });
      }
    }
    // BYOK: refresh session stats when viewing usage or overview
    if ((page === 'usage' || page === 'overview') && byokMode && !account) {
      post({ type: 'load_session_stats' });
    }
    // Load library images when navigating to library page
    if (page === 'library') {
      post({ type: 'load_library' });
    }
    if (page === 'learning-library') {
      post({ type: 'load_library_paths' });
    }
    // Load personality when navigating to personality page
    if (page === 'personality') {
      post({ type: 'load_personality' });
    }
    // Load avatar when navigating to settings
    if (page === 'settings' || page === 'keys') {
      post({ type: 'load_avatar' });
    }
  }, [page]);

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  const hasAccess = Boolean(account) || byokMode;

  // If no access and page is 'chat', show connect page instead of blank screen
  const effectivePage = (!hasAccess && page === 'chat') ? 'connect' : page;

  function handleSkipAccount() {
    setByokMode(true);
    setPagePersist('overview');
    post({ type: 'skip_account' });
  }

  function handleConnectAccount() {
    setByokMode(false);
    setPagePersist('overview');
  }

  const renderPage = () => {
    if (!hasAccess) {
      return <ConnectAccount onSkipAccount={handleSkipAccount} />;
    }
    const mode = account ? 'platform' as const : 'byok' as const;
    switch (page) {
      case 'chat':
        return null; // Chat is rendered separately (always mounted)

      // ── Consolidated pages ──────────────────────────────────────────
      case 'planner':
      case 'tasks':
      case 'journal':
      case 'learning':
        return (
          <Planner
            tasks={tasks}
            sessionTasks={sessionTasks}
            journalDay={journalDay}
            journalDate={selectedJournalDate}
            userName={account?.name?.split(' ')[0] ?? null}
            onSaveJournalEntry={(date, content, mood, tags) => post({ type: 'save_journal_user_entry', date, content, mood, tags })}
            onDeleteUserEntry={(date) => post({ type: 'delete_journal_user_entry', date })}
            onDeleteAvaEntry={(date) => post({ type: 'delete_journal_ava_entry', date })}
            learningCurriculums={learningCurriculums}
          />
        );

      case 'account':
      case 'settings':
      case 'billing':
      case 'connections':
      case 'personality':
      case 'sync':
      case 'keys':
        return (
          <AccountPage
            settings={settings}
            onSettingsChange={setSettings}
            providerKeys={providerKeys}
            onNavigate={setPagePersist}
            personality={personalityData}
            account={account}
            avatarDataUrl={avatarDataUrl}
            connections={connections}
            syncStatus={syncStatus}
            syncingTypes={syncingTypes}
            syncResults={syncResults}
            isPlatform={!!account}
          />
        );

      case 'help':
      case 'support':
      case 'releases':
      case 'roadmap':
        return (
          <HelpPage
            tickets={tickets}
            ticketsLoading={ticketsLoading}
            releases={releases}
            mode={mode}
          />
        );

      // ── Standalone pages ────────────────────────────────────────────
      case 'overview':
        return <Overview account={account} connections={connections} onNavigate={setPagePersist} logs={usageLogs} sessionStats={sessionStatsData} mode={mode} tasks={tasks} journalDay={journalDay} learningCurriculums={learningCurriculums} memories={account ? memories : localMemories} memoryTotal={account ? memoryTotal : undefined} weatherData={weatherData} newsArticles={newsArticles} latestRelease={latestRelease} />;
      case 'usage':
        return <Usage account={account} logs={usageLogs} sessionStats={sessionStatsData} mode={mode} />;
      case 'memory':
        return <Memory memories={account ? memories : localMemories} mode={mode} serverTotal={account ? memoryTotal : undefined} serverHasMore={account ? memoryHasMore : undefined} />;
      case 'history':
        return <History sessionStats={sessionStatsData} usageHistory={usageHistoryData} mode={account ? 'platform' : 'byok'} account={account} />;
      case 'library':
        return <Library images={libraryImages} projectRoot={libraryProjectRoot} hasImagesFolder={libraryHasFolder} />;
      case 'learning-library':
        return <LearningLibrary paths={libraryPaths} detail={libraryPathDetail} onNavigate={setPagePersist} />;

      // ── Admin ───────────────────────────────────────────────────────
      case 'admin_support':
        return <AdminSupport tickets={adminTickets} total={adminTicketsTotal} loading={adminTicketsLoading} />;
      case 'admin_proposals':
        return <AdminProposals proposals={adminProposals} total={adminProposalsTotal} loading={adminProposalsLoading} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden text-sm">
      {/* Sidebar — uses CSS order to flip sides without remounting */}
      {hasAccess && !sidebarCollapsed && (
        <div style={{ order: sidebarSide === 'left' ? 0 : 2 }}>
          <NavSidebar
            currentPage={page}
            onNavigate={setPagePersist}
            mode={account ? 'platform' : 'byok'}
            email={account?.email}
            isAdmin={account?.tier === 'admin'}
            onConnectAccount={handleConnectAccount}
            aiName={personalityData?.name}
            journalSummaries={journalSummaries}
            selectedJournalDate={selectedJournalDate}
            onSelectJournalDate={(date) => {
              setSelectedJournalDate(date);
              post({ type: 'load_journal_day', date });
            }}
            onLoadJournalSummaries={(from, to) => post({ type: 'load_journal_summaries', from, to })}
            taskDates={taskDates}
            onLoadTaskDates={() => post({ type: 'load_task_dates' })}
            onToggleSidebar={toggleSidebar}
            onFlipSidebar={flipSidebar}
            sidebarSide={sidebarSide}
            onNewChat={() => post({ type: 'new_chat' })}
            onOpenHistory={() => post({ type: 'request_history' })}
          />
        </div>
      )}

      {/* Chat page — always mounted to preserve state, hidden when not active */}
      {hasAccess && (
        <div className={`flex-1 overflow-hidden ${effectivePage === 'chat' ? '' : 'hidden'}`} style={{ order: 1, height: '100%' }}>
          <Chat
            onRegisterDispatch={registerChatDispatch}
            isActive={page === 'chat'}
            onToggleSidebar={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
            onFlipSidebar={flipSidebar}
            sidebarSide={sidebarSide}
          />
        </div>
      )}

      {/* Other pages */}
      {effectivePage !== 'chat' && (
        <main className="flex-1 overflow-y-auto p-8" style={{ order: 1 }}>
          {errorMsg && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">
              {errorMsg}
            </div>
          )}
          {renderPage()}
        </main>
      )}
    </div>
  );
}
