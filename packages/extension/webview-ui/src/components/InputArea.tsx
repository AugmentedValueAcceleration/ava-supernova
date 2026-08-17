import { useState, useRef, useCallback, useEffect } from 'react';
import { t, tt, useLocale } from '../i18n';
import type { ProviderSource } from '../types/messages';
import { SecretVault } from './SecretVault';
import type { SecretEntry } from './SecretVault';
import { useSecrets } from '../hooks/useSecrets';
import { useVSCodeApi } from '../hooks/useVSCodeApi';

export type AvaMode = 'code' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm' | 'write';

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
  /** Vision capability of the currently-selected model. When false the
   *  attach-image button is disabled and the tooltip explains why.
   *  Undefined means "unknown" — treated as supported (don't block).
   *  Mirrors dashboard-ui/src/chat/components/InputArea.tsx. */
  modelSupportsVision?: boolean;
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
  /**
   * External prefill source — e.g. starter chips on the empty-state
   * helper. Each new value (compared by `nonce`) replaces the textarea
   * contents and focuses the input. nonce is required so two clicks of
   * the same chip in a row still trigger the effect.
   */
  prefill?: { value: string; nonce: number } | null;
}

const MODES: { id: AvaMode; labelKey: string; descKey: string; icon: string }[] = [
  { id: 'code',       labelKey: 'input.mode.code',       descKey: 'input.mode.code.desc',       icon: '>>' },
  { id: 'write',      labelKey: 'input.mode.write',      descKey: 'input.mode.write.desc',      icon: '<<' },
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
  write: 'input.placeholder.write',
};

