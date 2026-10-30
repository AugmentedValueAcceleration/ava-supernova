import { useState, useEffect, useRef } from 'react';
import { tt, useLocale } from '../i18n';
import { post } from '../App';
import { Icon } from '../components/Icon';
import type { SupportTicket, SupportTicketMessage, SupportTicketCategory } from '../types/messages';

// Support is ONE private ticket system, always answered by a person on the
// team — there is no AI first reply. Discord is the public home for questions,
// bugs and ideas; a ticket is for anything personal, or for people who would
// rather not ask in public. Same flow as the IDE: list → thread → reply/close,
// plus the new-ticket form.

const DISCORD_URL = 'https://discord.gg/bbtnKMW4rf';
const SUBJECT_MAX = 200;
const MESSAGE_MAX = 10_000;

// Display order is the order the server documents. Labels resolve at render
// time so a locale switch re-renders them.
const CATEGORIES: { id: SupportTicketCategory; key: string; label: string }[] = [
  { id: 'question', key: 'support.ticket.cat.question', label: 'Question / how-to' },
  { id: 'bug',      key: 'support.ticket.cat.bug',      label: 'Bug report' },
  { id: 'feature',  key: 'support.ticket.cat.feature',  label: 'Feature idea' },
  { id: 'account',  key: 'support.ticket.cat.account',  label: 'Account & login' },
  { id: 'billing',  key: 'support.ticket.cat.billing',  label: 'Billing & credits' },
  { id: 'privacy',  key: 'support.ticket.cat.privacy',  label: 'Privacy & my data' },
  { id: 'security', key: 'support.ticket.cat.security', label: 'Security report' },
  { id: 'other',    key: 'support.ticket.cat.other',    label: 'Something else' },
];

function categoryLabel(id: string): string {
  const c = CATEGORIES.find(x => x.id === id);
  return c ? tt(c.key, c.label) : id;
}

// waiting_on_you is the one that asks for attention — the team has replied.
const STATUS: Record<string, { key: string; label: string; className: string }> = {
  waiting_on_us:  { key: 'support.ticket.status.waiting_on_us',  label: 'Waiting on us',  className: 'border-[var(--border-card)] text-[var(--text-secondary)]' },
  waiting_on_you: { key: 'support.ticket.status.waiting_on_you', label: 'Waiting on you', className: 'border-amber-400/40 bg-amber-400/10 text-amber-300' },
  resolved:       { key: 'support.ticket.status.resolved',       label: 'Resolved',       className: 'border-emerald-400/30 text-emerald-400' },
  closed:         { key: 'support.ticket.status.closed',         label: 'Closed',         className: 'border-[var(--border-card)] text-[var(--text-muted)]' },
};

