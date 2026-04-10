import { useState, useEffect, useRef } from 'react';
import { post } from '../App';
import type { SupportConversation, SupportConversationMessage } from '../types/messages';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-500/15 text-blue-300',
  resolved: 'bg-green-500/15 text-green-300',
  closed: 'bg-[var(--bg-input)] text-[var(--text-muted)]',
};

type FilterValue = 'all' | 'needs_human' | 'active' | 'resolved';

interface AdminSupportProps {
  conversations: SupportConversation[];
  messages: Record<string, SupportConversationMessage[]>;
  loading: boolean;
}

export function AdminSupport({ conversations, messages, loading }: AdminSupportProps) {
  const [filter, setFilter] = useState<FilterValue>('all');
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations.find(c => c.id === activeId);
  const activeMessages = activeId ? messages[activeId] || [] : [];

  useEffect(() => {
    if (activeId) {
      post({ type: 'load_admin_conversation_messages', conversationId: activeId });
    }
  }, [activeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length]);

  function loadFiltered(f: FilterValue) {
    setFilter(f);
    if (f === 'needs_human') {
      post({ type: 'load_admin_conversations', needsHuman: true });
    } else if (f === 'all') {
      post({ type: 'load_admin_conversations' });
    } else {
      post({ type: 'load_admin_conversations', status: f });
    }
  }

  function handleSend() {
    if (!activeId || !replyText.trim() || sending) return;
    setSending(true);
    post({ type: 'admin_reply_conversation', conversationId: activeId, message: replyText.trim() });
    setReplyText('');
    setSending(false);
  }

  function handleResolve() {
    if (!activeId) return;
    post({ type: 'admin_update_conversation', conversationId: activeId, status: 'resolved' });
  }

  function handleReopen() {
    if (!activeId) return;
    post({ type: 'admin_update_conversation', conversationId: activeId, status: 'active' });
  }

  // Filter + search
  const filtered = conversations.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.summary?.toLowerCase().includes(q) ||
      c.user?.email?.toLowerCase().includes(q) ||
      c.user?.name?.toLowerCase().includes(q)
    );
  });

  const needsHumanCount = conversations.filter(c => c.needs_human).length;
  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_admin, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Support Conversations</h2>
          <p className="text-xs text-[var(--text-muted)]">
            {needsHumanCount > 0 && <span className="text-red-400">{needsHumanCount} need attention</span>}
            {needsHumanCount > 0 && totalUnread > 0 && ' · '}
            {totalUnread > 0 && <span className="text-[var(--accent)]">{totalUnread} unread</span>}
            {needsHumanCount === 0 && totalUnread === 0 && 'All caught up'}
          </p>
        </div>
        <button
          onClick={() => loadFiltered(filter)}
          className="rounded bg-[var(--bg-input)] px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-white"
        >
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="mb-3 flex gap-1">
        {([
          { key: 'all', label: 'All' },
          { key: 'needs_human', label: `Urgent${needsHumanCount > 0 ? ` (${needsHumanCount})` : ''}` },
          { key: 'active', label: 'Active' },
          { key: 'resolved', label: 'Resolved' },
        ] as { key: FilterValue; label: string }[]).map(f => (
          <button
            key={f.key}
            onClick={() => loadFiltered(f.key)}
            className={`rounded px-3 py-1 text-[10px] font-medium transition ${
              filter === f.key
                ? f.key === 'needs_human'
                  ? 'bg-red-500/15 text-red-300'
                  : 'bg-[var(--accent)]/15 text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by user, name, or summary..."
        className="mb-3 w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-xs text-white placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
      />

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-card)] border-t-[var(--accent)]" />
        </div>
      )}

      {!loading && conversations.length === 0 && (
        <p className="py-8 text-center text-xs text-[var(--text-muted)]">No conversations</p>
      )}

      {!loading && conversations.length > 0 && (
        <div className="flex gap-3" style={{ minHeight: 400 }}>
          {/* Conversation list */}
          <div className="w-72 shrink-0 space-y-1.5 overflow-y-auto" style={{ maxHeight: 600 }}>
            {filtered.map(conv => {
              const isActive = activeId === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  className={`w-full rounded-lg border p-2.5 text-left transition ${
                    isActive
                      ? 'border-[var(--accent)]/40 bg-[var(--accent)]/10'
                      : 'border-[var(--border-card)] bg-[var(--bg-card)] hover:border-[var(--accent)]/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-white truncate">
                      {conv.user?.name || conv.user?.email?.split('@')[0] || 'Unknown'}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {conv.needs_human && (
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" title="Needs human" />
                      )}
                      {conv.unread_admin > 0 && (
                        <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {conv.unread_admin}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">
                    {conv.summary || conv.lastMessage?.preview || 'No messages yet'}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[9px] text-[var(--text-muted)]">
                    <span className={`rounded-full px-1.5 py-0.5 font-medium ${STATUS_COLORS[conv.status] || STATUS_COLORS.active}`}>
                      {conv.status}
                    </span>
                    <span>{conv.platform}</span>
                    <span className="opacity-60">{conv.user?.tier || 'free'}</span>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-4 text-center text-[10px] text-[var(--text-muted)]">No matches</p>
            )}
          </div>

          {/* Conversation detail */}
          <div className="flex-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)]">
            {!activeConv ? (
              <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
                Select a conversation to view messages
              </div>
            ) : (
              <div className="flex h-full flex-col">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--border-card)] p-3">
                  <div>
                    <p className="text-xs font-semibold text-white">
                      {activeConv.user?.name || activeConv.user?.email?.split('@')[0] || 'Unknown'}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {activeConv.user?.email} · {activeConv.platform} · {activeConv.user?.tier || 'free'}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {activeConv.status !== 'resolved' ? (
                      <button
                        onClick={handleResolve}
                        className="rounded bg-green-500/15 px-2 py-1 text-[10px] font-medium text-green-300 hover:bg-green-500/25"
                      >
                        Mark Resolved
                      </button>
                    ) : (
                      <button
                        onClick={handleReopen}
                        className="rounded bg-blue-500/15 px-2 py-1 text-[10px] font-medium text-blue-300 hover:bg-blue-500/25"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: 400 }}>
                  {activeMessages.length === 0 ? (
                    <p className="py-8 text-center text-xs text-[var(--text-muted)]">Loading messages...</p>
                  ) : (
                    activeMessages.map(m => (
                      <div
                        key={m.id}
                        className={`rounded-lg p-2.5 text-xs ${
                          m.sender_type === 'admin'
                            ? 'ml-6 bg-[var(--accent)]/10 border border-[var(--accent)]/20'
                            : m.is_ava
                              ? 'mr-6 bg-purple-500/5 border border-purple-500/15'
                              : 'mr-6 bg-[var(--bg-input)]'
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[10px] font-medium">
                            {m.is_ava ? 'Ava' : m.sender_name}
                            {m.is_ava && <span className="ml-1 text-purple-400">•</span>}
                          </span>
                          <span className="text-[9px] text-[var(--text-muted)]">
                            {new Date(m.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-[var(--text-secondary)]">{m.body}</p>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply */}
                <div className="border-t border-[var(--border-card)] p-3">
                  <div className="flex gap-2">
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
                      }}
                      placeholder="Reply as Support Team... (Cmd/Ctrl+Enter to send)"
                      rows={2}
                      className="flex-1 rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] p-2 text-xs text-white placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-none"
                    />
                    <button
                      onClick={handleSend}
                      disabled={sending || !replyText.trim()}
                      className="self-end rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
