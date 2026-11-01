import { ModelSelector } from './ModelSelector';
import { AnnouncementTicker } from '../../components/AnnouncementTicker';
import { t, tt, useLocale } from '../../i18n';

interface HeaderProps {
  models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean }>;
  activeModel: string | null;
  needsSetup: boolean;
  onSwitch: (modelId: string) => void;
  onOpenDashboard: () => void;
  onOpenHistory: () => void;
  onNewChat: () => void;
  /** Open the document picker. Absent in rooms that have no workspace. */
  onOpenDocument?: () => void;
  /** Name of the open document, so the bar says what is being worked on. */
  openDocName?: string | null;
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
  /** Length of session task list — drives the badge on the Tasks pill. */
  /** Loaded conversation title — rendered as a chip next to the model
   *  picker (mirrors IDE chat). null/undefined hides the chip. */
  conversationTitle?: string | null;
  /** Hides the New Chat button — the Ava Health room runs its own thread and
   *  must not offer a reset that would clear the main chat. Default shown. */
  showNewChat?: boolean;
  /** Shows a Clear-chat button in place of New Chat — the Ava Health room uses
   *  this to clear only its own thread (never the main chat). Default hidden. */
  showClearChat?: boolean;
  onClearChat?: () => void;
  /** Hub-set announcement messages for the centre ticker. */
  announcement?: string[];
}

export function Header({
  models,
  activeModel,
  needsSetup,
  onSwitch,
  onOpenDashboard,
  onNewChat,
  onOpenDocument,
  openDocName,
  conversationTitle,
  showNewChat = true,
  showClearChat = false,
  onClearChat,
  announcement,
}: HeaderProps) {
  useLocale();

  // Knowledge-pack dropdown removed in v0.59.2. Stale localStorage key
  // 'ava-knowledge-packs' is harmless if it survives from a prior install.

  return (
    <div className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
    <div className="flex items-center gap-2 px-3 py-2" role="toolbar" aria-label={tt('ext.header.chat_controls', 'Chat controls')}>
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

      {/* Centre — the announcement ticker fills the gap between the model picker
          and the right-hand controls; truncates so it never crowds either. */}
      <div className="flex-1 min-w-0">
        {announcement && announcement.length > 0 && <AnnouncementTicker messages={announcement} />}
      </div>

      {/* Right side: context ring + tasks */}
      <div className="flex items-center gap-3">
        {/* Tasks toggle removed — the always-visible Tasks spine on the right
            edge is now the single control (the grip expands/collapses it).
            A header button would be redundant with the self-advertising rail. */}

        {/* New Chat — labelled pill, matching IDE chat header at
            DashboardPages.tsx:4256-4273. Replaces the per-sidebar
            New Chat icon button (which is being dropped from the
            dashboard NavSidebar in this same commit). Hidden in the Ava
            Health room — its own thread has no main-chat reset. */}
        {/* Open a document — beside New Chat because it is the other
            "start something" action, and because the picker cannot live in the
            workspace pane's header: the pane does not exist until a document is
            open, so there would be nowhere to click. Every mode, this page. */}
        {onOpenDocument && (
        <button
          onClick={onOpenDocument}
          title={t('doc.open_title')}
          aria-label={t('doc.open_title')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', maxWidth: 190,
            background: openDocName ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent',
            border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
            borderRadius: 8,
            color: openDocName ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {openDocName || t('doc.open_title')}
          </span>
        </button>
        )}

        {showNewChat && (
        <button
          onClick={onNewChat}
          title={t('header.new_chat')}
          aria-label={tt('header.new_chat', 'New chat')}
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
          aria-label={tt('header.clear_chat', 'Clear chat')}
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

    </div>
  );
}
