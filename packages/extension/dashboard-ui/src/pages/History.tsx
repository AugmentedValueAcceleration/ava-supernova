import { useState } from 'react';
import { post } from '../App';
import { SearchIcon, TrashIcon } from '../components/Icons';

interface ConversationEntry {
  id: string;
  title: string | null;
  project_id: string | null;
  pinned: boolean;
  messages: { role: string; content: string }[];
  created_at: string;
  updated_at: string;
}

interface HistoryProps {
  conversations: ConversationEntry[];
  loading: boolean;
}

export function History({ conversations, loading }: HistoryProps) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.title?.toLowerCase().includes(q) ||
      c.project_id?.toLowerCase().includes(q) ||
      c.messages.some((m) => typeof m.content === 'string' && m.content.toLowerCase().includes(q))
    );
  });

  const pinned = filtered.filter((c) => c.pinned);
  const unpinned = filtered.filter((c) => !c.pinned);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-card)] border-t-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="mb-2 text-2xl font-bold">History</h1>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">
        Chat history synced from the Ava extension.
      </p>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] py-2.5 pl-10 pr-4 text-sm text-white placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <p className="mb-4 text-xs text-[var(--text-muted)]">
        {filtered.length} {filtered.length === 1 ? 'conversation' : 'conversations'}
      </p>

      {/* Pinned */}
      {pinned.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase text-[var(--text-muted)]">Pinned</h2>
          <div className="space-y-3">
            {pinned.map((conv) => (
              <ConversationCard
                key={conv.id}
                conv={conv}
                isExpanded={expandedId === conv.id}
                onToggle={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* All / Unpinned */}
      <div className="space-y-3">
        {pinned.length > 0 && unpinned.length > 0 && (
          <h2 className="mb-1 text-xs font-semibold uppercase text-[var(--text-muted)]">Recent</h2>
        )}
        {unpinned.map((conv) => (
          <ConversationCard
            key={conv.id}
            conv={conv}
            isExpanded={expandedId === conv.id}
            onToggle={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            {search ? 'No conversations match your search.' : 'No conversations yet. Start chatting to see history here.'}
          </p>
        </div>
      )}
    </div>
  );
}

function ConversationCard({ conv, isExpanded, onToggle }: { conv: ConversationEntry; isExpanded: boolean; onToggle: () => void }) {
  const messageCount = conv.messages.length;
  const preview = conv.messages.find((m) => m.role === 'user')?.content || '';
  const truncatedPreview = typeof preview === 'string' && preview.length > 120
    ? preview.slice(0, 120) + '...'
    : preview;

  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)]">
      <div
        className="flex cursor-pointer items-start justify-between gap-4 p-4"
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {conv.pinned && (
              <svg className="h-3.5 w-3.5 shrink-0 text-[var(--gradient-start)]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
              </svg>
            )}
            <h3 className="truncate text-sm font-medium">
              {conv.title || 'Untitled conversation'}
            </h3>
          </div>
          {!isExpanded && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">{truncatedPreview}</p>
          )}
          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
            <span>{messageCount} {messageCount === 1 ? 'message' : 'messages'}</span>
            {conv.project_id && <span>Project: {conv.project_id}</span>}
            <span>{new Date(conv.updated_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => post({ type: 'toggle_pin_conversation', id: conv.id })}
            className={`rounded px-2 py-1 text-xs transition hover:bg-[var(--bg-input)] ${
              conv.pinned ? 'text-[var(--gradient-start)]' : 'text-[var(--text-muted)] hover:text-white'
            }`}
          >
            {conv.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            onClick={() => post({ type: 'delete_conversation', id: conv.id })}
            className="rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-[var(--border-card)] p-4">
          <div className="space-y-3">
            {conv.messages.map((msg, i) => (
              <div key={i} className={`rounded-lg p-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-[var(--bg-input)] text-white'
                  : 'border border-[var(--border-card)] text-[var(--text-secondary)]'
              }`}>
                <p className="mb-1 text-[10px] font-bold uppercase text-[var(--text-muted)]">
                  {msg.role === 'user' ? 'You' : 'Ava'}
                </p>
                <p className="whitespace-pre-wrap">{typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
