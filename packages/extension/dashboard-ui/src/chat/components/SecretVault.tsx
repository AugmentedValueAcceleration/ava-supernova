import { useState, useRef, useEffect } from 'react';
import { t, useLocale, tt} from '../../i18n';
import { detectProvider } from '../../utils/secret-patterns';

export interface SecretEntry {
  id: string;
  label: string;
  value: string;
  /** Auto-detected provider when the value matches a known pattern. */
  provider?: string;
  /** ISO timestamp the entry was created. */
  createdAt?: string;
  /** Project root hashes where Ava is auto-granted access (slice 2). */
  alwaysGrantProjects?: string[];
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

    const provider = detectProvider(trimValue);
    const entry: SecretEntry = {
      id: `secret-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: trimLabel,
      value: trimValue,
      ...(provider ? { provider } : {}),
      createdAt: new Date().toISOString(),
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
        // Ava's own palette — the vault used to sit on raw --vscode-* chrome,
        // which made it read as a VS Code dialog with an accent rim bolted on
        // rather than part of Ava. --bg-page under --bg-card gives the tinted,
        // lifted surface the rest of the dashboard has (the card layer is
        // translucent, so it needs an opaque base beneath it).
        background: 'linear-gradient(var(--bg-card), var(--bg-card)), var(--bg-page)',
        border: '1.5px solid color-mix(in srgb, var(--accent) 25%, transparent)',
        boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.4), 0 0 12px color-mix(in srgb, var(--accent) 10%, transparent)',
        animation: 'vault-slide-up 0.2s ease-out',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-card)' }}
      >
        <div className="flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {t('secrets.title')}
          </span>
          {/* The only affordance telling you how to use the vault — it was a
              10px/30%-opacity whisper, which is why nobody could find it. It
              now also states the guarantee, because that guarantee is the
              entire point of the feature. */}
          <span
            className="ml-1 rounded px-1.5 py-0.5 font-mono text-[10px]"
            style={{
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              color: 'var(--accent)',
            }}
            title={tt('ext.vault.reference_hint','Reference a key by label in your message. Ava receives an opaque handle — the value is swapped in on your machine when a tool runs, so it never reaches the model or your saved chat.')}
          >
            @secret:Label
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-lg
                     bg-transparent border-none cursor-pointer
                     text-[var(--text-secondary)] opacity-60 hover:opacity-100
                     transition-opacity duration-150"
          aria-label={tt('history.close','Close')}
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
            <p className="text-xs text-[var(--text-muted)]">{t('secrets.empty')}</p>
          </div>
        ) : (
          <div className="px-2 py-2 space-y-1">
            {secrets.map((secret) => {
              const isRevealed = revealedIds.has(secret.id);
              return (
                <div
                  key={secret.id}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg group
                             hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] transition-colors duration-150"
                >
                  {/* Label + provider badge */}
                  <div className="min-w-[80px] shrink-0 flex flex-col">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      {secret.label}
                    </span>
                    {secret.provider && (
                      <span className="text-[9px] uppercase tracking-wide text-[var(--accent)] opacity-70 mt-0.5">
                        {secret.provider}
                      </span>
                    )}
                  </div>

                  {/* Value (masked or revealed) */}
                  <span
                    className="flex-1 text-xs font-mono truncate"
                    style={{
                      color: isRevealed ? 'var(--text-primary)' : 'var(--text-muted)',
                      letterSpacing: isRevealed ? 'normal' : '2px',
                    }}
                  >
                    {isRevealed ? secret.value : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                  </span>

                  {/* Always-grant indicator */}
                  {secret.alwaysGrantProjects && secret.alwaysGrantProjects.length > 0 && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] shrink-0"
                      title={tt('ext.vault.autogrant_hint','Auto-granted to Ava on this project — clear by deleting and re-adding the secret')}
                    >
                      auto
                    </span>
                  )}

                  {/* Eye toggle */}
                  <button
                    onClick={() => toggleReveal(secret.id)}
                    className="flex items-center justify-center w-7 h-7 rounded-md
                               bg-transparent border-none cursor-pointer
                               text-[var(--text-muted)] opacity-70
                               hover:opacity-100 hover:text-[var(--accent)] transition-all duration-150"
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
                               text-[var(--text-muted)] opacity-0
                               group-hover:opacity-60 hover:!opacity-100 hover:!text-red-400
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
        style={{ borderTop: '1px solid var(--border-card)' }}
      >
        <input
          ref={labelInputRef}
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('secrets.label_placeholder')}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs
                     bg-[var(--bg-input)]
                     text-[var(--text-primary)]
                     placeholder:text-[var(--text-muted)]
                     outline-none
                     border border-[var(--border-card)]
                     focus:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]
                     transition-colors duration-150"
        />
        <input
          type="password"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('secrets.value_placeholder')}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs font-mono
                     bg-[var(--bg-input)]
                     text-[var(--text-primary)]
                     placeholder:font-sans placeholder:text-[var(--text-muted)]
                     outline-none
                     border border-[var(--border-card)]
                     focus:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]
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
              ? 'linear-gradient(135deg, var(--accent), #7C3AED)'
              : 'color-mix(in srgb, var(--accent) 15%, transparent)',
            boxShadow: newLabel.trim() && newValue.trim()
              ? '0 2px 8px color-mix(in srgb, var(--accent) 30%, transparent)'
              : 'none',
          }}
        >
          {t('secrets.save')}
        </button>
      </div>
    </div>
  );
}
