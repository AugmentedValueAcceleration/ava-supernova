import { useState, useRef, useEffect, useCallback } from 'react';
import { t, useLocale } from '../../i18n';

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
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  // Use locale-aware date format (day/month/year for non-US)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
  const [menuId, setMenuId] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sort: pinned first, then by updatedAt
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

  // Close menu on outside click
  useEffect(() => {
    if (!menuId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuId]);

  // Focus trap
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menuId) { setMenuId(null); return; }
        if (editingId) { setEditingId(null); return; }
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
    [onClose, menuId, editingId],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const menuBtnStyle = "flex items-center gap-2 w-full px-3 py-2 text-xs text-left bg-transparent border-none cursor-pointer text-[var(--vscode-foreground)] opacity-70 hover:opacity-100 hover:bg-white/[0.06] transition";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('history.title')}
      tabIndex={-1}
      className="absolute inset-0 z-50 flex flex-col outline-none"
      style={{
        background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(168, 85, 247, 0.06) 0%, transparent 70%), var(--vscode-sideBar-background)',
      }}
    >
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white cursor-pointer border-none transition"
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
            className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-white/[0.06] text-[var(--vscode-foreground)] opacity-50 hover:opacity-100 bg-transparent border-none cursor-pointer transition"
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
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-white/[0.04] text-[var(--vscode-foreground)] border border-white/[0.06] placeholder:opacity-30 outline-none transition"
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
                className="group relative flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-lg hover:bg-white/[0.04] transition"
                onClick={() => {
                  if (editingId !== conv.id && menuId !== conv.id) {
                    onSelect(conv.id);
                  }
                }}
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
                      onBlur={() => {
                        if (editTitle.trim() && editTitle.trim() !== conv.title) {
                          onRename(conv.id, editTitle.trim());
                        }
                        setEditingId(null);
                      }}
                      className="w-full px-2 py-0.5 text-xs rounded-md bg-white/[0.06] text-[var(--vscode-foreground)] outline-none"
                      style={{ border: '1px solid rgba(168, 85, 247, 0.3)' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p className="text-xs truncate m-0 text-[var(--vscode-foreground)]">
                      {conv.title}
                    </p>
                  )}
                  <p className="text-[10px] opacity-35 m-0 mt-0.5">
                    {formatRelativeDate(conv.updatedAt)}
                  </p>
                </div>

                {/* Three-dot menu button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuId(menuId === conv.id ? null : conv.id);
                  }}
                  className="flex items-center justify-center w-7 h-7 rounded-md opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-white/[0.08] bg-transparent border-none cursor-pointer transition"
                  style={menuId === conv.id ? { opacity: 1 } : undefined}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>
                  </svg>
                </button>

                {/* Dropdown menu */}
                {menuId === conv.id && (
                  <div
                    ref={menuRef}
                    className="absolute right-2 top-full z-50 rounded-lg border overflow-hidden"
                    style={{
                      background: '#1e1e2e',
                      borderColor: 'rgba(168, 85, 247, 0.2)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      minWidth: 160,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Rename */}
                    <button
                      className={menuBtnStyle}
                      onClick={() => {
                        setMenuId(null);
                        setEditingId(conv.id);
                        setEditTitle(conv.title);
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-8 1.77 1.77-8 8z"/>
                      </svg>
                      Rename
                    </button>

                    {/* Pin/Unpin */}
                    <button
                      className={menuBtnStyle}
                      onClick={() => {
                        setMenuId(null);
                        onPin(conv.id, !conv.pinned);
                      }}
                    >
                      <span className="text-xs">{conv.pinned ? '\u2605' : '\u2606'}</span>
                      {conv.pinned ? t('history.unpin') : t('history.pin')}
                    </button>

                    {/* Export */}
                    <button
                      className={menuBtnStyle}
                      onClick={() => {
                        setMenuId(null);
                        onExport(conv.id, 'markdown');
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 1v10.293L4.854 8.146l-.708.708L8 12.707l3.854-3.853-.708-.708L8 11.293V1H8zM2 14h12v1H2v-1z"/>
                      </svg>
                      {t('history.export_md')}
                    </button>

                    {/* Divider */}
                    <div style={{ height: 1, background: 'rgba(168, 85, 247, 0.1)', margin: '2px 0' }} />

                    {/* Delete */}
                    <button
                      className={menuBtnStyle}
                      style={{ color: deletingId === conv.id ? '#ef4444' : undefined }}
                      onClick={() => {
                        if (deletingId === conv.id) {
                          onDelete(conv.id);
                          setDeletingId(null);
                          setMenuId(null);
                          if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
                        } else {
                          setDeletingId(conv.id);
                          if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
                          deleteTimerRef.current = setTimeout(() => setDeletingId(null), 3000);
                        }
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M10 3h3v1h-1v9l-1 1H5l-1-1V4H3V3h3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1zM9 2H7v1h2V2zM5 4v9h6V4H5zm2 2h1v5H7V6zm2 0h1v5H9V6z"/>
                      </svg>
                      {deletingId === conv.id ? 'Click again to confirm' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
