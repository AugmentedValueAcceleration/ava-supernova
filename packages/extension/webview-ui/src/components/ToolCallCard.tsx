import { useState } from 'react';
import type { ToolCallDisplay } from '../types/messages';

interface ToolCallCardProps {
  toolCall: ToolCallDisplay;
  onConfirmation: (confirmationId: string, approved: boolean) => void;
}

const STATUS_ICONS: Record<ToolCallDisplay['status'], string> = {
  pending_confirmation: '\u26A0',
  running: '\u23F3',
  success: '\u2713',
  failed: '\u2717',
};

const STATUS_COLORS: Record<ToolCallDisplay['status'], string> = {
  pending_confirmation: 'var(--vscode-editorWarning-foreground, #ff9800)',
  running: 'var(--vscode-foreground)',
  success: 'var(--vscode-testing-iconPassed, #4caf50)',
  failed: 'var(--vscode-testing-iconFailed, #f44336)',
};

export function ToolCallCard({ toolCall, onConfirmation }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(toolCall.status === 'failed');

  return (
    <div
      className="rounded border text-xs"
      style={{ borderColor: 'var(--vscode-panel-border)' }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--vscode-list-hoverBackground)]"
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ color: STATUS_COLORS[toolCall.status] }}>
          {STATUS_ICONS[toolCall.status]}
        </span>
        <span className="font-medium">{toolCall.name}</span>
        <span className="ml-auto opacity-50">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {/* Confirmation */}
      {toolCall.status === 'pending_confirmation' && toolCall.confirmationId && (
        <div className="px-3 py-2 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-inputValidation-warningBackground,rgba(255,152,0,0.1))]">
          <p className="mb-2 opacity-80">{toolCall.summary || `Allow ${toolCall.name}?`}</p>
          <div className="flex gap-2">
            <button
              className="px-3 py-1 rounded text-xs font-medium
                         bg-[var(--vscode-button-background)]
                         text-[var(--vscode-button-foreground)]
                         hover:bg-[var(--vscode-button-hoverBackground)]"
              onClick={() => onConfirmation(toolCall.confirmationId!, true)}
            >
              Allow
            </button>
            <button
              className="px-3 py-1 rounded text-xs font-medium
                         bg-[var(--vscode-button-secondaryBackground)]
                         text-[var(--vscode-button-secondaryForeground)]
                         hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
              onClick={() => onConfirmation(toolCall.confirmationId!, false)}
            >
              Deny
            </button>
          </div>
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 py-2 border-t border-[var(--vscode-panel-border)]">
          {toolCall.arguments && (
            <div className="mb-2">
              <p className="opacity-50 mb-1">Arguments:</p>
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap opacity-80">
                {formatArgs(toolCall.arguments)}
              </pre>
            </div>
          )}
          {toolCall.result && (
            <div>
              <p className="opacity-50 mb-1">Result:</p>
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap opacity-80 max-h-40 overflow-y-auto">
                {toolCall.result.slice(0, 500)}
                {toolCall.result.length > 500 && '...'}
              </pre>
            </div>
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
