import { useState } from 'react';
import type { ToolCallDisplay } from '../../types/messages';
import { t, useLocale } from '../../i18n';
import { Icon } from '../../components/Icon';

interface AskUserCardProps {
  toolCall: ToolCallDisplay;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllowCategory?: boolean, planSelection?: string, userResponse?: string) => void;
}

export function AskUserCard({ toolCall, onConfirmation }: AskUserCardProps) {
  useLocale();
  const [response, setResponse] = useState('');

  let question = t('ask.fallback');
  try {
    const args = JSON.parse(toolCall.arguments);
    question = args.question || question;
  } catch {
    // fallback
  }

  const isPending = toolCall.status === 'pending_confirmation' && !!toolCall.confirmationId;
  const isCompleted = toolCall.status === 'success';
  const isDenied = toolCall.status === 'failed';

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        borderColor: isPending
          ? 'var(--vscode-textLink-foreground, #3794ff)'
          : 'var(--vscode-panel-border, rgba(128,128,128,0.2))',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2"
           style={{ backgroundColor: isPending ? 'rgba(55, 148, 255, 0.08)' : 'transparent' }}>
        <span className="text-[var(--accent)]"><Icon.chat size={14} /></span>
        <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
          {t('ask.question')}
        </span>
      </div>

      {/* Question */}
      <div className="px-3 py-2 text-sm">
        {question}
      </div>

      {/* Input + actions (only when pending) */}
      {isPending && (
        <div className="px-3 pb-3 space-y-2">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder={t('ask.placeholder')}
            rows={2}
            className="w-full px-2 py-1.5 rounded text-sm resize-y
                       bg-[var(--vscode-input-background)]
                       text-[var(--vscode-input-foreground)]
                       border border-[var(--vscode-input-border,transparent)]
                       placeholder:text-[var(--vscode-input-placeholderForeground)]
                       focus:outline-none focus:border-[var(--vscode-focusBorder)]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && response.trim()) {
                e.preventDefault();
                onConfirmation(toolCall.confirmationId!, true, false, undefined, response.trim());
              }
            }}
          />
          <div className="flex items-center gap-2">
            <button
              disabled={!response.trim()}
              className="px-3 py-1 rounded text-xs font-medium
                         bg-[var(--vscode-button-background)]
                         text-[var(--vscode-button-foreground)]
                         hover:bg-[var(--vscode-button-hoverBackground)]
                         border-none cursor-pointer
                         disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => onConfirmation(toolCall.confirmationId!, true, false, undefined, response.trim())}
            >
              {t('ask.submit')}
            </button>
            <button
              className="px-3 py-1 rounded text-xs font-medium
                         bg-[var(--vscode-button-secondaryBackground)]
                         text-[var(--vscode-button-secondaryForeground)]
                         hover:bg-[var(--vscode-button-secondaryHoverBackground)]
                         border-none cursor-pointer"
              onClick={() => onConfirmation(toolCall.confirmationId!, false)}
            >
              {t('ask.skip')}
            </button>
          </div>
        </div>
      )}

      {/* Completed state */}
      {isCompleted && toolCall.result && (
        <div className="px-3 pb-2 text-xs opacity-60">
          {toolCall.result}
        </div>
      )}

      {/* Denied state */}
      {isDenied && (
        <div className="px-3 pb-2 text-xs opacity-50 italic">
          {t('ask.skipped')}
        </div>
      )}
    </div>
  );
}
