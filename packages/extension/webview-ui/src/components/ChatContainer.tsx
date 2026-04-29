import { useState, type RefObject } from 'react';
import type { UIMessage } from '../types/messages';
import { MessageBubble } from './MessageBubble';
import { ThinkingIndicator } from './ThinkingIndicator';
import { PersonaStatus } from './PersonaStatus';
import { SignInScreen } from './SignInScreen';
import { t, useLocale } from '../i18n';

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
  consentRequired?: boolean;
  onAcceptConsent?: () => void;
  initialized?: boolean;
  onOpenDashboard?: () => void;
  activeModel?: string | null;
  models?: Array<{ id: string; name: string; provider: string }>;
  // OAuth sign-in (v0.37.0)
  signInPending?: 'github' | 'email' | null;
  signInError?: string | null;
  onStartSignIn?: (method: 'github' | 'email') => void;
  onCancelSignIn?: () => void;
  onClearSignInError?: () => void;
  // Context bar (v0.39.x) — replaces the circular indicator in InputArea.
  contextUsage?: { used: number; limit: number; percent: number } | null;
  isCompressing?: boolean;
  isStreaming?: boolean;
  onCompress?: () => void;
  /** Operator's first name — drives the time-of-day-aware seeded welcome
   *  bubble AND the user-avatar initials fallback. Null when account
   *  hasn't loaded yet (or BYOK with no account). */
  userName?: string | null;
  /** User's avatar URL from auth (Supabase users.avatar_url). Null
   *  falls back to initials, then to the generic person SVG. */
  userAvatarUrl?: string | null;
}

// SUGGESTIONS / CAPABILITIES / MODE_INFO arrays removed — they backed the
// previous multi-card welcome screen which has been retired to match the
// IDE's single-seeded-message empty state. Props onSuggestion / activeModel
// / models stay in ChatContainerProps for caller compatibility but are no
// longer destructured here.
export function ChatContainer({ messages, isThinking, onConfirmation, onContinue, onRate, chatEndRef, needsSetup, consentRequired, onAcceptConsent, initialized, onOpenDashboard, conductorActive, conductorMode, activePersonas, signInPending, signInError, onStartSignIn, onCancelSignIn, onClearSignInError, onSuggestion, userName, userAvatarUrl }: ChatContainerProps) {
  useLocale();
  const [consentChecked, setConsentChecked] = useState(false);

  // Show welcome screen immediately — don't block on init message
  // Init will update models/activeModel/needsSetup when it arrives

  // ── GDPR Consent Gate ─────────────────────────────────────────────────────
  if (consentRequired && initialized) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-lg mx-auto">

          {/* Hero */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 mb-3">
              <span className="text-2xl font-bold text-[var(--vscode-foreground)]">Ava</span>
              <span
                className="text-[10px] uppercase tracking-[3px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(124,58,237,0.2))',
                  color: '#C084FC',
                  border: '1px solid rgba(168,85,247,0.2)',
                }}
              >
                {t('brand.supernova')}
              </span>
            </div>
            <p className="text-sm opacity-60 mb-1">{t('consent.welcome')}</p>
          </div>

          {/* Privacy summary */}
          <div
            className="rounded-xl p-5 mb-4"
            style={{
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(168, 85, 247, 0.15)',
            }}
          >
            <p className="text-xs font-semibold opacity-70 mb-3">{t('consent.header')}</p>
            <div className="space-y-2.5 text-[11px] opacity-50 leading-relaxed">
              <p>{t('consent.builder')}</p>
              <div className="space-y-1.5">
                <p className="font-medium opacity-70">{t('consent.data_title')}</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>{t('consent.data.local')}</li>
                  <li>{t('consent.data.cloud')}</li>
                  <li>{t('consent.data.code')}</li>
                  <li>{t('consent.data.keys')}</li>
                  <li>{t('consent.data.analytics')}</li>
                </ul>
              </div>
              <p>{t('consent.gdpr')}</p>
            </div>
          </div>

          {/* Links to full policies */}
          <div className="flex gap-3 mb-5 justify-center">
            <a
              href="https://ava-supernova.com/terms"
              className="text-[11px] font-medium opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: '#C084FC' }}
            >
              {t('consent.terms')}
            </a>
            <span className="text-[11px] opacity-20">|</span>
            <a
              href="https://ava-supernova.com/privacy"
              className="text-[11px] font-medium opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: '#C084FC' }}
            >
              {t('consent.privacy')}
            </a>
          </div>

          {/* Consent checkbox */}
          <label
            className="flex items-start gap-3 rounded-lg px-4 py-3 cursor-pointer transition-all"
            style={{
              background: consentChecked ? 'rgba(168, 85, 247, 0.08)' : 'rgba(0, 0, 0, 0.1)',
              border: consentChecked ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid rgba(168, 85, 247, 0.1)',
            }}
          >
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-0.5 accent-purple-500"
            />
            <span className="text-[11px] opacity-60 leading-relaxed">
              {t('consent.agree')}
            </span>
          </label>

          {/* Accept button */}
          <button
            onClick={onAcceptConsent}
            disabled={!consentChecked}
            className="w-full mt-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all cursor-pointer border-none
                       disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: consentChecked
                ? 'linear-gradient(135deg, #A855F7, #7C3AED)'
                : 'rgba(168, 85, 247, 0.3)',
            }}
          >
            {t('consent.cta')}
          </button>

          <p className="text-center text-[9px] opacity-20 mt-3">
            {t('consent.withdraw')}
          </p>

        </div>
      </div>
    );
  }

  // Hero stays until the user's first turn. Ambient injections — daily
  // briefing, model-switch notices, tick-engine nudges, etc. — push
  // assistant/system messages into state but the user hasn't actually
  // started chatting yet. Previously we gated on messages.length === 0
  // which meant closing a fresh chat and reopening it dropped the hero
  // the moment any ambient message arrived.
  const hasUserSpoken = messages.some((m) => m.role === 'user');

  // Empty-state alignment with IDE: the IDE chat opens with a seeded
  // assistant message containing t('dash.chat.welcome'). The extension's
  // previous multi-card welcome screen (Hero + Quick Start + Capabilities
  // + Modes + Shared Learning + Footer) is dropped to match that — same
  // first-turn experience on both surfaces.
  //
  // SignInScreen stays when needsSetup since the panel webview can be
  // open without a key configured; the IDE handles this differently
  // (key-required sign-in lives on the Account page) but the panel
  // needs a sign-in affordance inline. This is the one intentional
  // delta from the IDE on the empty state.
  if (!hasUserSpoken && !isThinking) {
    if (needsSetup && onStartSignIn && onCancelSignIn && onClearSignInError) {
      return (
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-lg mx-auto">
            <SignInScreen
              pendingMethod={signInPending ?? null}
              signInError={signInError ?? null}
              onStartSignIn={onStartSignIn}
              onCancelSignIn={onCancelSignIn}
              onOpenDashboard={onOpenDashboard ?? (() => {})}
              onClearError={onClearSignInError}
            />
          </div>
        </div>
      );
    }

    // Render a synthetic seeded welcome bubble + any ambient messages
    // (daily briefing, model-switch notices) that arrived before the
    // user's first turn. Mirrors IDE chat at DashboardPages.tsx:1990
    // where the welcome is the first message in the list. Welcome text
    // is dynamic — picks a time-of-day greeting and uses the operator's
    // first name when available so it feels like a partner picking up,
    // not a generic chatbot.
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
          <MessageBubble message={seededWelcome} onConfirmation={onConfirmation} />
          {messages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onConfirmation={onConfirmation}
              onContinue={msg.role === 'error' && i === messages.length - 1 ? onContinue : undefined}
              onRate={msg.role === 'assistant' ? onRate : undefined}
            />
          ))}
          <StarterHelper onSuggestion={onSuggestion} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ContextBar moved out — now rendered in App.tsx directly above the
          composer so the bar sits next to where the user is typing, not at
          the far top of the message list where it was easy to forget. */}

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3" role="log" aria-label={t('chat.messages_aria')} aria-live="polite">
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
 * voice elsewhere — partner, not chatbot.
 *
 * Buckets: 05–11 morning · 12–17 afternoon · 18–22 evening · 23–04 late.
 */
