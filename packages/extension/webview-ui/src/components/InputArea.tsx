import { useState, useRef, useCallback, useEffect } from 'react';
import { t } from '../i18n';
import type { ProviderSource } from '../types/messages';

export type AvaMode = 'code' | 'plan' | 'chat' | 'security';

export interface ImageAttachment {
  type: 'image';
  data: string; // data URL
  name: string;
}

interface InputAreaProps {
  onSend: (text: string, mode: AvaMode, attachments?: ImageAttachment[]) => void;
  onCancel: () => void;
  isStreaming: boolean;
  disabled: boolean;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
    contextWindow?: number;
  } | null;
  isCompressing?: boolean;
  onCompress?: () => void;
  providerSource?: ProviderSource;
  platformStatus?: {
    connected: boolean;
    tier: string | null;
    freeTokensUsed: number;
    freeTokensLimit: number;
  } | null;
  onProviderSourceChange?: (source: ProviderSource) => void;
}

const MODES: { id: AvaMode; labelKey: string; icon: string }[] = [
  { id: 'code', labelKey: 'input.mode.code', icon: '>>' },
  { id: 'plan', labelKey: 'input.mode.plan', icon: '::' },
  { id: 'chat', labelKey: 'input.mode.chat', icon: '..' },
  { id: 'security', labelKey: 'input.mode.security', icon: '!!' },
];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

const PLACEHOLDER_KEYS: Record<AvaMode, string> = {
  code: 'input.placeholder.code',
  plan: 'input.placeholder.plan',
  chat: 'input.placeholder.chat',
  security: 'input.placeholder.security',
};

