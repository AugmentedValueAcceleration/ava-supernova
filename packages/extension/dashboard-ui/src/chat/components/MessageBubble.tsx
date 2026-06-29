import { useCallback, useState } from 'react';
import type { UIMessage, MessageEvent, ToolCallDisplay } from '../../types/messages';
import { getMessageText } from '../../types/messages';
import { t, useLocale } from '../../i18n';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallBlock } from './ToolCallBlock';
import { PlanCard } from './PlanCard';
import { TodoCard } from './TodoCard';
import { AskUserCard } from './AskUserCard';
import { ProfileFieldCard } from './ProfileFieldCard';
import { OpenHealthRoomCard } from './OpenHealthRoomCard';
import { OpenLearningRoomCard } from './OpenLearningRoomCard';
import { TaskSuggestCard } from './TaskSuggestCard';
import { CopyButton } from './CopyButton';
import { FeedbackButtons } from './FeedbackButtons';
import { useSecrets } from '../hooks/useSecrets';

interface MessageBubbleProps {
  message: UIMessage;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllowCategory?: boolean, planSelection?: string, userResponse?: string) => void;
  onContinue?: () => void;
  onRate?: (messageId: string, rating: 'up' | 'down', reason?: string) => void;
  /** User's auth-provider avatar (Supabase users.avatar_url). Null
   *  falls back to a name-initials gradient circle, then the generic
   *  person SVG. Mirrors webview-ui MessageBubble. */
  userAvatarUrl?: string | null;
  userName?: string | null;
}

function getErrorLabel(code: string): string {
  return t(`error.${code}`) || t('error.unknown');
}

