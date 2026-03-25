import { useState, useRef, useEffect } from 'react';
import { t, useLocale } from '../i18n';

export interface SecretEntry {
  id: string;
  label: string;
  value: string;
}

interface SecretVaultProps {
  secrets: SecretEntry[];
  onSave: (secrets: SecretEntry[]) => void;
  onClose: () => void;
}

export function SecretVault({ secrets, onSave, onClose }: SecretVaultProps) {
  useLocale();
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus label input on mount
  useEffect(() => {
    labelInputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = (id: string) => {
    const updated = secrets.filter((s) => s.id !== id);
    onSave(updated);
  };

  const handleAdd = () => {
    const trimLabel = newLabel.trim();
    const trimValue = newValue.trim();
    if (!trimLabel || !trimValue) return;

    const entry: SecretEntry = {
      id: `secret-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: trimLabel,
      value: trimValue,
    };
    onSave([...secrets, entry]);
    setNewLabel('');
    setNewValue('');
    labelInputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div
      ref={panelRef}
      className="absolute left-0 right-0 z-50 mx-3 rounded-xl overflow-hidden"
      style={{
        bottom: '100%',
        marginBottom: '8px',
        background: 'var(--vscode-editor-background, #1e1e1e)',
        border: '1.5px solid rgba(168, 85, 247, 0.25)',
        boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.4), 0 0 12px rgba(168, 85, 247, 0.1)',
        animation: 'vault-slide-up 0.2s ease-out',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(168, 85, 247, 0.15)' }}
      >
        <div className="flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#A855F7"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-sm font-semibold text-[var(--vscode-foreground)]">
            {t('secrets.title')}
          </span>
          <span className="text-[10px] opacity-30 ml-1">
            @secret:Label
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-lg
                     bg-transparent border-none cursor-pointer
                     text-[var(--vscode-foreground)] opacity-40 hover:opacity-80
                     transition-opacity duration-150"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Secret list */}
      <div className="max-h-[240px] overflow-y-auto">
        {secrets.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <svg
              className="mx-auto mb-2 opacity-20"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p className="text-xs opacity-30">{t('secrets.empty')}</p>
          </div>
        ) : (
          <div className="px-2 py-2 space-y-1">
            {secrets.map((secret) => {
              const isRevealed = revealedIds.has(secret.id);
              return (
                <div
                  key={secret.id}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg group
                             hover:bg-[rgba(168,85,247,0.06)] transition-colors duration-150"
                >
                  {/* Label */}
                  <span className="text-xs font-medium text-[var(--vscode-foreground)] opacity-70 min-w-[80px] shrink-0">
                    {secret.label}
                  </span>

                  {/* Value (masked or revealed) */}
                  <span
                    className="flex-1 text-xs font-mono truncate"
                    style={{
                      color: isRevealed
                        ? 'var(--vscode-foreground)'
                        : 'var(--vscode-foreground)',
                      opacity: isRevealed ? 0.8 : 0.35,
                      letterSpacing: isRevealed ? 'normal' : '2px',
                    }}
                  >
                    {isRevealed ? secret.value : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                  </span>

                  {/* Eye toggle */}
                  <button
                    onClick={() => toggleReveal(secret.id)}
                    className="flex items-center justify-center w-7 h-7 rounded-md
                               bg-transparent border-none cursor-pointer
                               text-[var(--vscode-foreground)] opacity-30
                               hover:opacity-70 transition-opacity duration-150"
                    title={isRevealed ? t('secrets.hide') : t('secrets.reveal')}
                    aria-label={isRevealed ? t('secrets.hide') : t('secrets.reveal')}
                  >
                    {isRevealed ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(secret.id)}
                    className="flex items-center justify-center w-7 h-7 rounded-md
                               bg-transparent border-none cursor-pointer
                               text-[var(--vscode-foreground)] opacity-0
                               group-hover:opacity-30 hover:!opacity-70 hover:!text-red-400
                               transition-all duration-150"
                    title={t('memory.delete')}
                    aria-label={t('memory.delete')}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add new secret row */}
      <div
        className="flex items-center gap-2 px-3 py-3"
        style={{ borderTop: '1px solid rgba(168, 85, 247, 0.12)' }}
      >
        <input
          ref={labelInputRef}
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('secrets.label_placeholder')}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs
                     bg-[var(--vscode-input-background)]
                     text-[var(--vscode-input-foreground)]
                     placeholder:opacity-30
                     outline-none
                     border border-[rgba(168,85,247,0.12)]
                     focus:border-[rgba(168,85,247,0.4)]
                     transition-colors duration-150"
        />
        <input
          type="password"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('secrets.value_placeholder')}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs
                     bg-[var(--vscode-input-background)]
                     text-[var(--vscode-input-foreground)]
                     placeholder:opacity-30
                     outline-none
                     border border-[rgba(168,85,247,0.12)]
                     focus:border-[rgba(168,85,247,0.4)]
                     transition-colors duration-150"
        />
        <button
          onClick={handleAdd}
          disabled={!newLabel.trim() || !newValue.trim()}
          className="shrink-0 px-3.5 py-2 rounded-lg text-xs font-medium
                     text-white border-none cursor-pointer
                     transition-all duration-200
                     disabled:opacity-20 disabled:cursor-not-allowed"
          style={{
            background: newLabel.trim() && newValue.trim()
              ? 'linear-gradient(135deg, #A855F7, #7C3AED)'
              : 'rgba(168, 85, 247, 0.15)',
            boxShadow: newLabel.trim() && newValue.trim()
              ? '0 2px 8px rgba(168, 85, 247, 0.3)'
              : 'none',
          }}
        >
          {t('secrets.save')}
        </button>
      </div>
    </div>
  );
}
