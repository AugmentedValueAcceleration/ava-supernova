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
}: HeaderProps) {
  useLocale();
  const btnBase = `flex items-center justify-center w-7 h-7 rounded
                   hover:bg-[var(--vscode-toolbar-hoverBackground)]
                   text-[var(--vscode-foreground)] opacity-70 hover:opacity-100
                   bg-transparent border-none cursor-pointer text-sm`;

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b" style={{ borderColor: 'rgba(168, 85, 247, 0.12)' }} role="toolbar" aria-label={t('header.controls_aria')}>
      {/* Branding */}
      <div className="flex items-baseline gap-1 mr-2 select-none flex-shrink-0">
        <span className="text-[15px] font-bold text-[var(--vscode-foreground)]">Ava</span>
        <span className="text-[9px] uppercase tracking-[2px] opacity-40 text-[var(--vscode-foreground)]">{t('brand.supernova')}</span>
      </div>

      <div className="flex-1 min-w-0 flex justify-end">
        <ModelSelector
          models={models}
          activeModel={activeModel}
          needsSetup={needsSetup}
          onSwitch={onSwitch}
          onOpenDashboard={onOpenDashboard}
        />
      </div>

      {/* History */}
      <button onClick={onOpenHistory} title={t('header.history')} aria-label={t('header.history')} className={btnBase}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M13.507 12.324a7 7 0 0 0 .065-8.56A7 7 0 0 0 2 4.393V2H1v3.5l.5.5H5V5H2.811a6.008 6.008 0 1 1-.135 5.77l-.887.462a7 7 0 0 0 11.718 1.092zM8 4h1v4.28l3.35 2.01-.51.858L8 8.72V4z"/>
        </svg>
      </button>

      {/* Tasks — highlighted when open */}
      <button
        onClick={onToggleTasks}
        title={t('header.tasks')}
        aria-label={t('header.tasks')}
        className={`flex items-center justify-center w-7 h-7 rounded
                   hover:bg-[var(--vscode-toolbar-hoverBackground)]
                   text-[var(--vscode-foreground)] ${tasksOpen ? 'opacity-100' : 'opacity-70'} hover:opacity-100
                   bg-transparent border-none cursor-pointer text-sm`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M3.75 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 3.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 7.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 11.5h8v1H6v-1z"/>
        </svg>
      </button>

      {/* Dashboard */}
      <button onClick={onOpenDashboard} title={t('header.dashboard')} aria-label={t('header.dashboard')} className={btnBase}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 1a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM2 13c0-3 2.69-4.5 6-4.5s6 1.5 6 4.5v1H2v-1z"/>
        </svg>
      </button>

      {/* New Chat */}
      <button onClick={onNewChat} title={t('header.new_chat')} aria-label={t('header.new_chat')} className={btnBase}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/>
        </svg>
      </button>
    </div>
  );
}
