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
  const [isFocused, setIsFocused] = useState(false);
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

  // Voice input
  const [isListening, setIsListening] = useState(false);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>(() => {
    const saved = localStorage.getItem('ava-mic-consent');
    return saved === 'granted' ? 'granted' : saved === 'denied' ? 'denied' : 'prompt';
  });
  const [showMicPrompt, setShowMicPrompt] = useState(false);
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    let finalTranscript = '';

    recognition.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interim = transcript;
        }
      }
      setText(prev => {
        const base = prev.replace(/\u200B.*$/, '').trimEnd();
        return (base ? base + ' ' : '') + finalTranscript + interim;
      });
      handleInput();
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      textareaRef.current?.focus();
    };

    recognition.onerror = (e: any) => {
      setIsListening(false);
      recognitionRef.current = null;
      if (e.error === 'not-allowed') {
        setMicPermission('denied');
        localStorage.setItem('ava-mic-consent', 'denied');
      }
    };

    recognitionRef.current = recognition;
    finalTranscript = '';
    recognition.start();
    setIsListening(true);
    localStorage.setItem('ava-mic-consent', 'granted');
    setMicPermission('granted');
  }, [handleInput]);

  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    if (micPermission === 'prompt' && !localStorage.getItem('ava-mic-consent')) {
      setShowMicPrompt(true);
      return;
    }
    if (micPermission === 'denied') return;
    startListening();
  }, [isListening, micPermission, startListening]);

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
    <div className="px-3 pb-3 pt-1">
      <div
        className="rounded-xl overflow-hidden relative transition-all duration-200"
        style={{
          border: isDragOver
            ? '1.5px dashed #A855F7'
            : isFocused
              ? '1.5px solid #A855F7'
              : '1.5px solid rgba(168, 85, 247, 0.15)',
          background: 'rgba(0, 0, 0, 0.35)',
          boxShadow: isFocused
            ? '0 0 12px rgba(168, 85, 247, 0.2), 0 0 0 1px rgba(168, 85, 247, 0.1)'
            : '0 1px 3px rgba(0, 0, 0, 0.2)',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Image previews */}
        {attachments.length > 0 && (
          <div className="flex gap-2 px-3 pt-3 flex-wrap">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="relative group w-16 h-16 rounded-lg overflow-hidden
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
                          bg-[var(--vscode-input-background)] opacity-90 pointer-events-none rounded-xl">
            <span className="text-xs opacity-50">{t('input.drop_image')}</span>
          </div>
        )}

        {/* Textarea */}
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={disabled ? t('input.placeholder.disabled') : t(PLACEHOLDER_KEYS[mode])}
          disabled={disabled}
          rows={1}
          className="w-full resize-none text-sm px-4 pt-3 pb-1
                     bg-transparent
                     text-[var(--vscode-input-foreground)]
                     placeholder:opacity-40
                     outline-none border-none
                     disabled:opacity-40"
          style={{ maxHeight: '150px' }}
        />

        {/* Bottom toolbar */}
        <div
          className="flex items-center justify-between px-3 pb-2.5 pt-2 mx-2 mt-0.5"
          style={{ borderTop: '1px solid rgba(168, 85, 247, 0.4)' }}
        >
          {/* Mode selector */}
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Input mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                role="radio"
                aria-checked={mode === m.id}
                aria-label={`${t(m.labelKey)} mode`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                            cursor-pointer transition-all duration-200
                  ${mode === m.id
                    ? 'text-white border border-[rgba(168,85,247,0.6)]'
                    : 'text-[var(--vscode-foreground)] opacity-40 hover:opacity-80 border border-transparent hover:border-[rgba(168,85,247,0.3)] hover:bg-[rgba(168,85,247,0.08)]'
                  }`}
                style={mode === m.id ? {
                  background: 'linear-gradient(135deg, #A855F7, #7C3AED)',
                  boxShadow: '0 2px 8px rgba(168, 85, 247, 0.4), 0 0 12px rgba(168, 85, 247, 0.15)',
                } : undefined}
              >
                <span className="font-mono text-[10px] opacity-70" aria-hidden="true">{m.icon}</span>
                {t(m.labelKey)}
              </button>
            ))}
          </div>

          {/* Provider source toggle */}
          {platformStatus?.connected && onProviderSourceChange && (
            <div className="flex items-center gap-0.5 rounded-lg bg-[rgba(168,85,247,0.06)] p-0.5 border border-[rgba(168,85,247,0.1)]">
              <button
                onClick={() => onProviderSourceChange('platform')}
                disabled={
                  providerSource !== 'platform' &&
                  platformStatus.tier === 'free' &&
                  platformStatus.freeTokensUsed >= platformStatus.freeTokensLimit
                }
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium border-none cursor-pointer transition-all duration-150
                  disabled:opacity-20 disabled:cursor-not-allowed
                  ${providerSource === 'platform'
                    ? 'bg-[var(--color-accent,var(--vscode-button-background))] text-white shadow-sm'
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
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium border-none cursor-pointer transition-all duration-150
                  ${providerSource === 'byok'
                    ? 'bg-[var(--color-accent,var(--vscode-button-background))] text-white shadow-sm'
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
              className="flex items-center justify-center w-9 h-9 rounded-lg
                         cursor-pointer
                         text-[var(--vscode-foreground)] opacity-50 hover:opacity-90
                         disabled:opacity-20 disabled:cursor-not-allowed
                         transition-all duration-200
                         border border-[rgba(168,85,247,0.15)] hover:border-[rgba(168,85,247,0.4)]
                         hover:bg-[rgba(168,85,247,0.1)]"
              style={{ background: 'rgba(168, 85, 247, 0.05)' }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a2.75 2.75 0 1 1-3.935-3.84l4.486-4.486a1.75 1.75 0 0 1 2.505 2.44L6.623 9.573a.75.75 0 0 1-1.08-1.04l4.473-4.563z" />
              </svg>
            </button>

            {/* Voice input button */}
            <button
              onClick={toggleVoice}
              disabled={disabled || micPermission === 'denied'}
              title={micPermission === 'denied' ? 'Microphone denied — check browser settings' : isListening ? 'Stop listening' : 'Voice input'}
              aria-label={isListening ? 'Stop listening' : 'Voice input'}
              className={`flex items-center justify-center w-9 h-9 rounded-lg
                         cursor-pointer transition-all duration-200
                         ${isListening
                           ? 'text-white border border-red-500/50'
                           : micPermission === 'denied'
                           ? 'text-[var(--vscode-foreground)] opacity-15 cursor-not-allowed border border-[rgba(168,85,247,0.08)]'
                           : 'text-[var(--vscode-foreground)] opacity-50 hover:opacity-90 border border-[rgba(168,85,247,0.15)] hover:border-[rgba(168,85,247,0.4)] hover:bg-[rgba(168,85,247,0.1)]'
                         }
                         disabled:opacity-15 disabled:cursor-not-allowed`}
              style={isListening ? {
                background: 'linear-gradient(135deg, #e53935, #c62828)',
                boxShadow: '0 2px 8px rgba(229, 57, 53, 0.35)',
                animation: 'pulse 1.5s infinite',
              } : { background: 'rgba(168, 85, 247, 0.05)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </button>

            {isStreaming ? (
              <button
                onClick={onCancel}
                title={t('input.stop')}
                aria-label={t('input.stop')}
                className="flex items-center justify-center w-9 h-9 rounded-lg
                           text-white
                           hover:opacity-90
                           border border-[rgba(229,57,53,0.5)] cursor-pointer transition-all duration-200"
                style={{
                  background: 'linear-gradient(135deg, #e53935, #c62828)',
                  boxShadow: '0 2px 8px rgba(229, 57, 53, 0.35), 0 0 12px rgba(229, 57, 53, 0.15)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <rect x="3" y="3" width="10" height="10" rx="1.5" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={disabled || !hasContent}
                title={t('input.send')}
                aria-label={t('input.send')}
                className={`flex items-center justify-center w-9 h-9 rounded-lg
                           border cursor-pointer transition-all duration-200
                  ${hasContent && !disabled
                    ? 'text-white border-[rgba(168,85,247,0.5)]'
                    : 'bg-transparent text-[var(--vscode-foreground)] opacity-15 cursor-not-allowed border-[rgba(168,85,247,0.08)]'
                  }`}
                style={hasContent && !disabled ? {
                  background: 'linear-gradient(135deg, #A855F7, #7C3AED)',
                  boxShadow: '0 2px 8px rgba(168, 85, 247, 0.4), 0 0 12px rgba(168, 85, 247, 0.15)',
                } : undefined}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 3.5l-4.5 4.5.707.707L7.5 5.414V13h1V5.414l3.293 3.293.707-.707L8 3.5z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Mic consent prompt */}
      {showMicPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-80 rounded-xl p-5 space-y-3" style={{ background: 'var(--vscode-editor-background)', border: '1px solid var(--vscode-panel-border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.2)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--vscode-foreground)' }}>Voice Input</div>
                <div className="text-[11px]" style={{ color: 'var(--vscode-descriptionForeground)' }}>Speak instead of typing</div>
              </div>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--vscode-foreground)' }}>
              Ava can listen to your voice and convert it to text. Audio is processed entirely by your browser — <strong>nothing is recorded, stored, or sent to any server</strong>.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setShowMicPrompt(false); startListening(); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white cursor-pointer border-none"
                style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)' }}
              >
                Allow
              </button>
              <button
                onClick={() => { setShowMicPrompt(false); localStorage.setItem('ava-mic-consent', 'denied'); setMicPermission('denied'); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer"
                style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none' }}
              >
                No Thanks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
