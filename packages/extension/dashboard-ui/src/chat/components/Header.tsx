import { useState, useEffect, useCallback } from 'react';
import { ModelSelector } from './ModelSelector';
import { t, tt, useLocale } from '../../i18n';
import { post } from '../../vscode';
import type { ProviderSource } from '../../types/messages';

const SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes
const SYNC_TYPES = ['memory', 'tasks', 'journal', 'learning', 'history', 'settings', 'personality'] as const;

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
  /** @deprecated extension-specific UX, kept for backward-compat but ignored — IDE doesn't show a sidebar toggle in the chat header. */
  onToggleSidebar?: () => void;
  /** @deprecated see onToggleSidebar. */
  sidebarCollapsed?: boolean;
  /** @deprecated extension-specific, IDE has no L↔R flip. */
  onFlipSidebar?: () => void;
  /** @deprecated see onFlipSidebar. */
  sidebarSide?: 'left' | 'right';
  sessionCredits?: number;
  /** Length of session task list — drives the badge on the Tasks pill. */
  sessionTaskCount?: number;
  /** Loaded conversation title — rendered as a chip next to the model
   *  picker (mirrors IDE chat). null/undefined hides the chip. */
  conversationTitle?: string | null;
  providerSource?: ProviderSource;
  platformStatus?: { connected: boolean; tier: string | null; freeTokensUsed: number; freeTokensLimit: number; subTokensUsed: number; subTokensLimit: number | null } | null;
  /** @deprecated extension-only Platform/API-key toggle — IDE doesn't have it; provider routing is set in Settings. */
  onProviderSourceChange?: (source: ProviderSource) => void;
}

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
  platformStatus,
}: HeaderProps) {
  useLocale();

  // Knowledge-pack dropdown removed in v0.59.2. Stale localStorage key
  // 'ava-knowledge-packs' is harmless if it survives from a prior install.

  // Local/Cloud/Both data mode — persisted
  type DataMode = 'local' | 'cloud' | 'both';
  const DATA_MODES: DataMode[] = ['local', 'cloud', 'both'];

  const [dataMode, setDataMode] = useState<DataMode>(() => {
    return (localStorage.getItem('ava-data-mode') as DataMode) || 'local';
  });

  // Notify the extension host of the current mode on mount so its save
  // handlers know whether to write locally, to the cloud, or both. Without
  // this the host's default ('local') stays in place until the user
  // clicks the toggle for the first time — and any sync in the meantime
  // would ignore the user's actual pref stored in localStorage.
  useEffect(() => {
    post({ type: 'set_data_mode', mode: dataMode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to host broadcasts so a flip on the panel pill is
  // reflected here without a reload (and vice-versa). Mirrors the
  // panel Header's subscription so both surfaces stay in sync.
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
    if (!platformStatus?.connected) return;
    setDataMode(prev => {
      const idx = DATA_MODES.indexOf(prev);
      const next = DATA_MODES[(idx + 1) % DATA_MODES.length];
      localStorage.setItem('ava-data-mode', next);
      // Tell the host immediately — save handlers read this before every
      // write, so a delayed post would mean the first write after a
      // toggle could still go the old direction.
      post({ type: 'set_data_mode', mode: next });
      return next;
    });
  }, [platformStatus?.connected]);

  // Auto-sync when cloud or both mode is active
  useEffect(() => {
    if ((dataMode !== 'cloud' && dataMode !== 'both') || !platformStatus?.connected) return;

    // Sync immediately on switching to cloud/both
    for (const dt of SYNC_TYPES) {
      post({ type: 'push_to_cloud', dataType: dt });
    }

    const interval = setInterval(() => {
      for (const dt of SYNC_TYPES) {
        post({ type: 'push_to_cloud', dataType: dt });
      }
    }, SYNC_INTERVAL);

    return () => clearInterval(interval);
  }, [dataMode, platformStatus?.connected]);

  return (
    <div className="border-b" style={{ borderColor: 'rgba(168, 85, 247, 0.12)' }}>
    <div className="flex items-center gap-2 px-3 py-2" role="toolbar" aria-label="Chat controls">
      {/* Model selector — sidebar toggle dropped to match IDE which has no
          sidebar-toggle in the chat header (the dashboard sidebar collapses
          via its own affordance). */}
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
          DashboardPages.tsx:4154-4157. Hidden when no conversation is
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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side: data mode + provider toggle + tokens + context ring + tasks */}
      <div className="flex items-center gap-3">
        {/* Local/Cloud/Both data toggle */}
        {platformStatus?.connected && (
          <button
            onClick={cycleDataMode}
            className="flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-[10px] font-semibold cursor-pointer transition-all"
            style={{
              background: dataMode === 'cloud' ? 'rgba(137,180,250,0.1)'
                : dataMode === 'both' ? 'rgba(168,85,247,0.1)'
                : 'rgba(166,227,161,0.1)',
              borderColor: dataMode === 'cloud' ? 'rgba(137,180,250,0.3)'
                : dataMode === 'both' ? 'rgba(168,85,247,0.3)'
                : 'rgba(166,227,161,0.3)',
              color: dataMode === 'cloud' ? '#89b4fa'
                : dataMode === 'both' ? '#a855f7'
                : '#a6e3a1',
            }}
            title={dataMode === 'local'
              ? 'Local — data stays on your machine. Click to switch to Cloud.'
              : dataMode === 'cloud'
              ? 'Cloud — syncing to platform. Click to switch to Both.'
              : 'Both — local backup + cloud sync. Click to switch to Local.'}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: dataMode === 'cloud' ? '#89b4fa'
                  : dataMode === 'both' ? '#a855f7'
                  : '#a6e3a1',
              }}
            />
            {dataMode === 'local' ? tt('dash.chat.local', 'Local') : dataMode === 'cloud' ? tt('dash.chat.cloud', 'Cloud') : tt('dash.chat.both', 'Both')}
          </button>
        )}

        {/* Credit balance display — matches IDE chat header at
            DashboardPages.tsx:4210-4225. Shows total platform balance
            remaining when signed in (with red/amber/green colour ramp at
            95/80%); falls back to session count for the standalone case.
            Plain "X credits" text from the previous extension shape is
            retired — IDE doesn't show that. */}
        {platformStatus?.connected ? (() => {
          const limit = (platformStatus.freeTokensLimit ?? 0) + (platformStatus.subTokensLimit ?? 0);
          const used = (platformStatus.freeTokensUsed ?? 0) + (platformStatus.subTokensUsed ?? 0);
          const isAdmin = limit >= 999_999_999;
          if (isAdmin) {
            return (
              <span
                className="text-[11px] tabular-nums opacity-50"
                style={{ fontFamily: 'monospace', color: '#6c7086' }}
                title="Unlimited credits"
              >∞ credits</span>
            );
          }
          if (limit <= 0) return null;
          const remaining = Math.max(0, limit - used);
          const pct = (used / limit) * 100;
          const color = pct >= 95 ? '#ef4444' : pct >= 80 ? '#eab308' : '#a6e3a1';
          return (
            <span
              className="text-[11px] tabular-nums font-semibold"
              style={{ fontFamily: 'monospace', color }}
              title={`${remaining.toLocaleString()} of ${limit.toLocaleString()} credits remaining (${Math.round(pct)}% used)`}
            >
              {remaining.toLocaleString()} left
            </span>
          );
        })() : null}

        {/* Tasks — labelled pill with badge, matching IDE chat header
            at DashboardPages.tsx:4232-4254. Replaces the previous
            icon-only button. */}
        <button
          onClick={onToggleTasks}
          title={t('header.tasks')}
          aria-label="Tasks"
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

        {/* New Chat — labelled pill, matching IDE chat header at
            DashboardPages.tsx:4256-4273. Replaces the per-sidebar
            New Chat icon button (which is being dropped from the
            dashboard NavSidebar in this same commit). */}
        <button
          onClick={onNewChat}
          title={t('header.new_chat')}
          aria-label="New chat"
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
    </div>

      {/* Token usage bar — full width below header. Unified total covering
          free + subscription + top-ups so Pro/Ultra users see their real
          balance, not just the 3M free pool. */}
      {platformStatus?.connected && platformStatus.freeTokensLimit > 0 && platformStatus.freeTokensLimit < 999_999_999 && (() => {
        const totalLimit = platformStatus.freeTokensLimit + (platformStatus.subTokensLimit ?? 0);
        const totalUsed = platformStatus.freeTokensUsed + platformStatus.subTokensUsed;
        const remaining = Math.max(0, totalLimit - totalUsed);
        const pct = totalLimit > 0 ? Math.max(0, Math.min(100, (remaining / totalLimit) * 100)) : 0;
        const color = pct <= 5 ? '#ef4444' : pct <= 20 ? '#eab308' : '#a855f7';
        return (
          <div className="px-3 pb-1.5">
            <div className="flex items-center gap-2">
              <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(168,85,247,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
              <span
                className="text-[9px] tabular-nums shrink-0"
                style={{ color, opacity: pct <= 20 ? 0.9 : 0.4, fontFamily: 'monospace' }}
              >
                {remaining.toLocaleString('en-US')} left
              </span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
