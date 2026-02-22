import type { RefObject } from 'react';
import type { UIMessage } from '../types/messages';
import { MessageBubble } from './MessageBubble';
import { ThinkingIndicator } from './ThinkingIndicator';

interface ChatContainerProps {
  messages: UIMessage[];
  isThinking: boolean;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllow?: boolean, allowAll?: boolean, planSelection?: string) => void;
  onContinue: () => void;
  chatEndRef: RefObject<HTMLDivElement | null>;
}

export function ChatContainer({ messages, isThinking, onConfirmation, onContinue, chatEndRef }: ChatContainerProps) {
  if (messages.length === 0 && !isThinking) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center opacity-40">
          <p className="text-lg font-semibold mb-1">Ava | Supernova</p>
          <p className="text-xs">Ask anything about your code.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
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
