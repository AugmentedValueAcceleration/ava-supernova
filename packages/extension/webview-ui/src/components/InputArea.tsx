import { useState, useRef, useCallback, useEffect } from 'react';
import { t, useLocale } from '../i18n';
import type { ProviderSource } from '../types/messages';
import { SecretVault } from './SecretVault';
import type { SecretEntry } from './SecretVault';
import { useSecrets } from '../hooks/useSecrets';

export type AvaMode = 'code' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm';

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
  contextUsage?: { used: number; limit: number; percent: number } | null;
  platformStatus?: {
    connected: boolean;
    tier: string | null;
    freeTokensUsed: number;
    freeTokensLimit: number;
    subTokensUsed: number;
    subTokensLimit: number | null;
    warning?: 'none' | 'approaching' | 'critical' | 'exhausted';
    warningMessage?: string;
  } | null;
  onProviderSourceChange?: (source: ProviderSource) => void;
}

const MODES: { id: AvaMode; labelKey: string; descKey: string; icon: string }[] = [
  { id: 'code',       labelKey: 'input.mode.code',       descKey: 'input.mode.code.desc',       icon: '>>' },
  { id: 'plan',       labelKey: 'input.mode.plan',       descKey: 'input.mode.plan.desc',       icon: '::' },
  { id: 'brainstorm', labelKey: 'input.mode.brainstorm', descKey: 'input.mode.brainstorm.desc', icon: '**' },
  { id: 'chat',       labelKey: 'input.mode.chat',       descKey: 'input.mode.chat.desc',       icon: '..' },
  { id: 'teach',      labelKey: 'input.mode.teach',      descKey: 'input.mode.teach.desc',      icon: '??' },
  { id: 'security',   labelKey: 'input.mode.security',   descKey: 'input.mode.security.desc',   icon: '!!' },
];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

const PLACEHOLDER_KEYS: Record<AvaMode, string> = {
  code: 'input.placeholder.code',
  plan: 'input.placeholder.plan',
  chat: 'input.placeholder.chat',
  teach: 'input.placeholder.teach',
  security: 'input.placeholder.security',
  brainstorm: 'input.placeholder.brainstorm',
};

