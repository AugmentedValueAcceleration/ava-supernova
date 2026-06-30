import { useState, useCallback } from 'react';
import { CopyButton } from './CopyButton';
import { t, useLocale } from '../../i18n';

interface ThinkingBlockProps {
  content: string;
  isStreaming: boolean;
}

export function ThinkingBlock({ content, isStreaming }: ThinkingBlockProps) {
  useLocale();
  const [expanded, setExpanded] = useState(false);
  const duration = estimateDuration(content);
  const getContent = useCallback(() => content, [content]);

  return (
    <div
      className="text-xs overflow-hidden mb-2"
      style={{ borderLeft: '2px solid color-mix(in srgb, var(--accent) 38%, transparent)' }}
    >
      <button
        className="w-full flex items-center gap-2 pl-2.5 pr-2 py-1.5 text-left
                   hover:bg-[var(--vscode-list-hoverBackground)]
                   transition-colors border-none bg-transparent cursor-pointer
                   text-[var(--vscode-foreground)]"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={isStreaming ? t('dash.chat.thinking_in_progress') : t('dash.chat.thought_for', { duration })}
      >
        {/* Spinner while thinking, checkmark when done */}
        {isStreaming ? (
          <span
            className="inline-block w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
            style={{
              borderColor: 'var(--vscode-textLink-foreground, #3794ff)',
              borderTopColor: 'transparent',
            }}
          />
        ) : (
          <span style={{ color: 'var(--vscode-textLink-foreground, #3794ff)' }}>
            {'\u2713'}
          </span>
        )}

        {/* Label */}
        <span className="font-medium opacity-80">
          {isStreaming ? t('dash.chat.status.thinking') : t('dash.chat.thought_for', { duration })}
        </span>

        {/* Expand chevron */}
        <span className="ml-auto opacity-30 text-[10px]">
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {/* Expanded thinking content */}
      {expanded && (
        <div
          className="pl-2.5 pr-1 py-2 relative group/thinking"
          style={{ background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}
        >
          <pre className="text-xs whitespace-pre-wrap opacity-60 max-h-64 overflow-y-auto leading-relaxed">
            {content}
            {isStreaming && (
              <span className="inline-block w-1.5 h-3 bg-[var(--vscode-foreground)] opacity-40 animate-pulse ml-0.5" />
            )}
          </pre>
          {!isStreaming && (
            <CopyButton
              getText={getContent}
              className="absolute top-2 right-2 w-5 h-5
                         opacity-0 group-hover/thinking:opacity-50 hover:!opacity-100"
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Rough estimate of thinking duration based on content length (~3 tokens/word, ~50 tok/s) */
function estimateDuration(content: string): string {
  const words = content.split(/\s+/).length;
  const estimatedTokens = Math.ceil(words * 1.3);
  const seconds = Math.max(1, Math.round(estimatedTokens / 50));

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}
