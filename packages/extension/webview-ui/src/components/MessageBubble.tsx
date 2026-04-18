import { useCallback, useState } from 'react';
import type { UIMessage, MessageEvent, ToolCallDisplay } from '../types/messages';
import { getMessageText } from '../types/messages';
import { t, useLocale } from '../i18n';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallBlock } from './ToolCallBlock';
import { PlanCard } from './PlanCard';
import { TodoCard } from './TodoCard';
import { AskUserCard } from './AskUserCard';
import { CopyButton } from './CopyButton';
import { FeedbackButtons } from './FeedbackButtons';
import { useSecrets } from '../hooks/useSecrets';

interface MessageBubbleProps {
  message: UIMessage;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllowCategory?: boolean, planSelection?: string, userResponse?: string) => void;
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
  useLocale();
  const { redact } = useSecrets();

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

  // ── Assistant message — single bubble per turn with chronological timeline ──
  //
  // The source of truth is `message.events` (for messages produced by the
  // current reducer). Legacy history loaded from disk may still use the old
  // `content` / `thinking` / `toolCalls` fields — we derive an events list
  // from those so the rendering path is unified.

  const events: MessageEvent[] = message.events || legacyEventsFromMessage(message);

  // Find the index of the last text event — that's where the streaming
  // cursor goes while the message is still streaming.
  let lastTextEventIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind === 'text') {
      lastTextEventIdx = i;
      break;
    }
  }

  // Find the index of the last todo_write tool_call event so only the
  // latest todo card is expanded by default.
  let lastTodoIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === 'tool_call' && e.toolCall.name === 'todo_write') {
      lastTodoIdx = i;
      break;
    }
  }

  const fullText = getMessageText(message);
  const getContent = useCallback(() => fullText, [fullText]);

  // Secret redaction — check across all text events in the message
  const [secretsRevealed, setSecretsRevealed] = useState(false);
  const redactedFullText = fullText ? redact(fullText) : '';
  const hasSecrets = fullText !== redactedFullText;
  const redactTextEvent = (content: string): string =>
    secretsRevealed ? content : redact(content);

  // ── Segment the events for top-level tool-block rendering ───────────────
  //
  // Events run chronologically. Text and thinking events are grouped into
  // contiguous text-bubble segments; each tool_call event becomes its own
  // top-level segment rendered OUTSIDE the bubble as a dedicated block.
  // This makes tool activity first-class in the visual stream instead of
  // being a chip inside the assistant's reply.
  type Segment =
    | { kind: 'bubble'; events: MessageEvent[]; firstIdx: number; lastIdx: number }
    | { kind: 'tool'; event: Extract<MessageEvent, { kind: 'tool_call' }>; idx: number };

  const segments: Segment[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.kind === 'tool_call') {
      segments.push({ kind: 'tool', event: ev, idx: i });
    } else {
      const last = segments[segments.length - 1];
      if (last && last.kind === 'bubble') {
        last.events.push(ev);
        last.lastIdx = i;
      } else {
        segments.push({ kind: 'bubble', events: [ev], firstIdx: i, lastIdx: i });
      }
    }
  }

  // Pure tool-only runs: still show the Ava name badge once at the top so
  // users can see whose turn it is. We synthesise a nameless bubble.
  const hasAnyBubble = segments.some((s) => s.kind === 'bubble');
  const showNameHeaderAlone = !hasAnyBubble && segments.length > 0;

  // Identify which segment index carries the final trailing footer (timestamp + feedback).
  const lastSegmentIdx = segments.length - 1;

  return (
    <div className="flex flex-col gap-2 items-start w-full">
      {/* Name badge — rendered once for pure tool-run messages */}
      {showNameHeaderAlone && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-sm font-bold text-[var(--vscode-foreground)]">Ava</span>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider"
            style={{ color: 'var(--color-accent, #a855f7)', backgroundColor: 'rgba(168, 85, 247, 0.15)' }}
          >
            {t('brand.supernova_caps')}
          </span>
        </div>
      )}

      {segments.map((seg, segIdx) => {
        const isFirst = segIdx === 0;
        const isLast = segIdx === lastSegmentIdx;

        if (seg.kind === 'bubble') {
          const isFirstBubble = !segments.slice(0, segIdx).some((s) => s.kind === 'bubble');
          return (
            <div key={`seg-${segIdx}`} className="flex justify-start w-full">
              <div className="group max-w-[90%] rounded-2xl rounded-bl-sm bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)] px-4 py-3 space-y-2">
                {/* Name badge — only on the first bubble of the message */}
                {isFirstBubble && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[var(--vscode-foreground)]">Ava</span>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider"
                      style={{ color: 'var(--color-accent, #a855f7)', backgroundColor: 'rgba(168, 85, 247, 0.15)' }}
                    >
                      {t('brand.supernova_caps')}
                    </span>
                    {hasSecrets && !message.isStreaming && (
                      <button
                        onClick={() => setSecretsRevealed(!secretsRevealed)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium
                                   bg-transparent border-none cursor-pointer
                                   transition-all duration-150 ml-auto"
                        style={{
                          color: secretsRevealed ? '#ef4444' : '#A855F7',
                          background: secretsRevealed ? 'rgba(239, 68, 68, 0.08)' : 'rgba(168, 85, 247, 0.08)',
                          border: `1px solid ${secretsRevealed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(168, 85, 247, 0.15)'}`,
                        }}
                        title={secretsRevealed ? t('secrets.hide') : t('secrets.reveal')}
                      >
                        {secretsRevealed ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                        {secretsRevealed ? t('secrets.hide') : t('secrets.reveal')}
                      </button>
                    )}
                  </div>
                )}

                {/* Events inside this bubble segment */}
                {seg.events.map((event, i) => {
                  const absIdx = seg.firstIdx + i;
                  if (event.kind === 'thinking') {
                    return (
                      <ThinkingBlock
                        key={`ev-${absIdx}`}
                        content={event.content}
                        isStreaming={message.isStreaming && absIdx === events.length - 1}
                      />
                    );
                  }
                  if (event.kind === 'text') {
                    const isLastText = absIdx === lastTextEventIdx;
                    const showStreamingCursor = message.isStreaming && isLastText;
                    return (
                      <div key={`ev-${absIdx}`} className="relative group">
                        <div className="text-sm leading-relaxed">
                          <MarkdownRenderer content={redactTextEvent(event.content)} />
                          {showStreamingCursor && (
                            <span
                              className="inline-block w-2 h-4 animate-pulse ml-0.5"
                              style={{ backgroundColor: 'var(--color-accent, #a855f7)' }}
                            />
                          )}
                        </div>
                        {!message.isStreaming && isLastText && (
                          <CopyButton
                            getText={getContent}
                            className="absolute top-1 right-1 w-6 h-6 opacity-20 hover:opacity-80 transition-opacity"
                          />
                        )}
                      </div>
                    );
                  }
                  return null;
                })}

                {/* Footer (timestamp + feedback) lands on the last segment overall */}
                {isLast && !message.isStreaming && (
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

        // Tool-call segment — rendered as top-level block.
        const tc = seg.event.toolCall;
        if (tc.name === 'todo_write') {
          return <TodoCard key={tc.id} toolCall={tc} isLatest={seg.idx === lastTodoIdx} />;
        }
        if (tc.name === 'present_plan') {
          return <PlanCard key={tc.id} toolCall={tc} onConfirmation={onConfirmation} />;
        }
        if (tc.name === 'ask_user') {
          return <AskUserCard key={tc.id} toolCall={tc} onConfirmation={onConfirmation} />;
        }
        return (
          <div key={tc.id} className="w-full">
            <ToolCallBlock toolCall={tc} onConfirmation={onConfirmation} />
            {/* Footer attaches to the absolute last segment when it's a tool block */}
            {isLast && !message.isStreaming && (
              <div className="flex items-end justify-between mt-1 px-1">
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
        );

        // Silence the "all code paths return a value" pedantry from TS —
        // the switch above covers every Segment kind.
        void isFirst;
      })}
    </div>
  );
}

/**
 * Build an events array from the legacy `content` / `thinking` / `toolCalls`
 * fields so conversation history loaded from disk (before the events refactor)
 * still renders through the new timeline path. Ordering is best-effort:
 * thinking first, then text, then tool calls.
 */
function legacyEventsFromMessage(msg: UIMessage): MessageEvent[] {
  const events: MessageEvent[] = [];
  if (msg.thinking) events.push({ kind: 'thinking', content: msg.thinking });
  if (msg.content) events.push({ kind: 'text', content: msg.content });
  for (const tc of msg.toolCalls || []) {
    events.push({ kind: 'tool_call', toolCall: tc as ToolCallDisplay });
  }
  return events;
}
