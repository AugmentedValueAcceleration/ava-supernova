import { useState, useEffect, useCallback, useRef } from 'react';
import { ModelSelector } from './ModelSelector';
import { t, useLocale } from '../../i18n';
import { post } from '../../vscode';
import type { ProviderSource } from '../../types/messages';

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

const KNOWLEDGE_PACKS = [
  { id: 'game-development', name: 'Game Development', icon: '\uD83C\uDFAE', desc: 'Unreal, Godot, Unity' },
  { id: 'marketing', name: 'Marketing & Growth', icon: '\uD83D\uDCC8', desc: 'SEO, content, analytics' },
  { id: 'finance', name: 'Finance & Business', icon: '\uD83D\uDCB0', desc: 'Modelling, budgeting, fundraising' },
  { id: 'legal', name: 'Legal & Compliance', icon: '\u2696\uFE0F', desc: 'Contracts, IP, privacy' },
  { id: 'product', name: 'Product Management', icon: '\uD83D\uDCCB', desc: 'Roadmaps, metrics, user research' },
  { id: 'devops', name: 'DevOps & Infrastructure', icon: '\u2601\uFE0F', desc: 'CI/CD, Docker, cloud' },
  { id: 'data-science', name: 'Data Science', icon: '\uD83D\uDCC9', desc: 'Analysis, ML, visualisation' },
];

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

  // Knowledge packs — persisted
  const [enabledPacks, setEnabledPacks] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('ava-knowledge-packs');
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [packsOpen, setPacksOpen] = useState(false);
  const packsRef = useRef<HTMLDivElement>(null);

  const togglePack = useCallback((id: string) => {
    setEnabledPacks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem('ava-knowledge-packs', JSON.stringify([...next]));
      // Save to host and reinitialise session with new knowledge
      post({ type: 'toggle_knowledge_pack', packId: id, enabled: next.has(id) } as any);
      return next;
    });
  }, []);

  // Close packs dropdown on outside click
  useEffect(() => {
    if (!packsOpen) return;
    const handler = (e: MouseEvent) => {
      if (packsRef.current && !packsRef.current.contains(e.target as Node)) setPacksOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [packsOpen]);

  // Local/Cloud data mode — persisted
  const [dataMode, setDataMode] = useState<'local' | 'cloud'>(() => {
    return (localStorage.getItem('ava-data-mode') as 'local' | 'cloud') || 'local';
  });

  const toggleDataMode = useCallback(() => {
    if (!platformStatus?.connected) return;
    setDataMode(prev => {
      const next = prev === 'local' ? 'cloud' : 'local';
      localStorage.setItem('ava-data-mode', next);
      return next;
    });
  }, [platformStatus?.connected]);

  // Auto-sync every 15 minutes when cloud mode is active
  useEffect(() => {
    if (dataMode !== 'cloud' || !platformStatus?.connected) return;

    // Sync immediately on switching to cloud
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

      {/* Knowledge packs dropdown */}
      <div className="relative" ref={packsRef}>
        <button
          onClick={() => setPacksOpen(!packsOpen)}
          className="flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-[10px] font-semibold cursor-pointer transition-all"
          style={{
            background: enabledPacks.size > 0 ? 'rgba(168,85,247,0.1)' : 'rgba(108,112,134,0.1)',
            borderColor: enabledPacks.size > 0 ? 'rgba(168,85,247,0.3)' : 'rgba(108,112,134,0.2)',
            color: enabledPacks.size > 0 ? '#a855f7' : '#6c7086',
          }}
          title="Knowledge Packs"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14.5 2H9l-.35-.15-.65-.64-.65.64L7 2H1.5l-.5.5v10l.5.5h13l.5-.5v-10l-.5-.5zM7 3H2v9h5V3zm7 9H9V3h5v9z"/>
          </svg>
          {enabledPacks.size > 0 ? `${enabledPacks.size} pack${enabledPacks.size > 1 ? 's' : ''}` : 'Packs'}
          <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor" style={{ opacity: 0.5 }}>
            <path d="M2 4l4 4 4-4"/>
          </svg>
        </button>

        {packsOpen && (
          <div className="absolute left-0 top-full mt-1 z-50 rounded-lg border overflow-hidden"
            style={{ background: '#1e1e2e', borderColor: 'rgba(168,85,247,0.2)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 240 }}
          >
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider opacity-40 border-b" style={{ borderColor: 'rgba(168,85,247,0.1)' }}>
              Knowledge Packs
            </div>
            {KNOWLEDGE_PACKS.map(pack => {
              const enabled = enabledPacks.has(pack.id);
              return (
                <button
                  key={pack.id}
                  onClick={() => togglePack(pack.id)}
                  className="flex items-center gap-3 w-full px-3 py-2 text-left bg-transparent border-none cursor-pointer transition hover:bg-white/[0.04]"
                >
                  <span className="text-sm">{pack.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium" style={{ color: enabled ? '#cdd6f4' : '#6c7086' }}>{pack.name}</div>
                    <div className="text-[10px] opacity-40">{pack.desc}</div>
                  </div>
                  <div
                    className="w-8 h-4 rounded-full relative transition-all"
                    style={{ background: enabled ? '#a855f7' : 'rgba(108,112,134,0.3)' }}
                  >
                    <div
                      className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                      style={{ left: enabled ? 16 : 2 }}
                    />
                  </div>
                </button>
              );
            })}
            <div className="px-3 py-1.5 text-[10px] opacity-30 border-t" style={{ borderColor: 'rgba(168,85,247,0.1)' }}>
              Game projects auto-detect. Others enable here.
            </div>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side: data mode + provider toggle + tokens + context ring + tasks */}
      <div className="flex items-center gap-3">
        {/* Local/Cloud data toggle */}
        {platformStatus?.connected && (
          <button
            onClick={toggleDataMode}
            className="flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-[10px] font-semibold cursor-pointer transition-all"
            style={{
              background: dataMode === 'cloud' ? 'rgba(137,180,250,0.1)' : 'rgba(166,227,161,0.1)',
              borderColor: dataMode === 'cloud' ? 'rgba(137,180,250,0.3)' : 'rgba(166,227,161,0.3)',
              color: dataMode === 'cloud' ? '#89b4fa' : '#a6e3a1',
            }}
            title={dataMode === 'local'
              ? 'Local — data stays on your machine. Click to enable cloud sync.'
              : 'Cloud — auto-syncing every 15 minutes. Click to switch to local only.'}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: dataMode === 'cloud' ? '#89b4fa' : '#a6e3a1' }}
            />
            {dataMode === 'local' ? 'Local' : 'Cloud'}
          </button>
        )}

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

        {/* Token display — platform balance or session count */}
        {platformStatus?.connected && providerSource === 'platform' ? (() => {
          const isAdmin = platformStatus.freeTokensLimit >= 999_999_999;
          if (isAdmin) {
            return (
              <span className="text-[11px] tabular-nums opacity-30" style={{ fontFamily: 'monospace' }} title="Unlimited tokens">
                ∞ tokens
              </span>
            );
          }
          const remaining = Math.max(0, platformStatus.freeTokensLimit - platformStatus.freeTokensUsed);
          const pct = platformStatus.freeTokensLimit > 0 ? (platformStatus.freeTokensUsed / platformStatus.freeTokensLimit) * 100 : 0;
          const color = pct >= 95 ? '#ef4444' : pct >= 80 ? '#eab308' : '#a6e3a1';
          return (
            <span
              className="text-[11px] tabular-nums font-medium"
              style={{ fontFamily: 'monospace', color }}
              title={`${remaining.toLocaleString()} of ${platformStatus.freeTokensLimit.toLocaleString()} tokens remaining (${Math.round(pct)}% used)`}
            >
              {fmtTokens(remaining)} left
            </span>
          );
        })() : (
          <span
            className="text-[11px] tabular-nums opacity-40"
            style={{ fontFamily: 'monospace' }}
            title={`${sessionTokens.toLocaleString()} tokens used this session`}
          >
            {sessionTokens > 0 ? fmtTokens(sessionTokens) : '0'} tokens
          </span>
        )}

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
