import { useCallback } from 'react';
import type { UIMessage } from '../types/messages';
import { t } from '../i18n';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallCard } from './ToolCallCard';
import { PlanCard } from './PlanCard';
import { TodoCard } from './TodoCard';
import { AskUserCard } from './AskUserCard';
import { CopyButton } from './CopyButton';
import { FeedbackButtons } from './FeedbackButtons';

interface MessageBubbleProps {
  message: UIMessage;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllow?: boolean, allowAll?: boolean, planSelection?: string, userResponse?: string) => void;
  onContinue?: () => void;
  onRate?: (messageId: string, rating: 'up' | 'down', reason?: string) => void;
}

function getErrorLabel(code: string): string {
  return t(`error.${code}`) || t('error.unknown');
}

// Errors where "Try Again" makes sense — the conversation context is intact
const RESUMABLE_ERRORS = new Set([
  'stream_stall', 'timeout', 'server_error', 'network', 'rate_limit', 'iterations_exceeded', 'context_truncated', 'provider_error', 'unknown',
]);

// Contextual SVG icons per error type — makes errors scannable at a glance
function ErrorIcon({ code }: { code: string }) {
  const cls = 'w-5 h-5 flex-shrink-0';
  switch (code) {
    case 'auth':
      // Key icon
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zM15.5 7.5l2 2L22 5l-2-2z"/>
        </svg>
      );
    case 'credits':
      // Wallet icon
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
      );
    case 'rate_limit':
      // Clock icon
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      );
    case 'network':
      // Wifi-off icon
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
        </svg>
      );
    case 'timeout':
    case 'stream_stall':
      // Loader icon
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
        </svg>
      );
    case 'server_error':
      // Server icon
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
        </svg>
      );
    case 'model_not_found':
      // Search-x icon
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="8" x2="14" y2="14"/><line x1="14" y1="8" x2="8" y2="14"/>
        </svg>
      );
    case 'iterations_exceeded':
    case 'context_truncated':
      // Layers icon
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
        </svg>
      );
    default:
      // Alert circle (generic)
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      );
  }
}

