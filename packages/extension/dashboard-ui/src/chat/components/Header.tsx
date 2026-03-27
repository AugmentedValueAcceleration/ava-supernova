import { ModelSelector } from './ModelSelector';
import { t, useLocale } from '../../i18n';

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
}

export function Header({
  models,
  activeModel,
  needsSetup,
  onSwitch,
  onOpenDashboard,
  onOpenHistory,
  onNewChat,
  onToggleTasks,
  tasksOpen,
  onToggleSidebar,
  sidebarCollapsed,
  onFlipSidebar,
  sidebarSide,
}: HeaderProps) {
  useLocale();
  const btnBase = `flex items-center justify-center w-7 h-7 rounded
                   hover:bg-[var(--vscode-toolbar-hoverBackground)]
                   text-[var(--vscode-foreground)] opacity-70 hover:opacity-100
                   bg-transparent border-none cursor-pointer text-sm`;

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b" style={{ borderColor: 'rgba(168, 85, 247, 0.12)' }} role="toolbar" aria-label="Chat controls">
      {/* Left: Model selector */}
      <div className="flex-1 min-w-0 flex justify-start">
        <ModelSelector
          models={models}
          activeModel={activeModel}
          needsSetup={needsSetup}
          onSwitch={onSwitch}
          onOpenDashboard={onOpenDashboard}
        />
      </div>

      {/* Right: all buttons grouped */}
      <div className="flex items-center gap-0.5">
        {/* Sidebar toggle */}
        {onToggleSidebar && (
          <button onClick={onToggleSidebar} title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'} aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'} className={btnBase}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={sidebarSide === 'right' ? { transform: 'scaleX(-1)' } : undefined}>
              <path d="M1 2h14v12H1V2zm1 1v10h4V3H2zm5 0v10h7V3H7z"/>
            </svg>
          </button>
        )}

        {/* Flip sidebar side */}
        {onFlipSidebar && (
          <button onClick={onFlipSidebar} title={sidebarSide === 'left' ? 'Move sidebar to right' : 'Move sidebar to left'} aria-label="Flip sidebar" className={btnBase}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M2 8l3-3v2h6V5l3 3-3 3V9H5v2L2 8z"/>
            </svg>
          </button>
        )}

        {/* History */}
        <button onClick={onOpenHistory} title={t('header.history')} aria-label="History" className={btnBase}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M13.507 12.324a7 7 0 0 0 .065-8.56A7 7 0 0 0 2 4.393V2H1v3.5l.5.5H5V5H2.811a6.008 6.008 0 1 1-.135 5.77l-.887.462a7 7 0 0 0 11.718 1.092zM8 4h1v4.28l3.35 2.01-.51.858L8 8.72V4z"/>
          </svg>
        </button>

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

        {/* New Chat */}
        <button onClick={onNewChat} title={t('header.new_chat')} aria-label="New chat" className={btnBase}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
