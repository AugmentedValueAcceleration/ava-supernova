interface ModelSelectorProps {
  models: Array<{ id: string; name: string; provider: string }>;
  activeModel: string | null;
  needsSetup: boolean;
  onSwitch: (modelId: string) => void;
}

export function ModelSelector({ models, activeModel, needsSetup, onSwitch }: ModelSelectorProps) {
  if (needsSetup) {
    return (
      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <p className="text-xs opacity-60">
          No providers configured.{' '}
          <span className="text-[var(--vscode-textLink-foreground)] cursor-pointer">
            Open Settings
          </span>{' '}
          to add an API key.
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)] flex items-center gap-2">
      <select
        value={activeModel || ''}
        onChange={(e) => onSwitch(e.target.value)}
        className="flex-1 text-xs px-2 py-1 rounded
                   bg-[var(--vscode-input-background)]
                   text-[var(--vscode-input-foreground)]
                   border border-[var(--vscode-input-border)]
                   outline-none"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} ({m.provider})
          </option>
        ))}
      </select>
    </div>
  );
}
