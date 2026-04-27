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

export function ChatContainer({ messages, isThinking, onConfirmation, onContinue, onRate, chatEndRef, needsSetup, initialized, onOpenDashboard, conductorActive, conductorMode, activePersonas }: ChatContainerProps) {
  useLocale();
  // Don't render welcome screen until init message arrives — prevents setup banner flash
  if (!initialized && messages.length === 0) {
    return <div className="flex-1" />;
  }

  // Empty-state alignment with IDE: drop the multi-card welcome screen
  // (Hero + Setup banner + Quick Start + Capabilities + Modes + Shared
  // Learning + Footer) and render a single seeded assistant message
  // containing t('dash.chat.welcome'), mirroring the IDE chat at
  // DashboardPages.tsx:1990. Setup banner — when needsSetup is true and
  // we're on the dashboard chat page — kept as a small inline card above
  // the welcome bubble so signed-out users still know what to do, but
  // dropped to one card instead of the multi-section page.
  if (messages.length === 0 && !isThinking) {
    const seededWelcome = {
      id: 'welcome-seed',
      role: 'assistant' as const,
      content: t('dash.chat.welcome'),
      isStreaming: false,
      timestamp: Date.now(),
    } as unknown as typeof messages[number];

    return (
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-3">
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
