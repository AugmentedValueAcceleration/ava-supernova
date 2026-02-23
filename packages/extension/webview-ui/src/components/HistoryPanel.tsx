import { useState, useRef } from 'react';
import { t } from '../i18n';

interface HistoryPanelProps {
  conversations: Array<{ id: string; title: string; updatedAt: string; pinned?: boolean }>;
  onClose: () => void;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
  onNewChat: () => void;
  onSearch: (query: string) => void;
  onRename: (conversationId: string, newTitle: string) => void;
  onPin: (conversationId: string, pinned: boolean) => void;
  onExport: (conversationId: string, format: 'markdown' | 'json') => void;
}

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('history.just_now');
  if (diffMins < 60) return t('history.minutes_ago', { n: diffMins });
  if (diffHours < 24) return t('history.hours_ago', { n: diffHours });
  if (diffDays < 7) return t('history.days_ago', { n: diffDays });
  return date.toLocaleDateString();
}

export function HistoryPanel({
  conversations,
  onClose,
  onSelect,
  onDelete,
  onNewChat,
  onSearch,
  onRename,
  onPin,
  onExport,
}: HistoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sort: pinned first, then by updatedAt (already sorted newest-first)
  const sortedConversations = [
    ...conversations.filter((c) => c.pinned),
    ...conversations.filter((c) => !c.pinned),
  ];

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      onSearch(value);
    }, 300);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[var(--vscode-sideBar-background)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
          {t('history.title')}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewChat}
            title={t('header.new_chat')}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs
                       bg-[var(--vscode-button-background)]
                       text-[var(--vscode-button-foreground)]
                       hover:bg-[var(--vscode-button-hoverBackground)]
                       border-none cursor-pointer"
          >
            {t('history.new_chat')}
          </button>
          <button
            onClick={onClose}
            title={t('history.close')}
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

      {/* Search */}
      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <input
          type="text"
          placeholder={t('history.search')}
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full px-2 py-1 text-xs rounded
                     bg-[var(--vscode-input-background)]
                     text-[var(--vscode-input-foreground)]
                     border border-[var(--vscode-input-border)]
                     placeholder:opacity-50
                     outline-none focus:border-[var(--vscode-focusBorder)]"
        />
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {sortedConversations.length === 0 ? (
          <div className="flex items-center justify-center h-32 opacity-50 text-xs">
            {searchQuery ? t('history.no_match') : t('history.empty')}
          </div>
        ) : (
          <div className="py-1">
            {sortedConversations.map((conv) => (
              <div
                key={conv.id}
                className="group flex items-center gap-2 px-3 py-2 cursor-pointer
                           hover:bg-[var(--vscode-list-hoverBackground)]"
                onClick={() => editingId !== conv.id && onSelect(conv.id)}
              >
                {/* Pin indicator */}
                {conv.pinned && (
                  <span className="text-[var(--vscode-charts-yellow)] text-[10px] flex-shrink-0" title={t('history.pinned')}>
                    &#9733;
                  </span>
                )}

                <div className="flex-1 min-w-0">
                  {editingId === conv.id ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && editTitle.trim()) {
                          onRename(conv.id, editTitle.trim());
                          setEditingId(null);
                        }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onBlur={() => setEditingId(null)}
                      className="w-full px-1 text-xs rounded
                                 bg-[var(--vscode-input-background)]
                                 text-[var(--vscode-input-foreground)]
                                 border border-[var(--vscode-focusBorder)]
                                 outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p
                      className="text-xs truncate m-0"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingId(conv.id);
                        setEditTitle(conv.title);
                      }}
                      title={t('history.rename_hint')}
                    >
                      {conv.title}
                    </p>
                  )}
                  <p className="text-[10px] opacity-50 m-0 mt-0.5">
                    {formatRelativeDate(conv.updatedAt)}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-60">
                  {/* Pin/Unpin */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onPin(conv.id, !conv.pinned); }}
                    title={conv.pinned ? t('history.unpin') : t('history.pin')}
                    className="flex items-center justify-center w-5 h-5 rounded
                               hover:!opacity-100 hover:bg-[var(--vscode-toolbar-hoverBackground)]
                               text-[var(--vscode-foreground)] bg-transparent border-none cursor-pointer text-[11px]"
                  >
                    {conv.pinned ? '\u2605' : '\u2606'}
                  </button>

                  {/* Export */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onExport(conv.id, 'markdown'); }}
                    title={t('history.export_md')}
                    className="flex items-center justify-center w-5 h-5 rounded
                               hover:!opacity-100 hover:bg-[var(--vscode-toolbar-hoverBackground)]
                               text-[var(--vscode-foreground)] bg-transparent border-none cursor-pointer"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 1v10.293L4.854 8.146l-.708.708L8 12.707l3.854-3.853-.708-.708L8 11.293V1H8zM2 14h12v1H2v-1z"/>
                    </svg>
                  </button>

                  {/* Delete (two-click confirmation) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (deletingId === conv.id) {
                        onDelete(conv.id);
                        setDeletingId(null);
                        if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
                      } else {
                        setDeletingId(conv.id);
                        if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
                        deleteTimerRef.current = setTimeout(() => setDeletingId(null), 3000);
                      }
                    }}
                    title={deletingId === conv.id ? t('history.delete_confirm') : t('history.close')}
                    className={`flex items-center justify-center rounded
                               border-none cursor-pointer transition-all
                               ${deletingId === conv.id
                                 ? 'w-auto px-1.5 h-5 bg-[var(--vscode-errorForeground,#e53935)] text-white text-[10px] font-medium opacity-100'
                                 : 'w-5 h-5 hover:!opacity-100 hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)] bg-transparent'
                               }`}
                  >
                    {deletingId === conv.id ? (
                      t('history.delete_confirm')
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M10 3h3v1h-1v9l-1 1H5l-1-1V4H3V3h3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1zM9 2H7v1h2V2zM5 4v9h6V4H5zm2 2h1v5H7V6zm2 0h1v5H9V6z"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
