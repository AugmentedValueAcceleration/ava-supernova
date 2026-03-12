import { useState, useEffect, useCallback } from 'react';
import { NavSidebar } from './components/NavSidebar';
import { ConnectAccount } from './pages/ConnectAccount';
import { Overview } from './pages/Overview';
import { Usage } from './pages/Usage';
import { Memory } from './pages/Memory';
import { Connections } from './pages/Connections';
import { Billing } from './pages/Billing';
import { Settings } from './pages/Settings';
import type {
  Page,
  AccountInfo,
  ConnectionStatus,
  DashboardSettings,
  MemoryEntry,
  ProviderKeyStatus,
  UsageLogEntry,
  ExtToDashboardMessage,
  DashboardToExtMessage,
} from './types/messages';

declare function acquireVsCodeApi(): {
  postMessage: (msg: DashboardToExtMessage) => void;
};

function ComingSoon({ page }: { page: string }) {
  const label = page.charAt(0).toUpperCase() + page.slice(1);
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="rounded-full bg-[var(--bg-input)] p-4">
        <svg className="h-8 w-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-lg font-medium text-white">{label}</h2>
      <p className="text-sm text-[var(--text-muted)]">This feature is coming soon.</p>
    </div>
  );
}

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
  const [byokMode, setByokMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleMessage = useCallback((event: MessageEvent) => {
    // Only accept messages from the VSCode webview host
    if (event.origin && !event.origin.startsWith('vscode-webview://')) return;
    const msg = event.data as ExtToDashboardMessage;
    switch (msg.type) {
      case 'init':
        setAccount(msg.account);
        setConnections(msg.connections);
        setSettings(msg.settings);
        setProviderKeys(msg.providerKeys);
        if (!msg.account && Object.values(msg.providerKeys).some(Boolean)) {
          setByokMode(true);
          setPage('settings');
        }
        setInitialized(true);
        break;
      case 'account_updated':
        setAccount(msg.account);
        if (!msg.account && Object.values(providerKeys).some(Boolean)) {
          setByokMode(true);
          setPage('settings');
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
    setPage('settings');
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
    switch (page) {
      case 'overview':
        if (account) {
          return <Overview account={account} connections={connections} onNavigate={setPage} logs={usageLogs} />;
        }
        return <Settings settings={settings} onSettingsChange={setSettings} providerKeys={providerKeys} showProviderKeys />;
      case 'keys':
        return <Settings settings={settings} onSettingsChange={setSettings} providerKeys={providerKeys} showProviderKeys />;
      case 'usage':
        if (account) {
          return <Usage account={account} logs={usageLogs} />;
        }
        return <Settings settings={settings} onSettingsChange={setSettings} providerKeys={providerKeys} showProviderKeys />;
      case 'memory':
        return <Memory memories={memories} />;
      case 'connections':
        return <Connections connections={connections} />;
      case 'history':
      case 'support':
        return <ComingSoon page={page} />;
      case 'billing':
        return account ? <Billing account={account} /> : <Settings settings={settings} onSettingsChange={setSettings} providerKeys={providerKeys} showProviderKeys />;
      case 'settings':
        return <Settings settings={settings} onSettingsChange={setSettings} providerKeys={providerKeys} showProviderKeys={!account} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden text-sm">
      {hasAccess && <NavSidebar currentPage={page} onNavigate={setPage} mode={account ? 'platform' : 'byok'} email={account?.email} isAdmin={account?.tier === 'admin'} onConnectAccount={handleConnectAccount} />}

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
