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
  conductorMode?: string;
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
}

const SUGGESTIONS = [
  { labelKey: 'suggestion.explain', promptKey: 'suggestion.explain_prompt', icon: '📖' },
  { labelKey: 'suggestion.bug', promptKey: 'suggestion.bug_prompt', icon: '🔍' },
  { labelKey: 'suggestion.test', promptKey: 'suggestion.test_prompt', icon: '🧪' },
  { labelKey: 'suggestion.refactor', promptKey: 'suggestion.refactor_prompt', icon: '♻️' },
];

const CAPABILITIES = [
  { icon: '📁', titleKey: 'welcome.cap.files', descKey: 'welcome.cap.files_desc' },
  { icon: '🔎', titleKey: 'welcome.cap.search', descKey: 'welcome.cap.search_desc' },
  { icon: '⚡', titleKey: 'welcome.cap.terminal', descKey: 'welcome.cap.terminal_desc' },
  { icon: '🌐', titleKey: 'welcome.cap.web', descKey: 'welcome.cap.web_desc' },
  { icon: '🔒', titleKey: 'welcome.cap.security', descKey: 'welcome.cap.security_desc' },
  { icon: '🧠', titleKey: 'welcome.cap.memory', descKey: 'welcome.cap.memory_desc' },
];

const MODE_INFO = [
  { icon: '>>', label: 'Work', desc: 'welcome.mode.code_desc' },
  { icon: '::', label: 'Plan', desc: 'welcome.mode.plan_desc' },
  { icon: '..', label: 'Chat', desc: 'welcome.mode.chat_desc' },
  { icon: '??', label: 'Teach', desc: 'welcome.mode.teach_desc' },
  { icon: '!!', label: 'Security', desc: 'welcome.mode.security_desc' },
  { icon: '**', label: 'Brainstorm', desc: 'welcome.mode.brainstorm_desc' },
];

