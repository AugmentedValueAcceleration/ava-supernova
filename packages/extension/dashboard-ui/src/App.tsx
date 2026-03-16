import { useState, useEffect, useCallback } from 'react';
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
  SupportTicket,
  DashboardSettings,
  MemoryEntry,
  ProviderKeyStatus,
  UsageLogEntry,
  ExtToDashboardMessage,
  DashboardToExtMessage,
  DashboardLearningCurriculum,
  SyncStatus,
  ReleaseNote,
} from './types/messages';

declare function acquireVsCodeApi(): {
  postMessage: (msg: DashboardToExtMessage) => void;
};

const vscode = acquireVsCodeApi();

export function post(msg: DashboardToExtMessage): void {
  vscode.postMessage(msg);
}

export function App() {
  const [initialized, setInitialized] = useState(false);
  const [page, setPage] = useState<Page>('overview');
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
    streamResponses: true,
  });
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
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
  const [journalDay, setJournalDay] = useState<DashboardJournalDay | null>(null);
  const [journalSummaries, setJournalSummaries] = useState<DashboardJournalDaySummary[]>([]);
  const [selectedJournalDate, setSelectedJournalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sessionStatsData, setSessionStatsData] = useState<SessionStats | null>(null);
  const [learningCurriculums, setLearningCurriculums] = useState<DashboardLearningCurriculum[]>([]);
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

  const handleMessage = useCallback((event: MessageEvent) => {
    // Only accept messages from the VSCode webview host
    if (!event.origin || !event.origin.startsWith('vscode-webview://')) return;
    const msg = event.data as ExtToDashboardMessage;
    switch (msg.type) {
      case 'init':
        setAccount(msg.account);
        setConnections(msg.connections);
        setSettings(msg.settings);
        setProviderKeys(msg.providerKeys);
        if (!msg.account && Object.values(msg.providerKeys).some(Boolean)) {
          setByokMode(true);
          setPage('overview');
        }
        setInitialized(true);
        break;
      case 'account_updated':
        setAccount(msg.account);
        if (!msg.account && Object.values(providerKeys).some(Boolean)) {
          setByokMode(true);
          setPage('overview');
        }
        break;
      case 'provider_keys_updated':
        setProviderKeys(msg.providerKeys);
        break;
      case 'memories_loaded':
        setMemories(msg.memories);
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
      // Task messages
      case 'tasks_loaded':
        setTasks(msg.tasks);
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
      case 'journal_day_updated':
        setJournalDay(msg.day);
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
      case 'error':
        setErrorMsg(msg.message);
        setTimeout(() => setErrorMsg(null), 5000);
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    post({ type: 'webview_ready' });
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Load data when navigating to pages
  useEffect(() => {
    if (page === 'history' && conversations.length === 0 && !conversationsLoading) {
      setConversationsLoading(true);
      post({ type: 'load_conversations' });
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
    if (page === 'tasks' && tasks.length === 0) {
      post({ type: 'load_tasks' });
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
    // BYOK: refresh session stats when viewing usage or overview
    if ((page === 'usage' || page === 'overview') && byokMode && !account) {
      post({ type: 'load_session_stats' });
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

  function handleSkipAccount() {
    setByokMode(true);
    setPage('overview');
    post({ type: 'skip_account' });
  }

  function handleConnectAccount() {
    setByokMode(false);
    setPage('overview');
  }

  const renderPage = () => {
    if (!hasAccess) {
      return <ConnectAccount onSkipAccount={handleSkipAccount} />;
    }
    const mode = account ? 'platform' as const : 'byok' as const;
    switch (page) {
      case 'overview':
        return <Overview account={account} connections={connections} onNavigate={setPage} logs={usageLogs} sessionStats={sessionStatsData} mode={mode} />;
      case 'keys':
        return <Settings settings={settings} onSettingsChange={setSettings} providerKeys={providerKeys} showProviderKeys />;
      case 'usage':
        return <Usage account={account} logs={usageLogs} sessionStats={sessionStatsData} mode={mode} />;
      case 'memory':
        return <Memory memories={account ? memories : localMemories} mode={mode} />;
      case 'tasks':
        return <Tasks tasks={tasks} />;
      case 'journal':
        return (
          <Journal
            day={journalDay}
            selectedDate={selectedJournalDate}
            userName={account?.name?.split(' ')[0] ?? null}
            onSaveUserEntry={(date, content, mood, tags) => post({ type: 'save_journal_user_entry', date, content, mood, tags })}
          />
        );
      case 'learning':
        return <Learning curriculums={learningCurriculums} />;
      case 'sync':
        return <Sync syncStatus={syncStatus} syncingTypes={syncingTypes} syncResults={syncResults} isConnected={!!account} />;
      case 'releases':
        return <Releases releases={releases} />;
      case 'connections':
        return <Connections connections={connections} />;
      case 'history':
        return <History conversations={conversations} loading={conversationsLoading} />;
      case 'support':
        return <Support tickets={tickets} loading={ticketsLoading} mode={mode} />;
      case 'billing':
        return account ? <Billing account={account} /> : <Settings settings={settings} onSettingsChange={setSettings} providerKeys={providerKeys} showProviderKeys />;
      case 'settings':
        return <Settings settings={settings} onSettingsChange={setSettings} providerKeys={providerKeys} showProviderKeys={!account} />;
      case 'admin_support':
        return <AdminSupport tickets={adminTickets} total={adminTicketsTotal} loading={adminTicketsLoading} />;
      case 'admin_proposals':
        return <AdminProposals proposals={adminProposals} total={adminProposalsTotal} loading={adminProposalsLoading} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden text-sm">
      {hasAccess && (
        <NavSidebar
          currentPage={page}
          onNavigate={setPage}
          mode={account ? 'platform' : 'byok'}
          email={account?.email}
          isAdmin={account?.tier === 'admin'}
          onConnectAccount={handleConnectAccount}
          journalSummaries={journalSummaries}
          selectedJournalDate={selectedJournalDate}
          onSelectJournalDate={(date) => {
            setSelectedJournalDate(date);
            post({ type: 'load_journal_day', date });
          }}
          onLoadJournalSummaries={(from, to) => post({ type: 'load_journal_summaries', from, to })}
        />
      )}

      <main className="flex-1 overflow-y-auto p-8">
        {errorMsg && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">
            {errorMsg}
          </div>
        )}
        {renderPage()}
      </main>
    </div>
  );
}
