import type { UIMessage } from '../types/messages';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ToolCallCard } from './ToolCallCard';

interface MessageBubbleProps {
  message: UIMessage;
  onConfirmation: (confirmationId: string, approved: boolean) => void;
}

export function MessageBubble({ message, onConfirmation }: MessageBubbleProps) {
  if (message.role === 'error') {
    return (
      <div className="px-3 py-2 rounded text-xs bg-[var(--vscode-inputValidation-errorBackground,rgba(255,0,0,0.1))] text-[var(--vscode-errorForeground)] border border-[var(--vscode-inputValidation-errorBorder,rgba(255,0,0,0.3))]">
        {message.content}
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="space-y-2">
      {message.content && (
        <div className="text-sm leading-relaxed">
          <MarkdownRenderer content={message.content} />
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 bg-[var(--vscode-foreground)] opacity-60 animate-pulse ml-0.5" />
          )}
        </div>
      )}

      {message.toolCalls.map((tc) => (
        <ToolCallCard
          key={tc.id}
          toolCall={tc}
          onConfirmation={onConfirmation}
        />
      ))}
    </div>
  );
}