export function InputArea({ onSend, onCancel, isStreaming, disabled, usage, isCompressing, onCompress, providerSource, platformStatus, onProviderSourceChange, contextUsage }: InputAreaProps) {
  useLocale();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<AvaMode>('code');
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [modesExpanded, setModesExpanded] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const { secrets, setSecrets } = useSecrets();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
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

  // Save secrets through context (handles persistence + events)
  const handleSaveSecrets = useCallback((updated: SecretEntry[]) => {
    setSecrets(updated);
    // Dispatch custom event so other components in the same window stay in sync
    window.dispatchEvent(new CustomEvent('ava-secrets-changed'));
  }, [setSecrets]);

  // Keyboard shortcuts for mode switching: Ctrl+Shift+1-6
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < MODES.length) {
          e.preventDefault();
          setMode(MODES[idx].id);
          setModesExpanded(false);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close mode menu when clicking outside
  useEffect(() => {
    if (!modesExpanded) return;
    const handler = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setModesExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modesExpanded]);

  const handleSend = useCallback(() => {
    let trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    // Replace @secret:Label references with actual values
    if (trimmed) {
      trimmed = trimmed.replace(/@secret:([^\s]+)/g, (_match, label: string) => {
        const found = secrets.find((s) => s.label.toLowerCase() === label.toLowerCase());
        return found ? found.value : _match;
      });
    }
    onSend(trimmed || '(image)', mode, attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, mode, attachments, onSend, secrets]);

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

  // Clean up speech recognition on unmount to prevent orphaned listeners
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

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

  const warningLevel = platformStatus?.warning;
  const warningMsg = platformStatus?.warningMessage;

  return (
    <div className="px-3 pb-3 pt-1 relative">
      {/* Usage warning banner */}
      {warningLevel && warningLevel !== 'none' && warningMsg && (
        <div className={`mb-2 rounded-lg px-3 py-2 text-[11px] flex items-center gap-2 ${
          warningLevel === 'exhausted' ? 'bg-red-500/15 text-red-400 border border-red-500/20' :
          warningLevel === 'critical' ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20' :
          'bg-amber-500/10 text-amber-400 border border-amber-500/20'
        }`}>
          <span>{warningLevel === 'exhausted' ? '\u26D4' : warningLevel === 'critical' ? '\u26A0' : '\u25CB'}</span>
          <span className="flex-1">{warningMsg}</span>
        </div>
      )}
      {/* Secret Vault panel */}
      {vaultOpen && (
        <SecretVault
          secrets={secrets}
          onSave={handleSaveSecrets}
          onClose={() => setVaultOpen(false)}
        />
      )}
      <div
        className="rounded-xl overflow-visible relative transition-all duration-200 outline-none focus-within:outline-none"
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
          className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-2 mx-2 mt-0.5"
          style={{ borderTop: '1px solid rgba(168, 85, 247, 0.4)', overflow: 'visible' }}
        >
          {/* Mode selector — collapsible */}
          <div className="relative" ref={modeMenuRef}>
            {/* Active mode button (always visible) */}
            <button
              onClick={() => setModesExpanded(!modesExpanded)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                         text-white cursor-pointer transition-all duration-200
                         border border-[rgba(168,85,247,0.6)]"
              style={{
                background: 'linear-gradient(135deg, #A855F7, #7C3AED)',
                boxShadow: '0 2px 8px rgba(168, 85, 247, 0.4), 0 0 12px rgba(168, 85, 247, 0.15)',
              }}
              title={t('input.mode_switch_hint')}
            >
              <span className="font-mono text-[10px] opacity-70" aria-hidden="true">
                {MODES.find(m => m.id === mode)?.icon}
              </span>
              {t(MODES.find(m => m.id === mode)?.labelKey || '')}
              <svg className={`w-3 h-3 ml-0.5 transition-transform duration-200 ${modesExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {modesExpanded && (
              <div
                className="absolute left-0 rounded-lg border border-[rgba(168,85,247,0.2)] p-1 min-w-[200px] shadow-xl"
                style={{
                  background: 'var(--vscode-dropdown-background, var(--vscode-editor-background))',
                  bottom: '100%',
                  marginBottom: '6px',
                  zIndex: 9999,
                }}
                role="radiogroup"
                aria-label={t('input.mode_select_aria')}
              >
                {MODES.map((m, idx) => (
                  <button
                    key={m.id}
                    onClick={() => { setMode(m.id); setModesExpanded(false); }}
                    role="radio"
                    aria-checked={mode === m.id}
                    title={t(m.descKey)}
                    className={`flex flex-col items-stretch w-full px-3 py-2 rounded-md text-xs font-medium
                                cursor-pointer transition-all duration-150 border-none gap-1
                      ${mode === m.id
                        ? 'text-white bg-[rgba(168,85,247,0.2)]'
                        : 'text-[var(--vscode-foreground)] opacity-70 hover:opacity-100 hover:bg-[rgba(168,85,247,0.1)]'
                      }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[10px] opacity-60 w-4 text-center">{m.icon}</span>
                        {t(m.labelKey)}
                      </span>
                      <span className="text-[9px] opacity-40 font-mono">Ctrl+Shift+{idx + 1}</span>
                    </span>
                    <span className="text-[10px] opacity-60 text-left font-normal leading-snug">
                      {t(m.descKey)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right side: provider toggle + actions */}
          <div className="flex items-center gap-2 shrink-0">
          {/* Provider source toggle */}
          {platformStatus?.connected && onProviderSourceChange && (
            <div className="flex items-center gap-0.5 rounded-lg bg-[rgba(168,85,247,0.06)] p-0.5 border border-[rgba(168,85,247,0.1)]">
              <button
                onClick={() => onProviderSourceChange('platform')}
                disabled={(() => {
                  if (providerSource === 'platform') return false;
                  // Disabled only when the *entire* balance is exhausted —
                  // free pool + subscription pool + top-ups combined.
                  const totalUsed = platformStatus.freeTokensUsed + platformStatus.subTokensUsed;
                  const totalLimit = platformStatus.freeTokensLimit + (platformStatus.subTokensLimit ?? 0);
                  return totalUsed >= totalLimit;
                })()}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium border-none cursor-pointer transition-all duration-150
                  disabled:opacity-20 disabled:cursor-not-allowed
                  ${providerSource === 'platform'
                    ? 'bg-[var(--color-accent,var(--vscode-button-background))] text-white shadow-sm'
                    : 'bg-transparent text-[var(--vscode-foreground)] opacity-40 hover:opacity-70'
                  }`}
                title={providerSource === 'platform'
                  ? t('input.tokens_remaining', { remaining: Math.max(
                      0,
                      (platformStatus.freeTokensLimit + (platformStatus.subTokensLimit ?? 0))
                      - (platformStatus.freeTokensUsed + platformStatus.subTokensUsed),
                    ).toLocaleString() })
                  : t('input.provider_switch_free')}
              >
                {platformStatus.tier === 'free' ? t('input.provider_free') : t('input.provider_platform')}
              </button>
              <button
                onClick={() => onProviderSourceChange('byok')}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium border-none cursor-pointer transition-all duration-150
                  ${providerSource === 'byok'
                    ? 'bg-[var(--color-accent,var(--vscode-button-background))] text-white shadow-sm'
                    : 'bg-transparent text-[var(--vscode-foreground)] opacity-40 hover:opacity-70'
                  }`}
                title={t('input.provider_use_own_key')}
              >
                {t('input.provider_api_key')}
              </button>
            </div>
          )}

          {/* Right side: attach + usage + send/stop */}
          <div className="flex items-center gap-2">
            {/* Unified token balance — free + subscription + top-ups combined.
                Backend still burns the free pool first and overflows to the
                subscription pool, but users see one number here. */}
            {providerSource === 'platform' && platformStatus?.connected && (() => {
              // Admin/unlimited accounts
              if (platformStatus.freeTokensLimit >= 999_999_999) {
                return (
                  <span className="text-[10px] tabular-nums opacity-30" title={t('input.tokens_unlimited')}>
                    ∞
                  </span>
                );
              }
              const subLimit = platformStatus.subTokensLimit ?? 0;
              const totalUsed = platformStatus.freeTokensUsed + platformStatus.subTokensUsed;
              const totalLimit = platformStatus.freeTokensLimit + subLimit;
              const remaining = Math.max(0, totalLimit - totalUsed);
              const isLow = remaining <= 500_000;
              return (
                <span
                  className={`text-[10px] tabular-nums ${
                    isLow
                      ? 'text-[var(--vscode-editorWarning-foreground,#cca700)] opacity-80'
                      : 'opacity-30'
                  }`}
                  title={`${remaining.toLocaleString()} / ${totalLimit.toLocaleString()} tokens remaining`}
                >
                  {remaining >= 1_000_000 ? `${(remaining / 1_000_000).toFixed(2)}M` : remaining >= 1000 ? `${(remaining / 1000).toFixed(1)}K` : remaining}
                </span>
              );
            })()}
            {/* Context usage indicator moved to the top of the chat
                container as a horizontal bar (ContextBar). The old
                circular chip lived here and is gone. */}

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

            {/* Secret Vault button */}
            <button
              onClick={() => setVaultOpen(!vaultOpen)}
              disabled={disabled}
              title={t('secrets.vault_tooltip')}
              aria-label={t('secrets.title')}
              className={`relative flex items-center justify-center w-9 h-9 rounded-lg
                         cursor-pointer transition-all duration-200
                         ${vaultOpen
                           ? 'text-white border border-[rgba(168,85,247,0.5)]'
                           : 'text-[var(--vscode-foreground)] opacity-50 hover:opacity-90 border border-[rgba(168,85,247,0.15)] hover:border-[rgba(168,85,247,0.4)] hover:bg-[rgba(168,85,247,0.1)]'
                         }
                         disabled:opacity-20 disabled:cursor-not-allowed`}
              style={vaultOpen ? {
                background: 'linear-gradient(135deg, #A855F7, #7C3AED)',
                boxShadow: '0 2px 8px rgba(168, 85, 247, 0.35)',
              } : { background: 'rgba(168, 85, 247, 0.05)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {secrets.length > 0 && (
                <span
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] font-bold
                             flex items-center justify-center text-white"
                  style={{ background: '#A855F7' }}
                >
                  {secrets.length}
                </span>
              )}
            </button>

            {/* Voice input button */}
            <button
              onClick={toggleVoice}
              disabled={disabled || micPermission === 'denied'}
              title={micPermission === 'denied' ? t('input.voice_denied') : isListening ? t('input.voice_stop') : t('input.voice_input')}
              aria-label={isListening ? t('input.voice_stop') : t('input.voice_input')}
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
                aria-label={t('input.stop_aria')}
                className="flex items-center justify-center w-9 h-9 rounded-lg
                           text-white
                           hover:opacity-90
                           border border-[rgba(168,85,247,0.5)] cursor-pointer transition-all duration-200"
                style={{
                  background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                  boxShadow: '0 2px 8px rgba(168, 85, 247, 0.35), 0 0 12px rgba(168, 85, 247, 0.15)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <rect x="3" y="3" width="4" height="10" rx="1" />
                  <rect x="9" y="3" width="4" height="10" rx="1" />
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
          </div>{/* close second row */}
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
                <div className="text-sm font-semibold" style={{ color: 'var(--vscode-foreground)' }}>{t('input.voice_title')}</div>
                <div className="text-[11px]" style={{ color: 'var(--vscode-descriptionForeground)' }}>{t('input.voice_subtitle')}</div>
              </div>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--vscode-foreground)' }}>{t('input.voice_description')}</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setShowMicPrompt(false); startListening(); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white cursor-pointer border-none"
                style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)' }}
              >
                {t('input.voice_allow')}
              </button>
              <button
                onClick={() => { setShowMicPrompt(false); localStorage.setItem('ava-mic-consent', 'denied'); setMicPermission('denied'); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer"
                style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none' }}
              >
                {t('input.voice_deny')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