export function ChatContainer({ messages, isThinking, onConfirmation, onContinue, onSuggestion, onRate, chatEndRef, needsSetup, consentRequired, onAcceptConsent, initialized, onOpenDashboard, activeModel, models, conductorActive, conductorMode, activePersonas, signInPending, signInError, onStartSignIn, onCancelSignIn, onClearSignInError, contextUsage, isCompressing, isStreaming, onCompress }: ChatContainerProps) {
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

  if (!hasUserSpoken && !isThinking) {
    const activeModelObj = models?.find(m => m.id === activeModel);
    const ambientMessages = messages;

    return (
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-lg mx-auto">

          {/* Hero */}
          <div className="text-center mb-8">
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
            <p className="text-sm opacity-50 mb-1">{t('welcome.subtitle')}</p>
            <p className="text-xs opacity-30">{t('welcome.tagline')}</p>
          </div>

          {/* Sign-in screen or setup banner — v0.37.0 replaces the old banner */}
          {needsSetup ? (
            onStartSignIn && onCancelSignIn && onClearSignInError ? (
              <div className="mb-6">
                <SignInScreen
                  pendingMethod={signInPending ?? null}
                  signInError={signInError ?? null}
                  onStartSignIn={onStartSignIn}
                  onCancelSignIn={onCancelSignIn}
                  onOpenDashboard={onOpenDashboard ?? (() => {})}
                  onClearError={onClearSignInError}
                />
              </div>
            ) : (
              // Fallback for callers that haven't wired the sign-in handlers
              // (shouldn't happen after v0.37.0 ships, but keeps the UI safe
              // if the host code lags behind the webview)
              <button
                onClick={onOpenDashboard}
                className="w-full mb-6 p-4 rounded-xl text-left cursor-pointer transition-all duration-200
                           border bg-transparent hover:bg-[rgba(168,85,247,0.05)]"
                style={{
                  border: '1.5px dashed rgba(168, 85, 247, 0.4)',
                }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5">🔑</span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--vscode-foreground)] mb-1">{t('welcome.setup_title')}</p>
                    <p className="text-xs opacity-50 leading-relaxed">{t('welcome.setup_desc')}</p>
                  </div>
                </div>
              </button>
            )
          ) : activeModelObj ? (
            <div
              className="mb-6 px-4 py-2.5 rounded-lg flex items-center gap-2"
              style={{
                background: 'rgba(168, 85, 247, 0.06)',
                border: '1px solid rgba(168, 85, 247, 0.12)',
              }}
            >
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="text-xs opacity-60">
                {t('welcome.ready_with')} <span className="font-semibold opacity-80">{activeModelObj.name}</span>
                <span className="opacity-40 ml-1">({activeModelObj.provider})</span>
              </span>
            </div>
          ) : null}

          {/* Quick Start suggestions */}
          <div className="mb-6">
            <p className="text-[10px] uppercase tracking-[1.5px] font-semibold opacity-30 mb-3">{t('welcome.quick_start')}</p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.labelKey}
                  onClick={() => onSuggestion(t(s.promptKey))}
                  disabled={needsSetup}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left
                             cursor-pointer transition-all duration-200
                             text-[var(--vscode-foreground)]
                             disabled:opacity-20 disabled:cursor-not-allowed
                             hover:bg-[rgba(168,85,247,0.08)]"
                  style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(168, 85, 247, 0.1)',
                  }}
                >
                  <span className="text-base">{s.icon}</span>
                  <span className="text-xs font-medium opacity-70">{t(s.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Capabilities */}
          <div className="mb-6">
            <p className="text-[10px] uppercase tracking-[1.5px] font-semibold opacity-30 mb-3">{t('welcome.capabilities')}</p>
            <div className="grid grid-cols-2 gap-2">
              {CAPABILITIES.map((c) => (
                <div
                  key={c.titleKey}
                  className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg"
                  style={{
                    background: 'rgba(0, 0, 0, 0.15)',
                    border: '1px solid rgba(168, 85, 247, 0.06)',
                  }}
                >
                  <span className="text-sm mt-0.5 shrink-0">{c.icon}</span>
                  <div>
                    <p className="text-xs font-medium opacity-60 mb-0.5">{t(c.titleKey)}</p>
                    <p className="text-[10px] opacity-30 leading-snug">{t(c.descKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Modes */}
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-[1.5px] font-semibold opacity-30 mb-3">{t('welcome.modes')}</p>
            <div className="grid grid-cols-3 gap-2">
              {MODE_INFO.map((m) => (
                <div
                  key={m.label}
                  className="px-2.5 py-2 rounded-lg text-center"
                  style={{
                    background: 'rgba(0, 0, 0, 0.15)',
                    border: '1px solid rgba(168, 85, 247, 0.06)',
                  }}
                >
                  <span
                    className="font-mono text-[10px] font-bold block mb-1"
                    style={{ color: '#A855F7' }}
                  >
                    {m.icon}
                  </span>
                  <p className="text-[11px] font-semibold opacity-60 mb-0.5">{m.label}</p>
                  <p className="text-[9px] opacity-30 leading-snug">{t(m.desc)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Shared learning info */}
          <div className="mt-4 rounded-lg px-4 py-3" style={{ background: 'rgba(168, 85, 247, 0.05)', border: '1px solid rgba(168, 85, 247, 0.1)' }}>
            <p className="text-[10px] font-semibold opacity-50 mb-1">{t('shared_learning.title')}</p>
            <p className="text-[9px] opacity-30 leading-relaxed">
              {t('shared_learning.body')}
            </p>
          </div>

          {/* Footer info */}
          <div className="text-center pt-2">
            <p className="text-[10px] opacity-20">{t('welcome.footer')}</p>
          </div>

          {/* Ambient messages arrived before the user spoke — the daily
              briefing is the usual one. Render them below the hero so
              they're not swallowed, but keep them visually distinct from
              a real chat thread. */}
          {ambientMessages.length > 0 && (
            <div className="mt-6 space-y-3">
              {ambientMessages.map((msg, i) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onConfirmation={onConfirmation}
                  onContinue={msg.role === 'error' && i === ambientMessages.length - 1 ? onContinue : undefined}
                  onRate={msg.role === 'assistant' ? onRate : undefined}
                />
              ))}
            </div>
          )}

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