export function MessageBubble({ message, onConfirmation, onContinue, onRate }: MessageBubbleProps) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center py-1">
        <span className="text-[11px] opacity-40 italic">
          {message.content}
        </span>
      </div>
    );
  }

  if (message.role === 'error') {
    const code = message.errorCode || 'unknown';
    const label = getErrorLabel(code);
    const canResume = onContinue && RESUMABLE_ERRORS.has(code);

    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] overflow-hidden">
        {/* Header: icon + label */}
        <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-1 text-red-400">
          <ErrorIcon code={code} />
          <span className="text-xs font-semibold tracking-wide">
            {label}
          </span>
        </div>

        {/* Main error message */}
        <div className="px-4 pb-2 pl-[46px] text-[13px] leading-relaxed text-[var(--vscode-foreground)] opacity-90">
          {message.content}
        </div>

        {/* Suggestion — visually distinct with a light-bulb feel */}
        {message.errorSuggestion && (
          <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg bg-[var(--vscode-input-background)] px-3 py-2.5">
            <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-yellow-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
            </svg>
            <span className="text-xs leading-relaxed text-[var(--vscode-foreground)] opacity-70">
              {message.errorSuggestion}
            </span>
          </div>
        )}

        {/* Resume button */}
        {canResume && (
          <div className="border-t border-red-500/10 px-4 py-2.5">
            <button
              onClick={onContinue}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium
                         bg-[var(--color-accent,var(--vscode-button-background))]
                         text-[var(--vscode-button-foreground)]
                         border-none cursor-pointer hover:opacity-90 transition-opacity"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              {t('error.continue')}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-4 py-3 rounded-2xl rounded-br-sm bg-[var(--color-accent,#a855f7)] text-white text-sm whitespace-pre-wrap">
          {message.images && message.images.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-1.5">
              {message.images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`Attachment ${i + 1}`}
                  className="max-w-[200px] max-h-[150px] rounded object-cover"
                />
              ))}
            </div>
          )}
          {message.content}
          <div className="text-[11px] opacity-60 mt-1 text-right">
            {message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  const hasThinking = !!message.thinking;
  const isThinkingOnly = hasThinking && !message.content;
  const getContent = useCallback(() => message.content, [message.content]);

  return (
    <div className="flex justify-start">
      <div className="group max-w-[90%] rounded-2xl rounded-bl-sm bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)] px-4 py-3 space-y-2">
        {/* Name badge */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[var(--vscode-foreground)]">Ava</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider"
                style={{ color: 'var(--color-accent, #a855f7)', backgroundColor: 'rgba(168, 85, 247, 0.15)' }}>
            SUPERNOVA
          </span>
        </div>

        {hasThinking && (
          <ThinkingBlock
            content={message.thinking!}
            isStreaming={message.isStreaming && isThinkingOnly}
          />
        )}

        {message.content && (
          <div className="relative group">
            <div className="text-sm leading-relaxed">
              <MarkdownRenderer content={message.content} />
              {message.isStreaming && (
                <span className="inline-block w-2 h-4 animate-pulse ml-0.5" style={{ backgroundColor: 'var(--color-accent, #a855f7)' }} />
              )}
            </div>
            {!message.isStreaming && (
              <CopyButton
                getText={getContent}
                className="absolute top-0 right-0 w-6 h-6
                           opacity-0 group-hover:opacity-50 hover:!opacity-100"
              />
            )}
          </div>
        )}

      {(() => {
        // Find the last todo_write index so only the most recent one is expanded
        const lastTodoIdx = message.toolCalls.reduce(
          (acc, tc, i) => (tc.name === 'todo_write' ? i : acc), -1,
        );

        // Separate tool calls into special cards and timeline-eligible calls
        const specialCards: React.ReactNode[] = [];
        const timelineCalls: Array<{ tc: typeof message.toolCalls[0]; idx: number }> = [];

        message.toolCalls.forEach((tc, i) => {
          if (tc.name === 'todo_write') {
            specialCards.push(<TodoCard key={tc.id} toolCall={tc} isLatest={i === lastTodoIdx} />);
          } else if (tc.name === 'present_plan') {
            specialCards.push(<PlanCard key={tc.id} toolCall={tc} onConfirmation={onConfirmation} />);
          } else if (tc.name === 'ask_user') {
            specialCards.push(<AskUserCard key={tc.id} toolCall={tc} onConfirmation={onConfirmation} />);
          } else {
            timelineCalls.push({ tc, idx: i });
          }
        });

        // Timeline header: show count + running status
        const totalTimeline = timelineCalls.length;
        const runningCount = timelineCalls.filter(({ tc }) => tc.status === 'running').length;
        const completedCount = timelineCalls.filter(({ tc }) => tc.status === 'success').length;
        const failedCount = timelineCalls.filter(({ tc }) => tc.status === 'failed').length;

        let headerText = '';
        if (totalTimeline > 0) {
          if (runningCount > 0) {
            headerText = `Running ${completedCount + runningCount} of ${totalTimeline}...`;
          } else {
            const parts: string[] = [];
            parts.push(`${totalTimeline} tool call${totalTimeline !== 1 ? 's' : ''}`);
            if (failedCount > 0) parts.push(`${failedCount} failed`);
            headerText = parts.join(' \u00B7 ');
          }
        }

        return (
          <>
            {/* Timeline block for regular tool calls */}
            {totalTimeline > 0 && (
              <div
                className="mt-1"
                style={{ borderLeft: '2px solid rgba(168, 85, 247, 0.3)', paddingLeft: '8px' }}
              >
                <div className="text-[10px] opacity-40 mb-0.5 select-none">
                  {headerText}
                </div>
                {timelineCalls.map(({ tc }) => (
                  <ToolCallCard key={tc.id} toolCall={tc} onConfirmation={onConfirmation} />
                ))}
              </div>
            )}
            {/* Special cards rendered outside the timeline */}
            {specialCards}
          </>
        );
      })()}

        {/* Timestamp + Feedback */}
        {!message.isStreaming && (
          <div className="flex items-end justify-between mt-1">
            {onRate && (
              <FeedbackButtons
                messageId={message.id}
                rating={message.rating}
                onRate={onRate}
              />
            )}
            {message.timestamp && (
              <div className="text-[11px] opacity-40 text-right flex-shrink-0 ml-auto">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
