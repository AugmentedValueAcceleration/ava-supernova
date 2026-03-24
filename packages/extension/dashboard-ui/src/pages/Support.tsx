import { useState } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import { Select } from '../components/Select';

interface SupportMessage {
  id: string;
  sender_type: 'user' | 'admin';
  sender_name: string;
  body: string;
  created_at: string;
}

export interface Ticket {
  id: string;
  email: string;
  name: string | null;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category?: 'bug' | 'feature' | 'question' | 'account' | 'feedback' | 'teach' | 'other';
  source: 'tool' | 'dashboard' | 'website';
  created_at: string;
  updated_at: string;
  support_messages: SupportMessage[];
}

type StatusFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'closed';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-300',
  in_progress: 'bg-amber-500/15 text-amber-300',
  resolved: 'bg-green-500/15 text-green-300',
  closed: 'bg-[var(--bg-input)] text-[var(--text-muted)]',
};

const SOURCE_LABELS: Record<string, string> = {
  tool: 'Ava',
  dashboard: 'Dashboard',
  website: 'Website',
};

const CATEGORY_OPTIONS = [
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'question', label: 'Question' },
  { value: 'account', label: 'Account / Billing' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'teach', label: 'Teach Mode' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_COLORS: Record<string, string> = {
  bug: 'bg-red-500/15 text-red-300',
  feature: 'bg-purple-500/15 text-purple-300',
  question: 'bg-cyan-500/15 text-cyan-300',
  account: 'bg-amber-500/15 text-amber-300',
  feedback: 'bg-green-500/15 text-green-300',
  teach: 'bg-pink-500/15 text-pink-300',
  other: 'bg-[var(--bg-input)] text-[var(--text-muted)]',
};

interface SupportProps {
  tickets: Ticket[];
  loading: boolean;
  mode?: 'platform' | 'byok';
}

export function Support({ tickets, loading, mode = 'platform' }: SupportProps) {
  useLocale();
  if (mode === 'byok') {
    return <ByokSupport />;
  }
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [newCategory, setNewCategory] = useState('other');
  const [creating, setCreating] = useState(false);

  const filtered = filter === 'all' ? tickets : tickets.filter((t) => t.status === filter);

  function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setCreating(true);
    const subject = newMessage.trim().slice(0, 80) + (newMessage.trim().length > 80 ? '...' : '');
    post({ type: 'create_support_ticket', subject, message: newMessage, category: newCategory });
    setTimeout(() => {
      setShowNew(false);
      setNewMessage('');
      setNewCategory('other');
      setCreating(false);
    }, 1000);
  }

  function handleReply() {
    if (!selectedTicket || !replyText.trim()) return;
    setSending(true);
    post({ type: 'reply_support_ticket', ticketId: selectedTicket.id, message: replyText });
    setTimeout(() => {
      setReplyText('');
      setSending(false);
    }, 1000);
  }

  // Detail view
  if (selectedTicket) {
    const messages = [...(selectedTicket.support_messages || [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return (
      <div className="mx-auto w-full max-w-4xl">
        <button
          onClick={() => setSelectedTicket(null)}
          className="mb-4 flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to tickets
        </button>

        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">{selectedTicket.subject}</h1>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[selectedTicket.status]}`}>
              {selectedTicket.status.replace('_', ' ')}
            </span>
            <span className="text-[var(--text-muted)]">
              Opened {new Date(selectedTicket.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="text-[var(--text-muted)]">via {SOURCE_LABELS[selectedTicket.source] ?? selectedTicket.source}</span>
          </div>
        </div>

        {/* Messages thread */}
        <div className="mb-6 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-xl border p-4 ${
                msg.sender_type === 'admin'
                  ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5'
                  : 'border-[var(--border-card)] bg-[var(--bg-card)]'
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-white">
                  {msg.sender_name}
                  {msg.sender_type === 'admin' && (
                    <span className="ml-1.5 rounded bg-[var(--accent)]/20 px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
                      Support
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {new Date(msg.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">{msg.body}</p>
            </div>
          ))}
        </div>

        {/* Reply box */}
        {selectedTicket.status !== 'closed' && (
          <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
              placeholder="Write a reply..."
            />
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleReply}
                disabled={sending || !replyText.trim()}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover,#6d28d9)] disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send Reply'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('dash.support.title')}</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {t('dash.support.subtitle')}
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover,#6d28d9)]"
        >
          {t('dash.support.new_ticket')}
        </button>
      </div>

      {/* New ticket form */}
      {showNew && (
        <form onSubmit={handleCreateTicket} className="mb-6 space-y-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{t('dash.support.type')}</label>
            <Select value={newCategory} onChange={setNewCategory} options={CATEGORY_OPTIONS} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{t('dash.support.description')}</label>
            <textarea
              required
              rows={4}
              maxLength={10000}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="w-full resize-y rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
              placeholder={t('dash.support.description')}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover,#6d28d9)] disabled:opacity-50"
            >
              {creating ? 'Submitting...' : t('dash.support.submit')}
            </button>
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="rounded-lg px-4 py-2 text-xs text-[var(--text-muted)] hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filter tabs */}
      <div className="mb-6 flex w-fit gap-1 rounded-lg bg-[var(--bg-input)] p-1">
        {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition ${
              filter === f
                ? 'bg-[var(--bg-card)] text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-card)] border-t-[var(--accent)]" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bg-input)] text-[var(--text-muted)]">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 17h.01" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold">No support tickets</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Need help? Click &ldquo;New Ticket&rdquo; above, or ask Ava to submit one for you.
          </p>
        </div>
      )}

      {/* Ticket list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => setSelectedTicket(ticket)}
              className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5 text-left transition hover:border-[var(--border-input)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-white">{ticket.subject}</h3>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[ticket.status]}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                    {ticket.category && (
                      <span className={`rounded-full px-2 py-0.5 font-medium ${CATEGORY_COLORS[ticket.category] || CATEGORY_COLORS.other}`}>
                        {ticket.category}
                      </span>
                    )}
                    <span className="text-[var(--text-muted)]">via {SOURCE_LABELS[ticket.source] ?? ticket.source}</span>
                    <span className="text-[var(--text-muted)]">
                      {new Date(ticket.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-[var(--text-muted)]">
                  {ticket.support_messages?.length > 0 && (
                    <span>{ticket.support_messages.length} message{ticket.support_messages.length !== 1 ? 's' : ''}</span>
                  )}
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ByokSupport() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('other');
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !message.trim()) return;
    const subject = message.trim().slice(0, 80) + (message.trim().length > 80 ? '...' : '');
    post({ type: 'send_byok_support', email: email.trim(), subject, message: message.trim(), category });
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('dash.support.title')}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {t('dash.support.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-6 space-y-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Your Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Category</label>
          <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Message</label>
          <textarea
            required
            rows={5}
            maxLength={10000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full resize-y rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
            placeholder="Describe your issue..."
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover,#6d28d9)]"
          >
            Send Message
          </button>
          {sent && <span className="text-xs text-green-400">Opening your email client...</span>}
        </div>
      </form>

      <div className="rounded-xl border border-dashed border-[var(--border-card)] bg-[var(--bg-card)] p-5 text-center">
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          Connected account holders get priority support and ticket tracking.
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          You can also open an issue on{' '}
          <button onClick={() => post({ type: 'open_url', url: 'https://github.com/AugmentedValueAcceleration/ava-supernova/issues' })} className="text-[var(--gradient-start)] hover:underline">
            GitHub
          </button>.
        </p>
      </div>
    </div>
  );
}
