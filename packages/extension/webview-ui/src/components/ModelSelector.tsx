interface ModelSelectorProps {
  models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean }>;
  activeModel: string | null;
  needsSetup: boolean;
  onSwitch: (modelId: string) => void;
  onOpenSettings: () => void;
}

export function ModelSelector({ models, activeModel, needsSetup, onSwitch, onOpenSettings }: ModelSelectorProps) {
  if (needsSetup) {
    return (
      <p className="text-xs opacity-60 m-0">
        No providers configured.{' '}
        <button
          onClick={onOpenSettings}
          className="text-[var(--vscode-textLink-foreground)] cursor-pointer underline bg-transparent border-none p-0 text-xs"
        >
          Open Settings
        </button>{' '}
        to add an API key.
      </p>
    );
  }

  const activeModelDef = models.find((m) => m.id === activeModel);

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={activeModel || ''}
        onChange={(e) => onSwitch(e.target.value)}
        className="flex-1 text-xs px-2 py-1 rounded min-w-0
                   bg-[var(--vscode-input-background)]
                   text-[var(--vscode-input-foreground)]
                   border border-[var(--vscode-input-border)]
                   outline-none"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} ({m.provider}){m.supportsVision ? ' \u{1F441}' : ''}
          </option>
        ))}
      </select>
      {activeModelDef?.supportsVision && (
        <span
          title="This model supports image/vision input"
          className="text-[10px] opacity-50 flex-shrink-0"
        >
          vision
        </span>
      )}
    </div>
  );
}
