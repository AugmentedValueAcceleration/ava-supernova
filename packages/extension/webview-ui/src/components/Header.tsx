import { ModelSelector } from './ModelSelector';
import { t, useLocale } from '../i18n';

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
