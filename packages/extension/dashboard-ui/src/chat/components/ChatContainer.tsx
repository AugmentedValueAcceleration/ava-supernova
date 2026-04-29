import type { RefObject } from 'react';
import type { UIMessage } from '../../types/messages';
import { MessageBubble } from './MessageBubble';
import { ThinkingIndicator } from './ThinkingIndicator';
import { PersonaStatus } from './PersonaStatus';
// ContextBar is rendered by Chat.tsx above the composer — not in here anymore
import { t, useLocale } from '../../i18n';

interface PersonaInfo {
  id: string;
  phase: 'active' | 'complete' | 'error';
  description?: string;
  output?: string;
  tools?: Array<{ name: string; done: boolean; success?: boolean }>;
}

interface ChatContainerProps {
  messages: UIMessage[];
  isThinking: boolean;
  conductorActive?: boolean;
  conductorMode?: string | null;
  activePersonas?: PersonaInfo[];
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllowCategory?: boolean, planSelection?: string, userResponse?: string) => void;
  onContinue: () => void;
  onSuggestion: (prompt: string) => void;
  onRate?: (messageId: string, rating: 'up' | 'down', reason?: string) => void;
  chatEndRef: RefObject<HTMLDivElement | null>;
  needsSetup?: boolean;
  initialized?: boolean;
  onOpenDashboard?: () => void;
  activeModel?: string | null;
  models?: Array<{ id: string; name: string; provider: string }>;
  /** Operator's first name — drives the time-of-day-aware seeded
   *  welcome bubble AND the user-avatar initials fallback. */
  userName?: string | null;
  /** User's avatar URL from auth (Supabase users.avatar_url). */
  userAvatarUrl?: string | null;
  // Context bar (v0.39.x) — replaces the circular chip in InputArea.
  contextUsage?: { used: number; limit: number; percent: number } | null;
  isCompressing?: boolean;
  isStreaming?: boolean;
  onCompress?: () => void;
}

// SUGGESTIONS / CAPABILITIES / MODE_INFO arrays removed — they backed
// the previous multi-card welcome screen which has been retired to
// match the IDE's single-seeded-message empty state. Props onSuggestion
// / activeModel / models stay in ChatContainerProps for caller
// compatibility but are no longer destructured here.

export function ChatContainer({ messages, isThinking, onConfirmation, onContinue, onRate, chatEndRef, needsSetup, initialized, onOpenDashboard, conductorActive, conductorMode, activePersonas, onSuggestion, userName, userAvatarUrl }: ChatContainerProps) {
  useLocale();
  // Don't render welcome screen until init message arrives — prevents setup banner flash
  if (!initialized && messages.length === 0) {
    return <div className="flex-1" />;
  }

  // Empty-state branch fires until the user's first turn. Ambient messages
  // (model-switch notices, daily briefing, tick-engine nudges) push
  // assistant/system rows into state but don't count as the user starting
  // a conversation — gate on `hasUserSpoken` so those don't drop the
  // helper card on first touch. Mirrors the webview-ui chat panel.
  const hasUserSpoken = messages.some((m) => m.role === 'user');
  if (!hasUserSpoken && !isThinking) {
    const seededWelcome = {
      id: 'welcome-seed',
      role: 'assistant' as const,
      content: buildSeededWelcome(userName ?? null),
      isStreaming: false,
      timestamp: Date.now(),
    } as unknown as typeof messages[number];

    return (
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="w-full space-y-3">
          {needsSetup && (
            <button
              onClick={onOpenDashboard}
              className="w-full mb-2 p-4 rounded-xl text-left cursor-pointer transition-all duration-200
                         border bg-transparent hover:bg-[rgba(168,85,247,0.05)]"
              style={{ border: '1.5px dashed rgba(168, 85, 247, 0.4)' }}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">🔑</span>
                <div>
                  <p className="text-sm font-semibold text-[var(--vscode-foreground)] mb-1">{t('welcome.setup_title')}</p>
                  <p className="text-xs opacity-50 leading-relaxed">{t('welcome.setup_desc')}</p>
                </div>
              </div>
            </button>
          )}
          <MessageBubble message={seededWelcome} onConfirmation={onConfirmation} />
          {messages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onConfirmation={onConfirmation}
              onContinue={msg.role === 'error' && i === messages.length - 1 ? onContinue : undefined}
              onRate={msg.role === 'assistant' ? onRate : undefined}
              userAvatarUrl={userAvatarUrl}
              userName={userName}
            />
          ))}
          <StarterHelper onSuggestion={onSuggestion} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ContextBar moved out — Chat.tsx renders it between the message
          list and the composer so the gauge is right where typing happens. */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3" role="log" aria-label="Chat messages" aria-live="polite">
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onConfirmation={onConfirmation}
            onContinue={msg.role === 'error' && i === messages.length - 1 ? onContinue : undefined}
            onRate={msg.role === 'assistant' ? onRate : undefined}
          />
        ))}
        {(conductorActive || (activePersonas && activePersonas.length > 0)) && (
          <PersonaStatus
            active={conductorActive || false}
            mode={conductorMode}
            personas={activePersonas || []}
          />
        )}
        {isThinking && <ThinkingIndicator />}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
}

