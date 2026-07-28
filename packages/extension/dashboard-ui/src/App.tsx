import { useState, useEffect, useCallback, useRef } from 'react';
import { initLocale, useLocale, getLocale } from './i18n';
import { post } from './vscode';

import { NavSidebar } from './components/NavSidebar';
import { DashboardTopBar } from './components/DashboardTopBar';
import { WelcomeOnboarding } from './components/WelcomeOnboarding';
import { ConnectAccount } from './pages/ConnectAccount';
import { Overview } from './pages/Overview';
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
import { ArticleReader } from './pages/ArticleReader';
import type { FullArticle, RelatedArticle } from './pages/ArticleReader';
import { Health } from './pages/Health';
import { LearningRoom } from './pages/LearningRoom';
import type { DayProposal } from './components/AssistSheet';
import type {
  Page,
  AccountInfo,
  ConnectionStatus,
  ConversationEntry,
  DashboardTaskEntry,
  DashboardJournalDay,
  DashboardJournalDaySummary,
  DashboardJournalMonthEntry,
  DashboardJournalKind,
  DashboardJournalSearchHit,
  SessionStats,
  UsageHistoryData,
  SupportTicket,
  DashboardSettings,
  MemoryEntry,
  ProviderKeyStatus,
  UsageLogEntry,
  ExtToDashboardMessage,
  ChatModel,
  ChatPlatformStatus,
  DashboardLearningCurriculum,
  LearnerProfilePayload,
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
  HealthTaxonomies,
  HealthMySubmissions,
  HealthProfile,
  GeneralProfile,
  HealthPlan,
  HealthPlanSummary,
  HealthExerciseSubmissionPayload,
  HealthRecipeSubmissionPayload,
  HealthSubmissionStatus,
  HealthExerciseDraft,
  HealthRecipeDraft,
  HealthGenerateExerciseIntake,
  HealthGenerateRecipeIntake,
  CreativeAsset,
  StorageScan,
  PersonalityData,
  RoadmapTheme,
  CuratedPlanSummary, CuratedPlanDetail,
  HealthPlanDay,
  HealthPlanType,
} from './types/messages';

export { post };

// ── Health load instrumentation ───────────────────────────────────────────
// Temporary perf probe — pinpoints where the "minutes to load" delay sits in
// the exercises/recipes path. Module-eval timestamp anchors segment 1 (how
// long after the bundle starts before the load message is posted).
const HEALTH_PERF_BUNDLE_EVAL = Date.now();
console.log(`[health-perf] webview bundle eval at ${HEALTH_PERF_BUNDLE_EVAL}`);
const healthPerfPostTs = new Map<number, number>(); // seq -> post Date.now()

