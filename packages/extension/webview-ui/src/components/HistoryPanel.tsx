interface HistoryPanelProps {
  conversations: Array<{ id: string; title: string; updatedAt: string }>;
  onClose: () => void;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
  onNewChat: () => void;
}

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function HistoryPanel({ conversations, onClose, onSelect, onDelete, onNewChat }: HistoryPanelProps) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[var(--vscode-sideBar-background)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
          Chat History
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewChat}
            title="New Chat"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs
                       bg-[var(--vscode-button-background)]
                       text-[var(--vscode-button-foreground)]
                       hover:bg-[var(--vscode-button-hoverBackground)]
                       border-none cursor-pointer"
          >
            + New Chat
          </button>
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
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex items-center justify-center h-32 opacity-50 text-xs">
            No saved conversations yet.
          </div>
        ) : (
          <div className="py-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className="group flex items-center gap-2 px-3 py-2 cursor-pointer
                           hover:bg-[var(--vscode-list-hoverBackground)]"
                onClick={() => onSelect(conv.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate m-0">
                    {conv.title}
                  </p>
                  <p className="text-[10px] opacity-50 m-0 mt-0.5">
                    {formatRelativeDate(conv.updatedAt)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  title="Delete"
                  className="flex items-center justify-center w-5 h-5 rounded
                             opacity-0 group-hover:opacity-60 hover:!opacity-100
                             hover:bg-[var(--vscode-toolbar-hoverBackground)]
                             text-[var(--vscode-foreground)]
                             bg-transparent border-none cursor-pointer"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M10 3h3v1h-1v9l-1 1H5l-1-1V4H3V3h3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1zM9 2H7v1h2V2zM5 4v9h6V4H5zm2 2h1v5H7V6zm2 0h1v5H9V6z"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