function buildSeededWelcome(userName: string | null): string {
  const now = new Date();
  const h = now.getHours();
  const day = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const name = userName ? `, ${userName}` : '';

  if (h >= 5 && h < 12) return `Morning${name}. It's ${day} — what are we tackling today?`;
  if (h >= 12 && h < 18) return `Afternoon${name}. ${day} — what can I get into for you?`;
  if (h >= 18 && h < 23) return `Evening${name}. Pull up a chair — what are we working on?`;
  return `Late one${name ? '' : ' here'}${name}. I'm awake if you are — what's on your mind?`;
}

/**
 * Empty-state helper card — six clickable starter chips, one per mode,
 * shown alongside the seeded welcome bubble until the user sends their
 * first message. Clicking a chip calls `onSuggestion(prompt)` which
 * (per App.tsx) prefills the input rather than auto-sending so the user
 * can edit before firing.
 *
 * Visual: subtle gradient, animated entrance, hover-lift on chips with
 * prefix-coloured tokens. Aim is "warm partner" not "onboarding tooltip".
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
      className="rounded-2xl p-4 mt-2 ava-starter-card"
      style={{
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(96, 165, 250, 0.04) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.22)',
        boxShadow: '0 4px 20px rgba(168, 85, 247, 0.08)',
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ color: '#a855f7', fontSize: 14 }}>✦</span>
        <div className="text-[13px] font-semibold" style={{ color: '#cdd6f4' }}>Where do we start?</div>
      </div>
      <p className="text-[11px] leading-relaxed mb-3" style={{ color: '#a6adc8' }}>
        I can read your code, plan a feature, teach you something, audit security, brainstorm, or just chat.
        Pick one — you can edit before sending.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.label}
            onClick={() => onSuggestion(c.prompt)}
            className="text-[11px] px-2.5 py-1.5 rounded-lg flex items-center gap-1.5"
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
      <p className="text-[10px] mt-3" style={{ color: '#6c7086' }}>
        Tip: type <code style={{ color: '#a855f7' }}>{'>>'}</code> <code style={{ color: '#60a5fa' }}>::</code> <code style={{ color: '#a6adc8' }}>..</code> <code style={{ color: '#f9e2af' }}>??</code> <code style={{ color: '#f38ba8' }}>!!</code> <code style={{ color: '#94e2d5' }}>**</code> to switch modes any time.
      </p>
      <style>{`
        .ava-starter-card { animation: avaStarterFade 0.4s ease-out; }
        @keyframes avaStarterFade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