export function App() {
  useLocale(); // re-render on language change
  const [initialized, setInitialized] = useState(false);
  const [page, setPage] = useState<Page>('overview');
  // First-run welcome overlay — shows over the dashboard on startup for everyone
  // (signed in or not) while the "show welcome on startup" preference is on.
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeOnStartup, setWelcomeOnStartup] = useState(true);

  // Chat page dispatch — forwards extension messages to the Chat reducer.
  //
  // Replays the cached chat_init / chat_platform_status on registration, exactly
  // like the three room dispatches below. The main chat is gated behind
  // `hasAccess`, so it mounts LATER than the one-shot chat_init the host posts
  // (~2-3s in, once the platform provider is registered). Until it mounted,
  // `chatDispatchRef.current` was null and `chatDispatchRef.current?.(msg)`
  // silently dropped that message — and it never fires again. The chat then sat
  // on its initial state forever: "Loading your account…" over
  // "No providers configured", with a perfectly healthy agent behind it.
  //
  // Every room got this replay when they hit the same race. The main chat — the
  // surface everyone actually uses — was the one that never did.
  const chatDispatchRef = useRef<((msg: ExtToDashboardMessage) => void) | null>(null);
  // The last restore/reset the host sent for the MAIN chat — a `conversation_loaded`
  // (restore the previous session) or a `chat_cleared` (start fresh). Same race as
  // the setup cache above, but this one is why the chat opened BLANK: the host posts
  // conversation_loaded ~2-3s in from restoreLast(), the main Chat mounts later
  // (gated on hasAccess), so `chatDispatchRef.current?.(msg)` dropped the only copy
  // and the previous session never came back. The setup cache (chat_init /
  // chat_platform_status) got the replay in the July 12 fix; the restore message
  // did not, so "always opens a clean chat" survived. Keep only the latest — a
  // chat_cleared supersedes an earlier conversation_loaded and vice versa.
  const lastRestoreRef = useRef<ExtToDashboardMessage | null>(null);
  const registerChatDispatch = useCallback((fn: (msg: ExtToDashboardMessage) => void) => {
    chatDispatchRef.current = fn;
    // Replay cached setup so a late-mounting chat has account/provider/model.
    for (const cached of lastChatSetupRef.current.values()) fn(cached);
    // Then replay the restore so the previous session is actually on screen,
    // not just the account context around an empty thread.
    if (lastRestoreRef.current) fn(lastRestoreRef.current);
  }, []);
  // Second chat dispatch — the focused Ava Health & Fitness room. Host events
  // from a health-lane turn are tagged lane:'health' and routed here instead of
  // the main chat, so the two surfaces never cross-render.
  const healthChatDispatchRef = useRef<((msg: ExtToDashboardMessage) => void) | null>(null);
  // The Ava room mounts only when the user first opens the Health page — well
  // after the one-time chat_init / chat_platform_status fired. Cache them so we
  // can replay on registration; otherwise the room is stuck on "Loading your
  // account…" / "No providers configured" forever.
  const lastChatSetupRef = useRef<Map<string, ExtToDashboardMessage>>(new Map());
  const registerHealthChatDispatch = useCallback((fn: (msg: ExtToDashboardMessage) => void) => {
    healthChatDispatchRef.current = fn;
    // Replay cached setup so the freshly-mounted room has account/provider/model.
    for (const cached of lastChatSetupRef.current.values()) fn(cached);
  }, []);
  // Third chat dispatch — the focused Learning room. Same pattern as health:
  // host events from a learning-lane turn are tagged lane:'learning' and routed
  // here, never the main chat. Reuses the shared setup cache above.
  const learningChatDispatchRef = useRef<((msg: ExtToDashboardMessage) => void) | null>(null);
  const registerLearningChatDispatch = useCallback((fn: (msg: ExtToDashboardMessage) => void) => {
    learningChatDispatchRef.current = fn;
    for (const cached of lastChatSetupRef.current.values()) fn(cached);
  }, []);

  // Fourth chat dispatch — the Design Studio room (Ava's Design Architect hat).
  // Host events from a design-lane turn are tagged lane:'design' and routed
  // here, never the main chat. Same setup-cache reuse as the other rooms.
  const designChatDispatchRef = useRef<((msg: ExtToDashboardMessage) => void) | null>(null);
  const registerDesignChatDispatch = useCallback((fn: (msg: ExtToDashboardMessage) => void) => {
    designChatDispatchRef.current = fn;
    for (const cached of lastChatSetupRef.current.values()) fn(cached);
  }, []);

  // Model + credit state for the Design Studio's OWN top bar (so it shows the
  // model dropdown + credits even when the chat overlay is closed). Fed from the
  // same chat_init / chat_platform_status the host already sends.
  const [designModel, setDesignModel] = useState<{ models: ChatModel[]; activeModel: string | null; needsSetup: boolean; platformStatus: ChatPlatformStatus | null }>({ models: [], activeModel: null, needsSetup: false, platformStatus: null });
  const switchDesignModel = useCallback((id: string) => {
    post({ type: 'switch_model', modelId: id });
    setDesignModel(s => ({ ...s, activeModel: id }));
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
    anthropic: false, deepseek: false, kimi: false, glm: false, qwen: false, mistral: false, xiaomi: false, tencent: false, nvidia: false,
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
  const [journalYear, setJournalYear] = useState(() => new Date().getFullYear());
  const [journalMonth, setJournalMonth] = useState(() => new Date().getMonth() + 1);
  const [journalMonthEntries, setJournalMonthEntries] = useState<DashboardJournalMonthEntry[]>([]);
  const [journalKinds, setJournalKinds] = useState<DashboardJournalKind[]>([]);
  const [journalSearchHits, setJournalSearchHits] = useState<DashboardJournalSearchHit[] | null>(null);
  const [journalYearSummaries, setJournalYearSummaries] = useState<DashboardJournalDaySummary[]>([]);
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
  const [learnerProfilePayload, setLearnerProfilePayload] = useState<LearnerProfilePayload | null>(null);
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
  // Set when the host's platform fetch failed (network / timeout) — lets
  // the grid show "Couldn't load — Retry" instead of "No exercises match".
  const [healthExercisesError, setHealthExercisesError] = useState(false);
  const [healthRecipesError, setHealthRecipesError] = useState(false);
  const [healthExerciseDetail, setHealthExerciseDetail] = useState<HealthExerciseDetail | null>(null);
  const [healthRecipeDetail, setHealthRecipeDetail] = useState<HealthRecipeDetail | null>(null);
  const [healthDetailLoading, setHealthDetailLoading] = useState(false);
  // Health submission flow — taxonomies for the form, the user's own
  // submissions for the My Submissions tab, and the last submission
  // result so the modal can show success/error inline.
  const [healthTaxonomies, setHealthTaxonomies] = useState<HealthTaxonomies | null>(null);
  // Curated starters — the shelf, and one template in full. Kept here rather
  // than in the sheet so reopening it does not refetch a shelf that has not
  // changed, and so a start survives the sheet closing.
  const [curatedPlans, setCuratedPlans] = useState<CuratedPlanSummary[]>([]);
  const [curatedLoading, setCuratedLoading] = useState(false);
  const [curatedError, setCuratedError] = useState<string | null>(null);
  const [curatedDetail, setCuratedDetail] = useState<CuratedPlanDetail | null>(null);
  const [curatedDetailLoading, setCuratedDetailLoading] = useState(false);
  // Ask-Ava-about-this-day. The proposal lives here rather than in the sheet
  // so a slow generation is not lost by an accidental dismissal — it took the
  // better part of a minute and, on a platform key, real credits.
  const [dayAssistBusy, setDayAssistBusy] = useState(false);
  const [dayAssistError, setDayAssistError] = useState<string | null>(null);
  const [dayAssistProposal, setDayAssistProposal] = useState<DayProposal | null>(null);
  const [healthMySubmissions, setHealthMySubmissions] = useState<HealthMySubmissions>({ exercises: [], recipes: [] });
  const [healthClearingMySubmissions, setHealthClearingMySubmissions] = useState(false);
  // Health profile — local-first goals + constraints + schedule (body basics
  // moved to the general profile).
  const [healthProfile, setHealthProfile] = useState<HealthProfile | null>(null);
  // General profile — account-level identity + body basics, shown under the
  // Account "{name}'s profile" tab. Reusable beyond health.
  const [generalProfile, setGeneralProfile] = useState<GeneralProfile | null>(null);
  // Deep-link into the Account profile tab's sub-tab (set by Health's "Edit
  // profile →"). Consumed once by AccountPage.
  const [profileInitialSubTab, setProfileInitialSubTab] = useState<'general' | 'submissions' | null>(null);
  // Deep-link target for the Health page's inner tab. Set when another
  // surface (e.g. the Health Dashboard's "Set your goals" pointer)
  // navigates here wanting a specific tab; Health consumes it once on
  // mount then clears it so a later sidebar visit lands on the default.
  const [healthInitialTab, setHealthInitialTab] = useState<'plans' | 'exercises' | 'recipes' | 'profile' | 'ava' | null>(null);
  const [learningInitialTab, setLearningInitialTab] = useState<'courses' | 'my-learning' | 'ava' | null>(null);
  // Multi-week Plans — the library (lightweight summaries) plus the one
  // full plan currently open in the editor. Loaded on dashboard mount.
  const [healthPlans, setHealthPlans] = useState<HealthPlanSummary[]>([]);
  const [healthPlanOpen, setHealthPlanOpen] = useState<HealthPlan | null>(null);
  // Full data for active, dated plans — feeds the Command Center Today/Week view.
  const [activeHealthPlans, setActiveHealthPlans] = useState<HealthPlan[]>([]);
  // Catalog search results for the plan editor's "+ Add" picker — kept
  // separate from the Health page's grid state. seq drops stale hits.
  const [planExerciseResults, setPlanExerciseResults] = useState<HealthExerciseSummary[]>([]);
  const [planRecipeResults, setPlanRecipeResults] = useState<HealthRecipeSummary[]>([]);
  const [planCatalogSearching, setPlanCatalogSearching] = useState(false);
  const planExSearchSeq = useRef(0);
  const planRecipeSearchSeq = useRef(0);
  // Plan picker — full detail caches keyed by slug. Exercise detail
  // feeds routine pre-fill; recipe detail feeds meal nutrition.
  const [planExerciseDetails, setPlanExerciseDetails] = useState<Record<string, HealthExerciseDetail>>({});
  const [planRecipeDetails, setPlanRecipeDetails] = useState<Record<string, HealthRecipeDetail>>({});
  // Picker pagination — total catalogue count for the current filter.
  const [planExerciseTotal, setPlanExerciseTotal] = useState(0);
  const [planRecipeTotal, setPlanRecipeTotal] = useState(0);
  const [healthSubmissionResult, setHealthSubmissionResult] = useState<
    { kind: 'exercise' | 'recipe'; ok: boolean; error?: string; status?: HealthSubmissionStatus; submissionName?: string } | null
  >(null);
  const [healthSubmissionInflight, setHealthSubmissionInflight] = useState(false);
  // Ava-assisted draft generation — kind drives which form gets pre-filled,
  // inflight gates the spinner step, error surfaces inline. Cleared when
  // the user accepts the draft (transitions to form) or cancels.
  const [healthExerciseDraft, setHealthExerciseDraft] = useState<HealthExerciseDraft | null>(null);
  const [healthRecipeDraft, setHealthRecipeDraft] = useState<HealthRecipeDraft | null>(null);
  const [healthDraftInflight, setHealthDraftInflight] = useState(false);
  const [healthDraftError, setHealthDraftError] = useState<string | null>(null);
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
  // Health handlers — sequence numbers (via refs so they don't trigger
  // re-renders) protect against out-of-order responses. The pre-warm fires
  // on dashboard mount with no filter; if a filter request fires shortly
  // after, both are in flight at once. Without sequencing, the pre-warm
  // response could land second and overwrite the filtered data with the
  // unfiltered slice. Each request bumps the seq; responses with a stale
  // seq are dropped in the message handler below.
  const healthExercisesSeqRef = useRef(0);
  const healthRecipesSeqRef = useRef(0);
  const handleLoadHealthExercises = useCallback((limit?: number, offset?: number, workoutType?: string, q?: string) => {
    healthExercisesSeqRef.current += 1;
    const seq = healthExercisesSeqRef.current;
    setHealthExercisesLoading(true);
    setHealthExercisesError(false);
    const now = Date.now();
    healthPerfPostTs.set(seq, now);
    console.log(`[health-perf] webview POST load_health_exercises seq=${seq} at ${now} (+${now - HEALTH_PERF_BUNDLE_EVAL}ms since eval)`);
    post({ type: 'load_health_exercises', limit, offset, workoutType, q, seq, locale: getLocale() });
    window.setTimeout(() => setHealthExercisesLoading(false), 15000);
  }, []);
  const handleLoadHealthRecipes = useCallback((limit?: number, offset?: number, course?: string, q?: string, collection?: string, extra?: { collections?: string[]; diets?: string[]; flags?: string[]; cuisines?: string[]; maxTime?: number; sort?: 'name' }) => {
    healthRecipesSeqRef.current += 1;
    const seq = healthRecipesSeqRef.current;
    setHealthRecipesLoading(true);
    setHealthRecipesError(false);
    const now = Date.now();
    healthPerfPostTs.set(seq, now);
    console.log(`[health-perf] webview POST load_health_recipes seq=${seq} at ${now} (+${now - HEALTH_PERF_BUNDLE_EVAL}ms since eval)`);
    post({ type: 'load_health_recipes', limit, offset, course, collection, q, seq, locale: getLocale(), ...extra });
    window.setTimeout(() => setHealthRecipesLoading(false), 15000);
  }, []);
  const handleLoadHealthExerciseDetail = useCallback((slug: string) => {
    setHealthDetailLoading(true);
    setHealthExerciseDetail(null);
    post({ type: 'load_health_exercise_detail', slug, locale: getLocale() });
    window.setTimeout(() => setHealthDetailLoading(false), 15000);
  }, []);
  const handleLoadHealthRecipeDetail = useCallback((slug: string) => {
    setHealthDetailLoading(true);
    setHealthRecipeDetail(null);
    post({ type: 'load_health_recipe_detail', slug, locale: getLocale() });
    window.setTimeout(() => setHealthDetailLoading(false), 15000);
  }, []);

  // Submission handlers
  const handleLoadHealthTaxonomies = useCallback(() => {
    // Clear stale state so the modal goes back to "Loading…" on retry
    // instead of flickering between failure → success/failure.
    setHealthTaxonomies(null);
    post({ type: 'load_health_taxonomies' });
  }, []);
  const handleLoadMyHealthSubmissions = useCallback(() => {
    post({ type: 'load_my_health_submissions' });
  }, []);
  const handleClearMyRejectedHealthSubmissions = useCallback(() => {
    setHealthClearingMySubmissions(true);
    post({ type: 'clear_my_rejected_health_submissions' });
  }, []);
  const handleSaveHealthProfile = useCallback((profile: HealthProfile) => {
    // Optimistic update — the host echoes back the saved state and
    // we'll reconcile if the echo differs.
    setHealthProfile(profile);
    post({ type: 'save_health_profile', profile });
  }, []);
  const handleSaveGeneralProfile = useCallback((profile: GeneralProfile) => {
    setGeneralProfile(profile);
    post({ type: 'save_general_profile', profile });
  }, []);
  // Multi-week Plans — single open, save (upsert), delete. The library
  // list loads via the dashboard-mount pre-warm.
  const handleOpenHealthPlan = useCallback((id: string) => {
    post({ type: 'load_health_plan', id });
  }, []);
  const handleAssistDay = useCallback((args: {
    planType: HealthPlanType; goal: string | null; day: HealthPlanDay; week: HealthPlanDay[];
    instruction: string; date: string | null; profile: unknown;
  }) => {
    setDayAssistBusy(true);
    setDayAssistError(null);
    setDayAssistProposal(null);
    post({ type: 'generate_health_day', ...args });
  }, []);
  const handleDiscardDayAssist = useCallback(() => {
    setDayAssistProposal(null);
    setDayAssistError(null);
  }, []);
  const handleLoadCuratedPlans = useCallback(() => {
    setCuratedLoading(true);
    setCuratedError(null);
    post({ type: 'load_curated_plans' });
  }, []);
  const handleLoadCuratedPlan = useCallback((id: string) => {
    setCuratedDetail(null);
    setCuratedDetailLoading(true);
    post({ type: 'load_curated_plan', id });
  }, []);
  /**
   * Save the copy, then report the start.
   *
   * In that order, and the report is fire-and-forget: a counter must never be
   * the reason somebody's plan fails to start. The plan is already theirs by
   * the time the network is touched.
   */
  const handleStartCuratedPlan = useCallback((plan: HealthPlan, curatedId: string) => {
    post({ type: 'save_health_plan', plan });
    post({ type: 'curated_plan_started', id: curatedId });
  }, []);
  const handleSaveHealthPlan = useCallback((plan: HealthPlan) => {
    post({ type: 'save_health_plan', plan });
  }, []);
  const handleDeleteHealthPlan = useCallback((id: string) => {
    post({ type: 'delete_health_plan', id });
  }, []);
  const handleCloseHealthPlan = useCallback(() => {
    setHealthPlanOpen(null);
  }, []);
  // Plan editor catalog picker — searches the exercise / recipe library.
  const handleSearchPlanExercises = useCallback((o: { q: string; offset: number; category: string | null }) => {
    planExSearchSeq.current += 1;
    setPlanCatalogSearching(true);
    post({ type: 'search_plan_exercises', q: o.q, offset: o.offset, workoutType: o.category ?? undefined, seq: planExSearchSeq.current });
  }, []);
  const handleSearchPlanRecipes = useCallback((o: { q: string; offset: number; category: string | null }) => {
    planRecipeSearchSeq.current += 1;
    setPlanCatalogSearching(true);
    post({ type: 'search_plan_recipes', q: o.q, offset: o.offset, course: o.category ?? undefined, seq: planRecipeSearchSeq.current });
  }, []);
  const handleLoadPlanExerciseDetail = useCallback((slug: string) => {
    post({ type: 'load_plan_exercise_detail', slug });
  }, []);
  const handleLoadPlanRecipeDetail = useCallback((slug: string) => {
    post({ type: 'load_plan_recipe_detail', slug });
  }, []);
  const handleSubmitHealthExercise = useCallback((payload: HealthExerciseSubmissionPayload) => {
    setHealthSubmissionInflight(true);
    setHealthSubmissionResult(null);
    post({ type: 'submit_health_exercise', payload });
  }, []);
  const handleSubmitHealthRecipe = useCallback((payload: HealthRecipeSubmissionPayload) => {
    setHealthSubmissionInflight(true);
    setHealthSubmissionResult(null);
    post({ type: 'submit_health_recipe', payload });
  }, []);
  const handleClearHealthSubmissionResult = useCallback(() => {
    setHealthSubmissionResult(null);
  }, []);
  const handleGenerateHealthExerciseDraft = useCallback((intake: HealthGenerateExerciseIntake) => {
    setHealthDraftInflight(true);
    setHealthDraftError(null);
    setHealthExerciseDraft(null);
    post({ type: 'generate_health_exercise_draft', intake });
  }, []);
  const handleGenerateHealthRecipeDraft = useCallback((intake: HealthGenerateRecipeIntake) => {
    setHealthDraftInflight(true);
    setHealthDraftError(null);
    setHealthRecipeDraft(null);
    post({ type: 'generate_health_recipe_draft', intake });
  }, []);
  const handleClearHealthDraft = useCallback(() => {
    setHealthExerciseDraft(null);
    setHealthRecipeDraft(null);
    setHealthDraftError(null);
    setHealthDraftInflight(false);
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
  // Release notes state
  const [releases, setReleases] = useState<ReleaseNote[]>([]);
  // Library state
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
  const [libraryProjectRoot, setLibraryProjectRoot] = useState('');
  const [libraryHasFolder, setLibraryHasFolder] = useState(true);
  const [libraryCloudAssets, setLibraryCloudAssets] = useState<CreativeAsset[]>([]);
  // Local-first creative gallery (~/.ava/users/<id>/creative) — what the Assets
  // tab shows now. Cloud assets are kept only for the Documents tab.
  const [libraryLocalCreative, setLibraryLocalCreative] = useState<CreativeAsset[]>([]);
  // Whole-footprint storage scan (~/.ava by category) — powers the storage bar
  // in the Command Center header and the Library. Refreshed on those pages.
  const [storageScan, setStorageScan] = useState<StorageScan | null>(null);
  const [announcement, setAnnouncement] = useState<string[]>([]);
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
    post({ type: 'load_cloud_assets' });   // Documents tab
    post({ type: 'load_local_creative' });  // Assets tab (local-first)
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
  // Findings are computed host-side by the shared @ava/core/audit engine and
  // sent alongside the entries; the audit view localises each from its `kind`.
  const [auditFindings, setAuditFindings] = useState<any[]>([]);
  // Article reader state
  const [activeArticle, setActiveArticle] = useState<FullArticle | null>(null);
  const [activeArticleRelated, setActiveArticleRelated] = useState<RelatedArticle[]>([]);
  const [articleLoading, setArticleLoading] = useState(false);

  // ── Page load-state signals ─────────────────────────────────────────────
  // A data source is "loaded" once its first `*_loaded` message arrives.
  // Pages read this to tell "still loading" apart from "loaded and
  // genuinely empty" — the difference between showing a skeleton and an
  // empty state. Every ExtToDashboard message whose type ends in
  // `_loaded` auto-registers in handleMessage, so no per-handler wiring
  // is needed. Key = the message type with the `_loaded` suffix stripped
  // (e.g. 'tasks', 'weather', 'journal_day').
  const [loadedSources, setLoadedSources] = useState<Set<string>>(() => new Set());
  const isLoaded = useCallback(
    (source: string) => loadedSources.has(source),
    [loadedSources],
  );

  // ── Local-first persistence ─────────────────────────────────────────────
  useEffect(() => { try { localStorage.setItem('ava-dash-tasks', JSON.stringify(tasks)); } catch {} }, [tasks]);
  // Always persist (incl. an empty list) so deleting the last course clears the
  // cache — the old `length > 0` guard left a stale course that re-appeared.
  useEffect(() => { try { localStorage.setItem('ava-dash-learning', JSON.stringify(learningCurriculums)); } catch {} }, [learningCurriculums]);
  useEffect(() => { if (journalDay) { try { localStorage.setItem(`ava-dash-journal-${selectedJournalDate}`, JSON.stringify(journalDay)); } catch {} } }, [journalDay, selectedJournalDate]);
  // Settings → Advanced can replay the welcome tour on demand.
  useEffect(() => {
    const show = () => setShowWelcome(true);
    window.addEventListener('ava-show-welcome', show);
    return () => window.removeEventListener('ava-show-welcome', show);
  }, []);
  useEffect(() => { if (personalityData) { try { localStorage.setItem('ava-dash-personality', JSON.stringify(personalityData)); } catch {} } }, [personalityData]);

  // "Ask Ava" from the docs page — the question is stashed in localStorage by
  // DocumentationPage; we just navigate to chat, which reads it on mount.
  useEffect(() => {
    const onAsk = () => setPagePersist('chat');
    window.addEventListener('ava-ask-docs', onAsk);
    return () => window.removeEventListener('ava-ask-docs', onAsk);
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    // Ignore messages from unexpected origins (e.g. browser extensions)
    // Accept vscode-webview:// and vscode-file:// (Electron/WebView2 on Windows)
    if (event.origin && !event.origin.startsWith('vscode-webview://') && !event.origin.startsWith('vscode-file://')) return;
    const msg = event.data as ExtToDashboardMessage;

    // Route chat-stream messages by lane so the main chat and the Ava Health
    // & Fitness room never cross-render. The host stamps every outbound message
    // with its turn's lane (default 'main'). Health-lane turns go only to the
    // health surface; everything else (incl. shared setup like chat_init) goes
    // to the main chat — and ALSO to the health surface so it has the same
    // model/account context. Each surface still filters CHAT_MESSAGE_TYPES.
    const lane = (msg as { lane?: 'main' | 'health' | 'learning' | 'design' }).lane;
    // The host remaps init → chat_init and platform_status → chat_platform_status
    // before they reach the dashboard, so those are the only setup types seen
    // here. Mirror them to the room surfaces so their chats have model/account
    // context too — and cache the latest of each so a room mounted later (when
    // the user first opens Health / Learning) gets them replayed on registration.
    const isChatSetup = msg.type === 'chat_init' || msg.type === 'chat_platform_status';
    if (isChatSetup) lastChatSetupRef.current.set(msg.type, msg);
    // Cache the latest MAIN-lane restore/reset so a late-mounting chat can replay
    // it on registration (see registerChatDispatch). Room-lane messages carry a
    // lane tag and are handled by their own surfaces, so only cache untagged ones.
    if ((msg.type === 'conversation_loaded' || msg.type === 'chat_cleared') && !lane) {
      lastRestoreRef.current = msg;
    }
    // Keep the Design Studio top-bar model/credit state in sync.
    if (msg.type === 'chat_init') {
      setDesignModel({ models: msg.models, activeModel: msg.activeModel, needsSetup: msg.needsSetup, platformStatus: msg.platformStatus ?? null });
    } else if (msg.type === 'chat_platform_status') {
      const { type: _t, ...ps } = msg;
      setDesignModel(s => ({ ...s, platformStatus: ps as ChatPlatformStatus }));
    } else if (msg.type === 'model_switched') {
      // Same staleness, same fix: this top bar tracked chat_init and nothing
      // after it.
      setDesignModel(s => ({ ...s, activeModel: msg.modelId }));
    }
    // A MODEL SWITCH IS SHARED STATE, NOT TURN TRAFFIC.
    //
    // The lane split exists so a health turn's stream deltas cannot leak into
    // the main chat. But the host stamps every outbound message with the
    // current lane, and `activeLane` resets to 'main' the moment a turn ends —
    // so a switch made BETWEEN turns always went out as lane:'main'. Routed
    // strictly, it reached the main chat alone and every room's picker stayed
    // frozen on whatever chat_init gave it at mount: the UI naming one model
    // while another was actually running.
    //
    // So it goes to every surface. Only the one in view says so out loud —
    // announcing it in rooms nobody is looking at turns a fact into a pile of
    // stale notices at the top of a room opened hours later.
    if (msg.type === 'model_switched') {
      const here = page === 'health' ? 'health' : page === 'learning-room' ? 'learning' : null;
      const say = (target: 'main' | 'health' | 'learning' | 'design') =>
        ({ ...msg, announce: target === (here ?? 'main') });
      chatDispatchRef.current?.(say('main'));
      healthChatDispatchRef.current?.(say('health'));
      learningChatDispatchRef.current?.(say('learning'));
      designChatDispatchRef.current?.(say('design'));
      return;
    }
    if (lane === 'health') {
      healthChatDispatchRef.current?.(msg);
    } else if (lane === 'learning') {
      learningChatDispatchRef.current?.(msg);
      // When a learning turn settles, refresh the course state so the course-path
      // sidebar + My Courses + the active course (and any just-created course)
      // reflect the progress Ava made in chat.
      if (msg.type === 'done') { post({ type: 'load_learning' }); post({ type: 'load_learning_profile' }); }
    } else if (lane === 'design') {
      designChatDispatchRef.current?.(msg);
    } else {
      chatDispatchRef.current?.(msg);
      if (isChatSetup) { healthChatDispatchRef.current?.(msg); learningChatDispatchRef.current?.(msg); designChatDispatchRef.current?.(msg); }
    }

    // Auto-register every data source the moment its first load lands —
    // powers the per-page skeleton / empty-state distinction.
    if (typeof msg.type === 'string' && msg.type.endsWith('_loaded')) {
      const src = msg.type.slice(0, -'_loaded'.length);
      setLoadedSources(prev => (prev.has(src) ? prev : new Set(prev).add(src)));
    }

    switch (msg.type) {
      case 'show_welcome':
        setShowWelcome(true);
        break;
      case 'init':
        setAccount(msg.account);
        setConnections(msg.connections);
        setSettings(msg.settings);
        setProviderKeys(msg.providerKeys);
        setShowWelcome(Boolean((msg as { showWelcome?: boolean }).showWelcome));
        setWelcomeOnStartup((msg as { welcomeOnStartup?: boolean }).welcomeOnStartup ?? true);
        // accountLoading is true when we have a key but no account yet —
        // sendInit posts init with account=null and fetches the account
        // in the background, so this fires the skeleton immediately.
        setAccountLoading(Boolean((msg as any).platformKey) && !msg.account);
        // Reflect the host's persisted Platform/API-Key choice when present, so
        // the sidebar toggle shows the REAL routing source rather than a guess;
        // fall back to the key-presence heuristic on fresh/never-set installs.
        const persistedSource = (msg as any).providerSource;
        if (persistedSource === 'platform' || persistedSource === 'byok') {
          setByokMode(persistedSource === 'byok');
        } else if (!msg.account && !((msg as any).platformKey) && Object.values(msg.providerKeys).some(Boolean)) {
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
        // The store is the source of truth — REPLACE, don't merge. The old
        // merge kept any previous task whose id wasn't in the new set, so once
        // the store was emptied the stale entries lived forever as ghosts that
        // couldn't be deleted (not in the store) or cleared.
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
      case 'journal_month_loaded':
        setJournalYear(msg.year);
        setJournalMonth(msg.month);
        setJournalMonthEntries(msg.entries);
        break;
      case 'journal_summaries_loaded':
        setJournalSummaries(msg.summaries);
        break;
      case 'journal_kinds_loaded':
        setJournalKinds(msg.kinds);
        break;
      case 'journal_search_results':
        setJournalSearchHits(msg.hits);
        break;
      case 'journal_year_summaries':
        if (msg.year === journalYear) setJournalYearSummaries(msg.summaries);
        break;
      case 'journal_changed': {
        // A local entry was added/updated/deleted — refresh the views that
        // could have changed: the month list, that day, calendar dots, heatmap.
        post({ type: 'load_journal_month', year: journalYear, month: journalMonth });
        post({ type: 'load_journal_day', date: msg.date });
        post({ type: 'load_journal_year', year: journalYear });
        const from = `${journalYear}-${String(journalMonth).padStart(2, '0')}-01`;
        const last = new Date(journalYear, journalMonth, 0).getDate();
        const to = `${journalYear}-${String(journalMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
        post({ type: 'load_journal_summaries', from, to });
        break;
      }
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
        // The host reads the LOCAL learning.json (the single source of truth —
        // learning is local-only). Replace wholesale; never merge in cached
        // curricula, or a deleted course re-appears from the stale cache.
        setLearningCurriculums(msg.curriculums);
        break;
      case 'curriculum_deleted':
        setLearningCurriculums(prev => prev.filter(c => c.id !== msg.id));
        break;
      case 'learning_profile_loaded':
        setLearnerProfilePayload(msg.payload);
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
      case 'health_exercises_loaded': {
        const postedAt = msg.seq != null ? healthPerfPostTs.get(msg.seq) : undefined;
        const rt = postedAt != null ? Date.now() - postedAt : null;
        console.log(`[health-perf] webview RECV health_exercises_loaded seq=${msg.seq} count=${msg.exercises.length} roundtrip=${rt}ms stale=${msg.seq != null && msg.seq !== healthExercisesSeqRef.current}`);
        // Drop stale responses — only the most recent request wins. This
        // is the fix for "filter chip click doesn't update the list":
        // pre-warm fires with no filter on mount, filter click fires
        // shortly after; either order is possible at the network layer,
        // and without sequencing the pre-warm could land second and
        // overwrite filtered results. Untagged responses (legacy or
        // safety-fallbacks) always apply.
        if (msg.seq != null && msg.seq !== healthExercisesSeqRef.current) {
          break;
        }
        setHealthExercises(msg.exercises);
        setHealthExercisesTotal(msg.total);
        setHealthExercisesOffset(msg.offset);
        setHealthExercisesLoading(false);
        setHealthExercisesError(msg.error ?? false);
        break;
      }
      case 'health_recipes_loaded': {
        const postedAt = msg.seq != null ? healthPerfPostTs.get(msg.seq) : undefined;
        const rt = postedAt != null ? Date.now() - postedAt : null;
        console.log(`[health-perf] webview RECV health_recipes_loaded seq=${msg.seq} count=${msg.recipes.length} roundtrip=${rt}ms stale=${msg.seq != null && msg.seq !== healthRecipesSeqRef.current}`);
        if (msg.seq != null && msg.seq !== healthRecipesSeqRef.current) {
          break;
        }
        setHealthRecipes(msg.recipes);
        setHealthRecipesTotal(msg.total);
        setHealthRecipesOffset(msg.offset);
        setHealthRecipesLoading(false);
        setHealthRecipesError(msg.error ?? false);
        break;
      }
      case 'health_exercise_detail_loaded':
        setHealthExerciseDetail(msg.exercise);
        setHealthDetailLoading(false);
        break;
      case 'health_recipe_detail_loaded':
        setHealthRecipeDetail(msg.recipe);
        setHealthDetailLoading(false);
        break;
      case 'health_taxonomies_loaded':
        setHealthTaxonomies(msg.taxonomies);
        break;
      case 'health_day_generated':
        setDayAssistBusy(false);
        if (msg.ok && msg.day) {
          setDayAssistProposal({
            day: msg.day,
            note: msg.note ?? '',
            credits: msg.credits_charged ?? 0,
            unverifiable: msg.unverifiable_allergens ?? [],
          });
        } else {
          setDayAssistError(msg.error ?? 'Unknown error');
        }
        break;
      case 'curated_plans_loaded':
        setCuratedPlans(msg.plans);
        setCuratedLoading(false);
        setCuratedError(null);
        break;
      case 'curated_plans_failed':
        setCuratedLoading(false);
        // Named, not swallowed: an empty shelf and an unreachable one look
        // identical otherwise, and only one of them is worth retrying.
        setCuratedError(msg.error);
        break;
      case 'curated_plan_loaded':
        setCuratedDetail(msg.plan);
        setCuratedDetailLoading(false);
        break;
      case 'curated_plan_failed':
        setCuratedDetailLoading(false);
        break;
      case 'health_my_submissions_loaded':
        setHealthMySubmissions(msg.data);
        break;
      case 'health_profile_loaded':
        setHealthProfile(msg.profile);
        break;
      case 'health_profile_saved':
        // Host's echo — reconcile in case the saved shape was
        // normalised (e.g. updated_at stamped server-side).
        setHealthProfile(msg.profile);
        break;
      case 'general_profile_loaded':
        setGeneralProfile(msg.profile);
        break;
      case 'general_profile_saved':
        setGeneralProfile(msg.profile);
        break;
      case 'health_plans_loaded':
        setHealthPlans(msg.plans);
        break;
      case 'active_health_plans_loaded':
        setActiveHealthPlans(msg.plans);
        break;
      case 'health_plan_loaded':
        setHealthPlanOpen(msg.plan);
        break;
      case 'health_plan_saved':
        setHealthPlans(msg.plans);
        // Only refresh the plan if its editor is already open — never OPEN it.
        // A silent day-view edit autosaves through here; it must not pop the
        // full PlanBuilder over the day view.
        setHealthPlanOpen(prev => (prev && prev.id === msg.plan.id ? msg.plan : prev));
        post({ type: 'load_active_health_plans' });
        break;
      case 'health_plan_deleted':
        setHealthPlans(msg.plans);
        setHealthPlanOpen(prev => (prev && prev.id === msg.id ? null : prev));
        post({ type: 'load_active_health_plans' });
        break;
      case 'plan_exercises_searched':
        if (msg.seq !== planExSearchSeq.current) break;
        setPlanExerciseResults(msg.exercises);
        setPlanExerciseTotal(msg.total);
        setPlanCatalogSearching(false);
        break;
      case 'plan_recipes_searched':
        if (msg.seq !== planRecipeSearchSeq.current) break;
        setPlanRecipeResults(msg.recipes);
        setPlanRecipeTotal(msg.total);
        setPlanCatalogSearching(false);
        break;
      case 'plan_exercise_detail_loaded': {
        const ex = msg.exercise;
        if (ex) setPlanExerciseDetails(prev => ({ ...prev, [msg.slug]: ex }));
        break;
      }
      case 'plan_recipe_detail_loaded': {
        const rec = msg.recipe;
        if (rec) setPlanRecipeDetails(prev => ({ ...prev, [msg.slug]: rec }));
        break;
      }
      case 'health_my_submissions_cleared':
        setHealthClearingMySubmissions(false);
        // Refresh the list either way — on success the rows are gone,
        // on failure the user gets the unchanged list back without a
        // stale "Clearing…" button.
        post({ type: 'load_my_health_submissions' });
        break;
      case 'health_submission_result':
        setHealthSubmissionInflight(false);
        setHealthSubmissionResult({
          kind: msg.kind,
          ok: msg.ok,
          error: msg.error,
          status: msg.submission?.status,
          submissionName: msg.submission?.name,
        });
        // Pull a fresh My Submissions snapshot so the new row shows up
        if (msg.ok) post({ type: 'load_my_health_submissions' });
        break;
      case 'health_exercise_draft_generated':
        setHealthDraftInflight(false);
        if (msg.ok && msg.draft) {
          setHealthExerciseDraft(msg.draft);
          setHealthDraftError(null);
        } else {
          setHealthDraftError(msg.error ?? 'Generation failed');
        }
        break;
      case 'health_recipe_draft_generated':
        setHealthDraftInflight(false);
        if (msg.ok && msg.draft) {
          setHealthRecipeDraft(msg.draft);
          setHealthDraftError(null);
        } else {
          setHealthDraftError(msg.error ?? 'Generation failed');
        }
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
      // Sync messages removed — Ava is local-first, nothing syncs to cloud.
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
      case 'local_creative_loaded':
        setLibraryLocalCreative(msg.assets);
        finishLibraryLoad();
        break;
      case 'storage_scan_loaded':
        setStorageScan(msg.scan);
        break;
      case 'announcement_loaded':
        setAnnouncement(Array.isArray(msg.messages) ? msg.messages : []);
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
        setAuditFindings((msg as any).findings || []);
        break;
      case 'audit_findings':
        setAuditFindings((msg as any).findings || []);
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
    console.log(`[health-perf] webview POST webview_ready (+${Date.now() - HEALTH_PERF_BUNDLE_EVAL}ms since eval)`);
    post({ type: 'webview_ready' });
    // Initialise i18n from core locale strings
    initLocale().catch(() => {});
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Pre-warm Health content so Exercises + Recipes render instantly on
  // first click instead of showing the loading card. ~5KB each, platform
  // is stale-while-revalidate cached, fires once per dashboard open. Uses
  // the existing handlers so loading state stays consistent if the user
  // navigates to Health while the pre-warm is still in flight.
  useEffect(() => {
    console.log(`[health-perf] webview pre-warm useEffect fires (+${Date.now() - HEALTH_PERF_BUNDLE_EVAL}ms since eval)`);
    handleLoadHealthExercises(24, 0);
    handleLoadHealthRecipes(24, 0);
    // Plan-builder catalogue — pre-warm the picker's first page so it
    // opens instantly, the same way Health's Exercises / Recipes do.
    handleSearchPlanExercises({ q: '', offset: 0, category: null });
    handleSearchPlanRecipes({ q: '', offset: 0, category: null });
    // Health + general profiles — local-first host round-trips (no network).
    // Loaded once per dashboard mount so the profile tabs open instantly.
    post({ type: 'load_health_profile' });
    post({ type: 'load_general_profile' });
    // Today's daily plan — same local-first storage. Date computed
    // here in the webview so the host doesn't have to know what
    // "today" is in the user's timezone.
    // Multi-week Plans library — lightweight summaries, loads once per
    // dashboard mount so the Plans tab renders its grid instantly.
    post({ type: 'load_health_plans' });
    // Active plans (full) for the Command Center Today/Week glance.
    post({ type: 'load_active_health_plans' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh health plans when landing on a surface that shows them. Ava can
  // create/update a plan in the Health room since the last load (she writes
  // straight to the local store, outside the dashboard's save flow), so the
  // Command Center / Plans / profile would otherwise read stale state. Cheap
  // local reads; fires only on entering these pages.
  useEffect(() => {
    if (page === 'overview' || page === 'account' || page === 'health') {
      post({ type: 'load_active_health_plans' });
      post({ type: 'load_health_plans' });
    }
  }, [page]);

  // Learning room data — the course catalogue + the user's curriculums. Both
  // messages + their reducers already exist (load_library_paths / load_learning);
  // cheap local-first reads, fires on entering the page.
  useEffect(() => {
    if (page === 'learning-room') {
      post({ type: 'load_learning' });
      post({ type: 'load_library_paths' });
      post({ type: 'load_learning_profile' });
    }
  }, [page]);

  // Main-chat → Health room handoff. When Ava (in the main chat) calls
  // open_health_room for a plan request, the handoff button dispatches this
  // event; we jump to Health → the Ava room and seed it with the plan type so
  // she picks up building right where they left off. Same path as onAskAvaPlan.
  useEffect(() => {
    const onOpenRoom = (e: Event) => {
      // detail is { planType, primer } (older callers may pass a bare string).
      const raw = (e as CustomEvent).detail;
      const planType: string | undefined = typeof raw === 'string' ? raw : raw?.planType;
      const primer: string | undefined = typeof raw === 'string' ? undefined : raw?.primer;
      setHealthInitialTab('ava');
      setPagePersist('health');
      // Carry the user's specific request into the room so it continues the
      // conversation. Falls back to the structured plan-kick when they gave no
      // free-text detail.
      if (primer && primer.trim()) {
        post({ type: 'send_message', text: primer.trim(), mode: 'health', surface: 'health' });
      } else if (planType === 'fitness' || planType === 'meal' || planType === 'combined') {
        post({ type: 'palette_intent', tool: 'plans', action: planType, mode: 'health', surface: 'health' });
      }
    };
    window.addEventListener('ava-open-health-room', onOpenRoom);
    return () => window.removeEventListener('ava-open-health-room', onOpenRoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Main-chat → Learning room handoff. When Ava (in the main chat) calls
  // open_learning_room, the handoff button dispatches this event; we jump to the
  // Learning room → the Ava tab and seed it with the topic so she starts building
  // the course right there (mode 'teach', lane 'learning').
  useEffect(() => {
    const onOpenRoom = (e: Event) => {
      // detail is { topic, primer } (older callers may pass a bare string).
      const raw = (e as CustomEvent).detail;
      const topic: string | undefined = typeof raw === 'string' ? raw : raw?.topic;
      const primer: string | undefined = typeof raw === 'string' ? undefined : raw?.primer;
      setLearningInitialTab('ava');
      setPagePersist('learning-room');
      // Prefer the user's own specific request (primer) so the room continues
      // their conversation; fall back to a topic-shaped opener, then a generic.
      const text = (primer && primer.trim())
        ? primer.trim()
        : topic ? `I'd like to learn ${topic}.` : `I'd like to start learning something.`;
      post({ type: 'send_message', text, mode: 'teach', surface: 'learning' });
    };
    window.addEventListener('ava-open-learning-room', onOpenRoom);
    return () => window.removeEventListener('ava-open-learning-room', onOpenRoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Load tasks when navigating to tasks page. Always refresh from the store
    // (the localStorage cache is only for instant paint) so a stale cached list
    // gets corrected against the real store instead of persisting.
    if (page === 'tasks') {
      post({ type: 'load_tasks' });
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
      post({ type: 'load_journal_month', year: journalYear, month: journalMonth });
      post({ type: 'load_journal_kinds' });
      post({ type: 'load_journal_year', year: journalYear });
    }
    // Load overview widget data
    if (page === 'overview') {
      post({ type: 'load_tasks' });
      post({ type: 'load_learning' });
      post({ type: 'load_journal_day', date: new Date().toISOString().slice(0, 10) });
      post({ type: 'load_weather' });
      post({ type: 'load_news' });
      post({ type: 'load_latest_release' });
      post({ type: 'get_storage_scan' });  // powers the header storage bar
      if (account) {
        post({ type: 'load_memories' });
      } else {
        post({ type: 'load_local_memories' });
      }
    }
    // BYOK: refresh session stats when viewing the overview
    if (page === 'overview' && byokMode && !account) {
      post({ type: 'load_session_stats' });
    }
    // Unified Library — load all three data sources when the page opens.
    // Cloud assets and local images power the Assets / Documents tabs;
    // courses power the Courses tab.
    if (page === 'library') {
      post({ type: 'load_library' });
      beginLibraryLoad();
      post({ type: 'load_cloud_assets' });
      post({ type: 'load_local_creative' });
      post({ type: 'load_library_paths' });
      post({ type: 'get_storage_scan' });
    }
    // Back-compat: 'learning-library' is the legacy nav target. Any
    // bookmarked / persisted page value that still points here redirects
    // to the unified Library, which defaults its tab to Assets but keeps
    // Courses one click away.
    if (page === 'learning-library') {
      setPagePersist('library');
    }
    // Back-compat: 'learning' was the Planner's Learning tab; learning now has
    // its own room. Redirect any stale persisted/deep-linked value there.
    if (page === 'learning') {
      setPagePersist('learning-room');
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

  // The NavSidebar Platform / API-Key toggle. Posts set_provider_source to the
  // host (DashboardPanel forwards it to AvaViewProvider, which persists the
  // choice and re-initializes the session so routing actually switches) AND
  // flips local state for instant feedback. Without the post the toggle was
  // cosmetic — it showed "API Key" while requests still used the platform key,
  // i.e. the UI lied about a signed-in user being able to use their own keys.
  function handleSourceToggle(byok: boolean) {
    setByokMode(byok);
    post({ type: 'set_provider_source', source: byok ? 'byok' : 'platform' });
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
      // 'learning' is redirected to 'learning-room' in the page-change effect
      // above (learning moved out of the Planner into its own room).
      case 'learning':
        return null;
      case 'planner':
      case 'tasks':
      case 'journal':
        return (
          <Planner
            tasks={tasks}
            sessionTasks={sessionTasks}
            journalDate={selectedJournalDate}
            journalNavTick={plannerJournalNavTick}
            journalYear={journalYear}
            journalMonth={journalMonth}
            journalMonthEntries={journalMonthEntries}
            journalKinds={journalKinds}
            journalSearchHits={journalSearchHits}
            journalYearSummaries={journalYearSummaries}
            onChangeJournalMonth={(y, m) => { setJournalYear(y); setJournalMonth(m); post({ type: 'load_journal_month', year: y, month: m }); if (y !== journalYear) post({ type: 'load_journal_year', year: y }); }}
            onClearJournalSearch={() => setJournalSearchHits(null)}
            tasksLoaded={isLoaded('tasks')}
            journalLoaded={isLoaded('journal_day')}
            healthPlans={healthPlans}
            activeHealthPlans={activeHealthPlans}
            healthPlanOpen={healthPlanOpen}
            onOpenHealthPlan={handleOpenHealthPlan}
            onSaveHealthPlan={handleSaveHealthPlan}
            onDeleteHealthPlan={handleDeleteHealthPlan}
            onCloseHealthPlan={handleCloseHealthPlan}
            planExerciseResults={planExerciseResults}
            planRecipeResults={planRecipeResults}
            planCatalogSearching={planCatalogSearching}
            onSearchPlanExercises={handleSearchPlanExercises}
            onSearchPlanRecipes={handleSearchPlanRecipes}
            planExerciseTotal={planExerciseTotal}
            planRecipeTotal={planRecipeTotal}
            planExerciseDetails={planExerciseDetails}
            planRecipeDetails={planRecipeDetails}
            onLoadPlanExerciseDetail={handleLoadPlanExerciseDetail}
            onLoadPlanRecipeDetail={handleLoadPlanRecipeDetail}
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
            isPlatform={!!account}
            generalProfile={generalProfile}
            onSaveGeneralProfile={handleSaveGeneralProfile}
            healthSubmissions={{
              data: healthMySubmissions,
              onRefresh: handleLoadMyHealthSubmissions,
              onClearRejected: handleClearMyRejectedHealthSubmissions,
              clearing: healthClearingMySubmissions,
              taxonomies: healthTaxonomies,
              inflight: healthSubmissionInflight,
              result: healthSubmissionResult
                ? { kind: healthSubmissionResult.kind, ok: healthSubmissionResult.ok, error: healthSubmissionResult.error, submissionName: healthSubmissionResult.submissionName }
                : null,
              onSubmitExercise: handleSubmitHealthExercise,
              onSubmitRecipe: handleSubmitHealthRecipe,
              onClearResult: handleClearHealthSubmissionResult,
              onRetryTaxonomies: handleLoadHealthTaxonomies,
              exerciseDraft: healthExerciseDraft,
              recipeDraft: healthRecipeDraft,
              draftInflight: healthDraftInflight,
              draftError: healthDraftError,
              onGenerateExerciseDraft: handleGenerateHealthExerciseDraft,
              onGenerateRecipeDraft: handleGenerateHealthRecipeDraft,
              onClearDraft: handleClearHealthDraft,
            }}
            profileInitialSubTab={profileInitialSubTab}
            onConsumeProfileInitialSubTab={() => setProfileInitialSubTab(null)}
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
        return <Overview account={account} connections={connections} onNavigate={setPagePersist} logs={usageLogs} sessionStats={sessionStatsData} mode={mode} tasks={tasks} journalDay={journalDay} learningCurriculums={learningCurriculums} memories={account ? memories : localMemories} memoryTotal={account ? memoryTotal : undefined} weatherData={weatherData} newsArticles={newsArticles} latestRelease={latestRelease} articleLoading={articleLoading} onOpenArticle={(slug) => { setArticleLoading(true); post({ type: 'load_news_article', slug }); }} activeHealthPlans={activeHealthPlans} auditFindings={auditFindings} tasksLoaded={isLoaded('tasks')} journalLoaded={isLoaded('journal_day')} weatherLoaded={isLoaded('weather')} storageScan={storageScan} />;
      case 'memory':
        return <Memory memories={account ? memories : localMemories} mode={mode} serverTotal={account ? memoryTotal : undefined} serverHasMore={account ? memoryHasMore : undefined} loaded={account ? isLoaded('memories') : isLoaded('local_memories')} />;
      case 'history':
        return <History sessionStats={sessionStatsData} usageHistory={usageHistoryData} mode={account ? 'platform' : 'byok'} account={account} auditLog={auditLog} auditFindings={auditFindings} conversations={conversations} loaded={isLoaded('conversations')} onNavigate={setPagePersist} />;
      case 'library':
        return (
          <Library
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
            localCreative={libraryLocalCreative}
            storageScan={storageScan}
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
        return <CreativeStudio account={account}
          onRegisterDesignChatDispatch={registerDesignChatDispatch}
          designModelState={designModel}
          onSwitchDesignModel={switchDesignModel}
          userName={account?.name?.split(' ')[0] ?? null}
          userAvatarUrl={account?.avatar_url ?? null} />;
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
            exercisesError={healthExercisesError}
            recipesError={healthRecipesError}
            exerciseDetail={healthExerciseDetail}
            recipeDetail={healthRecipeDetail}
            detailLoading={healthDetailLoading}
            onLoadExercises={handleLoadHealthExercises}
            onLoadRecipes={handleLoadHealthRecipes}
            onLoadExerciseDetail={handleLoadHealthExerciseDetail}
            onLoadRecipeDetail={handleLoadHealthRecipeDetail}
            taxonomies={healthTaxonomies}
            onLoadTaxonomies={handleLoadHealthTaxonomies}
            onNavigateToProfile={(subTab) => { setProfileInitialSubTab(subTab); setPagePersist('account'); }}
            healthPlans={{
              plans: healthPlans,
              fullPlans: activeHealthPlans,
              planOpen: healthPlanOpen,
              onOpenPlan: handleOpenHealthPlan,
              onSavePlan: handleSaveHealthPlan,
              onDeletePlan: handleDeleteHealthPlan,
              onClosePlan: handleCloseHealthPlan,
              exerciseResults: planExerciseResults,
              recipeResults: planRecipeResults,
              catalogSearching: planCatalogSearching,
              exerciseTotal: planExerciseTotal,
              recipeTotal: planRecipeTotal,
              onSearchExercises: handleSearchPlanExercises,
              onSearchRecipes: handleSearchPlanRecipes,
              exerciseDetails: planExerciseDetails,
              recipeDetails: planRecipeDetails,
              onLoadExerciseDetail: handleLoadPlanExerciseDetail,
              onLoadRecipeDetail: handleLoadPlanRecipeDetail,
            }}
            onAskAvaPlan={(type) => {
              // Same page now — just move to the Ava tab and seed her with the
              // chosen plan type. (Was a cross-page hop from Account.)
              setHealthInitialTab('ava');
              setPagePersist('health');
              post({ type: 'palette_intent', tool: 'plans', action: type, mode: 'health', surface: 'health' });
            }}
            healthProfile={healthProfile}
            onSaveHealthProfile={handleSaveHealthProfile}
            dayAssist={{
              busy: dayAssistBusy,
              error: dayAssistError,
              proposal: dayAssistProposal,
              onAsk: handleAssistDay,
              onDiscard: handleDiscardDayAssist,
            }}
            curated={{
              plans: curatedPlans,
              loading: curatedLoading,
              error: curatedError,
              detail: curatedDetail,
              detailLoading: curatedDetailLoading,
              onLoad: handleLoadCuratedPlans,
              onLoadDetail: handleLoadCuratedPlan,
              onStart: handleStartCuratedPlan,
            }}
            onRegisterHealthChatDispatch={registerHealthChatDispatch}
            userName={account?.name?.split(' ')[0] ?? null}
            userAvatarUrl={account?.avatar_url ?? null}
            initialTab={healthInitialTab}
            onConsumeInitialTab={() => setHealthInitialTab(null)}
          />
        );
      case 'learning-room':
        return (
          <LearningRoom
            paths={libraryPaths}
            pathDetail={libraryPathDetail}
            onNavigate={setPagePersist}
            learningCurriculums={learningCurriculums}
            learningLoaded={isLoaded('learning')}
            learnerProfile={learnerProfilePayload}
            onRegisterLearningChatDispatch={registerLearningChatDispatch}
            userName={account?.name?.split(' ')[0] ?? null}
            userAvatarUrl={account?.avatar_url ?? null}
            initialTab={learningInitialTab}
            onConsumeInitialTab={() => setLearningInitialTab(null)}
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
          onSetByokMode={handleSourceToggle}
          accountLoading={accountLoading}
          onConnectAccount={handleConnectAccount}
          providerKeys={providerKeys}
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
          healthPlans={healthPlans}
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
            announcement={announcement}
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
        <div className="flex-1 flex flex-col overflow-hidden" style={{ order: 1 }}>
          <DashboardTopBar account={account} announcement={announcement} />
          {/* flex column, so a page can claim the remaining height with flex-1.
              Without this, `min-h-full` on a page root has nothing definite to
              size against and any flex-1 section inside it collapses back to its
              content height — which is why the Newsroom card kept stopping short
              with dead space under it, whatever number I put on it. */}
          <main className="flex flex-1 flex-col overflow-y-auto p-8">
            {errorMsg && (
              <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                {errorMsg}
              </div>
            )}
            {renderPage()}
          </main>
        </div>
      )}
      {showWelcome && (
        <WelcomeOnboarding
          isConnected={!!account}
          welcomeOnStartup={welcomeOnStartup}
          onSetWelcomeOnStartup={(enabled) => { setWelcomeOnStartup(enabled); post({ type: 'set_welcome_on_startup', enabled }); }}
          onClose={() => setShowWelcome(false)}
          onNavigate={(p) => setPagePersist(p as Page)}
          onSetLanguage={(loc) => {
            localStorage.setItem('ava-dashboard-language', loc);
            initLocale(loc);
            setSettings((prev) => {
              const updated = { ...prev, language: loc };
              post({ type: 'save_settings', settings: updated });
              return updated;
            });
          }}
        />
      )}
    </div>
  );
}
