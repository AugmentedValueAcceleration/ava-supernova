import { ModelSelector } from './ModelSelector';
import { t } from '../i18n';

interface HeaderProps {
  models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean }>;
  activeModel: string | null;
  needsSetup: boolean;
  onSwitch: (modelId: string) => void;
  onOpenDashboard: () => void;
  onOpenHistory: () => void;
  onOpenMemory: () => void;
  onOpenDocs: () => void;
  onNewChat: () => void;
}

export function Header({
  models,
  activeModel,
  needsSetup,
  onSwitch,
  onOpenDashboard,
  onOpenHistory,
  onOpenMemory,
  onOpenDocs,
  onNewChat,
}: HeaderProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b" style={{ borderColor: 'rgba(168, 85, 247, 0.12)' }} role="toolbar" aria-label="Chat controls">
      {/* Branding */}
      <div className="flex items-baseline gap-1 mr-2 select-none flex-shrink-0">
        <span className="text-[15px] font-bold text-[var(--vscode-foreground)]">Ava</span>
        <span className="text-[9px] uppercase tracking-[2px] opacity-40 text-[var(--vscode-foreground)]">Supernova</span>
      </div>

      <div className="flex-1 min-w-0">
        <ModelSelector
          models={models}
          activeModel={activeModel}
          needsSetup={needsSetup}
          onSwitch={onSwitch}
          onOpenDashboard={onOpenDashboard}
        />
      </div>

      <button
        onClick={onOpenHistory}
        title={t('header.history')}
        aria-label={t('header.history')}
        className="flex items-center justify-center w-7 h-7 rounded
                   hover:bg-[var(--vscode-toolbar-hoverBackground)]
                   text-[var(--vscode-foreground)] opacity-70 hover:opacity-100
                   bg-transparent border-none cursor-pointer text-sm"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M13.507 12.324a7 7 0 0 0 .065-8.56A7 7 0 0 0 2 4.393V2H1v3.5l.5.5H5V5H2.811a6.008 6.008 0 1 1-.135 5.77l-.887.462a7 7 0 0 0 11.718 1.092zM8 4h1v4.28l3.35 2.01-.51.858L8 8.72V4z"/>
        </svg>
      </button>

      <button
        onClick={onOpenMemory}
        title="Memory"
        aria-label="Memory"
        className="flex items-center justify-center w-7 h-7 rounded
                   hover:bg-[var(--vscode-toolbar-hoverBackground)]
                   text-[var(--vscode-foreground)] opacity-70 hover:opacity-100
                   bg-transparent border-none cursor-pointer text-sm"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 1C4.15 1 1 3.58 1 6.75c0 1.83 1.12 3.45 2.84 4.44L3 14l3.23-1.75c.57.1 1.16.15 1.77.15 3.85 0 7-2.58 7-5.65S11.85 1 8 1zm0 10.3c-.55 0-1.08-.06-1.59-.17l-.35-.08-1.93 1.05.5-1.7-.32-.2C3.22 9.42 2 8.15 2 6.75 2 4.13 4.69 2 8 2s6 2.13 6 4.75-2.69 4.55-6 4.55z"/>
        </svg>
      </button>

      <button
        onClick={onOpenDocs}
        title="Documentation"
        aria-label="Documentation"
        className="flex items-center justify-center w-7 h-7 rounded
                   hover:bg-[var(--vscode-toolbar-hoverBackground)]
                   text-[var(--vscode-foreground)] opacity-70 hover:opacity-100
                   bg-transparent border-none cursor-pointer text-sm"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M4 1.5l.5-.5h7l.5.5v12l-.5.5H6l-.5-.5V13H4.5l-.5-.5v-11zm1 0v10h1V2h6v11H6v-1H5V1.5zM7 3v1h4V3H7zm0 2v1h4V5H7zm0 2v1h4V7H7z"/>
        </svg>
      </button>

      <button
        onClick={onOpenDashboard}
        title="Dashboard"
        aria-label="Dashboard"
        className="flex items-center justify-center w-7 h-7 rounded
                   hover:bg-[var(--vscode-toolbar-hoverBackground)]
                   text-[var(--vscode-foreground)] opacity-70 hover:opacity-100
                   bg-transparent border-none cursor-pointer text-sm"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 1a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM2 13c0-3 2.69-4.5 6-4.5s6 1.5 6 4.5v1H2v-1z"/>
        </svg>
      </button>

      <button
        onClick={onNewChat}
        title={t('header.new_chat')}
        aria-label={t('header.new_chat')}
        className="flex items-center justify-center w-7 h-7 rounded
                   hover:bg-[var(--vscode-toolbar-hoverBackground)]
                   text-[var(--vscode-foreground)] opacity-70 hover:opacity-100
                   bg-transparent border-none cursor-pointer text-sm"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/>
        </svg>
      </button>
    </div>
  );
}