// Errors where "Try Again" makes sense — the conversation context is intact
const RESUMABLE_ERRORS = new Set([
  'stream_stall', 'timeout', 'server_error', 'network', 'rate_limit', 'iterations_exceeded',
  'context_truncated', 'provider_error', 'unknown', 'bad_request', 'model_not_found',
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

export function MessageBubble({ message, onConfirmation, onContinue, onRate, userAvatarUrl, userName }: MessageBubbleProps) {
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
    // Mirrors IDE chat user-message at DashboardPages.tsx:4330-4400 —
    // see webview-ui/src/components/MessageBubble.tsx for the matching
    // shape rationale. Both extension copies edited in lockstep.
    const ts = message.timestamp ? new Date(message.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    return (
      <div className="flex justify-end items-start" style={{ marginBottom: 8 }}>
        <div style={{ maxWidth: '85%', position: 'relative' }}>
          <div className="flex items-center gap-2 justify-end" style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#b4befe' }}>
              {t('dash.chat.you') || 'You'}
            </span>
            <span style={{ fontSize: 10, color: '#45475a' }}>{ts}</span>
          </div>
          <div
            style={{
              padding: '10px 16px',
              borderRadius: '16px 16px 4px 16px',
              background: '#7c3aed',
              color: '#ffffff',
              fontSize: 14, lineHeight: 1.65,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}
          >
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
          </div>
        </div>
        {/* User avatar — fallback hierarchy: avatar_url → initials → person SVG. */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          marginLeft: 10, marginTop: 24,
          background: 'linear-gradient(135deg, #b4befe, #89b4fa)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          fontSize: 12, fontWeight: 600, color: '#1e1e2e',
        }}>
          {userAvatarUrl ? (
            <img
              src={userAvatarUrl}
              alt={userName || t('dash.chat.you') || 'You'}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : userName ? (
            <span aria-hidden="true">{userName.trim().charAt(0).toUpperCase()}</span>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
        </div>
      </div>
    );
  }

  // ── Assistant message — single bubble per turn with chronological timeline ──
  const events: MessageEvent[] = message.events || legacyEventsFromMessage(message);

  let lastTextEventIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind === 'text') {
      lastTextEventIdx = i;
      break;
    }
  }

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

  const [secretsRevealed, setSecretsRevealed] = useState(false);
  const redactedFullText = fullText ? redact(fullText) : '';
  const hasSecrets = fullText !== redactedFullText;
  const redactTextEvent = (content: string): string =>
    secretsRevealed ? content : redact(content);

  // ── Segment events for top-level tool-block rendering ──────────────────
  // See webview-ui/MessageBubble.tsx for the full rationale. Tool events
  // become sibling blocks outside the chat bubble; text/thinking events
  // group into contiguous bubble segments.
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

  const lastSegmentIdx = segments.length - 1;
  const headerTs = message.timestamp ? new Date(message.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

  return (
    <div className="flex items-start w-full" style={{ marginBottom: 8 }}>
      {/* Ava avatar — preset image URL is injected by the extension
          host as an absolute vscode-webview-resource:// URI on
          #root[data-ava-avatar-uri] (relative paths refuse to load
          inside a webview). Falls back to gradient + Ava initial. */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        marginRight: 10, marginTop: 4,
        background: 'linear-gradient(135deg, var(--accent), #6366f1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        fontSize: 12, fontWeight: 600, color: '#fff',
      }}>
        {(() => {
          const uri = typeof document !== 'undefined'
            ? document.getElementById('root')?.dataset.avaAvatarUri
            : '';
          return uri ? (
            <img
              src={uri}
              alt={t('dash.chat.ava') || 'Ava'}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <span aria-hidden="true">A</span>
          );
        })()}
      </div>

      <div className="flex flex-col flex-1 min-w-0 gap-2 items-start">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
            {t('dash.chat.ava') || 'Ava'}
          </span>
          <span style={{ fontSize: 10, color: '#45475a' }}>{headerTs}</span>
        </div>

      {segments.map((seg, segIdx) => {
        const isLast = segIdx === lastSegmentIdx;

        if (seg.kind === 'bubble') {
          const isFirstBubble = !segments.slice(0, segIdx).some((s) => s.kind === 'bubble');
          return (
            <div key={`seg-${segIdx}`} className="flex justify-start w-full">
              <div
                className="group space-y-2"
                style={{
                  maxWidth: '95%',
                  padding: '10px 16px',
                  borderRadius: '16px 16px 16px 4px',
                  background: '#181825',
                  border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
                  fontSize: 14, lineHeight: 1.65, color: '#cdd6f4',
                }}
              >
                {isFirstBubble && hasSecrets && !message.isStreaming && (
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => setSecretsRevealed(!secretsRevealed)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium
                                 bg-transparent border-none cursor-pointer
                                 transition-all duration-150"
                      style={{
                        color: secretsRevealed ? '#ef4444' : 'var(--accent)',
                        background: secretsRevealed ? 'rgba(239, 68, 68, 0.08)' : 'color-mix(in srgb, var(--accent) 8%, transparent)',
                        border: `1px solid ${secretsRevealed ? 'rgba(239, 68, 68, 0.15)' : 'color-mix(in srgb, var(--accent) 15%, transparent)'}`,
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
                  </div>
                )}

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
                              style={{ backgroundColor: 'var(--color-accent, var(--accent))' }}
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
                        {new Date(message.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
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
        if (tc.name === 'health_profile_ask') {
          return <ProfileFieldCard key={tc.id} toolCall={tc} onConfirmation={onConfirmation} />;
        }
        if (tc.name === 'open_health_room') {
          return <OpenHealthRoomCard key={tc.id} toolCall={tc} />;
        }
        if (tc.name === 'open_learning_room') {
          return <OpenLearningRoomCard key={tc.id} toolCall={tc} />;
        }
        if (tc.name === 'task_suggest') {
          return <TaskSuggestCard key={tc.id} toolCall={tc} onConfirmation={onConfirmation} />;
        }
        if (tc.name === 'ask_user') {
          return <AskUserCard key={tc.id} toolCall={tc} onConfirmation={onConfirmation} />;
        }
        return (
          <div key={tc.id} className="w-full">
            <ToolCallBlock toolCall={tc} onConfirmation={onConfirmation} />
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
                    {new Date(message.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

/**
 * Build an events array from the legacy content/thinking/toolCalls fields
 * so conversation history loaded from disk (pre-refactor format) still
 * renders through the new timeline path.
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