/**
 * Time-of-day-aware seeded welcome from Ava. First-person, warm, knows
 * the operator's name when the account has loaded. Mirrors the writing
 * voice of Ava elsewhere — partner, not chatbot.
 *
 * Buckets:
 *   05–11  → Morning (energetic, "what are we tackling today?")
 *   12–17  → Afternoon (mid-day, momentum)
 *   18–22  → Evening (winding down, "what are we wrapping up?")
 *   23–04  → Late / early hours (acknowledged, gentler)
 *
 * Date is appended in conversational form ("Tuesday") rather than full
 * ISO so it reads like a human picking up a conversation.
 */
function buildSeededWelcome(userName: string | null): string {
  const now = new Date();
  const h = now.getHours();
  const day = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const name = userName ? `, ${userName}` : '';

  if (h >= 5 && h < 12) {
    return `Morning${name}. It's ${day} — what are we tackling today?`;
  }
  if (h >= 12 && h < 18) {
    return `Afternoon${name}. ${day} — what can I get into for you?`;
  }
  if (h >= 18 && h < 23) {
    return `Evening${name}. Pull up a chair — what are we working on?`;
  }
  // Late hours — softer, acknowledges the time
  return `Late one${name ? '' : ' here'}${name}. I'm awake if you are — what's on your mind?`;
}

/**
 * Empty-state helper card — six clickable starter chips, one per mode,
 * shown alongside the seeded welcome bubble until the user sends their
 * first message. Clicking a chip calls `onSuggestion(prompt)` which
 * (per Chat.tsx) prefills the input rather than auto-sending so the user
 * can edit before firing. Surfaces all six modes so brand-new users
 * discover the mindset framework without reading docs.
 *
 * Visual: subtle gradient background, animated entrance, hover-lift on
 * chips with prefix-coloured tokens so the modes are recognisable on
 * sight. Aim is "warm partner" not "onboarding tooltip".
 */
function StarterHelper({ onSuggestion }: { onSuggestion: (prompt: string) => void }) {
  const chips: { label: string; prefix: string; prompt: string; color: string }[] = [
    { label: 'Explain a file',  prefix: '>>', prompt: 'Explain what this file does: ',                  color: '#a855f7' },
    { label: 'Plan a feature',  prefix: '::', prompt: ':: How should I approach adding ',                color: '#60a5fa' },
    { label: 'Teach me',        prefix: '??', prompt: '?? Teach me about ',                              color: '#f9e2af' },
    { label: 'Audit security',  prefix: '!!', prompt: '!! Audit this project for security issues',       color: '#f38ba8' },
    { label: 'Brainstorm',      prefix: '**', prompt: '** Help me think through ',                       color: '#94e2d5' },
    { label: 'Just chat',       prefix: '..', prompt: '.. ',                                             color: '#a6adc8' },
  ];

  return (
    <div
      className="rounded-2xl p-5 mt-3 ava-starter-card"
      style={{
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(96, 165, 250, 0.04) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.22)',
        boxShadow: '0 4px 20px rgba(168, 85, 247, 0.08)',
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ color: '#a855f7', fontSize: 14 }}>✦</span>
        <div className="text-sm font-semibold" style={{ color: '#cdd6f4' }}>Where do we start?</div>
      </div>
      <p className="text-[12px] leading-relaxed mb-4" style={{ color: '#a6adc8' }}>
        I can read your code, plan a feature, teach you something, audit security, brainstorm, or just chat.
        Pick one — you can edit before sending.
      </p>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.label}
            onClick={() => onSuggestion(c.prompt)}
            className="ava-starter-chip text-[12px] px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            style={{
              background: 'rgba(26, 16, 40, 0.5)',
              border: `1px solid ${c.color}33`,
              color: '#cdd6f4',
              transition: 'transform 0.12s ease, background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${c.color}1c`;
              e.currentTarget.style.borderColor = `${c.color}66`;
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(26, 16, 40, 0.5)';
              e.currentTarget.style.borderColor = `${c.color}33`;
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span style={{ color: c.color, fontFamily: 'monospace', fontSize: 10, fontWeight: 700 }}>{c.prefix}</span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] mt-4" style={{ color: '#6c7086' }}>
        Tip: type <code style={{ color: '#a855f7' }}>{'>>'}</code> <code style={{ color: '#60a5fa' }}>::</code> <code style={{ color: '#a6adc8' }}>..</code> <code style={{ color: '#f9e2af' }}>??</code> <code style={{ color: '#f38ba8' }}>!!</code> <code style={{ color: '#94e2d5' }}>**</code> at the start of a message to switch modes any time.
      </p>
      <style>{`
        .ava-starter-card {
          animation: avaStarterFade 0.4s ease-out;
        }
        @keyframes avaStarterFade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