export function InputArea({ onSend, onCancel, isStreaming, disabled, usage, isCompressing, onCompress, providerSource, platformStatus, onProviderSourceChange }: InputAreaProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<AvaMode>('code');
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wasStreamingRef = useRef(false);

  // Auto-focus textarea when streaming ends
  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
    } else if (wasStreamingRef.current) {
      wasStreamingRef.current = false;
      textareaRef.current?.focus();
    }
  }, [isStreaming]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    onSend(trimmed || '(image)', mode, attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, mode, attachments, onSend]);

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

  const handleAttach = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > MAX_IMAGE_SIZE) return;

      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result as string;
        setAttachments((prev) => [...prev, { type: 'image', data, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });

    // Reset so the same file can be re-selected
    e.target.value = '';
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Paste support (Ctrl+V / Cmd+V screenshots) ───────────────────────────

  const addImageFromFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > MAX_IMAGE_SIZE) return;

    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      const name = file.name || `pasted-${Date.now()}.png`;
      setAttachments((prev) => [...prev, { type: 'image', data, name }]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) addImageFromFile(file);
          return; // only handle one image per paste
        }
      }
      // If no image found, let the default text paste happen
    },
    [addImageFromFile],
  );

  // ── Drag & drop support ───────────────────────────────────────────────────

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer?.files;
      if (!files) return;

      Array.from(files).forEach((file) => addImageFromFile(file));
    },
    [addImageFromFile],
  );

  const hasContent = text.trim().length > 0 || attachments.length > 0;

  return (
    <div className="px-3 py-2">
      <div
        className={`rounded-md overflow-hidden relative transition-colors
                    bg-[var(--vscode-input-background)]
                    ${isDragOver ? 'border-dashed' : ''}`}
        style={{
          border: isDragOver
            ? '1px dashed var(--color-accent, #A855F7)'
            : '1px solid rgba(168, 85, 247, 0.15)',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Image previews */}
        {attachments.length > 0 && (
          <div className="flex gap-2 px-3 pt-2 flex-wrap">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="relative group w-16 h-16 rounded overflow-hidden
                           border border-[var(--vscode-panel-border)]"
              >
                <img
                  src={att.data}
                  alt={att.name}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removeAttachment(i)}
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full
                             bg-[var(--vscode-errorForeground,#e53935)] text-white
                             text-[10px] leading-none
                             opacity-0 group-hover:opacity-100
                             border-none cursor-pointer transition-opacity
                             flex items-center justify-center"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Drop overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center
                          bg-[var(--vscode-input-background)] opacity-90 pointer-events-none">
            <span className="text-xs opacity-50">{t('input.drop_image')}</span>
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={disabled ? t('input.placeholder.disabled') : t(PLACEHOLDER_KEYS[mode])}
          disabled={disabled}
          rows={1}
          className="w-full resize-none text-sm px-3 pt-3 pb-1
                     bg-transparent
                     text-[var(--vscode-input-foreground)]
                     placeholder:opacity-40
                     outline-none border-none
                     disabled:opacity-40"
          style={{ maxHeight: '150px' }}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-2 pb-2 pt-1" style={{ borderTop: '1px solid rgba(168, 85, 247, 0.08)' }}>
          {/* Mode selector */}
          <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Input mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                role="radio"
                aria-checked={mode === m.id}
                aria-label={`${t(m.labelKey)} mode`}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium
                            border-none cursor-pointer transition-colors
                  ${mode === m.id
                    ? 'bg-[var(--color-accent,var(--vscode-button-background))] text-[var(--vscode-button-foreground)]'
                    : 'bg-transparent text-[var(--vscode-foreground)] opacity-40 hover:opacity-70'
                  }`}
              >
                <span className="font-mono text-[10px] opacity-80" aria-hidden="true">{m.icon}</span>
                {t(m.labelKey)}
              </button>
            ))}
          </div>

          {/* Provider source toggle */}
          {platformStatus?.connected && onProviderSourceChange && (
            <div className="flex items-center gap-0.5 rounded bg-[var(--vscode-input-background)] p-0.5">
              <button
                onClick={() => onProviderSourceChange('platform')}
                disabled={
                  providerSource !== 'platform' &&
                  platformStatus.tier === 'free' &&
                  platformStatus.freeTokensUsed >= platformStatus.freeTokensLimit
                }
                className={`px-2 py-0.5 rounded text-[10px] font-medium border-none cursor-pointer transition-colors
                  disabled:opacity-20 disabled:cursor-not-allowed
                  ${providerSource === 'platform'
                    ? 'bg-[var(--color-accent,var(--vscode-button-background))] text-[var(--vscode-button-foreground)]'
                    : 'bg-transparent text-[var(--vscode-foreground)] opacity-40 hover:opacity-70'
                  }`}
                title={providerSource === 'platform'
                  ? `${Math.max(0, platformStatus.freeTokensLimit - platformStatus.freeTokensUsed).toLocaleString()} free tokens remaining`
                  : 'Switch to free/platform tokens'}
              >
                {platformStatus.tier === 'free' ? 'Free' : 'Platform'}
              </button>
              <button
                onClick={() => onProviderSourceChange('byok')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border-none cursor-pointer transition-colors
                  ${providerSource === 'byok'
                    ? 'bg-[var(--color-accent,var(--vscode-button-background))] text-[var(--vscode-button-foreground)]'
                    : 'bg-transparent text-[var(--vscode-foreground)] opacity-40 hover:opacity-70'
                  }`}
                title="Use your own API key"
              >
                API Key
              </button>
            </div>
          )}

          {/* Right side: attach + usage + send/stop */}
          <div className="flex items-center gap-2">
            {/* Free token balance */}
            {providerSource === 'platform' && platformStatus?.connected && (() => {
              const remaining = Math.max(0, platformStatus.freeTokensLimit - platformStatus.freeTokensUsed);
              const isLow = remaining <= 100_000;
              return (
                <span
                  className={`text-[10px] tabular-nums ${
                    isLow
                      ? 'text-[var(--vscode-editorWarning-foreground,#cca700)] opacity-80'
                      : 'opacity-30'
                  }`}
                  title={`${remaining.toLocaleString()} / ${platformStatus.freeTokensLimit.toLocaleString()} free tokens remaining`}
                >
                  {remaining >= 1000 ? `${Math.round(remaining / 1000)}K` : remaining} free
                </span>
              );
            })()}
            {usage && (() => {
              const pct = usage.contextWindow
                ? Math.round((usage.total_tokens / usage.contextWindow) * 100)
                : 0;
              const isWarning = pct >= 80;
              const isCritical = pct >= 90;
              return (
                <button
                  onClick={onCompress}
                  disabled={isCompressing || disabled || isStreaming}
                  className={`text-[10px] tabular-nums bg-transparent border-none cursor-pointer
                              hover:underline transition-opacity disabled:cursor-default disabled:no-underline ${
                    isCritical
                      ? 'text-[var(--vscode-errorForeground)] opacity-90'
                      : isWarning
                        ? 'text-[var(--vscode-editorWarning-foreground,#cca700)] opacity-80'
                        : 'opacity-30 hover:opacity-50'
                  }`}
                  title={isCompressing
                    ? t('input.compressing')
                    : isCritical
                      ? t('input.compress_click')
                      : isWarning
                        ? t('input.compress_click')
                        : t('input.compress_usage')}
                >
                  {isCompressing ? t('input.compressing') : (
                    <>
                      {usage.prompt_tokens.toLocaleString()}/{usage.completion_tokens.toLocaleString()}
                      {pct > 0 && ` \u00B7 ${pct}%`}
                      {usage.cost !== undefined && usage.cost > 0 && ` \u00B7 $${usage.cost.toFixed(4)}`}
                      {isCritical && ' \u26A0'}
                    </>
                  )}
                </button>
              );
            })()}

            {/* Attach button */}
            <button
              onClick={handleAttach}
              disabled={disabled}
              title={t('input.attach_image')}
              aria-label={t('input.attach_image')}
              className="flex items-center justify-center w-7 h-7 rounded
                         bg-transparent border-none cursor-pointer
                         text-[var(--vscode-foreground)] opacity-40 hover:opacity-70
                         disabled:opacity-20 disabled:cursor-not-allowed
                         transition-opacity"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a2.75 2.75 0 1 1-3.935-3.84l4.486-4.486a1.75 1.75 0 0 1 2.505 2.44L6.623 9.573a.75.75 0 0 1-1.08-1.04l4.473-4.563z" />
              </svg>
            </button>

            {isStreaming ? (
              <button
                onClick={onCancel}
                title={t('input.stop')}
                aria-label={t('input.stop')}
                className="flex items-center justify-center w-7 h-7 rounded-full
                           bg-[var(--vscode-errorForeground,#e53935)]
                           text-white
                           hover:opacity-80
                           border-none cursor-pointer transition-opacity"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <rect x="3" y="3" width="10" height="10" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={disabled || !hasContent}
                title={t('input.send')}
                aria-label={t('input.send')}
                className={`flex items-center justify-center w-7 h-7 rounded-full
                           border-none cursor-pointer transition-all
                  ${hasContent && !disabled
                    ? 'bg-[var(--color-accent,var(--vscode-button-background))] text-[var(--vscode-button-foreground)] opacity-100'
                    : 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] opacity-20 cursor-not-allowed'
                  }`}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 3.5l-4.5 4.5.707.707L7.5 5.414V13h1V5.414l3.293 3.293.707-.707L8 3.5z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
