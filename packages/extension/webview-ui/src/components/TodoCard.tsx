import { useState } from 'react';
import type { ToolCallDisplay } from '../types/messages';

interface TodoCardProps {
  toolCall: ToolCallDisplay;
  /** When false, the card renders collapsed (older updates in the same message). */
  isLatest?: boolean;
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

// ─── Status colors (matches ToolCallCard / PlanCard) ────────────────────────

const CARD_COLORS = {
  running: 'var(--vscode-textLink-foreground, #3794ff)',
  success: 'var(--vscode-testing-iconPassed, #4caf50)',
  failed: 'var(--vscode-testing-iconFailed, #f44336)',
  pending_confirmation: 'var(--vscode-editorWarning-foreground, #ff9800)',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function TodoCard({ toolCall, isLatest = true }: TodoCardProps) {
  const todos = parseTodos(toolCall.arguments);
  const [expanded, setExpanded] = useState(isLatest);

  // Fallback for malformed data
  if (!todos) {
    return (
      <div className="rounded border text-xs overflow-hidden"
           style={{ borderColor: 'var(--vscode-panel-border)' }}>
        <div className="px-3 py-2 opacity-60">Task list unavailable</div>
      </div>
    );
  }

  const total = todos.length;
  const done = todos.filter((t) => t.status === 'completed').length;
  const inProgress = todos.filter((t) => t.status === 'in_progress').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const accentColor = done === total
    ? CARD_COLORS.success
    : inProgress > 0
      ? CARD_COLORS.running
      : 'var(--vscode-foreground)';

  const borderColor = (CARD_COLORS[toolCall.status] ?? accentColor) + '40';

  return (
    <div className="rounded border text-xs overflow-hidden" style={{ borderColor }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left
                   hover:bg-[var(--vscode-list-hoverBackground)]
                   transition-colors border-none bg-transparent cursor-pointer
                   text-[var(--vscode-foreground)]"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`Tasks: ${done} of ${total} done`}
      >
        {/* Checkbox icon */}
        <span style={{ color: accentColor, fontSize: '13px' }}>
          {done === total ? '\u2713' : '\u2610'}
        </span>

        {/* Label */}
        <span className="font-medium">Tasks</span>

        {/* Count */}
        <span className="opacity-50 text-[11px]">
          {done}/{total} done
        </span>

        {/* Mini progress bar */}
        <span className="flex-1 max-w-[80px] h-1.5 rounded-full overflow-hidden ml-1"
              style={{ backgroundColor: 'var(--vscode-panel-border)' }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}>
          <span className="block h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  backgroundColor: accentColor,
                }} />
        </span>

        {/* Chevron */}
        <span className="ml-auto opacity-30 text-[10px]">
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {/* ── Expanded body ──────────────────────────────────────────────── */}
      {expanded && (
        <div className="px-3 pb-2.5 pt-1 border-t space-y-0.5"
             style={{ borderColor: accentColor + '20' }}>
          {todos.map((todo, i) => (
            <div key={i} className="flex items-start gap-2 py-0.5">
              {/* Status icon */}
              {todo.status === 'in_progress' ? (
                <span
                  className="inline-block w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0 mt-0.5"
                  style={{
                    borderColor: CARD_COLORS.running,
                    borderTopColor: 'transparent',
                  }}
                />
              ) : (
                <span
                  className="flex-shrink-0 mt-0.5 text-[12px] leading-none w-3.5 text-center"
                  style={{
                    color: todo.status === 'completed'
                      ? CARD_COLORS.success
                      : 'var(--vscode-foreground)',
                    opacity: todo.status === 'completed' ? 1 : 0.3,
                  }}
                >
                  {todo.status === 'completed' ? '\u2713' : '\u25CB'}
                </span>
              )}

              {/* Text */}
              <span
                className={todo.status === 'completed' ? 'opacity-50 line-through' : ''}
                style={todo.status === 'in_progress' ? { color: CARD_COLORS.running } : undefined}
              >
                {todo.status === 'in_progress' ? todo.activeForm : todo.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
