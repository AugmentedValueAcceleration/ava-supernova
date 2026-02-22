import { useState, useRef, useCallback } from 'react';

interface InputAreaProps {
  onSend: (text: string) => void;
  onCancel: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export function InputArea({ onSend, onCancel, isStreaming, disabled }: InputAreaProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (isStreaming) return;
        handleSend();
      }
    },
    [handleSend, isStreaming],
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    }
  }, []);

  return (
    <div className="px-3 py-2 border-t border-[var(--vscode-panel-border)]">
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Configure a provider to start...' : 'Ask anything...'}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none text-sm px-3 py-2 rounded
                     bg-[var(--vscode-input-background)]
                     text-[var(--vscode-input-foreground)]
                     border border-[var(--vscode-input-border)]
                     placeholder:opacity-40
                     outline-none focus:border-[var(--color-accent)]
                     disabled:opacity-40"
          style={{ maxHeight: '150px' }}
        />
        {isStreaming ? (
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded text-xs font-medium shrink-0
                       bg-[var(--vscode-errorForeground,#f44336)]
                       text-white
                       hover:opacity-80"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={disabled || !text.trim()}
            className="px-3 py-2 rounded text-xs font-medium shrink-0
                       bg-[var(--color-accent)]
                       text-white
                       hover:bg-[var(--color-accent-light)]
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
