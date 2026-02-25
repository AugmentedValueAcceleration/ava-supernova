import { useState, useEffect, useCallback } from 'react';
import { NavSidebar } from './components/NavSidebar';
import { ConnectAccount } from './pages/ConnectAccount';
import { Overview } from './pages/Overview';
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
  ExtToDashboardMessage,
  DashboardToExtMessage,
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleMessage = useCallback((event: MessageEvent) => {
    const msg = event.data as ExtToDashboardMessage;
    switch (msg.type) {
      case 'init':
        setAccount(msg.account);
        setConnections(msg.connections);
        setSettings(msg.settings);
        setInitialized(true);
        break;
      case 'account_updated':
        setAccount(msg.account);
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          opacity: 0.4,
          fontSize: '13px',
          fontFamily: 'var(--vscode-font-family)',
          color: 'var(--vscode-foreground)',
          background: 'var(--vscode-editor-background)',
        }}
      >
        Loading…
      </div>
    );
  }

  const renderPage = () => {
    if (!account) {
      return <ConnectAccount />;
    }
    switch (page) {
      case 'overview':
        return <Overview account={account} connections={connections} onNavigate={setPage} />;
      case 'memory':
        return <Memory memories={memories} />;
      case 'connections':
        return <Connections connections={connections} />;
      case 'billing':
        return <Billing account={account} />;
      case 'settings':
        return <Settings settings={settings} onSettingsChange={setSettings} />;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--vscode-editor-background)',
        color: 'var(--vscode-editor-foreground)',
        fontFamily: 'var(--vscode-font-family)',
        fontSize: 'var(--vscode-font-size, 13px)',
      }}
    >
      {account && <NavSidebar currentPage={page} onNavigate={setPage} />}

      <main style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {errorMsg && (
          <div
            style={{
              marginBottom: '16px',
              padding: '10px 14px',
              borderRadius: '6px',
              background: 'var(--vscode-inputValidation-errorBackground)',
              border: '1px solid var(--vscode-inputValidation-errorBorder)',
              color: 'var(--vscode-errorForeground)',
              fontSize: '12px',
            }}
          >
            {errorMsg}
          </div>
        )}
        {renderPage()}
      </main>
    </div>
  );
}
