import type { RefObject } from 'react';
import type { UIMessage } from '../types/messages';
import { MessageBubble } from './MessageBubble';
import { ThinkingIndicator } from './ThinkingIndicator';

interface ChatContainerProps {
  messages: UIMessage[];
  isThinking: boolean;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllow?: boolean, allowAll?: boolean, planSelection?: string, userResponse?: string) => void;
  onContinue: () => void;
  onSuggestion: (prompt: string) => void;
  chatEndRef: RefObject<HTMLDivElement | null>;
}

const SUGGESTIONS = [
  { label: 'Explain this codebase', prompt: 'Give me a high-level overview of this project structure and architecture.' },
  { label: 'Find a bug', prompt: 'Help me find and fix bugs in the current file.' },
  { label: 'Write tests', prompt: 'Write comprehensive tests for the main module.' },
  { label: 'Refactor code', prompt: 'Suggest refactoring improvements for the current file.' },
];

export function ChatContainer({ messages, isThinking, onConfirmation, onContinue, onSuggestion, chatEndRef }: ChatContainerProps) {
  if (messages.length === 0 && !isThinking) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-lg font-semibold mb-1 opacity-40">Ava | Supernova</p>
          <p className="text-xs opacity-30 mb-4">Ask anything about your code.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                onClick={() => onSuggestion(s.prompt)}
                className="px-3 py-1.5 rounded-full text-[11px]
                           bg-[var(--vscode-button-secondaryBackground)]
                           text-[var(--vscode-button-secondaryForeground)]
                           hover:bg-[var(--vscode-button-secondaryHoverBackground)]
                           border-none cursor-pointer transition-colors opacity-60 hover:opacity-90"
              >
                {s.label}
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
