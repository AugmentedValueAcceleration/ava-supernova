import { ModelSelector } from './ModelSelector';
import { t, tt, useLocale } from '../../i18n';
import type { ProviderSource } from '../../types/messages';

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
  /** Hides the New Chat button — the Ava Health room runs its own thread and
   *  must not offer a reset that would clear the main chat. Default shown. */
  showNewChat?: boolean;
  /** Shows a Clear-chat button in place of New Chat — the Ava Health room uses
   *  this to clear only its own thread (never the main chat). Default hidden. */
  showClearChat?: boolean;
  onClearChat?: () => void;
}

export function Header({
  models,
  activeModel,
  needsSetup,
  onSwitch,
  onOpenDashboard,
  onNewChat,
  conversationTitle,
  platformStatus,
  showNewChat = true,
  showClearChat = false,
  onClearChat,
}: HeaderProps) {
  useLocale();

  // Knowledge-pack dropdown removed in v0.59.2. Stale localStorage key
  // 'ava-knowledge-packs' is harmless if it survives from a prior install.

  // Cloud-sync toggle removed — Ava is local-first; nothing syncs to the
  // cloud (storage sunsets 1 Jul 2026). Managers default to local-only.

  return (
    <div className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
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

      {/* Right side: tokens + context ring + tasks */}
      <div className="flex items-center gap-3">
        {/* Cloud-sync toggle removed — Ava is local-first; nothing syncs to
            the cloud (storage sunsets 1 Jul 2026). */}

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

        {/* Tasks toggle removed — the always-visible Tasks spine on the right
            edge is now the single control (the grip expands/collapses it).
            A header button would be redundant with the self-advertising rail. */}

        {/* New Chat — labelled pill, matching IDE chat header at
            DashboardPages.tsx:4256-4273. Replaces the per-sidebar
            New Chat icon button (which is being dropped from the
            dashboard NavSidebar in this same commit). Hidden in the Ava
            Health room — its own thread has no main-chat reset. */}
        {showNewChat && (
        <button
          onClick={onNewChat}
          title={t('header.new_chat')}
          aria-label="New chat"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            borderRadius: 8,
            color: 'var(--accent)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 20%, transparent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 10%, transparent)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {tt('header.new_chat', 'New Chat')}
        </button>
        )}

        {/* Clear chat — the Ava Health room's reset. Clears only this focused
            thread (never the main chat). Replaces New Chat in the room. */}
        {showClearChat && (
        <button
          onClick={onClearChat}
          title={tt('header.clear_chat', 'Clear chat')}
          aria-label="Clear chat"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            borderRadius: 8,
            color: 'var(--accent)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 20%, transparent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 10%, transparent)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
          {tt('header.clear_chat', 'Clear chat')}
        </button>
        )}
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
        const color = pct <= 5 ? '#ef4444' : pct <= 20 ? '#eab308' : 'var(--accent)';
        return (
          <div className="px-3 pb-1.5">
            <div className="flex items-center gap-2">
              <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
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
