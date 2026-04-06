import { useState, useEffect, useRef, useCallback } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';

interface SupportMessage {
  id: string;
  sender_type: 'user' | 'admin';
  sender_name: string;
  body: string;
  is_ava: boolean;
  created_at: string;
}

interface SupportConversation {
  id: string;
  status: string;
  unread_user: number;
  summary: string | null;
  last_message_at: string;
  lastMessage?: {
    preview: string;
    senderType: string;
    isAva: boolean;
    timestamp: string;
  };
}

interface SupportChatProps {
  conversations: SupportConversation[];
  activeMessages: SupportMessage[];
  activeConversationId: string | null;
  loading: boolean;
  mode?: 'platform' | 'byok';
}

export function SupportChat({ conversations, activeMessages, activeConversationId, loading, mode = 'platform' }: SupportChatProps) {
  useLocale();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    if (activeConversationId) {
      post({ type: 'send_support_message', conversationId: activeConversationId, message: text });
    } else {
      post({ type: 'start_support_conversation', message: text });
    }

    // Reset sending state after a short delay (actual confirmation comes via message update)
    setTimeout(() => setSending(false), 1000);
  }, [input, sending, activeConversationId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectConversation = (id: string) => {
    post({ type: 'load_support_messages', conversationId: id });
    post({ type: 'mark_support_read', conversationId: id });
  };

  const startNewChat = () => {
    post({ type: 'clear_support_chat' });
  };

  // If not connected (BYOK), show a simplified view
  if (mode === 'byok') {
    return <ByokChat />;
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex flex-col" style={{ height: 'calc(100vh - 200px)', minHeight: 400 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-light">Support</h1>
          <p className="text-xs text-[var(--text-muted)]">Chat with Ava and the team</p>
        </div>
        <button
          onClick={startNewChat}
          className="rounded-lg border border-[var(--border-card)] bg-transparent px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent)]/30 transition cursor-pointer"
        >
          + New chat
        </button>
      </div>

      <div className="flex flex-1 gap-3 min-h-0">
        {/* Conversation list */}
        <div className="w-48 shrink-0 flex flex-col gap-1 overflow-y-auto">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => selectConversation(conv.id)}
              className={`text-left rounded-lg p-2.5 transition cursor-pointer border ${
                activeConversationId === conv.id
                  ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5'
                  : 'border-transparent hover:bg-[var(--bg-input)]'
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-[var(--text-muted)]">
                  {new Date(conv.last_message_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
                {conv.unread_user > 0 && (
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[var(--accent)] text-[8px] font-bold text-white">
                    {conv.unread_user}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] truncate">
                {conv.lastMessage?.preview || conv.summary || 'New conversation'}
              </p>
            </button>
          ))}

          {conversations.length === 0 && !loading && (
            <p className="text-[10px] text-[var(--text-muted)] text-center py-4">No conversations yet</p>
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] overflow-hidden">
          {activeConversationId || activeMessages.length > 0 ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeMessages.map(msg => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-[var(--border-card)] p-3">
                <div className="flex gap-2">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    rows={1}
                    className="flex-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-sm text-white outline-none resize-none focus:border-[var(--accent)] transition"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white transition hover:bg-[var(--accent-hover,#6d28d9)] disabled:opacity-30 cursor-pointer"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Empty state — start a new chat */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-white mb-1">Need a hand?</h3>
              <p className="text-xs text-[var(--text-muted)] mb-6 max-w-xs">
                Just type your question below. Ava will try to help first — and if she can't, the team will jump in.
              </p>

              {/* Quick input for new chat */}
              <div className="w-full max-w-sm">
                <div className="flex gap-2">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="What's up?"
                    rows={1}
                    className="flex-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-sm text-white outline-none resize-none focus:border-[var(--accent)] transition"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white transition hover:bg-[var(--accent-hover,#6d28d9)] disabled:opacity-30 cursor-pointer"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legal links */}
      <div className="mt-6 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Legal</h2>
        <div className="flex gap-4">
          <button
            onClick={() => post({ type: 'open_url', url: 'https://ava-supernova.com/terms' })}
            className="flex items-center gap-2 text-sm text-[var(--text-secondary)] transition hover:text-white"
          >
            <svg className="h-4 w-4 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Terms of Service
          </button>
          <button
            onClick={() => post({ type: 'open_url', url: 'https://ava-supernova.com/privacy' })}
            className="flex items-center gap-2 text-sm text-[var(--text-secondary)] transition hover:text-white"
          >
            <svg className="h-4 w-4 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            Privacy Policy
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────

function MessageBubble({ message }: { message: SupportMessage }) {
  const isUser = message.sender_type === 'user';
  const isAva = message.is_ava;
  const time = new Date(message.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 ${
        isUser
          ? 'bg-[var(--accent)] text-white'
          : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
      }`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-medium text-white">{message.sender_name}</span>
            {isAva && (
              <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--accent)] bg-[var(--accent)]/15 px-1.5 py-0.5 rounded">
                Ava
              </span>
            )}
          </div>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.body}</p>
        <p className={`text-[9px] mt-1 ${isUser ? 'text-white/50' : 'text-[var(--text-muted)]'}`}>{time}</p>
      </div>
    </div>
  );
}

// ── BYOK fallback ─────────────────────────────────────────────────────

function ByokChat() {
  useLocale();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !message.trim()) return;
    const subject = message.trim().slice(0, 80) + (message.trim().length > 80 ? '...' : '');
    post({ type: 'send_byok_support', email: email.trim(), subject, message: message.trim(), category: 'other' });
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-light">Support</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Connect your account for live chat, or send us a message below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <div>
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">Your email</label>
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
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">What's up?</label>
          <textarea
            required
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full resize-y rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
            placeholder="Describe your issue or question..."
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition hover:bg-[var(--accent-hover,#6d28d9)] cursor-pointer"
        >
          Send Message
        </button>
        {sent && <span className="text-xs text-green-400 ml-2">Sent! We'll reply to your email.</span>}
      </form>
    </div>
  );
}
