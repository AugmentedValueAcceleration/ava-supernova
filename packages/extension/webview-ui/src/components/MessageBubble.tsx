import type { UIMessage } from '../types/messages';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallCard } from './ToolCallCard';
import { PlanCard } from './PlanCard';
import { TodoCard } from './TodoCard';
import { AskUserCard } from './AskUserCard';

interface MessageBubbleProps {
  message: UIMessage;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllow?: boolean, allowAll?: boolean, planSelection?: string, userResponse?: string) => void;
  onContinue?: () => void;
}

const ERROR_LABELS: Record<string, string> = {
  auth: 'Authentication',
  credits: 'Billing',
  forbidden: 'Access Denied',
  rate_limit: 'Rate Limited',
  model_not_found: 'Model Error',
  bad_request: 'Bad Request',
  server_error: 'Server Error',
  timeout: 'Timeout',
  stream_stall: 'Stream Stalled',
  network: 'Network Error',
  setup: 'Setup Required',
  busy: 'Busy',
  iterations_exceeded: 'Iteration Limit',
  provider_error: 'Provider Error',
  unknown: 'Error',
};

// Errors where "Continue" makes sense — the conversation context is intact
const RESUMABLE_ERRORS = new Set([
  'stream_stall', 'timeout', 'server_error', 'network', 'rate_limit', 'iterations_exceeded', 'provider_error', 'unknown',
]);

export function MessageBubble({ message, onConfirmation, onContinue }: MessageBubbleProps) {
  if (message.role === 'error') {
    const label = ERROR_LABELS[message.errorCode || ''] || 'Error';
    const canResume = onContinue && RESUMABLE_ERRORS.has(message.errorCode || '');

    return (
      <div className="rounded-lg border border-[var(--vscode-inputValidation-errorBorder,rgba(255,0,0,0.3))] bg-[var(--vscode-inputValidation-errorBackground,rgba(255,0,0,0.08))] overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--vscode-errorForeground)" className="flex-shrink-0">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2zm-.7 3h1.4L8.4 9H7.6L7.3 5zM8 10.2a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z"/>
          </svg>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vscode-errorForeground)] opacity-80">
            {label}
          </span>
        </div>
        <div className="px-3 pb-2 text-xs text-[var(--vscode-errorForeground)]">
          {message.content}
        </div>
        {message.errorSuggestion && (
          <div className="px-3 pb-2.5 text-xs text-[var(--vscode-foreground)] opacity-70">
            {message.errorSuggestion}
          </div>
        )}
        {canResume && (
          <div className="px-3 pb-2.5">
            <button
              onClick={onContinue}
              className="px-3 py-1 rounded text-[11px] font-medium
                         bg-[var(--color-accent,var(--vscode-button-background))]
                         text-[var(--vscode-button-foreground)]
                         border-none cursor-pointer hover:opacity-80 transition-opacity"
            >
              Continue
            </button>
          </div>
        )}
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
  const hasThinking = !!message.thinking;
  const isThinkingOnly = hasThinking && !message.content;

  return (
    <div className="space-y-2">
      {hasThinking && (
        <ThinkingBlock
          content={message.thinking!}
          isStreaming={message.isStreaming && isThinkingOnly}
        />
      )}

      {message.content && (
        <div className="text-sm leading-relaxed">
          <MarkdownRenderer content={message.content} />
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 bg-[var(--vscode-foreground)] opacity-60 animate-pulse ml-0.5" />
          )}
        </div>
      )}

      {(() => {
        // Find the last todo_write index so only the most recent one is expanded
        const lastTodoIdx = message.toolCalls.reduce(
          (acc, tc, i) => (tc.name === 'todo_write' ? i : acc), -1,
        );
        return message.toolCalls.map((tc, i) =>
          tc.name === 'todo_write' ? (
            <TodoCard key={tc.id} toolCall={tc} isLatest={i === lastTodoIdx} />
          ) : tc.name === 'present_plan' ? (
            <PlanCard key={tc.id} toolCall={tc} onConfirmation={onConfirmation} />
          ) : tc.name === 'ask_user' ? (
            <AskUserCard key={tc.id} toolCall={tc} onConfirmation={onConfirmation} />
          ) : (
            <ToolCallCard key={tc.id} toolCall={tc} onConfirmation={onConfirmation} />
          ),
        );
      })()}
    </div>
  );
}