function StatusChip({ status }: { status: string }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] ${s ? s.className : 'border-[var(--border-card)] text-[var(--text-muted)]'}`}>
      {s ? tt(s.key, s.label) : status}
    </span>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── The one line every Support screen carries ────────────────────────────
function PublicPrivateLine() {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-4 py-3 text-[12px] text-[var(--text-secondary)]">
      <span className="text-[var(--accent)] leading-none"><Icon.chat size={14} /></span>
      <span>{tt('support.ticket.public_q', 'Public question?')}</span>
      <button
        type="button"
        onClick={() => post({ type: 'open_url', url: DISCORD_URL })}
        className="cursor-pointer border-none bg-transparent p-0 text-[var(--accent)] hover:underline"
      >
        {tt('support.ticket.ask_discord', 'Ask in our Discord.')}
      </button>
      <span className="mx-1 opacity-40">·</span>
      <span className="text-[var(--accent)] leading-none"><Icon.locked size={14} /></span>
      <span>{tt('support.ticket.private_line', 'Private? Open a ticket here — only you and the team can see it.')}</span>
    </div>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{text}</p>
  );
}

interface SupportTicketsProps {
  tickets: SupportTicket[];
  loading: boolean;
  /** null until the host's first answer. false = no platform key. */
  signedIn: boolean | null;
  listError: string | null;
  activeTicket: SupportTicket | null;
  activeMessages: SupportTicketMessage[];
  /** Drop the open ticket from App state when the user goes back to the list. */
  onCloseTicket: () => void;
}

type View = { kind: 'list' } | { kind: 'new' } | { kind: 'ticket'; ref: string };

export function SupportTickets({ tickets, loading, signedIn, listError, activeTicket, activeMessages, onCloseTicket }: SupportTicketsProps) {
  useLocale();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [openError, setOpenError] = useState<string | null>(null);

  // The host keeps re-reading the open ticket every 30s; tell it to stop when
  // the thread is left — by Back, by another Help tab, or by leaving the page.
  const viewingRef = view.kind === 'ticket' ? view.ref : null;
  useEffect(() => {
    if (!viewingRef) return;
    return () => post({ type: 'leave_support_ticket' });
  }, [viewingRef]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'support_ticket_submitted' && msg.ticket?.ref_label) {
        setView({ kind: 'ticket', ref: msg.ticket.ref_label });
      } else if (msg?.type === 'support_ticket_failed' && msg.action === 'open') {
        setOpenError(msg.error);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const openTicket = (ref: string) => {
    setOpenError(null);
    setView({ kind: 'ticket', ref });
    post({ type: 'open_support_ticket', ref });
  };

  const backToList = () => {
    setOpenError(null);
    onCloseTicket();
    setView({ kind: 'list' });
    post({ type: 'load_support_tickets' });
  };

  const header = (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold text-[#cdd6f4] mb-1">{tt('support.ticket.title', 'Private support tickets')}</h1>
        <p className="text-[13px] text-[#6c7086]">
          {tt('support.ticket.subtitle', 'Every ticket is read and answered by a person on the team.')}
        </p>
      </div>
      {signedIn && view.kind === 'list' && (
        <button
          type="button"
          onClick={() => setView({ kind: 'new' })}
          className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 cursor-pointer"
        >
          {tt('support.ticket.new', '+ New ticket')}
        </button>
      )}
    </div>
  );

  // Signed out, or BYOK-only with no account: nothing to call, so say how to
  // get a ticket and leave the public route right there.
  if (signedIn === false) {
    return (
      <div className="w-full flex flex-col gap-3">
        {header}
        <PublicPrivateLine />
        <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-5 py-6">
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
            {tt('support.ticket.sign_in', 'Sign in to your Ava Supernova account to open a private ticket.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-3">
      {header}
      <PublicPrivateLine />

      {view.kind === 'new' && (
        <NewTicketForm onCancel={() => setView({ kind: 'list' })} />
      )}

      {view.kind === 'ticket' && (
        <TicketThread
          ticket={activeTicket && activeTicket.ref_label === view.ref ? activeTicket : null}
          messages={activeTicket && activeTicket.ref_label === view.ref ? activeMessages : []}
          openError={openError}
          onBack={backToList}
        />
      )}

      {view.kind === 'list' && (
        <TicketList tickets={tickets} loading={loading || signedIn === null} error={listError} onOpen={openTicket} />
      )}
    </div>
  );
}

// ── My tickets ───────────────────────────────────────────────────────────
function TicketList({ tickets, loading, error, onOpen }: { tickets: SupportTicket[]; loading: boolean; error: string | null; onOpen: (ref: string) => void }) {
  if (loading && tickets.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-5 py-6 text-[12px] text-[var(--text-muted)]">
        {tt('support.ticket.loading', 'Loading your tickets…')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ErrorLine text={error} />
      {tickets.length === 0 && !error ? (
        <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-5 py-6">
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
            {tt('support.ticket.none', 'You have no tickets yet. Open one with + New ticket.')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)]">
          {tickets.map(tk => {
            const unread = tk.unread_user > 0;
            return (
              <button
                key={tk.ref_label}
                type="button"
                onClick={() => onOpen(tk.ref_label)}
                className="flex w-full items-center gap-3 border-b border-[var(--border-card)] px-4 py-3 text-left transition last:border-b-0 hover:bg-[var(--bg-input)] cursor-pointer"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-[var(--accent)]' : 'bg-transparent'}`}
                  aria-label={unread ? tt('support.ticket.unread', 'New reply') : undefined}
                  title={unread ? tt('support.ticket.unread', 'New reply') : undefined}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">{tk.ref_label}</span>
                    <span className={`truncate text-[13px] ${unread ? 'font-semibold text-white' : 'text-[var(--text-secondary)]'}`}>{tk.subject}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{categoryLabel(tk.category)}</div>
                </div>
                <StatusChip status={tk.status} />
                <span className="w-16 shrink-0 text-right text-[10px] text-[var(--text-muted)]">{formatWhen(tk.last_message_at || tk.created_at)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── New ticket ───────────────────────────────────────────────────────────
function NewTicketForm({ onCancel }: { onCancel: () => void }) {
  const [category, setCategory] = useState<SupportTicketCategory | ''>('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'support_ticket_failed' && msg.action === 'create') {
        setSubmitting(false);
        setError(msg.error);
      } else if (msg?.type === 'support_ticket_submitted') {
        setSubmitting(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const canSubmit = !!category && !!subject.trim() && !!message.trim() && !submitting;

  const submit = () => {
    if (!category) { setError(tt('support.ticket.err_category', 'Choose a category.')); return; }
    if (!subject.trim() || !message.trim()) { setError(tt('support.ticket.err_empty', 'Tell us what you need help with.')); return; }
    setError(null);
    setSubmitting(true);
    post({ type: 'submit_support_ticket', category, subject: subject.trim(), message: message.trim() });
  };

  const fieldClass = 'w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/60 transition disabled:opacity-50';

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
      <h2 className="text-[15px] font-semibold text-white">{tt('support.ticket.new_title', 'New private ticket')}</h2>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{tt('support.ticket.category', 'Category')}</span>
        <select
          value={category}
          onChange={e => setCategory(e.target.value as SupportTicketCategory | '')}
          disabled={submitting}
          className={`${fieldClass} cursor-pointer`}
        >
          <option value="" disabled>{tt('support.ticket.category_pick', 'Choose a category…')}</option>
          {CATEGORIES.map(c => (
            <option key={c.id} value={c.id}>{tt(c.key, c.label)}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{tt('support.ticket.subject', 'Subject')}</span>
        <input
          type="text"
          value={subject}
          maxLength={SUBJECT_MAX}
          onChange={e => setSubject(e.target.value)}
          disabled={submitting}
          placeholder={tt('support.ticket.subject_ph', 'A short summary')}
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          <span>{tt('support.ticket.message', 'Message')}</span>
          {message.length > MESSAGE_MAX * 0.9 && (
            <span className="normal-case tracking-normal">{message.length.toLocaleString()} / {MESSAGE_MAX.toLocaleString()}</span>
          )}
        </span>
        <textarea
          value={message}
          maxLength={MESSAGE_MAX}
          onChange={e => setMessage(e.target.value)}
          disabled={submitting}
          rows={7}
          placeholder={tt('support.ticket.message_ph', 'What is going on? The more detail, the faster we can help.')}
          className={`${fieldClass} resize-y leading-relaxed`}
        />
      </label>

      <p className="flex items-center gap-1.5 text-[11px] text-amber-300">
        <Icon.shield size={12} />
        {tt('support.ticket.privacy_note', 'Never paste API keys or passwords — the team never needs them.')}
      </p>

      <ErrorLine text={error} />

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-[var(--border-card)] bg-transparent px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-white cursor-pointer disabled:opacity-40"
        >
          {tt('support.ticket.cancel', 'Cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
        >
          {submitting ? tt('support.ticket.submitting', 'Sending…') : tt('support.ticket.submit', 'Open ticket')}
        </button>
      </div>
    </section>
  );
}

// ── One ticket: thread, reply, close / reopen ────────────────────────────
function TicketThread({ ticket, messages, openError, onBack }: { ticket: SupportTicket | null; messages: SupportTicketMessage[]; openError: string | null; onBack: () => void }) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'support_ticket_reply_sent') {
        setSending(false);
        setReply('');
      } else if (msg?.type === 'support_ticket_loaded') {
        setStatusBusy(false);
      } else if (msg?.type === 'support_ticket_failed' && msg.action !== 'open' && msg.action !== 'create') {
        setSending(false);
        setStatusBusy(false);
        setError(msg.error);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      className="self-start cursor-pointer border-none bg-transparent p-0 text-[12px] text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]"
    >
      ← {tt('support.ticket.back', 'My tickets')}
    </button>
  );

  if (!ticket) {
    return (
      <div className="flex flex-col gap-3">
        {backButton}
        {openError ? <ErrorLine text={openError} /> : (
          <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-5 py-6 text-[12px] text-[var(--text-muted)]">
            {tt('support.ticket.opening', 'Opening the ticket…')}
          </div>
        )}
      </div>
    );
  }

  const ref = ticket.ref_label;
  const isClosed = ticket.status === 'closed';

  const sendReply = () => {
    const text = reply.trim();
    if (!text || sending) return;
    setError(null);
    setSending(true);
    post({ type: 'send_support_ticket_reply', ref, message: text });
  };

  const setStatus = (action: 'close' | 'reopen') => {
    setError(null);
    setStatusBusy(true);
    post({ type: 'set_support_ticket_status', ref, action });
  };

  return (
    <div className="flex flex-col gap-3">
      {backButton}

      <section className="flex flex-col overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)]">
        {/* Ticket header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-card)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <span className="font-mono">{ref}</span>
              <span className="opacity-40">·</span>
              <span>{categoryLabel(ticket.category)}</span>
            </div>
            <h2 className="mt-1 text-[15px] font-semibold text-white break-words">{ticket.subject}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusChip status={ticket.status} />
            <button
              type="button"
              onClick={() => setStatus(isClosed ? 'reopen' : 'close')}
              disabled={statusBusy}
              className="rounded-lg border border-[var(--border-card)] bg-transparent px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:text-white hover:border-[var(--accent)]/40 cursor-pointer disabled:opacity-40"
            >
              {isClosed ? tt('support.ticket.reopen', 'Reopen') : tt('support.ticket.close', 'Close ticket')}
            </button>
          </div>
        </div>

        {/* Thread */}
        <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto p-5">
          {messages.map(m => <TicketBubble key={m.id} message={m} />)}
          <div ref={endRef} />
        </div>

        {/* Reply — a closed ticket is reopened first, so it never takes a reply. */}
        <div className="border-t border-[var(--border-card)] p-3">
          {isClosed ? (
            <p className="px-1 text-[12px] text-[var(--text-muted)]">
              {tt('support.ticket.closed_hint', 'This ticket is closed. Reopen it to reply.')}
            </p>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  maxLength={MESSAGE_MAX}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendReply(); }
                  }}
                  disabled={sending}
                  rows={3}
                  placeholder={tt('support.ticket.reply_ph', 'Write a reply…')}
                  className="flex-1 resize-y rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-sm text-white outline-none leading-relaxed transition focus:border-[var(--accent)]/60 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={!reply.trim() || sending}
                  className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                >
                  {sending ? tt('support.ticket.sending', 'Sending…') : tt('support.ticket.send', 'Send')}
                </button>
              </div>
              <p className="mt-1.5 px-1 text-[10px] text-[var(--text-muted)]">
                {tt('support.ticket.reply_hint', 'Ctrl+Enter to send · Never paste API keys or passwords — the team never needs them.')}
              </p>
            </>
          )}
          {error && <div className="mt-2"><ErrorLine text={error} /></div>}
        </div>
      </section>
    </div>
  );
}

// User on the right; everything else is the team. 'ava' only exists in old
// history (the retired auto-reply) and reads as an earlier message from the
// team's side — never as a live AI answer.
function TicketBubble({ message }: { message: SupportTicketMessage }) {
  const isUser = message.sender === 'user';
  const name = isUser
    ? tt('support.ticket.you', 'You')
    : message.sender === 'ava'
      ? tt('support.ticket.ava_earlier', 'Ava (earlier auto-reply)')
      : (message.sender_name || tt('support.ticket.team', 'Ava Supernova team'));

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 ${
        isUser
          ? 'bg-[var(--accent)] text-white'
          : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
      }`}>
        <div className={`mb-1 text-[10px] font-medium ${isUser ? 'text-white/80' : 'text-white'}`}>{name}</div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.body}</p>
        <p className={`mt-1 text-[9px] ${isUser ? 'text-white/50' : 'text-[var(--text-muted)]'}`}>{formatStamp(message.created_at)}</p>
      </div>
    </div>
  );
}
