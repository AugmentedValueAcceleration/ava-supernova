import { useState } from 'react';
import type { ToolCallDisplay } from '../types/messages';
import { t, tt, useLocale } from '../i18n';

interface TodoCardProps {
  toolCall: ToolCallDisplay;
  /** When false, the card renders collapsed (older updates in the same message). */
  isLatest?: boolean;
  /**
   * Is the turn that produced this card still running?
   *
   * The card is a SNAPSHOT of one `todo_write` call's arguments — it does not
   * track anything. The spinner used to animate purely because an item's
   * status string read `in_progress`, and nothing ever told the card the turn
   * had ended, so a card would spin forever over work that finished minutes
   * ago. That is not a progress indicator, it is a lie with an animation.
   */
  isStreaming?: boolean;
}

interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

function parseTodos(argsJson: string): TodoItem[] | null {
  try {
    const parsed = JSON.parse(argsJson);
    if (Array.isArray(parsed.todos)) {
      return parsed.todos as TodoItem[];
    }
  } catch { /* malformed */ }
  return null;
}

/**
 * Mirrors dashboard-ui's TodoCard in structure and behaviour, but keeps the
 * `--vscode-*` palette: this panel sits inside the editor chrome and is meant
 * to take the user's theme, where the dashboard is our own surface with our
 * own tokens. Same card, dressed for where it lives.
 */
export function TodoCard({ toolCall, isLatest = true, isStreaming = false }: TodoCardProps) {
  useLocale();
  const todos = parseTodos(toolCall.arguments);
  const [expanded, setExpanded] = useState(isLatest);

  if (!todos) {
    return (
      <div className="rounded-lg border px-3 py-2 text-xs opacity-60"
           style={{ borderColor: 'var(--vscode-panel-border)' }}>
        {t('todo.unavailable')}
      </div>
    );
  }

  const total = todos.length;
  const done = todos.filter((x) => x.status === 'completed').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = done === total && total > 0;

  // An item left `in_progress` on a turn that has ended is not running — it is
  // unfinished. Saying so is the whole point of this distinction.
  const live = isStreaming && isLatest;
  const stalled = !live && todos.some((x) => x.status === 'in_progress');

  const accent = allDone
    ? 'var(--vscode-testing-iconPassed, #4caf50)'
    : stalled
      ? 'var(--vscode-editorWarning-foreground, #ff9800)'
      : 'var(--vscode-textLink-foreground, #3794ff)';

  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{ borderColor: `color-mix(in srgb, ${accent} 35%, transparent)` }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-2.5 py-2 text-left
                   text-[var(--vscode-foreground)] transition-colors
                   hover:bg-[var(--vscode-list-hoverBackground)]"
      >
        {/* A ring rather than a bar — it survives the narrow rail, where an
            80px progress bar had almost nothing to say. */}
        <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" className="-rotate-90">
            <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2.5"
              stroke="var(--vscode-panel-border)" />
            <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2.5" strokeLinecap="round"
              stroke={accent}
              strokeDasharray={`${(pct / 100) * 62.8} 62.8`}
              style={{ transition: 'stroke-dasharray 0.4s ease' }} />
          </svg>
          {allDone && (
            <span className="absolute text-[9px] font-semibold" style={{ color: accent }}>✓</span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="text-[12px] font-semibold">{t('todo.tasks')}</span>
            <span className="text-[11px] opacity-50">
              {t('todo.done', { done: String(done), total: String(total) })}
            </span>
          </span>
          {/* The current step on the header, so a collapsed card still says
              what is happening rather than only how much of it is left. */}
          {!expanded && !allDone && (
            <span className="mt-0.5 block truncate text-[11px]" style={{ color: accent }}>
              {todos.find((x) => x.status === 'in_progress')?.activeForm
                ?? todos.find((x) => x.status === 'pending')?.content
                ?? ''}
            </span>
          )}
        </span>

        {stalled && (
          <span
            className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{ background: `color-mix(in srgb, ${accent} 18%, transparent)`, color: accent }}
          >
            {tt('todo.unfinished', 'unfinished')}
          </span>
        )}

        <span className="flex-shrink-0 text-[10px] opacity-30">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <ul
          className="list-none space-y-0.5 border-t px-2.5 pb-2 pt-1.5"
          style={{ borderColor: `color-mix(in srgb, ${accent} 20%, transparent)` }}
        >
          {todos.map((todo, i) => {
            const running = todo.status === 'in_progress' && live;
            return (
              <li key={i} className="flex items-start gap-2 py-[3px]">
                {running ? (
                  <span
                    className="mt-[3px] h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2"
                    style={{ borderColor: accent, borderTopColor: 'transparent' }}
                  />
                ) : (
                  <span
                    className="mt-[1px] w-3 flex-shrink-0 text-center text-[11px] leading-none"
                    style={{
                      color: todo.status === 'completed'
                        ? 'var(--vscode-testing-iconPassed, #4caf50)'
                        : todo.status === 'in_progress'
                          ? accent
                          : 'var(--vscode-foreground)',
                      opacity: todo.status === 'pending' ? 0.35 : 1,
                    }}
                  >
                    {/* A half-filled mark for an item abandoned mid-flight:
                        neither done nor untouched, and pretending otherwise is
                        what made this card untrustworthy. */}
                    {todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '◐' : '○'}
                  </span>
                )}
                <span
                  className={`text-[11.5px] leading-[1.5] ${todo.status === 'completed' ? 'line-through opacity-50' : ''}`}
                  style={todo.status === 'in_progress' ? { color: accent } : undefined}
                >
                  {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
