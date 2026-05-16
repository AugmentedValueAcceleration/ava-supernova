import { useEffect, useState, useCallback } from 'react';
import { ModelSelector } from './ModelSelector';
import { t, tt, useLocale } from '../i18n';
import { useVSCodeApi } from '../hooks/useVSCodeApi';

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

  // Cloud-sync toggle. Data is ALWAYS saved locally; this only controls
  // whether a copy is also backed up to the platform. Persists to
  // localStorage AND posts set_cloud_sync to the host so the active
  // managers (memory, tasks, journal, learning, creative) honour the
  // choice on the next save. Replaces the old three-way Local/Cloud/Both
  // "Data Mode" — in a local-first product "local" was never a mode.
  const [cloudSync, setCloudSync] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('ava-cloud-sync');
      if (stored === 'true') return true;
      if (stored === 'false') return false;
      // Migrate the legacy three-value data mode: cloud/both -> on.
      const legacy = localStorage.getItem('ava-data-mode');
      return legacy === 'cloud' || legacy === 'both';
    } catch { return false; }
  });

  useEffect(() => {
    // Echo current state to host on mount so the manager flags align
    // with localStorage even before the user clicks the toggle.
    postMessage({ type: 'set_cloud_sync', enabled: cloudSync } as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to host broadcasts so a flip on the dashboard toggle is
  // reflected here without a reload (and vice-versa).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'cloud_sync_changed' && typeof msg.enabled === 'boolean') {
        setCloudSync(msg.enabled);
        try { localStorage.setItem('ava-cloud-sync', String(msg.enabled)); } catch { /* */ }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const toggleCloudSync = useCallback(() => {
    setCloudSync(prev => {
      const next = !prev;
      try { localStorage.setItem('ava-cloud-sync', String(next)); } catch { /* */ }
      postMessage({ type: 'set_cloud_sync', enabled: next } as never);
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

      {/* Cloud-sync toggle — data is always local; this controls the
          optional cloud backup. Green = local only, blue = cloud sync on. */}
      <button
        onClick={toggleCloudSync}
        title={cloudSync
          ? 'Cloud sync ON — a copy of your data is backed up to the platform. Click to turn off.'
          : 'Cloud sync OFF — your data stays on this machine only. Click to turn on.'}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
          background: cloudSync ? 'rgba(96,165,250,0.1)' : 'rgba(166,227,161,0.1)',
          border: `1px solid ${cloudSync ? 'rgba(96,165,250,0.3)' : 'rgba(166,227,161,0.3)'}`,
          borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
          color: cloudSync ? '#60a5fa' : '#a6e3a1',
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: cloudSync ? '#60a5fa' : '#a6e3a1',
        }} />
        {cloudSync ? tt('dash.chat.cloud_sync', 'Cloud sync') : tt('dash.chat.local_only', 'Local only')}
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
        {tt('header.tasks', 'Tasks')}
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
        {tt('header.new_chat', 'New Chat')}
      </button>
    </div>
  );
}
