import type { RefObject } from 'react';
import type { UIMessage } from '../types/messages';
import { MessageBubble } from './MessageBubble';
import { ThinkingIndicator } from './ThinkingIndicator';
import { PersonaStatus } from './PersonaStatus';
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
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllow?: boolean, allowAll?: boolean, planSelection?: string, userResponse?: string) => void;
  onContinue: () => void;
  onSuggestion: (prompt: string) => void;
  onRate?: (messageId: string, rating: 'up' | 'down', reason?: string) => void;
  chatEndRef: RefObject<HTMLDivElement | null>;
  needsSetup?: boolean;
  initialized?: boolean;
  onOpenDashboard?: () => void;
  activeModel?: string | null;
  models?: Array<{ id: string; name: string; provider: string }>;
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
  { icon: '!!', label: 'Security', desc: 'welcome.mode.security_desc' },
];

export function ChatContainer({ messages, isThinking, onConfirmation, onContinue, onSuggestion, onRate, chatEndRef, needsSetup, initialized, onOpenDashboard, activeModel, models, conductorActive, conductorMode, activePersonas }: ChatContainerProps) {
  useLocale();
  // Don't render welcome screen until init message arrives — prevents setup banner flash
  if (!initialized && messages.length === 0) {
    return <div className="flex-1" />;
  }

  if (messages.length === 0 && !isThinking) {
    const activeModelObj = models?.find(m => m.id === activeModel);

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
                Supernova
              </span>
            </div>
            <p className="text-sm opacity-50 mb-1">{t('welcome.subtitle')}</p>
            <p className="text-xs opacity-30">{t('welcome.tagline')}</p>
          </div>

          {/* Setup banner — only if no provider configured */}
          {needsSetup ? (
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
                  <span
                    className="inline-block mt-2 text-xs font-medium px-3 py-1 rounded-lg"
                    style={{
                      background: 'linear-gradient(135deg, #A855F7, #7C3AED)',
                      color: 'white',
                    }}
                  >
                    {t('welcome.setup_cta')}
                  </span>
                </div>
              </div>
            </button>
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
            <div className="flex gap-2">
              {MODE_INFO.map((m) => (
                <div
                  key={m.label}
                  className="flex-1 px-2.5 py-2 rounded-lg text-center"
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
            <p className="text-[10px] font-semibold opacity-50 mb-1">💡 Shared Learning</p>
            <p className="text-[9px] opacity-30 leading-relaxed">
              Ava learns from every session. You can help improve her for everyone by enabling Shared Learning in Settings.
              Only anonymised technical patterns are shared — never personal data, code, or preferences. Off by default.
            </p>
          </div>

          {/* Footer info */}
          <div className="text-center pt-2">
            <p className="text-[10px] opacity-20">{t('welcome.footer')}</p>
          </div>

        </div>
      </div>
    );
  }

  return (
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
  );
}
