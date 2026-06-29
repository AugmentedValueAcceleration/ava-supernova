import { useState, useEffect, useRef, useCallback } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import { Icon } from '../components/Icon';

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
  category: string | null;
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

// Intent-based ticket reasons (migration 317) — same set as web + IDE.
// label/placeholder carry i18n keys resolved with t() at render time.
const SUPPORT_CATEGORIES = [
  { slug: 'bug',      labelKey: 'support.cat.bug',      icon: <Icon.bug size={14} />, placeholderKey: 'support.cat.bug.placeholder' },
  { slug: 'question', labelKey: 'support.cat.question', icon: <Icon.quiz size={14} />, placeholderKey: 'support.cat.question.placeholder' },
  { slug: 'feature',  labelKey: 'support.cat.feature',  icon: <Icon.sparkle size={14} />, placeholderKey: 'support.cat.feature.placeholder' },
  { slug: 'billing',  labelKey: 'support.cat.billing',  icon: <Icon.card size={14} />, placeholderKey: 'support.cat.billing.placeholder' },
  { slug: 'account',  labelKey: 'support.cat.account',  icon: <Icon.user size={14} />, placeholderKey: 'support.cat.account.placeholder' },
  { slug: 'feedback', labelKey: 'support.cat.feedback', icon: <Icon.chat size={14} />, placeholderKey: 'support.cat.feedback.placeholder' },
  { slug: 'other',    labelKey: 'support.cat.other',    icon: <Icon.chat size={14} />, placeholderKey: 'support.cat.other.placeholder' },
] as const;
const categoryMeta = (slug?: string | null) => SUPPORT_CATEGORIES.find(c => c.slug === slug) || null;

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
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages]);

  // Auto-grow the textarea up to a sensible cap so multi-line questions
  // don't crush the chat area but the field stays compact for one-liners.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = '0px';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const handleSend = useCallback(() => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    if (activeConversationId) {
      post({ type: 'send_support_message', conversationId: activeConversationId, message: text });
    } else {
      post({ type: 'start_support_conversation', message: text, category: newCategory });
      setNewCategory(null);
    }
    // Confirmation arrives via the message-update push; this just clears
    // the local "sending" guard so a stuck network doesn't lock the input.
    setTimeout(() => setSending(false), 1000);
  }, [input, sending, activeConversationId, newCategory]);

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

  // Picking a reason from the "+ New ticket" dropdown starts a fresh thread.
  const pickNewReason = (slug: string) => {
    post({ type: 'clear_support_chat' });
    setNewCategory(slug);
    setMenuOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  if (mode === 'byok') {
    return <ByokChat />;
  }

  const hasActiveThread = !!activeConversationId || activeMessages.length > 0;
  const isNewTicket = !hasActiveThread;
  const newCatMeta = categoryMeta(newCategory);

  return (
    <div className="w-full flex flex-col gap-3" style={{ minHeight: 'calc(100vh - 220px)' }}>
      {/* Header — matches the Releases / Roadmap headers. Subtitle in
          Ava's voice; no corporate framing. */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[#cdd6f4] mb-1">{t('dash.support.title')}</h1>
          <p className="text-[13px] text-[#6c7086]">
            {t('support.header_subtitle')}
          </p>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="rounded-lg border border-[var(--border-card)] bg-transparent px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent)]/40 transition cursor-pointer"
          >
            {t('support.new_ticket_plus')}
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-10 z-50 w-56 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-1 shadow-xl shadow-black/40">
                <p className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('support.pick_reason_heading')}</p>
                {SUPPORT_CATEGORIES.map(c => (
                  <button
                    key={c.slug}
                    onClick={() => pickNewReason(c.slug)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)] hover:text-white cursor-pointer"
                  >
                    <span className="text-sm">{c.icon}</span>{t(c.labelKey)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main area — left rail (conversations) + right card (chat) */}
      <div className="flex flex-1 gap-3 min-h-0">
        {/* Conversation list rail — subtler than the prior bordered
            buttons so it reads as navigation, not as cards competing
            with the chat surface. */}
        <aside className="w-56 shrink-0 flex flex-col gap-px overflow-y-auto rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-2">
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider font-medium text-[var(--text-muted)]">
            {t('support.conversations')}
          </div>
          {conversations.length === 0 && !loading && (
            <div className="px-2 py-3 text-[11px] text-[var(--text-muted)] leading-relaxed">
              {t('support.rail_empty')}
            </div>
          )}
          {conversations.map(conv => {
            const active = activeConversationId === conv.id;
            const date = new Date(conv.last_message_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            return (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={`text-left rounded-lg px-2.5 py-2 transition cursor-pointer ${
                  active
                    ? 'bg-[var(--accent)]/10 text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className={`text-[10px] ${active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                    {date}
                  </span>
                  {conv.unread_user > 0 && (
                    <span className="flex items-center justify-center min-w-[16px] h-4 rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-white">
                      {conv.unread_user}
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-snug truncate">
                  {conv.lastMessage?.preview || conv.summary || t('support.new_conversation')}
                </p>
                {categoryMeta(conv.category) && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded border border-[var(--border-card)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">
                    <span>{categoryMeta(conv.category)!.icon}</span>{t(categoryMeta(conv.category)!.labelKey)}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Chat surface — single card. Empty state lives inside it so
            the input stays in the same spot whether or not there's
            an active thread. */}
        <section className="flex-1 flex flex-col rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5">
            {hasActiveThread ? (
              <div className="space-y-3">
                {activeMessages.map(msg => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <EmptyState newCategory={newCategory} />
            )}
          </div>

          {/* Input — always pinned at the bottom of the card. Single
              place for composing whether starting a thread or replying
              in one. */}
          <div className="border-t border-[var(--border-card)] p-3">
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isNewTicket && !newCategory}
                placeholder={isNewTicket ? (newCatMeta ? t(newCatMeta.placeholderKey) : t('support.pick_reason_placeholder')) : t('support.reply_placeholder')}
                rows={1}
                className="flex-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-sm text-white outline-none resize-none focus:border-[var(--accent)]/60 transition leading-relaxed disabled:opacity-50"
                style={{ maxHeight: 160 }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending || (isNewTicket && !newCategory)}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                {t('dash.support.send')}
              </button>
            </div>
            <div className="mt-1.5 px-1 text-[10px] text-[var(--text-muted)]">
              {t('support.enter_hint')}
            </div>
          </div>
        </section>
      </div>

      {/* Legal — a single quiet line beneath the chat, not a card. */}
      <div className="flex items-center gap-4 px-1 text-[11px] text-[var(--text-muted)]">
        <button
          onClick={() => post({ type: 'open_url', url: 'https://ava-supernova.com/terms' })}
          className="hover:text-[var(--text-secondary)] transition cursor-pointer"
        >
          {t('dash.support.terms')}
        </button>
        <span className="opacity-40">·</span>
        <button
          onClick={() => post({ type: 'open_url', url: 'https://ava-supernova.com/privacy' })}
          className="hover:text-[var(--text-secondary)] transition cursor-pointer"
        >
          {t('dash.support.privacy')}
        </button>
      </div>
    </div>
  );
}

// ── Empty state — Ava's voice; reason is chosen from the + New dropdown ──
function EmptyState({ newCategory }: { newCategory: string | null }) {
  const picked = categoryMeta(newCategory);
  if (picked) {
    return (
      <div className="h-full flex flex-col items-start justify-center max-w-md">
        <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed mb-2">
          {picked.icon} {t(picked.labelKey)}
        </p>
        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
          {t('support.empty.picked_body')}
        </p>
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col items-start justify-center max-w-md">
      <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-3">
        {t('support.empty.greeting')}
      </p>
      <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
        {t('support.empty.hint_pre')} <span className="text-white">{t('support.new_ticket_plus')}</span> {t('support.empty.hint_post')}
      </p>
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
  return (
    <div className="w-full flex flex-col gap-4">
      <div>
        <h1 className="text-[22px] font-semibold text-[#cdd6f4] mb-1">{t('support.byok.title')}</h1>
        <p className="text-[13px] text-[#6c7086]">
          {t('support.byok.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => post({ type: 'open_url', url: 'https://github.com/AugmentedValueAcceleration/ava-supernova/issues' })}
          className="flex flex-col items-start gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 text-left cursor-pointer hover:border-[var(--accent)]/30 transition"
        >
          <span className="text-[var(--accent)] leading-none"><Icon.github size={22} /></span>
          <div>
            <p className="text-sm font-medium text-white">{t('support.byok.github')}</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{t('support.byok.github_desc')}</p>
          </div>
        </button>

        <button
          onClick={() => post({ type: 'open_url', url: 'https://discord.gg/tuHZzUGxA6' })}
          className="flex flex-col items-start gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 text-left cursor-pointer hover:border-[var(--accent)]/30 transition"
        >
          <span className="text-[var(--accent)] leading-none"><Icon.chat size={22} /></span>
          <div>
            <p className="text-sm font-medium text-white">{t('support.byok.community')}</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{t('support.byok.community_desc')}</p>
          </div>
        </button>

        <button
          onClick={() => post({ type: 'open_url', url: 'https://ava-supernova.com/docs' })}
          className="flex flex-col items-start gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 text-left cursor-pointer hover:border-[var(--accent)]/30 transition"
        >
          <span className="text-[var(--accent)] leading-none"><Icon.book size={22} /></span>
          <div>
            <p className="text-sm font-medium text-white">{t('support.byok.docs')}</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{t('support.byok.docs_desc')}</p>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-4 px-1 text-[11px] text-[var(--text-muted)]">
        <button
          onClick={() => post({ type: 'open_url', url: 'https://ava-supernova.com/terms' })}
          className="hover:text-[var(--text-secondary)] transition cursor-pointer"
        >
          {t('dash.support.terms')}
        </button>
        <span className="opacity-40">·</span>
        <button
          onClick={() => post({ type: 'open_url', url: 'https://ava-supernova.com/privacy' })}
          className="hover:text-[var(--text-secondary)] transition cursor-pointer"
        >
          {t('dash.support.privacy')}
        </button>
      </div>
    </div>
  );
}
