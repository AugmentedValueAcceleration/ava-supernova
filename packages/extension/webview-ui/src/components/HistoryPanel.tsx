import { useState, useRef, useEffect, useCallback } from 'react';
import { t, useLocale } from '../i18n';

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
  useLocale();
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

  const panelRef = useRef<HTMLDivElement>(null);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      onSearch(value);
    }, 300);
  };

  // Focus trap: Tab/Shift+Tab cycle within panel, Escape closes
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    // Auto-focus the panel on mount
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('history.title')}
      tabIndex={-1}
      className="absolute inset-0 z-50 flex flex-col outline-none"
      style={{
      // Catppuccin-purple base to match the rest of the chat surface
      // (and the IDE chat history page). Was var(--vscode-sideBar-background)
      // which respected user's VS Code theme but visually drifted from
      // the Ava purple chrome the chat now uses.
      background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(168, 85, 247, 0.06) 0%, transparent 70%), #0f0a1a',
      color: '#cdd6f4',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(168, 85, 247, 0.12)' }}>
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="opacity-50">
            <path d="M13.507 12.324a7 7 0 0 0 .065-8.56A7 7 0 0 0 2 4.393V2H1v3.5l.5.5H5V5H2.811a6.008 6.008 0 1 1-.135 5.77l-.887.462a7 7 0 0 0 11.718 1.092zM8 4h1v4.28l3.35 2.01-.51.858L8 8.72V4z"/>
          </svg>
          <span className="text-sm font-semibold">{t('history.title')}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewChat}
            title={t('header.new_chat')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                       text-white cursor-pointer border-none transition"
            style={{ background: '#A855F7' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#9333EA')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#A855F7')}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/>
            </svg>
            {t('history.new_chat')}
          </button>
          <button
            onClick={onClose}
            title={t('history.close')}
            className="flex items-center justify-center w-7 h-7 rounded-lg
                       hover:bg-white/[0.06]
                       text-[var(--vscode-foreground)] opacity-50 hover:opacity-100
                       bg-transparent border-none cursor-pointer transition"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
          </svg>
          <input
            type="text"
            placeholder={t('history.search')}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg
                       bg-white/[0.04] text-[var(--vscode-foreground)]
                       border border-white/[0.06]
                       placeholder:opacity-30
                       outline-none transition"
            style={{ borderColor: searchQuery ? 'rgba(168, 85, 247, 0.3)' : undefined }}
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2">
        {sortedConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 opacity-40 text-xs gap-2">
            <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" className="opacity-30">
              <path d="M13.507 12.324a7 7 0 0 0 .065-8.56A7 7 0 0 0 2 4.393V2H1v3.5l.5.5H5V5H2.811a6.008 6.008 0 1 1-.135 5.77l-.887.462a7 7 0 0 0 11.718 1.092zM8 4h1v4.28l3.35 2.01-.51.858L8 8.72V4z"/>
            </svg>
            {searchQuery ? t('history.no_match') : t('history.empty')}
          </div>
        ) : (
          <div className="flex flex-col gap-1 py-1">
            {sortedConversations.map((conv) => (
              <div
                key={conv.id}
                className="group flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-lg
                           hover:bg-white/[0.04] transition"
                onClick={() => editingId !== conv.id && onSelect(conv.id)}
              >
                {/* Pin indicator */}
                {conv.pinned && (
                  <span className="text-xs flex-shrink-0" style={{ color: '#A855F7' }} title={t('history.pinned')}>
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
                      className="w-full px-2 py-0.5 text-xs rounded-md
                                 bg-white/[0.06] text-[var(--vscode-foreground)]
                                 outline-none"
                      style={{ border: '1px solid rgba(168, 85, 247, 0.3)' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p
                      className="text-xs truncate m-0 text-[var(--vscode-foreground)]"
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
                  <p className="text-[10px] opacity-35 m-0 mt-0.5">
                    {formatRelativeDate(conv.updatedAt)}
                  </p>
                </div>

                {/* Action buttons — bigger, clearer */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  {/* Pin/Unpin */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onPin(conv.id, !conv.pinned); }}
                    title={conv.pinned ? t('history.unpin') : t('history.pin')}
                    className="flex items-center justify-center w-7 h-7 rounded-md
                               hover:bg-white/[0.08]
                               bg-transparent border-none cursor-pointer transition text-xs"
                    style={{ color: conv.pinned ? '#A855F7' : 'var(--vscode-foreground)', opacity: conv.pinned ? 1 : 0.5 }}
                  >
                    {conv.pinned ? '\u2605' : '\u2606'}
                  </button>

                  {/* Export */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onExport(conv.id, 'markdown'); }}
                    title={t('history.export_md')}
                    className="flex items-center justify-center w-7 h-7 rounded-md
                               hover:bg-white/[0.08]
                               text-[var(--vscode-foreground)] opacity-50 hover:opacity-100
                               bg-transparent border-none cursor-pointer transition"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
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
                    className={`flex items-center justify-center rounded-md
                               border-none cursor-pointer transition-all
                               ${deletingId === conv.id
                                 ? 'w-auto px-2.5 h-7 text-white text-[10px] font-semibold'
                                 : 'w-7 h-7 hover:bg-white/[0.08] text-[var(--vscode-foreground)] opacity-50 hover:opacity-100 bg-transparent'
                               }`}
                    style={deletingId === conv.id ? { background: '#EF4444' } : undefined}
                  >
                    {deletingId === conv.id ? (
                      t('history.delete_confirm')
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
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
