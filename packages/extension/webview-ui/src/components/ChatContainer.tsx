import type { RefObject } from 'react';
import type { UIMessage } from '../types/messages';
import { MessageBubble } from './MessageBubble';
import { ThinkingIndicator } from './ThinkingIndicator';
import { t } from '../i18n';

interface ChatContainerProps {
  messages: UIMessage[];
  isThinking: boolean;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllow?: boolean, allowAll?: boolean, planSelection?: string, userResponse?: string) => void;
  onContinue: () => void;
  onSuggestion: (prompt: string) => void;
  chatEndRef: RefObject<HTMLDivElement | null>;
}

const SUGGESTIONS = [
  { labelKey: 'suggestion.explain', promptKey: 'suggestion.explain_prompt' },
  { labelKey: 'suggestion.bug', promptKey: 'suggestion.bug_prompt' },
  { labelKey: 'suggestion.test', promptKey: 'suggestion.test_prompt' },
  { labelKey: 'suggestion.refactor', promptKey: 'suggestion.refactor_prompt' },
];

export function ChatContainer({ messages, isThinking, onConfirmation, onContinue, onSuggestion, chatEndRef }: ChatContainerProps) {
  if (messages.length === 0 && !isThinking) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-lg font-semibold mb-1 opacity-40">{t('welcome.title')}</p>
          <p className="text-xs opacity-30 mb-4">{t('welcome.subtitle')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.labelKey}
                onClick={() => onSuggestion(t(s.promptKey))}
                className="px-3 py-1.5 rounded-full text-[11px]
                           bg-[var(--vscode-button-secondaryBackground)]
                           text-[var(--vscode-button-secondaryForeground)]
                           hover:bg-[var(--vscode-button-secondaryHoverBackground)]
                           border-none cursor-pointer transition-colors opacity-60 hover:opacity-90"
              >
                {t(s.labelKey)}
              </button>
            ))}
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
        />
      ))}
      {isThinking && <ThinkingIndicator />}
      <div ref={chatEndRef} />
    </div>
  );
}
