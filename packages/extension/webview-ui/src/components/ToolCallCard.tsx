import { useState } from 'react';
import type { ToolCallDisplay } from '../types/messages';

interface ToolCallCardProps {
  toolCall: ToolCallDisplay;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllow?: boolean, allowAll?: boolean) => void;
}

// ─── Human-readable tool descriptions ──────────────────────────────────────

function getToolLabel(name: string, argsJson: string): { icon: string; label: string } {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson);
  } catch {
    // fallback
  }

  const filePath = shortenPath(args.file_path as string | undefined);
  const pattern = args.pattern as string | undefined;
  const command = args.command as string | undefined;

  switch (name) {
    case 'file_read':
      return { icon: '\uD83D\uDCC4', label: `Read ${filePath || 'file'}` };
    case 'file_write':
      return { icon: '\uD83D\uDCDD', label: `Write ${filePath || 'file'}` };
    case 'file_edit':
      return { icon: '\u270F\uFE0F', label: `Edit ${filePath || 'file'}` };
    case 'glob':
      return { icon: '\uD83D\uDD0D', label: `Find files: ${pattern || '...'}` };
    case 'grep':
      return { icon: '\uD83D\uDD0E', label: `Search: ${pattern ? `/${pattern}/` : '...'}` };
    case 'bash':
      return { icon: '\uD83D\uDCBB', label: `Run: ${truncate(command || '...', 60)}` };
    case 'list_directory':
      return { icon: '\uD83D\uDCC1', label: `List ${shortenPath(args.path as string | undefined) || 'directory'}` };
    case 'web_search':
      return { icon: '\uD83C\uDF10', label: `Search: ${truncate((args.query as string) || '...', 50)}` };
    case 'ask_user':
      return { icon: '\uD83D\uDCAC', label: 'Question for user' };
    default:
      return { icon: '\u2699\uFE0F', label: name };
  }
}

function shortenPath(p: string | undefined): string {
  if (!p) return '';
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.length <= 2 ? p : parts.slice(-2).join('/');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}

// ─── Status styling ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ToolCallDisplay['status'], string> = {
  pending_confirmation: 'var(--vscode-editorWarning-foreground, #ff9800)',
  running: 'var(--vscode-textLink-foreground, #3794ff)',
  success: 'var(--vscode-testing-iconPassed, #4caf50)',
  failed: 'var(--vscode-testing-iconFailed, #f44336)',
};

// ─── Component ─────────────────────────────────────────────────────────────

export function ToolCallCard({ toolCall, onConfirmation }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(
    toolCall.status === 'failed' || toolCall.status === 'pending_confirmation',
  );
  const { icon, label } = getToolLabel(toolCall.name, toolCall.arguments);
  const isRunning = toolCall.status === 'running';
  const isSuccess = toolCall.status === 'success';
  const isFailed = toolCall.status === 'failed';

  return (
    <div
      className="rounded border text-xs overflow-hidden"
      style={{ borderColor: STATUS_COLORS[toolCall.status] + '40' }}
    >
      {/* Header */}
      <button
        aria-expanded={expanded}
        aria-label={`${label} — ${toolCall.status}`}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left
                   hover:bg-[var(--vscode-list-hoverBackground)]
                   transition-colors border-none bg-transparent cursor-pointer
                   text-[var(--vscode-foreground)]"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Status indicator */}
        {isRunning ? (
          <span className="inline-block w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: STATUS_COLORS.running, borderTopColor: 'transparent' }} />
        ) : (
          <span className="text-xs" style={{ color: STATUS_COLORS[toolCall.status] }}>
            {isSuccess ? '\u2713' : isFailed ? '\u2717' : '\u26A0'}
          </span>
        )}

        {/* Tool icon + label */}
        <span className="opacity-70">{icon}</span>
        <span className={`font-medium ${isRunning ? 'opacity-80' : ''}`}>
          {label}
        </span>

        {/* Expand chevron */}
        <span className="ml-auto opacity-30 text-[10px]">
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {/* Confirmation bar */}
      {toolCall.status === 'pending_confirmation' && toolCall.confirmationId && (
        <div className="px-3 py-2 border-t space-y-2"
             style={{ borderColor: STATUS_COLORS.pending_confirmation + '30',
                      backgroundColor: STATUS_COLORS.pending_confirmation + '10' }}>
          <span className="opacity-70 block">
            {toolCall.summary || `Allow ${toolCall.name}?`}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              className="px-3 py-1 rounded text-xs font-medium
                         bg-[var(--vscode-button-background)]
                         text-[var(--vscode-button-foreground)]
                         hover:bg-[var(--vscode-button-hoverBackground)]
                         border-none cursor-pointer"
              onClick={() => onConfirmation(toolCall.confirmationId!, true)}
            >
              Allow
            </button>
            <button
              className="px-3 py-1 rounded text-xs font-medium
                         bg-[var(--color-accent,var(--vscode-button-background))]
                         text-[var(--vscode-button-foreground)]
                         hover:opacity-80
                         border-none cursor-pointer transition-opacity"
              onClick={() => onConfirmation(toolCall.confirmationId!, true, true)}
            >
              Always Allow
            </button>
            <button
              className="px-2 py-1 rounded text-[10px]
                         bg-transparent
                         text-[var(--vscode-foreground)] opacity-50 hover:opacity-80
                         border-none cursor-pointer transition-opacity"
              onClick={() => onConfirmation(toolCall.confirmationId!, true, false, true)}
            >
              Allow All
            </button>
            <button
              className="px-3 py-1 rounded text-xs font-medium
                         bg-[var(--vscode-button-secondaryBackground)]
                         text-[var(--vscode-button-secondaryForeground)]
                         hover:bg-[var(--vscode-button-secondaryHoverBackground)]
                         border-none cursor-pointer ml-auto"
              onClick={() => onConfirmation(toolCall.confirmationId!, false)}
            >
              Deny
            </button>
          </div>
        </div>
      )}

      {/* Expanded details */}
      {expanded && toolCall.status !== 'pending_confirmation' && (
        <div className="px-3 py-2 border-t border-[var(--vscode-panel-border)] space-y-2">
          {toolCall.arguments && (
            <details className="group">
              <summary className="opacity-40 cursor-pointer hover:opacity-60 text-[10px] uppercase tracking-wide">
                Arguments
              </summary>
              <pre className="mt-1 text-xs overflow-x-auto whitespace-pre-wrap opacity-70 max-h-32 overflow-y-auto">
                {formatArgs(toolCall.arguments)}
              </pre>
            </details>
          )}
          {toolCall.result && (
            <details open={isFailed}>
              <summary className="opacity-40 cursor-pointer hover:opacity-60 text-[10px] uppercase tracking-wide">
                {isFailed ? 'Error' : 'Output'}
              </summary>
              <pre className={`mt-1 text-xs overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto
                              ${isFailed ? 'text-[var(--vscode-errorForeground)]' : 'opacity-70'}`}>
                {toolCall.result.slice(0, 2000)}
                {toolCall.result.length > 2000 && '\n... (truncated)'}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function formatArgs(argsJson: string): string {
  try {
    return JSON.stringify(JSON.parse(argsJson), null, 2);
  } catch {
    return argsJson;
  }
}
