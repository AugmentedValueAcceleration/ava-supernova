import { useState } from 'react';
import { post } from '../App';
import type { SupportTicket } from '../types/messages';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-300',
  in_progress: 'bg-amber-500/15 text-amber-300',
  resolved: 'bg-green-500/15 text-green-300',
  closed: 'bg-[var(--bg-input)] text-[var(--text-muted)]',
};

interface AdminSupportProps {
  tickets: SupportTicket[];
  total: number;
  loading: boolean;
}

export function AdminSupport({ tickets, total, loading }: AdminSupportProps) {
  const [filter, setFilter] = useState<string>('all');
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  function loadFiltered(status: string) {
    setFilter(status);
    post({ type: 'load_admin_tickets', status: status === 'all' ? undefined : status });
  }

  async function sendReply() {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    post({ type: 'admin_reply_ticket', ticketId: selected.id, message: replyText.trim() });
    setReplyText('');
    setSending(false);
    // Reload after a moment
    setTimeout(() => post({ type: 'load_admin_tickets', status: filter === 'all' ? undefined : filter }), 500);
  }

  function updateStatus(ticketId: string, status: string) {
    post({ type: 'admin_update_ticket', ticketId, status });
    if (selected?.id === ticketId) {
      setSelected({ ...selected, status: status as SupportTicket['status'] });
    }
    setTimeout(() => post({ type: 'load_admin_tickets', status: filter === 'all' ? undefined : filter }), 500);
  }

  // Detail view
  if (selected) {
    const messages = [...(selected.support_messages || [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          className="mb-4 flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-white"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="mb-4">
          <h2 className="text-base font-bold">{selected.subject}</h2>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[selected.status]}`}>
              {selected.status.replace('_', ' ')}
            </span>
            <span className="text-[var(--text-muted)]">{selected.email}</span>
            <span className="text-[var(--text-muted)]">{selected.source}</span>
          </div>
        </div>

        {/* Status actions */}
        <div className="mb-4 flex gap-2">
          {['open', 'in_progress', 'resolved', 'closed'].map((s) => (
            <button
              key={s}
              onClick={() => updateStatus(selected.id, s)}
              className={`rounded px-2 py-1 text-[10px] font-medium transition ${
                selected.status === s
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-white'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="mb-4 space-y-3 max-h-[400px] overflow-y-auto">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg p-3 text-xs ${
                m.sender_type === 'admin'
                  ? 'ml-8 bg-[var(--accent)]/10 border border-[var(--accent)]/20'
                  : 'mr-8 bg-[var(--bg-input)]'
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">{m.sender_name}</span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-[var(--text-secondary)]">{m.body}</p>
            </div>
          ))}
        </div>

        {/* Reply */}
        <div className="flex gap-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type your reply..."
            className="flex-1 rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] p-2 text-xs text-white placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
            rows={3}
          />
          <button
            onClick={sendReply}
            disabled={sending || !replyText.trim()}
            className="self-end rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Support Tickets</h2>
          <p className="text-xs text-[var(--text-muted)]">{total} tickets</p>
        </div>
        <button
          onClick={() => loadFiltered(filter)}
          className="rounded bg-[var(--bg-input)] px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-white"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-1">
        {['all', 'open', 'in_progress', 'resolved', 'closed'].map((s) => (
          <button
            key={s}
            onClick={() => loadFiltered(s)}
            className={`rounded px-2.5 py-1 text-[10px] font-medium transition ${
              filter === s
                ? 'bg-[var(--bg-input)] text-white'
                : 'text-[var(--text-muted)] hover:text-white'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-card)] border-t-[var(--accent)]" />
        </div>
      )}

      {!loading && tickets.length === 0 && (
        <p className="py-8 text-center text-xs text-[var(--text-muted)]">No tickets</p>
      )}

      {!loading && tickets.length > 0 && (
        <div className="space-y-2">
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-3 text-left transition hover:border-[var(--accent)]/30"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{t.subject}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[t.status]}`}>
                  {t.status.replace('_', ' ')}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                <span>{t.email}</span>
                <span>{t.source}</span>
                <span>{new Date(t.created_at).toLocaleDateString()}</span>
                <span>{t.support_messages?.length || 0} msgs</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
