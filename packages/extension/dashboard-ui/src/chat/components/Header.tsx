import { ModelSelector } from './ModelSelector';
import { t, useLocale } from '../../i18n';
import type { ProviderSource } from '../../types/messages';

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

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
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
  onFlipSidebar?: () => void;
  sidebarSide?: 'left' | 'right';
  sessionTokens?: number;
  contextUsage?: { used: number; limit: number; percent: number } | null;
  providerSource?: ProviderSource;
  platformStatus?: { connected: boolean; tier: string | null; freeTokensUsed: number; freeTokensLimit: number } | null;
  onProviderSourceChange?: (source: ProviderSource) => void;
}

export function Header({
  models,
  activeModel,
  needsSetup,
  onSwitch,
  onOpenDashboard,
  onToggleTasks,
  tasksOpen,
  onToggleSidebar,
  sidebarCollapsed,
  sessionTokens = 0,
  contextUsage,
  providerSource,
  platformStatus,
  onProviderSourceChange,
}: HeaderProps) {
  useLocale();
  const btnBase = `flex items-center justify-center w-7 h-7 rounded
                   hover:bg-[var(--vscode-toolbar-hoverBackground)]
                   text-[var(--vscode-foreground)] opacity-70 hover:opacity-100
                   bg-transparent border-none cursor-pointer text-sm`;

  const contextPercent = contextUsage?.percent ?? 0;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'rgba(168, 85, 247, 0.12)' }} role="toolbar" aria-label="Chat controls">
      {/* Sidebar toggle — only shows when sidebar is collapsed */}
      {onToggleSidebar && sidebarCollapsed && (
        <button onClick={onToggleSidebar} title="Show sidebar" aria-label="Show sidebar" className={btnBase}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M1 2h14v12H1V2zm1 1v10h4V3H2zm5 0v10h7V3H7z"/>
          </svg>
        </button>
      )}

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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side: provider toggle + tokens + context ring + tasks */}
      <div className="flex items-center gap-3">
        {/* Provider toggle (Platform / API Key) */}
        {platformStatus?.connected && onProviderSourceChange && (
          <button
            onClick={() => onProviderSourceChange(providerSource === 'platform' ? 'byok' : 'platform')}
            className="flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-[10px] font-semibold cursor-pointer transition-all"
            style={{
              background: providerSource === 'platform' ? 'rgba(166,227,161,0.1)' : 'rgba(108,112,134,0.1)',
              borderColor: providerSource === 'platform' ? 'rgba(166,227,161,0.3)' : 'rgba(108,112,134,0.2)',
              color: providerSource === 'platform' ? '#a6e3a1' : '#6c7086',
            }}
            title={providerSource === 'platform' ? t('input.provider_switch_free') : t('input.provider_use_own_key')}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: providerSource === 'platform' ? '#a6e3a1' : '#6c7086' }}
            />
            {providerSource === 'platform'
              ? (platformStatus.tier === 'free' ? t('input.provider_free') : t('input.provider_platform'))
              : t('input.provider_api_key')}
          </button>
        )}

        {/* Session token counter */}
        <span
          className="text-[11px] tabular-nums opacity-40"
          style={{ fontFamily: 'monospace' }}
          title={`${sessionTokens.toLocaleString()} tokens used this session`}
        >
          {sessionTokens > 0 ? fmtTokens(sessionTokens) : '0'} tokens
        </span>

        {/* Context usage ring */}
        {contextPercent > 0 && (() => {
          const isWarning = contextPercent >= 80;
          const isCritical = contextPercent >= 90;
          const color = isCritical ? '#ef4444' : isWarning ? '#eab308' : '#a855f7';
          const r = 9;
          const circumference = 2 * Math.PI * r;
          const dashOffset = circumference - (contextPercent / 100) * circumference;
          return (
            <div className="relative flex items-center justify-center" style={{ width: 24, height: 24 }} title={`Context: ${contextPercent}%`}>
              <svg width="22" height="22" viewBox="0 0 22 22" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="11" cy="11" r={r} fill="none" stroke="rgba(168, 85, 247, 0.12)" strokeWidth="2.5" />
                <circle cx="11" cy="11" r={r} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={dashOffset} style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
              </svg>
              <span className="absolute text-[7px] font-bold tabular-nums" style={{ color, fontFamily: 'monospace' }}>{contextPercent}</span>
            </div>
          );
        })()}

        {/* Tasks */}
        <button
          onClick={onToggleTasks}
          title={t('header.tasks')}
          aria-label="Tasks"
          className={`flex items-center justify-center w-7 h-7 rounded
                     hover:bg-[var(--vscode-toolbar-hoverBackground)]
                     text-[var(--vscode-foreground)] ${tasksOpen ? 'opacity-100' : 'opacity-70'} hover:opacity-100
                     bg-transparent border-none cursor-pointer text-sm`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M3.75 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 3.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 7.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 11.5h8v1H6v-1z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
