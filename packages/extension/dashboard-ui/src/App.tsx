import { useState, useEffect, useCallback, useRef } from 'react';
import { initLocale, useLocale } from './i18n';
import { post } from './vscode';

import { NavSidebar } from './components/NavSidebar';
import { ConnectAccount } from './pages/ConnectAccount';
import { Overview } from './pages/Overview';
import { Usage } from './pages/Usage';
import { Memory } from './pages/Memory';
import { History } from './pages/History';
import { Library } from './pages/Library';
import { Chat } from './pages/Chat';
import { Planner } from './pages/Planner';
// LearningLibrary is no longer rendered directly — it's composed inside
// the unified Library page as the Courses tab.
import { CreativeStudio } from './pages/CreativeStudio';
import { AccountPage } from './pages/AccountPage';
import { HelpPage } from './pages/HelpPage';
import { DocumentationPage } from './pages/DocumentationPage';
import { ModelsPage } from './pages/Models';
import { ArticleReader } from './pages/ArticleReader';
import type { FullArticle, RelatedArticle } from './pages/ArticleReader';
import { Health } from './pages/Health';
import type {
  Page,
  AccountInfo,
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
  LibraryPaper,
  PapersTab,
  PaperDiscipline,
  HealthExerciseSummary,
  HealthExerciseDetail,
  HealthRecipeSummary,
  HealthRecipeDetail,
  CreativeAsset,
  PersonalityData,
  RoadmapTheme,
} from './types/messages';

export { post };

