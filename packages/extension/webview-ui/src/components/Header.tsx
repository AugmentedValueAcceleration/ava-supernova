import { ModelSelector } from './ModelSelector';

interface HeaderProps {
  models: Array<{ id: string; name: string; provider: string }>;
  activeModel: string | null;
  needsSetup: boolean;
  onSwitch: (modelId: string) => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onNewChat: () => void;
}

export function Header({
  models,
  activeModel,
  needsSetup,
  onSwitch,
  onOpenSettings,
  onOpenHistory,
  onNewChat,
}: HeaderProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--vscode-panel-border)]">
      <div className="flex-1 min-w-0">
        <ModelSelector
          models={models}
          activeModel={activeModel}
          needsSetup={needsSetup}
          onSwitch={onSwitch}
          onOpenSettings={onOpenSettings}
        />
      </div>

      <button
        onClick={onOpenHistory}
        title="Chat History"
        className="flex items-center justify-center w-7 h-7 rounded
                   hover:bg-[var(--vscode-toolbar-hoverBackground)]
                   text-[var(--vscode-foreground)] opacity-70 hover:opacity-100
                   bg-transparent border-none cursor-pointer text-sm"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.507 12.324a7 7 0 0 0 .065-8.56A7 7 0 0 0 2 4.393V2H1v3.5l.5.5H5V5H2.811a6.008 6.008 0 1 1-.135 5.77l-.887.462a7 7 0 0 0 11.718 1.092zM8 4h1v4.28l3.35 2.01-.51.858L8 8.72V4z"/>
        </svg>
      </button>

      <button
        onClick={onNewChat}
        title="New Chat"
        className="flex items-center justify-center w-7 h-7 rounded
                   hover:bg-[var(--vscode-toolbar-hoverBackground)]
                   text-[var(--vscode-foreground)] opacity-70 hover:opacity-100
                   bg-transparent border-none cursor-pointer text-sm"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/>
        </svg>
      </button>
    </div>
  );
}