// onProviderSourceChange is no longer destructured — the Platform/API-key
// toggle was dropped to match IDE. Prop stays in InputAreaProps so callers
// can keep passing it without a shape change.
export function InputArea({ onSend, onCancel, isStreaming, disabled, providerSource, platformStatus, modelSupportsVision, prefill }: InputAreaProps) {
  useLocale();
  const [text, setText] = useState('');
  // Mode persists across panel close/reopen — IDE chat persists via
  // localStorage key 'ava-ide-chat-mode'; extension panel uses
  // 'ava-ext-chat-mode' (separate webview localStorage origin so the
  // keys can't collide). Defaults to 'code' on first load and on any
  // unrecognised stored value.
  const [mode, setMode] = useState<AvaMode>(() => {
    try {
      const stored = localStorage.getItem('ava-ext-chat-mode');
      const valid: AvaMode[] = ['code', 'plan', 'chat', 'teach', 'security', 'brainstorm', 'write'];
      if (stored && (valid as string[]).includes(stored)) return stored as AvaMode;
    } catch { /* localStorage unavailable */ }
    return 'code';
  });
  // Persist mode on every change so the next panel mount lands on the
  // last-used mode rather than the default.
  useEffect(() => {
    try { localStorage.setItem('ava-ext-chat-mode', mode); } catch { /* quota / disabled */ }
  }, [mode]);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [modesExpanded, setModesExpanded] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const { secrets, setSecrets } = useSecrets();
  // Used to grant a secret to Ava's working set when the operator references
  // one with @secret:<label> — see handleSend.
  const { postMessage } = useVSCodeApi();
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

  // Prefill from starter chips on the empty-state helper. Replaces the
  // textarea contents (rather than appending) so a chip click always
  // produces a clean, editable starter prompt. Focus moves to the input
  // and the cursor lands at the end so the user can keep typing.
  const prefillNonce = prefill?.nonce ?? 0;
  useEffect(() => {
    if (!prefill) return;
    setText(prefill.value);
    const el = textareaRef.current;
    if (el) {
      el.focus();
      // Defer caret-to-end until React has applied the value update.
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = el.value.length;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillNonce]);

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
    // Expand @secret:Label to the OPAQUE {{secret:<id>}} handle — never the raw
    // value. The host holds the real key and swaps it in at tool-execution time
    // (setArgsPreprocessor), so the literal never crosses the conversation
    // boundary: not into the prompt, not to the model provider, not into the
    // saved transcript. This used to substitute `found.value` here, which put
    // the operator's key straight in the message body — masked on screen while
    // being shipped to a third party, i.e. the exact opposite of a vault.
    //
    // Typing the reference IS the grant, so tell the host to promote the entry
    // into Ava's working set; otherwise the handle would reach a tool with
    // nothing to resolve it. Only the id crosses — never the value.
    if (trimmed) {
      trimmed = trimmed.replace(/@secret:([^\s]+)/g, (_match, label: string) => {
        const found = secrets.find((s) => s.label.toLowerCase() === label.toLowerCase());
        if (!found) return _match;
        postMessage({ type: 'grant_secret', secretId: found.id });
        return `{{secret:${found.id}}}`;
      });
    }
    onSend(trimmed || '(image)', mode, attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, mode, attachments, onSend, secrets, postMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // Enter sends WHILE SHE IS WORKING TOO. It used to return here, so
        // typing a correction mid-run and pressing Enter did nothing at all —
        // no send, no error, no hint. You had to wait for her to finish before
        // you were allowed to say "not that file".
        //
        // The host already handles this properly: a message that arrives
        // mid-run goes to runner.inject(), which queues it and folds it in at
        // the next step boundary rather than interrupting a half-written file.
        // Only this line stopped it ever being sent.
        handleSend();
      }
    },
    [handleSend],
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

  // toggleVoice removed — voice button dropped to match IDE. The
  // recognition / permission / consent state stays for a future re-add.
  void isListening; void micPermission; void startListening; void setShowMicPrompt;

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

        {/* ── Single-row layout — mirrors IDE chat input bar at
             DashboardPages.tsx:5244-5572. Mode pill on the left, textarea
             flex-1 in the middle, action buttons (attach + vault + credit
             balance + send) on the right. The previous "textarea on top
             + bottom toolbar below" pattern + the modesExpanded
             collapsible strip are dropped. Voice input + provider toggle
             dropped (IDE doesn't have them). */}
        <div className="flex items-end gap-2 px-2 py-2">
          {/* Mode pill (left of input) — opens upward */}
          <div className="relative" ref={modeMenuRef} style={{ flexShrink: 0, alignSelf: 'center' }}>
            <button
              onClick={() => setModesExpanded(!modesExpanded)}
              className="flex items-center gap-1 cursor-pointer transition-all duration-200"
              style={{
                padding: '5px 10px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                color: '#fff', fontSize: 11, fontWeight: 600,
                whiteSpace: 'nowrap',
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

          {/* Textarea — flex-1 in the new single-row layout */}
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
            placeholder={disabled ? t('input.placeholder.disabled') : isStreaming ? tt('input.placeholder.working', 'Add something — she picks it up at the next step') : t(PLACEHOLDER_KEYS[mode])}
            disabled={disabled}
            rows={1}
            style={{
              flex: 1, resize: 'none', background: 'transparent',
              border: 'none', outline: 'none',
              color: '#cdd6f4', fontSize: 14, lineHeight: 1.5,
              padding: '6px 0',
              fontFamily: 'inherit',
              maxHeight: 160, minHeight: 24,
              opacity: disabled ? 0.4 : 1,
              cursor: disabled ? 'not-allowed' : 'text',
            }}
          />

          {/* Right side actions — provider toggle + voice button dropped
              to match IDE; only attach + vault + send remain. */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Attach button — disabled when the current model is text-only.
                modelSupportsVision === false explicitly blocks; undefined is
                treated as unknown/supported so older clients keep working. */}
            <button
              onClick={handleAttach}
              disabled={disabled || modelSupportsVision === false}
              title={modelSupportsVision === false
                ? t('input.attach_image_unsupported')
                : t('input.attach_image')}
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

            {/* Credit balance — between Vault and Send, mirrors IDE
                input bar at DashboardPages.tsx:5517-5529. Red/amber/
                green colour ramp at 95% / 80% / under. Admin (limit
                >= 999_999_999) shows ∞. */}
            {providerSource === 'platform' && platformStatus?.connected && (() => {
              const subLimit = platformStatus.subTokensLimit ?? 0;
              const totalLimit = platformStatus.freeTokensLimit + subLimit;
              const totalUsed = platformStatus.freeTokensUsed + platformStatus.subTokensUsed;
              if (platformStatus.freeTokensLimit >= 999_999_999 || totalLimit >= 999_999_999) {
                return (
                  <span
                    style={{ fontSize: 11, fontFamily: 'monospace', color: '#6c7086', opacity: 0.5, flexShrink: 0 }}
                    title={t('input.tokens_unlimited')}
                  >
                    ∞
                  </span>
                );
              }
              const remaining = Math.max(0, totalLimit - totalUsed);
              const pct = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0;
              const color = pct >= 95 ? '#ef4444' : pct >= 80 ? '#eab308' : '#a6e3a1';
              return (
                <span
                  style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 600, color, flexShrink: 0 }}
                  title={`${remaining.toLocaleString()} of ${totalLimit.toLocaleString()} credits remaining (${Math.round(pct)}% used)`}
                >
                  {remaining.toLocaleString()}
                </span>
              );
            })()}

            {/* Voice input button DROPPED — IDE doesn't have it. */}

            {/* While she works you get BOTH: send what you have typed, or stop
                her. They are different intentions and collapsing them into one
                button is what made mid-run messages feel impossible — there
                was only ever a stop here, so the way to add a note looked like
                the way to cancel everything. Sending queues; it does not
                interrupt. */}
            {isStreaming && hasContent && !disabled && (
              <button
                onClick={handleSend}
                title={tt('input.send_while_working', 'Send — she picks it up at the next step')}
                aria-label={tt('input.send_while_working', 'Send — she picks it up at the next step')}
                className="flex items-center justify-center w-9 h-9 rounded-lg
                           text-white border border-[rgba(168,85,247,0.5)]
                           cursor-pointer transition-all duration-200 hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg, #A855F7, #7C3AED)',
                  boxShadow: '0 2px 8px rgba(168, 85, 247, 0.4), 0 0 12px rgba(168, 85, 247, 0.15)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 3.5l-4.5 4.5.707.707L7.5 5.414V13h1V5.414l3.293 3.293.707-.707L8 3.5z" />
                </svg>
              </button>
            )}

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
