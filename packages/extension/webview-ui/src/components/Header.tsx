import { useEffect, useState, useCallback } from 'react';
import { ModelSelector } from './ModelSelector';
import { t, useLocale } from '../i18n';
import { useVSCodeApi } from '../hooks/useVSCodeApi';

type DataMode = 'local' | 'cloud' | 'both';
const DATA_MODES: DataMode[] = ['local', 'cloud', 'both'];

interface HeaderProps {
  models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean }>;
  activeModel: string | null;
  needsSetup: boolean;
  onSwitch: (modelId: string) => void;
  onOpenDashboard: () => void;
  onOpenHistory: () => void;
  onNewChat: () => void;
  onToggleTasks: () => void;
  tasksOpen: boolean;
  /** Length of session task list — drives the badge on the Tasks pill. */
  sessionTaskCount?: number;
  /** Loaded conversation title — chip next to the model picker. null
   *  hides the chip (fresh chat). Mirrors IDE chat header. */
  conversationTitle?: string | null;
}

// ── Step 1b of extension↔IDE chat alignment ─────────────────────────────────
// Right-side icon cluster (history / dashboard / new-chat icon-only buttons)
// dropped in favour of labelled pills matching the IDE chat header at
// DashboardPages.tsx:4232-4273. Tasks gets a count badge; New Chat becomes
// a labelled `+ New Chat` pill. The Branding block stays — it's panel-only
// chrome (the IDE doesn't need it because its window already says "Ava
// Supernova IDE"). Dashboard navigation (Settings entry) folds into the
// model picker's empty-state placeholder; the standalone gear button is
// gone. History is reachable from the dashboard sidebar's History page;
// the icon-only header button is gone.

export function Header({
  models,
  activeModel,
  needsSetup,
  onSwitch,
  onOpenDashboard,
  onNewChat,
  onToggleTasks,
  tasksOpen,
  sessionTaskCount = 0,
  conversationTitle,
}: HeaderProps) {
  useLocale();
  const { postMessage } = useVSCodeApi();

  // Local/Cloud/Both data-mode pill — mirrors IDE chat header at
  // DashboardPages.tsx:4163-4205 and the dashboard chat Header. Persists
  // to localStorage AND posts set_data_mode to the host so the active
  // managers (memory, tasks, journal, learning, history, creative)
  // honour the choice on the next save.
  const [dataMode, setDataMode] = useState<DataMode>(() => {
    try {
      const stored = localStorage.getItem('ava-data-mode');
      if (stored === 'cloud' || stored === 'both' || stored === 'local') return stored;
    } catch { /* localStorage unavailable */ }
    return 'local';
  });

  useEffect(() => {
    // Echo current state to host on mount so the manager flags align
    // with localStorage even before the user clicks the pill.
    postMessage({ type: 'set_data_mode', mode: dataMode } as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to host broadcasts so a flip on the dashboard pill is
  // reflected here without a reload (and vice-versa). The host emits
  // 'data_mode_changed' from applyDataMode regardless of which webview
  // triggered the change.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'data_mode_changed' && (msg.mode === 'local' || msg.mode === 'cloud' || msg.mode === 'both')) {
        setDataMode(msg.mode);
        try { localStorage.setItem('ava-data-mode', msg.mode); } catch { /* */ }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const cycleDataMode = useCallback(() => {
    setDataMode(prev => {
      const idx = DATA_MODES.indexOf(prev);
      const next = DATA_MODES[(idx + 1) % DATA_MODES.length];
      try { localStorage.setItem('ava-data-mode', next); } catch { /* */ }
      postMessage({ type: 'set_data_mode', mode: next } as never);
      return next;
    });
  }, [postMessage]);

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b"
      style={{ borderColor: 'rgba(168, 85, 247, 0.12)' }}
      role="toolbar"
      aria-label={t('header.controls_aria')}
    >
      {/* Branding — panel-only chrome (IDE doesn't need a wordmark inside
          the chat surface because the window title already carries it). */}
      <div className="flex items-baseline gap-1 mr-1 select-none flex-shrink-0">
        <span className="text-[15px] font-bold" style={{ color: '#cdd6f4' }}>Ava</span>
        <span className="text-[9px] uppercase tracking-[2px] opacity-40" style={{ color: '#cdd6f4' }}>{t('brand.supernova')}</span>
      </div>

      {/* Model selector */}
      <div className="min-w-0 flex justify-start">
        <ModelSelector
          models={models}
          activeModel={activeModel}
          needsSetup={needsSetup}
          onSwitch={onSwitch}
          onOpenDashboard={onOpenDashboard}
        />
      </div>

      {/* Conversation title chip — mirrors IDE chat header at
          DashboardPages.tsx:4154-4157. Hidden when no conversation
          loaded (fresh chat). */}
      {conversationTitle && (
        <span
          style={{
            fontSize: 12,
            color: '#6c7086',
            maxWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={conversationTitle}
        >
          {conversationTitle}
        </span>
      )}

      <div className="flex-1" />

      {/* Local / Cloud / Both data-mode pill — mirrors IDE chat header
          at DashboardPages.tsx:4163-4205. */}
      <button
        onClick={cycleDataMode}
        title={dataMode === 'local'
          ? 'Local — data stays on your machine. Click to switch to Cloud.'
          : dataMode === 'cloud'
            ? 'Cloud — syncing to platform. Click to switch to Both.'
            : 'Both — local backup + cloud sync. Click to switch to Local.'}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
          background: dataMode === 'cloud' ? 'rgba(96,165,250,0.1)'
            : dataMode === 'both' ? 'rgba(168,85,247,0.1)'
            : 'rgba(166,227,161,0.1)',
          border: `1px solid ${dataMode === 'cloud' ? 'rgba(96,165,250,0.3)'
            : dataMode === 'both' ? 'rgba(168,85,247,0.3)'
            : 'rgba(166,227,161,0.3)'}`,
          borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
          color: dataMode === 'cloud' ? '#60a5fa'
            : dataMode === 'both' ? '#a855f7'
            : '#a6e3a1',
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: dataMode === 'cloud' ? '#60a5fa'
            : dataMode === 'both' ? '#a855f7'
            : '#a6e3a1',
        }} />
        {dataMode === 'local' ? 'Local' : dataMode === 'cloud' ? 'Cloud' : 'Both'}
      </button>

      {/* Tasks — labelled pill with badge, mirrors IDE header at
          DashboardPages.tsx:4232-4254. */}
      <button
        onClick={onToggleTasks}
        title={t('header.tasks')}
        aria-label={t('header.tasks')}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px',
          background: tasksOpen ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.05)',
          border: `1px solid ${tasksOpen ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.15)'}`,
          borderRadius: 8,
          color: tasksOpen ? '#a855f7' : '#6c7086',
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M3.75 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 3.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 7.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 11.5h8v1H6v-1z"/>
        </svg>
        Tasks
        {sessionTaskCount > 0 && (
          <span style={{
            fontSize: 9, padding: '1px 5px', borderRadius: 8,
            background: 'rgba(168,85,247,0.25)', color: '#a855f7',
          }}>{sessionTaskCount}</span>
        )}
      </button>

      {/* New Chat — labelled pill, mirrors IDE header at
          DashboardPages.tsx:4256-4273. */}
      <button
        onClick={onNewChat}
        title={t('header.new_chat')}
        aria-label={t('header.new_chat')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
          background: 'rgba(168,85,247,0.1)',
          border: '1px solid rgba(168,85,247,0.25)',
          borderRadius: 8,
          color: '#a855f7',
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New Chat
      </button>
    </div>
  );
}
