import { useState } from 'react';

interface MemoryPanelProps {
  globalMemory: string | null;
  projectMemory: string | null;
  onClose: () => void;
  onSave: (scope: 'global' | 'project', content: string) => void;
  onClear: (scope: 'global' | 'project') => void;
}

type ActiveTab = 'global' | 'project';

export function MemoryPanel({
  globalMemory,
  projectMemory,
  onClose,
  onSave,
  onClear,
}: MemoryPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('global');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const currentContent = activeTab === 'global' ? globalMemory : projectMemory;

  const handleEdit = () => {
    setEditContent(currentContent ?? '');
    setEditing(true);
  };

  const handleSave = () => {
    onSave(activeTab, editContent);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
    setConfirmClear(false);
  };

  const handleClear = () => {
    if (confirmClear) {
      onClear(activeTab);
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  const handleTabSwitch = (tab: ActiveTab) => {
    setActiveTab(tab);
    setEditing(false);
    setConfirmClear(false);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[var(--vscode-sideBar-background)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
          Memory
        </span>
        <button
          onClick={onClose}
          title="Close"
          className="flex items-center justify-center w-6 h-6 rounded
                     hover:bg-[var(--vscode-toolbar-hoverBackground)]
                     text-[var(--vscode-foreground)] opacity-70 hover:opacity-100
                     bg-transparent border-none cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--vscode-panel-border)]">
        <button
          onClick={() => handleTabSwitch('global')}
          className={`flex-1 px-3 py-1.5 text-xs border-none cursor-pointer transition-colors
            ${activeTab === 'global'
              ? 'bg-[var(--vscode-tab-activeBackground,var(--vscode-editor-background))] text-[var(--vscode-foreground)] border-b-2 border-b-[var(--vscode-focusBorder)]'
              : 'bg-transparent text-[var(--vscode-foreground)] opacity-60 hover:opacity-80'
            }`}
        >
          Global
        </button>
        <button
          onClick={() => handleTabSwitch('project')}
          className={`flex-1 px-3 py-1.5 text-xs border-none cursor-pointer transition-colors
            ${activeTab === 'project'
              ? 'bg-[var(--vscode-tab-activeBackground,var(--vscode-editor-background))] text-[var(--vscode-foreground)] border-b-2 border-b-[var(--vscode-focusBorder)]'
              : 'bg-transparent text-[var(--vscode-foreground)] opacity-60 hover:opacity-80'
            }`}
        >
          Project
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {editing ? (
          <textarea
            autoFocus
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full min-h-[200px] p-2 text-xs font-mono rounded resize-none
                       bg-[var(--vscode-input-background)]
                       text-[var(--vscode-input-foreground)]
                       border border-[var(--vscode-input-border)]
                       outline-none focus:border-[var(--vscode-focusBorder)]"
          />
        ) : currentContent ? (
          <pre className="text-xs whitespace-pre-wrap font-mono m-0 opacity-90 leading-relaxed">
            {currentContent}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-32 opacity-50 text-xs">
            {activeTab === 'global'
              ? 'No global memories yet. Ava will save memories as you work together.'
              : 'No project memories yet. Ava will save project-specific patterns here.'}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--vscode-panel-border)]">
        {editing ? (
          <>
            <button
              onClick={handleSave}
              className="px-3 py-1 rounded text-xs
                         bg-[var(--vscode-button-background)]
                         text-[var(--vscode-button-foreground)]
                         hover:bg-[var(--vscode-button-hoverBackground)]
                         border-none cursor-pointer"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1 rounded text-xs
                         bg-transparent
                         text-[var(--vscode-foreground)]
                         hover:bg-[var(--vscode-toolbar-hoverBackground)]
                         border border-[var(--vscode-panel-border)] cursor-pointer"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleEdit}
              className="px-3 py-1 rounded text-xs
                         bg-[var(--vscode-button-background)]
                         text-[var(--vscode-button-foreground)]
                         hover:bg-[var(--vscode-button-hoverBackground)]
                         border-none cursor-pointer"
            >
              Edit
            </button>
            {currentContent && (
              <button
                onClick={handleClear}
                className={`px-3 py-1 rounded text-xs border-none cursor-pointer transition-all
                  ${confirmClear
                    ? 'bg-[var(--vscode-errorForeground,#e53935)] text-white'
                    : 'bg-transparent text-[var(--vscode-foreground)] opacity-60 hover:opacity-100 hover:bg-[var(--vscode-toolbar-hoverBackground)]'
                  }`}
              >
                {confirmClear ? 'Confirm Clear' : 'Clear'}
              </button>
            )}
          </>
        )}

        <div className="flex-1" />
        <span className="text-[10px] opacity-40">
          {activeTab === 'global' ? '~/.ava/memory.md' : '.ava/memory.md'}
        </span>
      </div>
    </div>
  );
}