export function App() {
  useLocale(); // re-render on language change
  const [initialized, setInitialized] = useState(false);
  const [page, setPage] = useState<Page>('overview');

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
    // Clear article reader when navigating away from overview
    if (p !== 'overview') {
      setActiveArticle(null);
      setActiveArticleRelated([]);
      setArticleLoading(false);
    }
  };
  const [account, setAccount] = useState<AccountInfo | null>(null);
  /** True when init said the user has a platform key but the account
   *  snapshot hasn't arrived yet. Drives skeleton placeholders in
   *  account-dependent surfaces (NavSidebar account block, Billing
   *  tab) instead of flashing "Connect" buttons during the network
   *  round-trip. Cleared when account_updated arrives, regardless of
   *  whether the snapshot itself is null. */
  const [accountLoading, setAccountLoading] = useState(false);
  // OAuth sign-in state (v0.37.0) — tracks in-flight attempts from the
  // ConnectAccount screen so it can show the pending spinner and errors.
  const [signInPending, setSignInPending] = useState<'github' | 'email' | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
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
    loopPreventionEnabled: true,
  });
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [memoryTotal, setMemoryTotal] = useState(0);
  const [memoryHasMore, setMemoryHasMore] = useState(false);
  const [providerKeys, setProviderKeys] = useState<ProviderKeyStatus>({
    anthropic: false, deepseek: false, kimi: false, glm: false, qwen: false, mistral: false, xiaomi: false,
  });
  const [usageLogs, setUsageLogs] = useState<UsageLogEntry[]>([]);
  const [conversations, setConversations] = useState<ConversationEntry[]>([]);
  const [, setConversationsLoading] = useState(false);
  const [, setTickets] = useState<SupportTicket[]>([]);
  const [, setTicketsLoading] = useState(false);
  const [byokMode, setByokMode] = useState(false);
  const [localMemories, setLocalMemories] = useState<MemoryEntry[]>([]);
  const [tasks, setTasks] = useState<DashboardTaskEntry[]>(() => {
    try { const saved = localStorage.getItem('ava-dash-tasks'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [sessionTasks, setSessionTasks] = useState<Array<{ id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }>>([]);
  const [journalDay, setJournalDay] = useState<DashboardJournalDay | null>(null);
  const [journalSummaries, setJournalSummaries] = useState<DashboardJournalDaySummary[]>([]);
  const [selectedJournalDate, setSelectedJournalDate] = useState(() => new Date().toISOString().slice(0, 10));
  // When the user picks a day on the sidebar mini-calendar, we navigate
  // to the Planner AND want it to land on the Journal tab (not Tasks,
  // which is Planner's default). This counter ticks on every calendar
  // pick; Planner watches it with useEffect to switch tab. A counter
  // rather than a boolean so re-clicking the same date still triggers
  // the switch (boolean would deduplicate).
  const [plannerJournalNavTick, setPlannerJournalNavTick] = useState(0);
  const [sessionStatsData, setSessionStatsData] = useState<SessionStats | null>(null);
  const [usageHistoryData, setUsageHistoryData] = useState<UsageHistoryData | null>(null);
  const [learningCurriculums, setLearningCurriculums] = useState<DashboardLearningCurriculum[]>(() => {
    try { const saved = localStorage.getItem('ava-dash-learning'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [libraryPaths, setLibraryPaths] = useState<LibraryPath[]>([]);
  const [libraryPathDetail, setLibraryPathDetail] = useState<LibraryPathDetail | null>(null);
  // Library → Papers state. Three sub-tabs cached independently so
  // switching tabs doesn't refetch already-loaded data.
  const [papersByTab, setPapersByTab] = useState<Record<PapersTab, LibraryPaper[]>>({
    featured: [], trending: [], latest: [],
  });
  const [paperSearchResults, setPaperSearchResults] = useState<LibraryPaper[]>([]);
  const [paperSearchLoading, setPaperSearchLoading] = useState(false);
  const [paperSearchQuery, setPaperSearchQuery] = useState('');
  // Per-tab loading. Set when load_papers fires, cleared when
  // papers_loaded comes back. Shown as a spinner in the LibraryPapers
  // list area so the user sees something between click and render.
  const [papersTabLoading, setPapersTabLoading] = useState<Record<PapersTab, boolean>>({
    featured: false, trending: false, latest: false,
  });

  // useCallback for the Papers handlers — LibraryPapers.tsx has
  // useEffects that depend on these references. Inline arrow props
  // get a new identity every render, which would refire the effect
  // every render, triggering a load loop and a flickering spinner.
  // Stable refs across renders fix that. setState updaters are stable
  // by design so no extra deps required.
  const handleLoadPapers = useCallback((tab: PapersTab, discipline?: PaperDiscipline) => {
    setPapersTabLoading(prev => ({ ...prev, [tab]: true }));
    post({ type: 'load_papers', tab, discipline });
    // Safety net — clear after 15s even if papers_loaded never arrives.
    window.setTimeout(() => {
      setPapersTabLoading(prev => prev[tab] ? { ...prev, [tab]: false } : prev);
    }, 15000);
  }, []);
  const handleSearchPapers = useCallback((query: string, discipline?: PaperDiscipline) => {
    setPaperSearchLoading(true);
    setPaperSearchQuery(query);
    post({ type: 'search_papers', query, discipline });
  }, []);
  const handleClearPaperSearch = useCallback(() => {
    setPaperSearchResults([]);
    setPaperSearchQuery('');
    setPaperSearchLoading(false);
  }, []);
  // Detail enrichment for the paper-card modal. Featured/trending/latest
  // list rows are slim — the platform DB carries the full record (long
  // abstract, oa_pdf_url, primary_url, etc). Without this round-trip the
  // modal just renders whatever sparse fields the list happened to
  // carry, which is why clicking a card felt like nothing loaded.
  const [paperDetail, setPaperDetail] = useState<LibraryPaper | null>(null);
  const [paperDetailLoading, setPaperDetailLoading] = useState(false);

  // Health library — exercises + recipes browse. Paginated server-side
  // because the initial all-rows fetch took multiple seconds on the
  // extension surface. Page state lives here so the Health page can
  // ask for prev/next slices without re-mounting.
  const [healthExercises, setHealthExercises] = useState<HealthExerciseSummary[]>([]);
  const [healthRecipes, setHealthRecipes] = useState<HealthRecipeSummary[]>([]);
  const [healthExercisesTotal, setHealthExercisesTotal] = useState(0);
  const [healthRecipesTotal, setHealthRecipesTotal] = useState(0);
  const [healthExercisesOffset, setHealthExercisesOffset] = useState(0);
  const [healthRecipesOffset, setHealthRecipesOffset] = useState(0);
  const [healthExercisesLoading, setHealthExercisesLoading] = useState(false);
  const [healthRecipesLoading, setHealthRecipesLoading] = useState(false);
  const [healthExerciseDetail, setHealthExerciseDetail] = useState<HealthExerciseDetail | null>(null);
  const [healthRecipeDetail, setHealthRecipeDetail] = useState<HealthRecipeDetail | null>(null);
  const [healthDetailLoading, setHealthDetailLoading] = useState(false);
  // Roadmap — fetched from /api/roadmap via the host, single source
  // of truth shared with the public web roadmap, the IDE Roadmap
  // page, and the Hub admin editor.
  const [roadmapThemes, setRoadmapThemes] = useState<RoadmapTheme[]>([]);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const handleLoadPaperDetail = useCallback((id: string) => {
    setPaperDetailLoading(true);
    setPaperDetail(null);
    post({ type: 'load_paper_detail', id });
  }, []);
  const handleClearPaperDetail = useCallback(() => {
    setPaperDetail(null);
    setPaperDetailLoading(false);
  }, []);
  // Health handlers — same pattern as Papers: handler sets loading and
  // posts the load message; safety-net timeout clears loading if the
  // host never responds. limit/offset come from the Health page; we
  // forward as-is.
  const handleLoadHealthExercises = useCallback((limit?: number, offset?: number, workoutType?: string) => {
    setHealthExercisesLoading(true);
    post({ type: 'load_health_exercises', limit, offset, workoutType });
    window.setTimeout(() => setHealthExercisesLoading(false), 15000);
  }, []);
  const handleLoadHealthRecipes = useCallback((limit?: number, offset?: number, course?: string) => {
    setHealthRecipesLoading(true);
    post({ type: 'load_health_recipes', limit, offset, course });
    window.setTimeout(() => setHealthRecipesLoading(false), 15000);
  }, []);
  const handleLoadHealthExerciseDetail = useCallback((slug: string) => {
    setHealthDetailLoading(true);
    setHealthExerciseDetail(null);
    post({ type: 'load_health_exercise_detail', slug });
    window.setTimeout(() => setHealthDetailLoading(false), 15000);
  }, []);
  const handleLoadHealthRecipeDetail = useCallback((slug: string) => {
    setHealthDetailLoading(true);
    setHealthRecipeDetail(null);
    post({ type: 'load_health_recipe_detail', slug });
    window.setTimeout(() => setHealthDetailLoading(false), 15000);
  }, []);

  const handleReadPaperWithAva = useCallback((paper: LibraryPaper) => {
    post({ type: 'read_paper_with_ava', paper });
    // Switch the dashboard to the Chat page so the user lands on the
    // conversation Ava is about to start instead of staring at the
    // Library tab while the primer fires off-screen.
    setPagePersist('chat');
  }, []);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Live chat support state
  const [supportConversations, setSupportConversations] = useState<any[]>([]);
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);
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
  const [libraryCloudAssets, setLibraryCloudAssets] = useState<CreativeAsset[]>([]);
  // Non-blocking loading indicator. The Library grid renders whatever
  // it has immediately and shows an inline "Pulling cloud assets…" pill
  // alongside while the fetch is in flight. Hard 15s safety timeout
  // makes sure the indicator can't get stuck if a response is missed —
  // 15s is comfortably above apiFetch's 10s network timeout, so any
  // legitimate fetch will resolve via the response handler first.
  const [libraryCloudAssetsLoading, setLibraryCloudAssetsLoading] = useState(false);
  const libraryLoadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beginLibraryLoad = useCallback(() => {
    setLibraryCloudAssetsLoading(true);
    if (libraryLoadingTimeoutRef.current) clearTimeout(libraryLoadingTimeoutRef.current);
    libraryLoadingTimeoutRef.current = setTimeout(() => {
      setLibraryCloudAssetsLoading(false);
      libraryLoadingTimeoutRef.current = null;
    }, 15_000);
  }, []);
  // Stable ref for Library's Assets/Documents reload button. The
  // Library component has a useEffect that depends on this — inline
  // arrow at the JSX call site would refire that effect every render
  // and cause the loading pill to flicker. Declared here, after
  // beginLibraryLoad, so the dep reference is in scope.
  const handleReloadCloudAssets = useCallback(() => {
    beginLibraryLoad();
    post({ type: 'load_cloud_assets' });
  }, [beginLibraryLoad]);
  const finishLibraryLoad = useCallback(() => {
    setLibraryCloudAssetsLoading(false);
    if (libraryLoadingTimeoutRef.current) {
      clearTimeout(libraryLoadingTimeoutRef.current);
      libraryLoadingTimeoutRef.current = null;
    }
  }, []);
  // Personality state
  const [personalityData, setPersonalityData] = useState<PersonalityData | null>(() => {
    try { const saved = localStorage.getItem('ava-dash-personality'); return saved ? JSON.parse(saved) : null; } catch { return null; }
  });
  // Avatar state
  const [avatarDataUrl, setAvatarDataUrl] = useState('');
  // Task calendar dates
  const [taskDates, setTaskDates] = useState<string[]>([]);
  // Overview widget state
  const [weatherData, setWeatherData] = useState<{ location: string; temp_c: number; condition: string; emoji: string; humidity: number; wind_kmph: number; forecast: Array<{ date: string; day: string; max_c: number; min_c: number; condition: string; emoji: string }> } | null>(null);
  const [newsArticles, setNewsArticles] = useState<Array<{ title: string; category: string; reading_time: number; slug: string; date: string }>>([]);
  const [latestRelease, setLatestRelease] = useState<{ version: string; title: string; published_at: string } | null>(null);
  // Audit log state
  const [auditLog, setAuditLog] = useState<Array<{ timestamp: string; toolName: string; category: string; riskLevel: string; approvalMethod: string; status: string; argsSummary: string; fullArgs?: Record<string, unknown>; result?: string }>>([]);
  // Article reader state
  const [activeArticle, setActiveArticle] = useState<FullArticle | null>(null);
  const [activeArticleRelated, setActiveArticleRelated] = useState<RelatedArticle[]>([]);
  const [articleLoading, setArticleLoading] = useState(false);

  // ── Local-first persistence ─────────────────────────────────────────────
  useEffect(() => { try { localStorage.setItem('ava-dash-tasks', JSON.stringify(tasks)); } catch {} }, [tasks]);
  useEffect(() => { if (learningCurriculums.length > 0) { try { localStorage.setItem('ava-dash-learning', JSON.stringify(learningCurriculums)); } catch {} } }, [learningCurriculums]);
  useEffect(() => { if (journalDay) { try { localStorage.setItem(`ava-dash-journal-${selectedJournalDate}`, JSON.stringify(journalDay)); } catch {} } }, [journalDay, selectedJournalDate]);
  useEffect(() => { if (personalityData) { try { localStorage.setItem('ava-dash-personality', JSON.stringify(personalityData)); } catch {} } }, [personalityData]);

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
        // accountLoading is true when we have a key but no account yet —
        // sendInit posts init with account=null and fetches the account
        // in the background, so this fires the skeleton immediately.
        setAccountLoading(Boolean((msg as any).platformKey) && !msg.account);
        if (!msg.account && !((msg as any).platformKey) && Object.values(msg.providerKeys).some(Boolean)) {
          setByokMode(true);
        }
        // Store key in memory only (not localStorage) for Creative Studio API calls
        if ((msg as any).platformKey) {
          (window as any).__avaPlatformKey = (msg as any).platformKey;
        } else {
          delete (window as any).__avaPlatformKey;
        }
        localStorage.removeItem('ava-platform-key');
        setInitialized(true);
        // Load avatar on startup so sidebar shows it immediately
        post({ type: 'load_avatar' });
        break;
      case 'account_updated':
        setAccount(msg.account);
        setAccountLoading(false);
        if (!msg.account && Object.values(providerKeys).some(Boolean)) {
          setByokMode(true);
        }
        break;

      // ── OAuth sign-in events (v0.37.0) ──────────────────────────────
      case 'sign_in_started':
        // Confirmation from the extension host that the browser was opened.
        // Usually we've already optimistically set the pending state when
        // the user clicked the button — this just ensures consistency.
        if (!signInPending) setSignInPending('github');
        setSignInError(null);
        break;
      case 'sign_in_complete':
        setSignInPending(null);
        setSignInError(null);
        // Set the account directly from the sign-in completion event —
        // this is what flips hasAccess from false to true and transitions
        // the dashboard out of the ConnectAccount screen. Without this
        // the user would see the sign-in page forever until manual reload.
        if (msg.account) {
          setAccount(msg.account as AccountInfo);
        }
        // Also tell DashboardPanel to refresh from the server so we get
        // the full account data (tier, usage, etc.) that the exchange
        // endpoint's minimal account payload might not include.
        post({ type: 'refresh_account' });
        break;
      case 'sign_in_failed':
        setSignInPending(null);
        setSignInError(msg.error);
        break;
      case 'sign_in_cancelled':
        setSignInPending(null);
        setSignInError(null);
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
        setTasks(prev => {
          const cloudIds = new Set(msg.tasks.map((t: any) => t.id));
          const localOnly = prev.filter(t => !cloudIds.has(t.id));
          return [...msg.tasks, ...localOnly];
        });
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
        if (msg.day) {
          setJournalDay(msg.day);
        } else {
          // No cloud data — try localStorage
          try {
            const local = localStorage.getItem(`ava-dash-journal-${selectedJournalDate}`);
            if (local) setJournalDay(JSON.parse(local));
            else setJournalDay(null);
          } catch { setJournalDay(null); }
        }
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
      // Live chat support
      case 'support_conversations_loaded':
        setSupportConversations(msg.conversations);
        setSupportLoading(false);
        break;
      case 'support_messages_loaded':
        setSupportMessages(msg.messages);
        setActiveConversationId(msg.conversationId);
        break;
      case 'support_conversation_started':
        setActiveConversationId(msg.conversation.id);
        break;
      case 'support_message_sent':
        // Message sent — will be refreshed via loadSupportMessages
        break;
      case 'support_chat_cleared':
        setSupportMessages([]);
        setActiveConversationId(null);
        break;
      case 'support_unread_count':
        setSupportUnread(msg.count);
        break;
      case 'learning_loaded':
        setLearningCurriculums(prev => {
          const cloudIds = new Set(msg.curriculums.map((c: any) => c.id));
          const localOnly = prev.filter(c => !cloudIds.has(c.id));
          return [...msg.curriculums, ...localOnly];
        });
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
      case 'papers_loaded':
        setPapersByTab(prev => ({ ...prev, [msg.tab]: msg.papers }));
        setPapersTabLoading(prev => ({ ...prev, [msg.tab]: false }));
        break;
      case 'papers_search_results':
        setPaperSearchResults(msg.papers);
        setPaperSearchQuery(msg.query);
        setPaperSearchLoading(false);
        break;
      case 'paper_detail_loaded':
        // Null = host couldn't find the row (curated paper deleted, or
        // the id was an OpenAlex result with no DB record). Modal falls
        // back to the slim list-row data in that case.
        setPaperDetail(msg.paper);
        setPaperDetailLoading(false);
        break;
      case 'health_exercises_loaded':
        setHealthExercises(msg.exercises);
        setHealthExercisesTotal(msg.total);
        setHealthExercisesOffset(msg.offset);
        setHealthExercisesLoading(false);
        break;
      case 'health_recipes_loaded':
        setHealthRecipes(msg.recipes);
        setHealthRecipesTotal(msg.total);
        setHealthRecipesOffset(msg.offset);
        setHealthRecipesLoading(false);
        break;
      case 'health_exercise_detail_loaded':
        setHealthExerciseDetail(msg.exercise);
        setHealthDetailLoading(false);
        break;
      case 'health_recipe_detail_loaded':
        setHealthRecipeDetail(msg.recipe);
        setHealthDetailLoading(false);
        break;
      case 'roadmap_loaded':
        // Empty themes = network/upstream failure; the Roadmap surface
        // shows an "empty roadmap" state, not a broken loader.
        setRoadmapThemes(msg.themes);
        setRoadmapLoading(false);
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
      case 'cloud_assets_loaded':
        setLibraryCloudAssets(msg.assets);
        finishLibraryLoad();
        break;
      case 'cloud_assets_error':
        // Logged on the host side; UI keeps whatever it had and the
        // pill goes away.
        finishLibraryLoad();
        break;
      case 'cloud_asset_deleted':
        setLibraryCloudAssets(prev => prev.filter(a => a.id !== msg.id));
        break;
      case 'library_image_deleted':
        setLibraryImages(prev => prev.filter(i => i.path !== msg.path));
        break;
      case 'creative_asset_created': {
        // Agent generated a creative asset — register in Creative Studio's local store
        const asset = (msg as any).asset;
        if (asset) {
          try {
            const saved = localStorage.getItem('ava-creative-assets');
            const assets = saved ? JSON.parse(saved) : [];
            assets.unshift({
              id: `${asset.type}_${Date.now()}`,
              type: asset.type,
              asset_type: asset.type,
              title: asset.path?.split(/[/\\]/).pop() || 'Untitled',
              prompt: asset.prompt || '',
              url: asset.dataUri || (asset.absolutePath ? `file://${asset.absolutePath}` : ''),
              created_at: new Date().toISOString(),
              path: asset.path,
              size: asset.size,
            });
            localStorage.setItem('ava-creative-assets', JSON.stringify(assets));
            // Signal open Creative Studio pages to re-read localStorage —
            // the native 'storage' event only fires cross-tab, not in the
            // tab that wrote, so we need our own bus.
            window.dispatchEvent(new CustomEvent('ava-creative-assets-updated'));
          } catch { /* quota */ }
          // Also trigger a library refresh so the Library page picks it up
          post({ type: 'load_library' } as any);
        }
        break;
      }
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
      case 'news_article_loaded':
        if (msg.loading) {
          setArticleLoading(true);
        } else {
          setArticleLoading(false);
          if (msg.post) {
            setActiveArticle(msg.post as unknown as FullArticle);
            setActiveArticleRelated((msg.related || []) as unknown as RelatedArticle[]);
            setPagePersist('overview'); // stay on overview — reader overlays it
          }
        }
        break;
      case 'audit_log':
        setAuditLog((msg as any).entries || []);
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

  // Re-fetch account info whenever the webview becomes visible — covers
  // the "upgraded on the website in a browser tab, came back to VSCode"
  // flow so tier / token allowance reflects the new plan without waiting
  // for the user to navigate to the Billing tab.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        post({ type: 'refresh_account' });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Load data when navigating to pages
  useEffect(() => {
    if (page === 'history') {
      // Load session stats for everyone
      post({ type: 'load_session_stats' });
      // Load conversations for the Conversations tab
      post({ type: 'load_conversations' });
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
    if ((page === 'support' || page === 'help') && supportConversations.length === 0 && !supportLoading) {
      setSupportLoading(true);
      post({ type: 'load_support_conversations' });
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
    // Unified Library — load all three data sources when the page opens.
    // Cloud assets and local images power the Assets / Documents tabs;
    // courses power the Courses tab.
    if (page === 'library') {
      post({ type: 'load_library' });
      beginLibraryLoad();
      post({ type: 'load_cloud_assets' });
      post({ type: 'load_library_paths' });
    }
    // Back-compat: 'learning-library' is the legacy nav target. Any
    // bookmarked / persisted page value that still points here redirects
    // to the unified Library, which defaults its tab to Assets but keeps
    // Courses one click away.
    if (page === 'learning-library') {
      setPagePersist('library');
    }
    // Load personality when navigating to personality page
    if (page === 'personality') {
      post({ type: 'load_personality' });
    }
    // Load avatar when navigating to settings
    if (page === 'settings' || page === 'keys') {
      post({ type: 'load_avatar' });
    }
    // Roadmap fetch — single source of truth on /api/roadmap.
    // Triggered when the user lands on any of the Help-page tabs
    // (the Roadmap sub-tab lives there). Cheap to refire — host
    // request is cached server-side and the UI shows the current
    // themes immediately, then swaps in the fresh response.
    if (page === 'help' || page === 'support' || page === 'releases' || page === 'roadmap') {
      setRoadmapLoading(true);
      post({ type: 'load_roadmap' });
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

  // If no access and page is 'chat', show overview instead of blank screen
  const effectivePage = (!hasAccess && page === 'chat') ? 'overview' : page;

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
      return (
        <ConnectAccount
          onSkipAccount={handleSkipAccount}
          pendingSignIn={signInPending}
          signInError={signInError}
          onClearSignInError={() => setSignInError(null)}
          onStartSignIn={(method) => {
            // Optimistic pending state so the UI flips instantly rather
            // than waiting for the round-trip sign_in_started event
            setSignInPending(method);
            setSignInError(null);
            post({ type: 'start_sign_in', method });
          }}
        />
      );
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
            journalNavTick={plannerJournalNavTick}
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
            releases={releases}
            mode={mode}
            supportConversations={supportConversations}
            supportMessages={supportMessages}
            activeConversationId={activeConversationId}
            supportLoading={supportLoading}
            supportUnread={supportUnread}
            roadmapThemes={roadmapThemes}
            roadmapLoading={roadmapLoading}
          />
        );

      case 'documentation':
        return <DocumentationPage />;

      case 'models':
        return <ModelsPage />;

      // ── Standalone pages ────────────────────────────────────────────
      case 'overview':
        if (activeArticle) {
          return (
            <ArticleReader
              article={activeArticle}
              related={activeArticleRelated}
              onBack={() => { setActiveArticle(null); setActiveArticleRelated([]); }}
              onNavigateToArticle={(slug) => {
                setActiveArticle(null);
                setArticleLoading(true);
                post({ type: 'load_news_article', slug });
              }}
            />
          );
        }
        return <Overview account={account} connections={connections} onNavigate={setPagePersist} logs={usageLogs} sessionStats={sessionStatsData} mode={mode} tasks={tasks} journalDay={journalDay} learningCurriculums={learningCurriculums} memories={account ? memories : localMemories} memoryTotal={account ? memoryTotal : undefined} weatherData={weatherData} newsArticles={newsArticles} latestRelease={latestRelease} articleLoading={articleLoading} onOpenArticle={(slug) => { setArticleLoading(true); post({ type: 'load_news_article', slug }); }} />;
      case 'usage':
        return <Usage account={account} logs={usageLogs} sessionStats={sessionStatsData} mode={mode} activeModel={settings.activeModel} />;
      case 'memory':
        return <Memory memories={account ? memories : localMemories} mode={mode} serverTotal={account ? memoryTotal : undefined} serverHasMore={account ? memoryHasMore : undefined} />;
      case 'history':
        return <History sessionStats={sessionStatsData} usageHistory={usageHistoryData} mode={account ? 'platform' : 'byok'} account={account} auditLog={auditLog} conversations={conversations} />;
      case 'library':
        return (
          <Library
            paths={libraryPaths}
            pathDetail={libraryPathDetail}
            onNavigate={setPagePersist}
            papersByTab={papersByTab}
            papersTabLoading={papersTabLoading}
            paperSearchResults={paperSearchResults}
            paperSearchLoading={paperSearchLoading}
            paperSearchQuery={paperSearchQuery}
            onLoadPapers={handleLoadPapers}
            onSearchPapers={handleSearchPapers}
            onClearPaperSearch={handleClearPaperSearch}
            onReadPaperWithAva={handleReadPaperWithAva}
            paperDetail={paperDetail}
            paperDetailLoading={paperDetailLoading}
            onLoadPaperDetail={handleLoadPaperDetail}
            onClearPaperDetail={handleClearPaperDetail}
            cloudAssets={libraryCloudAssets}
            cloudAssetsLoading={libraryCloudAssetsLoading}
            onReloadCloudAssets={handleReloadCloudAssets}
            images={libraryImages}
            projectRoot={libraryProjectRoot}
            hasImagesFolder={libraryHasFolder}
          />
        );
      // 'learning-library' is redirected to 'library' in the page-change
      // effect above — this case is kept only to satisfy the type switch
      // for any stale persisted value on its way to redirect.
      case 'learning-library':
        return null;
      case 'creative-studio':
        return <CreativeStudio account={account} />;
      case 'health':
        return (
          <Health
            exercises={healthExercises}
            recipes={healthRecipes}
            exercisesTotal={healthExercisesTotal}
            recipesTotal={healthRecipesTotal}
            exercisesOffset={healthExercisesOffset}
            recipesOffset={healthRecipesOffset}
            exercisesLoading={healthExercisesLoading}
            recipesLoading={healthRecipesLoading}
            exerciseDetail={healthExerciseDetail}
            recipeDetail={healthRecipeDetail}
            detailLoading={healthDetailLoading}
            onLoadExercises={handleLoadHealthExercises}
            onLoadRecipes={handleLoadHealthRecipes}
            onLoadExerciseDetail={handleLoadHealthExerciseDetail}
            onLoadRecipeDetail={handleLoadHealthRecipeDetail}
          />
        );
    }
  };

  return (
    <div className="flex h-screen overflow-hidden text-sm">
      {/* Sidebar — always rendered. When `sidebarCollapsed` is true the
          component renders a narrow icon rail so users can still navigate
          without first expanding. CSS order flips it between left/right. */}
      <div style={{ order: sidebarSide === 'left' ? 0 : 2 }}>
        <NavSidebar
          currentPage={page}
          onNavigate={setPagePersist}
          mode={account && !byokMode ? 'platform' : 'byok'}
          email={account?.email}
          isAdmin={account?.tier === 'admin'}
          tier={account?.tier}
          byokMode={byokMode}
          onSetByokMode={setByokMode}
          accountLoading={accountLoading}
          onConnectAccount={handleConnectAccount}
          aiName={personalityData?.name}
          journalSummaries={journalSummaries}
          selectedJournalDate={selectedJournalDate}
          onSelectJournalDate={(date) => {
            setSelectedJournalDate(date);
            post({ type: 'load_journal_day', date });
            // Tick so Planner switches to its Journal tab. Without this,
            // the Planner defaults to Tasks and the operator sees no
            // visible response to the calendar click — the date IS
            // updated, just on a tab they can't see.
            setPlannerJournalNavTick(n => n + 1);
          }}
          onLoadJournalSummaries={(from, to) => post({ type: 'load_journal_summaries', from, to })}
          taskDates={taskDates}
          onLoadTaskDates={() => post({ type: 'load_task_dates' })}
          onToggleSidebar={toggleSidebar}
          onFlipSidebar={flipSidebar}
          sidebarSide={sidebarSide}
          onNewChat={() => post({ type: 'new_chat' })}
          // History is a sidebar nav entry now (matches IDE chat).
          // Route to the History page rather than opening a slide-over
          // inside the chat surface.
          onOpenHistory={() => setPagePersist('history')}
          supportUnread={supportUnread}
          avatarUrl={avatarDataUrl}
          collapsed={sidebarCollapsed}
        />
      </div>


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
            onNavigate={setPagePersist}
            userName={account?.name?.split(' ')[0] ?? null}
            userAvatarUrl={account?.avatar_url ?? null}
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
