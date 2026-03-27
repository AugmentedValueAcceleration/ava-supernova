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
  onToggleTasks,
  tasksOpen,
  onToggleSidebar,
  sidebarCollapsed,
}: HeaderProps) {
  useLocale();
  const btnBase = `flex items-center justify-center w-7 h-7 rounded
                   hover:bg-[var(--vscode-toolbar-hoverBackground)]
                   text-[var(--vscode-foreground)] opacity-70 hover:opacity-100
                   bg-transparent border-none cursor-pointer text-sm`;

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b" style={{ borderColor: 'rgba(168, 85, 247, 0.12)' }} role="toolbar" aria-label="Chat controls">
      {/* Sidebar toggle — only shows when sidebar is collapsed */}
      {onToggleSidebar && sidebarCollapsed && (
        <button onClick={onToggleSidebar} title="Show sidebar" aria-label="Show sidebar" className={btnBase}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M1 2h14v12H1V2zm1 1v10h4V3H2zm5 0v10h7V3H7z"/>
          </svg>
        </button>
      )}

      {/* Model selector */}
      <div className="flex-1 min-w-0 flex justify-start">
        <ModelSelector
          models={models}
          activeModel={activeModel}
          needsSetup={needsSetup}
          onSwitch={onSwitch}
          onOpenDashboard={onOpenDashboard}
        />
      </div>

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
  );
}
